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
        
        const executablePath = await chromium.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
        );
        
        browser = await puppeteer.launch({
            args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
            executablePath: executablePath,
            defaultViewport: { width: 794, height: 1123 }, // Стартовый viewport
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // 1. Предварительная обработка HTML
        let processedHtml = htmlContent
            .replace(/✓/g, '<span style="color: #10b981; font-weight: bold; font-size: 14px;">OK</span>')
            .replace(/✗/g, '<span style="color: #ef4444; font-weight: bold; font-size: 14px;">NO</span>')
            .replace(/★/g, '<span style="color: #f59e0b; font-weight: bold; font-size: 14px;">★</span>')
            .replace(/⚠️/g, '<span style="color: #f59e0b; font-weight: bold; font-size: 14px;">!</span>')
            .replace(/⚠/g, '<span style="color: #f59e0b; font-weight: bold; font-size: 14px;">!</span>');

        // 2. Исправленные стили
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
            /* УБРАНО page-break-inside: avoid из глобального селектора - ЭТО ВЫЗЫВАЛО ПРОБЛЕМУ */
        }
        
        body {
            font-family: Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            padding: 20px;
            background: white;
            width: 100%;
            height: auto;
        }
        
        .report-container {
            max-width: 100%;
            margin: 0;
            padding: 0;
        }
        
        p, div, span, td, th {
            font-size: 12px;
        }
        
        /* Запрещаем разрыв только внутри важных элементов */
        h1, h2, h3, img, tr { 
            page-break-inside: avoid; 
        }

        h1 { font-size: 24px; margin: 10px 0; font-weight: 700; page-break-after: avoid; }
        h2 { font-size: 18px; margin: 8px 0; font-weight: 600; page-break-after: avoid; }
        h3 { font-size: 14px; margin: 6px 0; font-weight: 600; page-break-after: avoid; }
        
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
            display: block;
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
        // networkidle0 важен, чтобы подгрузились картинки (логотип)
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        // 3. Вычисление высоты и изменение Viewport
        // Это заставляет браузер отрендерить всю страницу целиком перед печатью
        const bodyHeight = await page.evaluate(() => {
            return document.body.scrollHeight;
        });
        
        const contentHeight = Math.ceil(bodyHeight);
        console.log('Content height calculated:', contentHeight);

        // Расширяем окно браузера на полную высоту контента
        await page.setViewport({ 
            width: 794, 
            height: contentHeight + 50 
        });

        console.log('Generating PDF...');
        
        const pdfBuffer = await page.pdf({
            width: '210mm',
            height: `${contentHeight + 20}px`, // Добавляем небольшой запас
            printBackground: true,
            // Убрали pageRanges: '1', так как мы и так задаем полную высоту страницы
            margin: {
                top: '0mm',
                bottom: '0mm',
                left: '0mm',
                right: '0mm'
            }
        });

        await browser.close();
        browser = null;

        console.log('PDF generated successfully, size:', pdfBuffer.length);
        
        const base64 = Buffer.from(pdfBuffer).toString('base64');

        res.status(200).json({
            success: true,
            pdfBase64: base64
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        
        if (browser) {
            try {
                await browser.close();
            } catch (e) { console.error(e); }
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
        },
        // Увеличиваем таймаут функции (Vercel hobby plan ограничение 10-60 сек)
        maxDuration: 60 
    }
};