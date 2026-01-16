const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const http = require('http');
const { URL } = require('url');

// OAuth2 настройки - ВСТАВЬТЕ ВАШИ
const CLIENT_ID = '3349739192-kqnlktg7c0tmgp6f74uf7m8pbmga14qp.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const FOLDERID = '18EZxRYhO94_U545EICtvtHCf7CeVzP0D'; // Твоя папка

app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow;
let oauth2Client = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Пути к файлам данных
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'reports-data.json');
const settingsFilePath = path.join(userDataPath, 'settings.json');
const TOKEN_PATH = path.join(userDataPath, 'google-oauth-token.json');

async function initializeOAuth() {
    oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    
    if (fs.existsSync(TOKEN_PATH)) {
        try {
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
            oauth2Client.setCredentials(token);
            
            // Слушаем обновление токенов
            oauth2Client.on('tokens', (tokens) => {
                console.log('Токены обновлены');
                if (tokens.refresh_token) {
                    token.refresh_token = tokens.refresh_token;
                }
                token.access_token = tokens.access_token;
                token.expiry_date = tokens.expiry_date;
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
                console.log('Новые токены сохранены');
            });
            
            // Проверяем валидность токена
            try {
                const tokenInfo = await oauth2Client.getAccessToken();
                if (tokenInfo.token) {
                    console.log('✓ OAuth токен загружен');
                    return true;
                }
            } catch (e) {
                console.log('✗ Токен истёк, требуется повторная авторизация');
                return false;
            }
        } catch (error) {
            console.error('Ошибка загрузки токена:', error);
            return false;
        }
    }
    return false;
}


// Авторизация пользователя
async function authorizeUser() {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.file'
      ],
      prompt: 'consent'
    });

    // Открываем браузер
    shell.openExternal(authUrl);

    // Запускаем локальный сервер
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost:3000');
        
        if (reqUrl.pathname === '/oauth2callback') {
          const code = reqUrl.searchParams.get('code');
          
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                  <h1 style="color: green;">✓ Авторизация успешна!</h1>
                  <p>Можете закрыть это окно и вернуться в приложение.</p>
                </body>
              </html>
            `);
            
            server.close();
            
            try {
              const { tokens } = await oauth2Client.getToken(code);
              oauth2Client.setCredentials(tokens);
              fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
              console.log('✓ Токен сохранен');
              resolve(true);
            } catch (error) {
              reject(error);
            }
          } else {
            res.writeHead(400);
            res.end('Ошибка: код не получен');
            reject(new Error('Код не получен'));
          }
        }
      } catch (err) {
        reject(err);
      }
    });
    
    server.listen(3000, () => {
      console.log('Ожидание авторизации на localhost:3000...');
    });
    
    // Таймаут 5 минут
    setTimeout(() => {
      server.close();
      reject(new Error('Timeout авторизации'));
    }, 5 * 60 * 1000);
  });
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, '../public/icon.ico'), // ← Изменил на .ico
        title: 'Генератор Отчётов Авто',
        backgroundColor: '#1a1a2e',
        show: false
    });


  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initializeOAuth();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// === IPC HANDLERS ===

// Проверка авторизации
ipcMain.handle('check-google-auth', async () => {
  return oauth2Client !== null && oauth2Client.credentials?.access_token;
});

// Авторизация
ipcMain.handle('authorize-google', async () => {
  try {
    const success = await authorizeUser();
    return { success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Замени старый handler create-google-doc на этот:
ipcMain.handle('upload-pdf-to-drive', async (event, { pdfBuffer, filename }) => {
    try {
        if (!oauth2Client || !oauth2Client.credentials?.access_token) {
            return { success: false, error: 'Google Drive не авторизован' };
        }

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Создаём файл из буфера
        const { Readable } = require('stream');
        const bufferStream = new Readable();
        bufferStream.push(pdfBuffer);
        bufferStream.push(null);

        // Загружаем PDF в Drive
        const file = await drive.files.create({
            requestBody: {
                name: filename,
                mimeType: 'application/pdf',
                parents: [FOLDERID] // Твоя папка
            },
            media: {
                mimeType: 'application/pdf',
                body: bufferStream
            },
            fields: 'id, webViewLink, webContentLink'
        });

        // Делаем файл доступным по ссылке (опционально)
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        return {
            success: true,
            url: file.data.webViewLink, // Ссылка для просмотра
            downloadUrl: file.data.webContentLink, // Ссылка для скачивания
            fileId: file.data.id
        };
    } catch (error) {
        console.error('Google Drive upload error:', error.message);
        return { success: false, error: error.message };
    }
});






// Остальные handlers без изменений
ipcMain.handle('load-data', async () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      const data = fs.readFileSync(dataFilePath, 'utf-8');
      return JSON.parse(data);
    }
    return { reports: [], cars: [] };
  } catch (error) {
    console.error('Error loading data:', error);
    return { reports: [], cars: [] };
  }
});

ipcMain.handle('save-data', async (event, data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-settings', async () => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    return {};
  }
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
    ]
  });

  if (result.canceled) return { canceled: true, files: [] };

  const files = result.filePaths.map(filePath => {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return {
      name: path.basename(filePath),
      path: filePath,
      data: `data:image/${mimeType};base64,${base64}`
    };
  });

  return { canceled: false, files };
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

// Экспорт PDF (сохранение на диск)
ipcMain.handle('export-to-pdf', async (event, { htmlContent, filename }) => {
    try {
        const pdfWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

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

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const contentHeight = await pdfWindow.webContents.executeJavaScript('document.body.scrollHeight');
        const heightInInches = (contentHeight / 96) + 0.5;

        console.log(`Content height: ${contentHeight}px = ${heightInInches} inches`);

        const pdfData = await pdfWindow.webContents.printToPDF({
            marginsType: 0,
            printBackground: true,
            printSelectionOnly: false,
            landscape: false,
            pageSize: {
                width: 8.27,
                height: Math.max(heightInInches, 11.69)
            },
            scaleFactor: 100,
            preferCSSPageSize: false,
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        });

        pdfWindow.close();

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            defaultPath: filename,
            filters: [
                { name: 'PDF', extensions: ['pdf'] }
            ]
        });

        if (!canceled && filePath) {
            fs.writeFileSync(filePath, pdfData);
            return { success: true, filePath: filePath };
        }

        return { success: false, canceled: true };
    } catch (error) {
        console.error('PDF export error:', error);
        return { success: false, error: error.message };
    }
});


// Автосохранение PDF в папку приложения + загрузка в Drive
ipcMain.handle('save-and-upload-pdf', async (event, { htmlContent, filename }) => {
    try {
        // Создаём папку для PDF если её нет
        const pdfFolder = path.join(userDataPath, 'reports-pdf');
        if (!fs.existsSync(pdfFolder)) {
            fs.mkdirSync(pdfFolder, { recursive: true });
        }

        // Генерируем PDF
        const pdfWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

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
        p, div, span, td, th { font-size: 12px; }
        h1 { font-size: 24px; margin: 10px 0; }
        h2 { font-size: 18px; margin: 8px 0; }
        h3 { font-size: 14px; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { padding: 8px; border: 1px solid #e0e0e0; }
        img { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <div class="report-container">
        ${htmlContent}
    </div>
</body>
</html>`;

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const contentHeight = await pdfWindow.webContents.executeJavaScript('document.body.scrollHeight');
        const heightInInches = (contentHeight / 96) + 0.5;

        const pdfData = await pdfWindow.webContents.printToPDF({
            marginsType: 0,
            printBackground: true,
            printSelectionOnly: false,
            landscape: false,
            pageSize: {
                width: 8.27,
                height: Math.max(heightInInches, 11.69)
            },
            scaleFactor: 100,
            preferCSSPageSize: false,
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });

        pdfWindow.close();

        // Сохраняем PDF локально
        const localPath = path.join(pdfFolder, filename);
        fs.writeFileSync(localPath, pdfData);
        console.log(`PDF saved locally: ${localPath}`);

        // Загружаем в Google Drive (если авторизован)
        let driveUrl = null;
        let driveFileId = null;

        if (oauth2Client && oauth2Client.credentials?.access_token) {
            try {
                const drive = google.drive({ version: 'v3', auth: oauth2Client });

                const fileMetadata = {
                    name: filename,
                    mimeType: 'application/pdf',
                    parents: [FOLDERID]
                };

                const media = {
                    mimeType: 'application/pdf',
                    body: fs.createReadStream(localPath)
                };

                const file = await drive.files.create({
                    requestBody: fileMetadata,
                    media: media,
                    fields: 'id, webViewLink, webContentLink'
                });

                // Делаем доступным по ссылке
                await drive.permissions.create({
                    fileId: file.data.id,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone'
                    }
                });

                driveUrl = file.data.webViewLink;
                driveFileId = file.data.id;
                console.log(`PDF uploaded to Drive: ${driveUrl}`);
            } catch (driveError) {
                console.error('Drive upload failed:', driveError.message);
                // Не падаем, просто не загрузили в Drive
            }
        }

        return {
            success: true,
            localPath: localPath,
            driveUrl: driveUrl,
            driveFileId: driveFileId
        };
    } catch (error) {
        console.error('Save and upload error:', error);
        return { success: false, error: error.message };
    }
});

// Загрузить существующий PDF в Drive
ipcMain.handle('upload-existing-pdf-to-drive', async (event, { localPath, filename }) => {
    try {
        if (!oauth2Client || !oauth2Client.credentials?.access_token) {
            return { success: false, error: 'Google Drive не авторизован' };
        }

        if (!fs.existsSync(localPath)) {
            return { success: false, error: 'Локальный файл не найден' };
        }

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const fileMetadata = {
            name: filename,
            mimeType: 'application/pdf',
            parents: [FOLDERID]
        };

        const media = {
            mimeType: 'application/pdf',
            body: fs.createReadStream(localPath)
        };

        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        // Делаем доступным по ссылке
        await drive.permissions.create({
            fileId: file.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });

        console.log(`Existing PDF uploaded to Drive: ${file.data.webViewLink}`);

        return {
            success: true,
            url: file.data.webViewLink,
            downloadUrl: file.data.webContentLink,
            fileId: file.data.id
        };
    } catch (error) {
        console.error('Upload existing PDF error:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('export-report', async (event, { content, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'report.html',
    filters: [
      { name: 'HTML файл', extensions: ['html'] }
    ]
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
// Обновить существующий файл в Drive
ipcMain.handle('update-pdf-in-drive', async (event, { fileId, htmlContent, filename }) => {
    try {
        if (!oauth2Client || !oauth2Client.credentials?.access_token) {
            return { success: false, error: 'Google Drive не авторизован' };
        }

        // Создаём папку для временных PDF
        const tempFolder = path.join(userDataPath, 'temp-pdf');
        if (!fs.existsSync(tempFolder)) {
            fs.mkdirSync(tempFolder, { recursive: true });
        }

        // Генерируем PDF
        const pdfWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        const fullHtml = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            padding: 20px;
            background: white;
            width: 210mm;
        }
        .report-container { max-width: 100%; margin: 0; padding: 0; }
        p, div, span, td, th { font-size: 12px; }
        h1 { font-size: 24px; margin: 10px 0; }
        h2 { font-size: 18px; margin: 8px 0; }
        h3 { font-size: 14px; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { padding: 8px; border: 1px solid #e0e0e0; }
        img { max-width: 100%; height: auto; }
    </style>
</head>
<body>
    <div class="report-container">${htmlContent}</div>
</body>
</html>`;

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const contentHeight = await pdfWindow.webContents.executeJavaScript('document.body.scrollHeight');
        const heightInInches = (contentHeight / 96) + 0.5;

        const pdfData = await pdfWindow.webContents.printToPDF({
            marginsType: 0,
            printBackground: true,
            printSelectionOnly: false,
            landscape: false,
            pageSize: {
                width: 8.27,
                height: Math.max(heightInInches, 11.69)
            },
            scaleFactor: 100,
            preferCSSPageSize: false,
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });

        pdfWindow.close();

        const tempPath = path.join(tempFolder, filename);
        fs.writeFileSync(tempPath, pdfData);

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Обновляем существующий файл
        const media = {
            mimeType: 'application/pdf',
            body: fs.createReadStream(tempPath)
        };

        const file = await drive.files.update({
            fileId: fileId,
            media: media,
            fields: 'id, webViewLink'
        });

        // Удаляем временный файл
        fs.unlinkSync(tempPath);

        console.log(`PDF обновлён в Drive: ${file.data.webViewLink}`);

        return {
            success: true,
            url: file.data.webViewLink,
            fileId: file.data.id
        };
    } catch (error) {
        console.error('Update Drive error:', error);
        return { success: false, error: error.message };
    }
});
