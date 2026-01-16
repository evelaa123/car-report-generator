import chromium from '@sparticuz/chromium';
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
        
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        const fullHtml = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            padding: 20px;
            background: white;
            width: 210mm;
        }
        
        .report-container {
            max-width: 100%;
            margin: 0;
            padding: 0;
        }
        
        p, div, span, td, th {
            font-size: 12px;
        }
        
        h1 { font-size: 24px; margin: 10px 0; }
        h2 { font-size: 18px; margin: 8px 0; }
        h3 { font-size: 14px; margin: 6px 0; }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        
        td, th {
            padding: 8px;
            border: 1px solid #e0e0e0;
        }
        
        img {
            max-width: 100%;
            height: auto;
        }
    </style>
</head>
<body>
    <div class="report-container">
        ${htmlContent}
    </div>
</body>
</html>`;

        console.log('Setting content...');
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        console.log('Waiting for images...');
        await page.waitForTimeout(1500);

        console.log('Generating PDF...');
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
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

        res.status(200).json({
            success: true,
            pdfBase64: pdfBuffer.toString('base64')
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
