# Деплой веб-версии на Vercel

## Что добавлено

✅ **API для генерации PDF** (`/api/generate-pdf.js`)
- Использует puppeteer-core + @sparticuz/chromium
- Генерирует PDF идентичный Electron версии
- Возвращает base64 для скачивания и загрузки в Drive

✅ **Загрузка в Google Drive из веба**
- OAuth2 через popup окно
- Прямая загрузка через Google Drive API
- Файлы загружаются в ту же папку что и в Electron

## Как задеплоить

### 1. Подготовка

```bash
# Убедитесь что зависимости установлены
npm install
```

### 2. Деплой на Vercel

```bash
# Установите Vercel CLI (если нет)
npm i -g vercel

# Залогиньтесь
vercel login

# Задеплойте
vercel --prod
```

**ИЛИ** через GitHub:

1. Закоммитьте изменения:
```bash
git add .
git commit -m "Add web PDF export and Google Drive upload"
git push
```

2. Vercel автоматически подхватит изменения

### 3. Проверка

После деплоя проверьте:
- ✅ Главная страница загружается
- ✅ Можно создать отчёт
- ✅ Кнопка "Скачать PDF" работает (генерирует через API)
- ✅ Кнопка "Google Drive" работает (запрашивает OAuth, загружает)

## Особенности

### PDF генерация
- В вебе: API endpoint `/api/generate-pdf` (puppeteer на сервере)
- В Electron: `printToPDF` (локально)
- Результат идентичный!

### Google Drive
- В вебе: OAuth через popup + прямая загрузка через Google Drive API
- В Electron: OAuth через Electron Google OAuth2 + googleapis
- Файлы попадают в одну папку!

### Лимиты Vercel
- **Timeout**: 30 секунд (достаточно для PDF)
- **Memory**: 3008 MB (хватает для Puppeteer)
- **Free tier**: 100GB bandwidth/месяц

## Troubleshooting

### PDF не генерируется
- Проверьте логи в Vercel Dashboard
- Убедитесь что `@sparticuz/chromium` установлен
- Проверьте что `htmlContent` не слишком большой (< 10MB)

### OAuth не работает
- Убедитесь что `CLIENT_ID` правильный
- Добавьте ваш домен в Google Cloud Console (Authorized JavaScript origins)
- Разрешите popup окна в браузере

### Timeout errors
- Уменьшите размер изображений в отчёте
- Проверьте что API не делает лишних запросов
