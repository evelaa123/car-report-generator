// api/log.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { level, context, message, data, userAgent, url, timestamp } = req.body;

        // Форматируем лог для Vercel
        const logEntry = {
            timestamp: timestamp || new Date().toISOString(),
            level,
            context,
            message,
            data,
            userAgent,
            url
        };

        // Используем соответствующий метод console в зависимости от уровня
        // Vercel автоматически собирает эти логи
        switch (level) {
            case 'ERROR':
                console.error('[CLIENT ERROR]', JSON.stringify(logEntry));
                break;
            case 'WARN':
                console.warn('[CLIENT WARN]', JSON.stringify(logEntry));
                break;
            case 'SUCCESS':
                console.log('[CLIENT SUCCESS]', JSON.stringify(logEntry));
                break;
            case 'DEBUG':
                console.debug('[CLIENT DEBUG]', JSON.stringify(logEntry));
                break;
            default:
                console.log('[CLIENT INFO]', JSON.stringify(logEntry));
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[LOG API ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '100kb'
        }
    }
};
