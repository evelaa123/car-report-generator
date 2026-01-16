import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let browser = null;
    
    try {
        const { htmlContent } = req.body;

        if (!htmlContent) {
            return res.status(400).json({ error: 'No HTML content provided' });
        }

        console.log('Launching browser...');
        
        // Используем удаленный Chromium для Vercel
        const executablePath = await chromium.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
        );
        
        browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: executablePath,
            defaultViewport: null,
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123 }); // A4 в пикселях

        // Заменяем Unicode символы на текст/HTML
        let processedHtml = htmlContent
            .replace(/✓/g, '<span style="color: #10b981; font-weight: bold;">[✓]</span>')
            .replace(/✗/g, '<span style="color: #ef4444; font-weight: bold;">[✗]</span>')
            .replace(/★/g, '<span style="color: #f59e0b; font-weight: bold;">[★]</span>')
            .replace(/⚠️/g, '<span style="color: #f59e0b; font-weight: bold;">[!]</span>')
            .replace(/⚠/g, '<span style="color: #f59e0b; font-weight: bold;">[!]</span>');

        const fullHtml = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @page {
            size: auto;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            page-break-inside: avoid;
        }
        
        body {
            font-family: Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            padding: 20px;
            background: white;
            width: 100%;
        }
        
        .report-container {
            max-width: 100%;
            margin: 0;
            padding: 0;
        }
        
        p, div, span, td, th {
            font-size: 12px;
        }
        
        h1 { font-size: 24px; margin: 10px 0; font-weight: 700; page-break-after: avoid; }
        h2 { font-size: 18px; margin: 8px 0; font-weight: 600; page-break-after: avoid; }
        h3 { font-size: 14px; margin: 6px 0; font-weight: 600; page-break-after: avoid; }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            page-break-inside: auto;
        }
        
        tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }
        
        td, th {
            padding: 8px;
            border: 1px solid #e0e0e0;
        }
        
        img {
            max-width: 100%;
            height: auto;
            page-break-inside: avoid;
        }
    </style>
</head>
<body>
    <div class="report-container">
        ${processedHtml}
    </div>
</body>
</html>`;

        console.log('Setting content...');
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        console.log('Waiting for rendering...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Generating PDF...');
        
        // Получаем высоту контента
        const contentHeight = await page.evaluate(() => {
            return Math.ceil(document.body.scrollHeight);
        });
        
        console.log('Content height:', contentHeight);
        
        const pdfBuffer = await page.pdf({
            width: '210mm',
            height: `${contentHeight + 40}px`, // +40px запас
            printBackground: true,
            pageRanges: '1',
            margin: {
                top: '0mm',
                bottom: '0mm',
                left: '0mm',
                right: '0mm'
            }
        });

        await browser.close();
        browser = null;

        console.log('PDF generated successfully');
        console.log('PDF buffer type:', typeof pdfBuffer);
        console.log('PDF buffer length:', pdfBuffer.length);
        
        // Конвертируем Uint8Array в base64
        const base64 = Buffer.from(pdfBuffer).toString('base64');
        console.log('Base64 length:', base64.length);

        res.status(200).json({
            success: true,
            pdfBase64: base64
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb'
        }
    }
};
