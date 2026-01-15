// ============================================
// Генератор Отчётов Авто - Главный JavaScript
// Версия 2.0 - С поддержкой Gemini, PDF, Google Docs
// ============================================

// Определяем режим работы (Electron или Web)
const isElectron = typeof require !== 'undefined';
let ipcRenderer = null;
if (isElectron) {
    ipcRenderer = require('electron').ipcRenderer;
}

// Глобальное состояние приложения
const appState = {
    images: [],
    reports: [],
    cars: {},
    settings: {
        openaiKey: '',
        geminiKey: '',
        aiProvider: 'openai', // 'openai' или 'gemini'
        logoUrl: '',
        logoBase64: '',
        googleClientId: '',
        googleApiKey: ''
    },
    currentReport: null,
    currentCar: null,
    googleAuth: null
};

// Константы
const MAX_IMAGE_SIZE = 4000; // Максимальный размер стороны для API
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB макс размер файла
const CHUNK_HEIGHT = 3000; // Высота чанка для разбивки длинных изображений

// ============================================
// Инициализация
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await loadSettings();
    updateUI();
    initGoogleAuth();
});

// Инициализация Google Auth
function initGoogleAuth() {
    // Google Identity Services загрузится асинхронно
    if (appState.settings.googleClientId && window.google) {
        try {
            google.accounts.id.initialize({
                client_id: appState.settings.googleClientId,
                callback: handleGoogleSignIn
            });
        } catch (e) {
            console.log('Google Auth not available');
        }
    }
}

function handleGoogleSignIn(response) {
    appState.googleAuth = response;
    showToast('Google авторизация успешна', 'success');
}

// ============================================
// Загрузка и сохранение данных
// ============================================

async function loadData() {
    if (isElectron) {
        const data = await ipcRenderer.invoke('load-data');
        appState.reports = data.reports || [];
        appState.cars = data.cars || {};
    } else {
        const data = localStorage.getItem('carReportsData');
        if (data) {
            const parsed = JSON.parse(data);
            appState.reports = parsed.reports || [];
            appState.cars = parsed.cars || {};
        }
    }
}

async function saveData() {
    const data = {
        reports: appState.reports,
        cars: appState.cars
    };
    
    if (isElectron) {
        await ipcRenderer.invoke('save-data', data);
    } else {
        localStorage.setItem('carReportsData', JSON.stringify(data));
    }
}

async function loadSettings() {
    if (isElectron) {
        const settings = await ipcRenderer.invoke('load-settings');
        appState.settings = { ...appState.settings, ...settings };
    } else {
        const settings = localStorage.getItem('carReportsSettings');
        if (settings) {
            appState.settings = { ...appState.settings, ...JSON.parse(settings) };
        }
    }
    
    // Заполняем поля настроек
    const elements = {
        'openai-key': appState.settings.openaiKey || '',
        'gemini-key': appState.settings.geminiKey || '',
        'logo-url': appState.settings.logoUrl || '',
        'google-client-id': appState.settings.googleClientId || '',
        'google-api-key': appState.settings.googleApiKey || ''
    };
    
    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }
    
    // Выбор провайдера
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect) {
        providerSelect.value = appState.settings.aiProvider || 'openai';
    }
    
    // Превью логотипа
    if (appState.settings.logoUrl || appState.settings.logoBase64) {
        const logoImg = document.getElementById('logo-img');
        const logoPreview = document.getElementById('logo-preview');
        if (logoImg && logoPreview) {
            logoImg.src = appState.settings.logoBase64 || appState.settings.logoUrl;
            logoPreview.classList.remove('hidden');
        }
    }
}

async function saveSettings() {
    appState.settings.openaiKey = document.getElementById('openai-key')?.value || '';
    appState.settings.geminiKey = document.getElementById('gemini-key')?.value || '';
    appState.settings.aiProvider = document.getElementById('ai-provider')?.value || 'openai';
    appState.settings.logoUrl = document.getElementById('logo-url')?.value || '';
    appState.settings.googleClientId = document.getElementById('google-client-id')?.value || '';
    appState.settings.googleApiKey = document.getElementById('google-api-key')?.value || '';
    
    if (isElectron) {
        await ipcRenderer.invoke('save-settings', appState.settings);
    } else {
        localStorage.setItem('carReportsSettings', JSON.stringify(appState.settings));
    }
    
    showToast('Настройки сохранены', 'success');
    
    // Обновить превью логотипа
    updateLogoPreview();
    initGoogleAuth();
}

function updateLogoPreview() {
    const logoImg = document.getElementById('logo-img');
    const logoPreview = document.getElementById('logo-preview');
    if (logoImg && logoPreview) {
        if (appState.settings.logoBase64 || appState.settings.logoUrl) {
            logoImg.src = appState.settings.logoBase64 || appState.settings.logoUrl;
            logoPreview.classList.remove('hidden');
        } else {
            logoPreview.classList.add('hidden');
        }
    }
}

// Загрузка логотипа из файла
function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        appState.settings.logoBase64 = e.target.result;
        updateLogoPreview();
        showToast('Логотип загружен', 'success');
    };
    reader.readAsDataURL(file);
}

// ============================================
// Навигация
// ============================================

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
        page.classList.remove('hidden');
    }
    
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    if (pageName === 'history') {
        renderReportsList();
    }
}

function showCarPage(vin) {
    appState.currentCar = vin;
    showPage('car');
    renderCarDetails(vin);
}

function showReportPage(reportId) {
    const report = appState.reports.find(r => r.id === reportId);
    if (report) {
        appState.currentReport = report;
        showPage('report');
        renderReportContent(report);
    }
}

// ============================================
// Обновление UI
// ============================================

function updateUI() {
    document.getElementById('reports-count').textContent = appState.reports.length;
    renderCarsList();
    
    const noReports = document.getElementById('no-reports');
    const reportsList = document.getElementById('reports-list');
    
    if (appState.reports.length === 0) {
        if (noReports) noReports.classList.remove('hidden');
        if (reportsList) reportsList.classList.add('hidden');
    } else {
        if (noReports) noReports.classList.add('hidden');
        if (reportsList) reportsList.classList.remove('hidden');
    }
}

function renderCarsList() {
    const container = document.getElementById('cars-list');
    if (!container) return;
    
    const carVins = [...new Set(appState.reports.map(r => r.vin).filter(v => v && v !== 'Неизвестно'))];
    
    if (carVins.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm px-4">Нет автомобилей</p>';
        return;
    }
    
    container.innerHTML = carVins.map(vin => {
        const carReports = appState.reports.filter(r => r.vin === vin);
        const latestReport = carReports[0];
        const displayName = latestReport?.brand || vin.substring(0, 10) + '...';
        
        return `
            <button onclick="showCarPage('${vin}')" class="sidebar-item w-full text-left px-4 py-2 rounded-lg flex items-center gap-3">
                <i class="fas fa-car-side text-gray-400"></i>
                <div class="flex-1 min-w-0">
                    <span class="block truncate text-sm">${displayName}</span>
                    <span class="text-xs text-gray-500">${carReports.length} отчёт(ов)</span>
                </div>
            </button>
        `;
    }).join('');
}

function renderReportsList() {
    const container = document.getElementById('reports-list');
    const noReports = document.getElementById('no-reports');
    
    if (!container) return;
    
    const searchQuery = document.getElementById('search-reports')?.value.toLowerCase() || '';
    
    let filteredReports = appState.reports;
    if (searchQuery) {
        filteredReports = appState.reports.filter(r => 
            (r.vin && r.vin.toLowerCase().includes(searchQuery)) ||
            (r.brand && r.brand.toLowerCase().includes(searchQuery))
        );
    }
    
    if (filteredReports.length === 0) {
        container.innerHTML = '';
        if (noReports) noReports.classList.remove('hidden');
        return;
    }
    
    if (noReports) noReports.classList.add('hidden');
    
    filteredReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    container.innerHTML = filteredReports.map(report => `
        <div class="report-card card-gradient rounded-xl p-6 cursor-pointer" onclick="showReportPage('${report.id}')">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="bg-purple-600 text-xs px-2 py-1 rounded">${report.brand || 'Неизвестно'}</span>
                        <span class="text-gray-400 text-sm">${formatDate(report.createdAt)}</span>
                        <span class="text-xs px-2 py-1 rounded ${report.aiProvider === 'gemini' ? 'bg-blue-600' : 'bg-green-600'}">${report.aiProvider === 'gemini' ? 'Gemini' : 'GPT'}</span>
                    </div>
                    <h3 class="text-lg font-semibold mb-1">${report.vin || 'VIN не определён'}</h3>
                    <p class="text-gray-400 text-sm">${report.model || ''}</p>
                    <div class="flex items-center gap-4 mt-3 text-sm">
                        ${report.rating ? `<span class="text-yellow-400"><i class="fas fa-star"></i> ${report.rating}</span>` : ''}
                        ${report.mileage ? `<span class="text-blue-400"><i class="fas fa-tachometer-alt"></i> ${report.mileage} км</span>` : ''}
                    </div>
                </div>
                <div class="flex gap-2">
                    ${report.googleDocUrl ? `
                        <button onclick="event.stopPropagation(); openLink('${report.googleDocUrl}')" 
                                class="w-10 h-10 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/40 flex items-center justify-center"
                                title="Открыть Google Doc">
                            <i class="fab fa-google-drive"></i>
                        </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); deleteReport('${report.id}')" 
                            class="w-10 h-10 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 flex items-center justify-center"
                            title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderCarDetails(vin) {
    const container = document.getElementById('car-details');
    if (!container) return;
    
    const carReports = appState.reports.filter(r => r.vin === vin);
    const latestReport = carReports[0];
    
    container.innerHTML = `
        <div class="card-gradient rounded-2xl p-8 mb-6">
            <div class="flex items-center gap-4 mb-6">
                <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <i class="fas fa-car text-3xl"></i>
                </div>
                <div>
                    <h2 class="text-2xl font-bold">${latestReport?.brand || 'Неизвестный автомобиль'}</h2>
                    <p class="text-gray-400">${latestReport?.model || ''}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-black/30 rounded-lg p-4">
                    <p class="text-gray-400 text-sm">VIN</p>
                    <p class="font-semibold text-sm">${vin}</p>
                </div>
                <div class="bg-black/30 rounded-lg p-4">
                    <p class="text-gray-400 text-sm">Всего отчётов</p>
                    <p class="font-semibold">${carReports.length}</p>
                </div>
                <div class="bg-black/30 rounded-lg p-4">
                    <p class="text-gray-400 text-sm">Последний пробег</p>
                    <p class="font-semibold">${latestReport?.mileage || '—'} км</p>
                </div>
                <div class="bg-black/30 rounded-lg p-4">
                    <p class="text-gray-400 text-sm">Оценка</p>
                    <p class="font-semibold text-yellow-400">${latestReport?.rating || '—'} <i class="fas fa-star"></i></p>
                </div>
            </div>
        </div>
        
        <h3 class="text-xl font-semibold mb-4">История отчётов</h3>
        <div class="space-y-4">
            ${carReports.map(report => `
                <div class="report-card card-gradient rounded-xl p-4 cursor-pointer" onclick="showReportPage('${report.id}')">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-400">${formatDate(report.createdAt)}</p>
                            <p class="font-semibold">${report.mileage || '—'} км</p>
                        </div>
                        <span class="bg-purple-600/20 text-purple-400 text-xs px-3 py-1 rounded-full">
                            <i class="fas fa-file-alt mr-1"></i> Посмотреть
                        </span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderReportContent(report) {
    const container = document.getElementById('report-content');
    if (!container) return;
    
    container.innerHTML = report.htmlContent || '<p class="text-gray-400">Содержимое отчёта недоступно</p>';
}

// ============================================
// Работа с изображениями
// ============================================

function selectFiles() {
    if (isElectron) {
        ipcRenderer.invoke('select-files').then(result => {
            if (!result.canceled && result.files.length > 0) {
                addImages(result.files);
            }
        });
    } else {
        document.getElementById('file-input').click();
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    processFiles(files);
    event.target.value = ''; // Сброс для повторного выбора тех же файлов
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    processFiles(files);
}

async function processFiles(files) {
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const originalData = e.target.result;
            
            // Обрабатываем изображение (сжимаем если нужно, разбиваем длинные)
            const processedImages = await processImage(originalData, file.name);
            addImages(processedImages);
        };
        reader.readAsDataURL(file);
    }
}

// Обработка изображения - сжатие и разбивка
async function processImage(dataUrl, fileName) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const results = [];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let { width, height } = img;
            
            // Если изображение очень длинное (высота > 3x ширины), разбиваем на части
            if (height > width * 3) {
                const chunks = Math.ceil(height / CHUNK_HEIGHT);
                const chunkActualHeight = Math.ceil(height / chunks);
                
                for (let i = 0; i < chunks; i++) {
                    const startY = i * chunkActualHeight;
                    const endY = Math.min((i + 1) * chunkActualHeight, height);
                    const chunkHeight = endY - startY;
                    
                    // Масштабируем если нужно
                    let scaledWidth = width;
                    let scaledChunkHeight = chunkHeight;
                    
                    if (width > MAX_IMAGE_SIZE) {
                        const scale = MAX_IMAGE_SIZE / width;
                        scaledWidth = MAX_IMAGE_SIZE;
                        scaledChunkHeight = Math.round(chunkHeight * scale);
                    }
                    
                    canvas.width = scaledWidth;
                    canvas.height = scaledChunkHeight;
                    
                    ctx.drawImage(img, 
                        0, startY, width, chunkHeight,  // source
                        0, 0, scaledWidth, scaledChunkHeight  // destination
                    );
                    
                    // Сжимаем качество для уменьшения размера
                    let quality = 0.85;
                    let data = canvas.toDataURL('image/jpeg', quality);
                    
                    // Уменьшаем качество если файл слишком большой
                    while (data.length > MAX_IMAGE_BYTES * 1.37 && quality > 0.3) { // base64 ~37% больше
                        quality -= 0.1;
                        data = canvas.toDataURL('image/jpeg', quality);
                    }
                    
                    results.push({
                        name: `${fileName} (часть ${i + 1}/${chunks})`,
                        data: data,
                        originalSize: `${width}x${height}`,
                        processedSize: `${scaledWidth}x${scaledChunkHeight}`
                    });
                }
            } else {
                // Обычное изображение - просто масштабируем если нужно
                let scaledWidth = width;
                let scaledHeight = height;
                
                if (width > MAX_IMAGE_SIZE || height > MAX_IMAGE_SIZE) {
                    const scale = Math.min(MAX_IMAGE_SIZE / width, MAX_IMAGE_SIZE / height);
                    scaledWidth = Math.round(width * scale);
                    scaledHeight = Math.round(height * scale);
                }
                
                canvas.width = scaledWidth;
                canvas.height = scaledHeight;
                ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
                
                let quality = 0.85;
                let data = canvas.toDataURL('image/jpeg', quality);
                
                while (data.length > MAX_IMAGE_BYTES * 1.37 && quality > 0.3) {
                    quality -= 0.1;
                    data = canvas.toDataURL('image/jpeg', quality);
                }
                
                results.push({
                    name: fileName,
                    data: data,
                    originalSize: `${width}x${height}`,
                    processedSize: `${scaledWidth}x${scaledHeight}`
                });
            }
            
            resolve(results);
        };
        img.src = dataUrl;
    });
}

function addImages(images) {
    appState.images.push(...images);
    renderImagesPreview();
    
    document.getElementById('images-preview').classList.remove('hidden');
    document.getElementById('generate-section').classList.remove('hidden');
}

function renderImagesPreview() {
    const grid = document.getElementById('images-grid');
    const count = document.getElementById('images-count');
    
    count.textContent = appState.images.length;
    
    grid.innerHTML = appState.images.map((img, index) => `
        <div class="relative group">
            <img src="${img.data}" alt="${img.name}" 
                 class="image-preview w-full h-32 object-cover rounded-lg cursor-pointer"
                 onclick="openImageModal(${index})">
            <button onclick="removeImage(${index})" 
                    class="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <i class="fas fa-times"></i>
            </button>
            <p class="text-xs text-gray-400 truncate mt-1">${img.name}</p>
            ${img.processedSize ? `<p class="text-xs text-gray-500">${img.processedSize}</p>` : ''}
        </div>
    `).join('');
}

function removeImage(index) {
    appState.images.splice(index, 1);
    renderImagesPreview();
    
    if (appState.images.length === 0) {
        document.getElementById('images-preview').classList.add('hidden');
        document.getElementById('generate-section').classList.add('hidden');
    }
}

function clearImages() {
    appState.images = [];
    renderImagesPreview();
    document.getElementById('images-preview').classList.add('hidden');
    document.getElementById('generate-section').classList.add('hidden');
}

// ============================================
// Модальные окна
// ============================================

function openImageModal(index) {
    const img = appState.images[index];
    if (img) {
        document.getElementById('modal-image').src = img.data;
        document.getElementById('image-modal').classList.remove('hidden');
        document.getElementById('image-modal').classList.add('flex');
    }
}

function closeImageModal(event) {
    if (!event || event.target === document.getElementById('image-modal')) {
        document.getElementById('image-modal').classList.add('hidden');
        document.getElementById('image-modal').classList.remove('flex');
    }
}

// ============================================
// Генерация отчёта
// ============================================

async function generateReport() {
    if (appState.images.length === 0) {
        showToast('Загрузите изображения', 'error');
        return;
    }
    
    const provider = appState.settings.aiProvider || 'openai';
    const apiKey = provider === 'gemini' ? appState.settings.geminiKey : appState.settings.openaiKey;
    
    if (!apiKey) {
        showToast(`Укажите API ключ ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} в настройках`, 'error');
        showPage('settings');
        return;
    }
    
    document.getElementById('generate-section').classList.add('hidden');
    document.getElementById('progress-section').classList.remove('hidden');
    
    try {
        updateProgress('Подготовка изображений...', 10);
        
        const systemPrompt = getSystemPrompt();
        const userPrompt = 'Проанализируй эти скриншоты китайского отчёта об автомобиле и извлеки всю информацию в указанном JSON формате. Переведи все китайские тексты на русский. Верни ТОЛЬКО валидный JSON без дополнительного текста.';
        
        updateProgress(`Отправка на анализ (${provider === 'gemini' ? 'Gemini' : 'GPT'})...`, 30);
        
        let content;
        if (provider === 'gemini') {
            content = await callGeminiAPI(apiKey, systemPrompt, userPrompt);
        } else {
            content = await callOpenAIAPI(apiKey, systemPrompt, userPrompt);
        }
        
        updateProgress('Обработка ответа...', 70);
        
        // Парсим JSON из ответа
        let reportData;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                reportData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('JSON not found in response');
            }
        } catch (e) {
            console.error('Parse error:', e);
            console.log('Raw content:', content);
            reportData = { rawContent: content };
        }
        
        updateProgress('Генерация отчёта...', 85);
        
        const htmlContent = generateHTMLReport(reportData);
        
        const report = {
            id: generateId(),
            createdAt: new Date().toISOString(),
            vin: reportData.vin || 'Неизвестно',
            brand: reportData.brand || 'Неизвестно',
            model: reportData.model || '',
            rating: reportData.rating || null,
            mileage: reportData.lastMileage || null,
            data: reportData,
            htmlContent: htmlContent,
            googleDocUrl: null,
            aiProvider: provider,
            images: appState.images.map(i => i.data.substring(0, 100) + '...') // Сохраняем только превью
        };
        
        updateProgress('Сохранение отчёта...', 95);
        
        appState.reports.unshift(report);
        await saveData();
        
        updateProgress('Готово!', 100);
        
        clearImages();
        updateUI();
        
        setTimeout(() => {
            document.getElementById('progress-section').classList.add('hidden');
            document.getElementById('generate-section').classList.remove('hidden');
            showReportPage(report.id);
            showToast('Отчёт успешно создан!', 'success');
        }, 500);
        
    } catch (error) {
        console.error('Generation error:', error);
        document.getElementById('progress-section').classList.add('hidden');
        document.getElementById('generate-section').classList.remove('hidden');
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

function getSystemPrompt() {
    return `Ты эксперт по анализу китайских отчётов об автомобилях. Извлеки ВСЮ информацию с изображений и верни в JSON формате.

ВАЖНО: Возвращай ТОЛЬКО JSON, без markdown, без комментариев!

{
  "brand": "Марка авто на русском",
  "model": "Полная модель",
  "vin": "VIN номер (полный или частичный)",
  "fuelType": "Тип топлива",
  "queryDate": "Дата запроса отчёта",
  "rating": "Оценка состояния (число, например 4.9)",
  "componentClass": "Класс узлов (A/B/C)",
  "mileageAnomalies": "Не обнаружено / Обнаружено",
  "lastMileage": "Последний пробег (только число в км)",
  "lastMileageDate": "Дата последнего пробега (YYYY-MM)",
  "maintenanceHabits": "Привычки обслуживания (Отличные/Хорошие/Удовлетворительные)",
  "lastMaintenanceDate": "Дата последнего ТО",
  "safetyChecks": {
    "accident": "5.0",
    "fire": "5.0",
    "flood": "5.0"
  },
  "components": {
    "airbags": {"status": "ok", "note": ""},
    "seatbelts": {"status": "ok", "note": ""},
    "axles": {"status": "ok", "note": ""},
    "suspension": {"status": "ok", "note": ""},
    "steering": {"status": "ok", "note": ""},
    "brakes": {"status": "ok", "note": ""},
    "airConditioner": {"status": "ok/problem", "note": "", "date": "", "description": ""}
  },
  "mileageHistory": [
    {"date": "2022-02", "mileage": "9", "status": "Первое посещение дилера"}
  ],
  "mileageSummary": {
    "maxMileage": "число",
    "anomalies": "0",
    "estimatedCurrent": "число",
    "avgYearly": "число"
  },
  "maintenanceFrequency": "0.8",
  "lastDealerVisit": "дата",
  "yearsWithoutDealer": "число",
  "serviceHistory": {
    "period": "2022.02.12 — 2024.09.01",
    "totalVisits": "8",
    "repairs": "5",
    "maintenance": "3",
    "records": [
      {
        "date": "02/2022",
        "mileage": "7",
        "description": "Предпродажная подготовка PDI",
        "materials": []
      }
    ]
  },
  "vehicleInfo": {
    "year": "2021",
    "engineVolume": "1395",
    "power": "110",
    "transmission": "DCT 7-ступ робот",
    "dimensions": {"length": "4343", "width": "1815", "height": "1458"},
    "weight": "1400",
    "production": "Китай"
  },
  "ownerInfo": {
    "ownerType": "Частное лицо",
    "registrationTime": "3-4 года",
    "ownersCount": "2",
    "usage": "Личное"
  },
  "insuranceInfo": {
    "osago": "действует",
    "kasko": "действует",
    "claims": "0",
    "maxDamage": "0"
  },
  "conclusion": {
    "accidents": "нет",
    "bodyAnomalies": "нет",
    "insuranceRepairs": "нет",
    "componentProblems": "нет",
    "recommendation": "Автомобиль в хорошем состоянии"
  }
}

Извлеки максимум информации. Если поле не найдено - поставь null. Возвращай ТОЛЬКО JSON!`;
}

// Вызов OpenAI API
async function callOpenAIAPI(apiKey, systemPrompt, userPrompt) {
    const imageContents = appState.images.map(img => ({
        type: 'image_url',
        image_url: {
            url: img.data,
            detail: 'high'
        }
    }));
    
    const response = await fetch('https://www.genspark.ai/api/llm_proxy/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-5',
            messages: [
                { role: 'system', content: systemPrompt },
                { 
                    role: 'user', 
                    content: [
                        { type: 'text', text: userPrompt },
                        ...imageContents
                    ]
                }
            ],
            max_tokens: 8192
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// Вызов Gemini API
async function callGeminiAPI(apiKey, systemPrompt, userPrompt) {
    const imageParts = appState.images.map(img => {
        const base64Data = img.data.split(',')[1];
        const mimeType = img.data.split(';')[0].split(':')[1] || 'image/jpeg';
        return {
            inline_data: {
                mime_type: mimeType,
                data: base64Data
            }
        };
    });
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: systemPrompt + '\n\n' + userPrompt },
                    ...imageParts
                ]
            }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
    }
    
    throw new Error('Неожиданный формат ответа от Gemini');
}

function updateProgress(status, percent) {
    document.getElementById('progress-status').textContent = status;
    document.getElementById('progress-bar').style.width = `${percent}%`;
}

// ============================================
// Генерация HTML отчёта
// ============================================

function generateHTMLReport(data) {
    const logoSrc = appState.settings.logoBase64 || appState.settings.logoUrl || '';
    
    return `
<div class="report-container" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 0 auto; color: #333; line-height: 1.6; background: white; padding: 30px;">
    
    <!-- Шапка с логотипом -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4a4a8a;">
        <div>
            <h1 style="font-size: 26px; font-weight: bold; color: #2a2a5a; margin: 0;">Экспертный отчёт об автомобиле</h1>
            <p style="font-size: 16px; color: #666; margin-top: 5px;">Отчёт об истории автомобиля</p>
        </div>
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="max-height: 70px; max-width: 180px; object-fit: contain;">` : ''}
    </div>
    
    <!-- Основная информация -->
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Марка / модель</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.brand || '—'} ${data.model || ''}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Тип</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.fuelType || 'Бензиновый автомобиль'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Дата запроса</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.queryDate || new Date().toLocaleDateString('ru-RU')}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">VIN</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.vin || '—'}</p>
            </div>
        </div>
    </div>
    
    <!-- 1. Общая оценка -->
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">1. Общая оценка автомобиля</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Оценка состояния</span>
                <p style="margin: 5px 0 0 0;"><span style="display: inline-block; background: linear-gradient(135deg, #ffd700, #ffb800); color: #333; padding: 6px 14px; border-radius: 15px; font-weight: bold; font-size: 16px;">★ ${data.rating || '—'}</span></p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Класс важных узлов</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.componentClass || 'A'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Аномалии пробега</span>
                <p style="font-size: 15px; font-weight: 600; color: ${data.mileageAnomalies === 'Обнаружено' ? '#dc3545' : '#28a745'}; margin: 5px 0 0 0;">${data.mileageAnomalies || 'Не обнаружено'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Последний пробег</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.lastMileage ? `${data.lastMileage} км` : '—'} ${data.lastMileageDate ? `(${data.lastMileageDate})` : ''}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Привычки обслуживания</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.maintenanceHabits || 'Отличные'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Последнее ТО</span>
                <p style="font-size: 15px; font-weight: 600; color: #333; margin: 5px 0 0 0;">${data.lastMaintenanceDate || '—'}</p>
            </div>
        </div>
        
        ${data.safetyChecks ? `
        <h3 style="margin-top: 20px; margin-bottom: 15px; font-size: 14px; color: #666;">Безопасность / риски</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="text-align: center; padding: 15px; background: white; border-radius: 10px;">
                <div style="font-size: 13px; color: #666; margin-bottom: 5px;">ДТП</div>
                <div style="font-size: 22px; font-weight: bold; color: #28a745;">${data.safetyChecks.accident || '5.0'}</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 10px;">
                <div style="font-size: 13px; color: #666; margin-bottom: 5px;">Пожар</div>
                <div style="font-size: 22px; font-weight: bold; color: #28a745;">${data.safetyChecks.fire || '5.0'}</div>
            </div>
            <div style="text-align: center; padding: 15px; background: white; border-radius: 10px;">
                <div style="font-size: 13px; color: #666; margin-bottom: 5px;">Затопление</div>
                <div style="font-size: 22px; font-weight: bold; color: #28a745;">${data.safetyChecks.flood || '5.0'}</div>
            </div>
        </div>
        ` : ''}
    </div>
    
    <!-- 2. Ключевые узлы -->
    ${data.components ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">2. Ключевые узлы автомобиля</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            ${generateComponentHTML('Подушки безопасности', data.components.airbags)}
            ${generateComponentHTML('Ремни безопасности', data.components.seatbelts)}
            ${generateComponentHTML('Передний/задний мосты', data.components.axles)}
            ${generateComponentHTML('Подвеска', data.components.suspension)}
            ${generateComponentHTML('Рулевое управление', data.components.steering)}
            ${generateComponentHTML('Тормозная система', data.components.brakes)}
            ${generateComponentHTML('Система кондиционирования', data.components.airConditioner)}
        </div>
        ${data.components.airConditioner?.status === 'problem' ? `
        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <strong>⚠️ Система кондиционирования:</strong> обнаружена проблема<br>
            ${data.components.airConditioner.date ? `<span style="color: #666;">Дата: ${data.components.airConditioner.date}</span><br>` : ''}
            ${data.components.airConditioner.description ? `<span style="color: #666;">${data.components.airConditioner.description}</span>` : ''}
        </div>
        ` : ''}
    </div>
    ` : ''}
    
    <!-- 3. Пробег -->
    ${data.mileageHistory && data.mileageHistory.length > 0 ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">3. Пробег (хронология)</h2>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #e9ecef;">
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Дата</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Пробег</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600; color: #495057;">Статус</th>
                </tr>
            </thead>
            <tbody>
                ${data.mileageHistory.map(m => `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 12px;">${m.date || '—'}</td>
                    <td style="padding: 12px;">${m.mileage ? `${m.mileage} км` : '—'}</td>
                    <td style="padding: 12px;">${m.status || '—'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        ${data.mileageSummary ? `
        <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px;">
            <h4 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Общее</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                <div>
                    <span style="font-size: 11px; color: #888;">Макс. пробег</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.maxMileage || '—'} км</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Аномалий</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.anomalies || '0'}</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Прогноз текущего</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.estimatedCurrent || '—'} км</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Среднегодовой</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.avgYearly || '—'} км/год</p>
                </div>
            </div>
        </div>
        ` : ''}
    </div>
    ` : ''}
    
    <!-- 4. Привычки обслуживания -->
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">4. Привычки обслуживания</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Средняя частота</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.maintenanceFrequency || '—'} раз(а) в год</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Последнее ТО</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.lastMaintenanceDate || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Без обслуживания у дилера</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.yearsWithoutDealer ? `${data.yearsWithoutDealer} года` : '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888; text-transform: uppercase;">Последнее посещение дилера</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.lastDealerVisit || '—'}</p>
            </div>
        </div>
    </div>
    
    <!-- 5. История обслуживания -->
    ${data.serviceHistory && data.serviceHistory.records && data.serviceHistory.records.length > 0 ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">5. История обслуживания</h2>
        <div style="margin-bottom: 20px; color: #666; font-size: 14px;">
            <p style="margin: 5px 0;"><strong>Период:</strong> ${data.serviceHistory.period || '—'}</p>
            <p style="margin: 5px 0;"><strong>Всего:</strong> ${data.serviceHistory.totalVisits || '—'} посещений (${data.serviceHistory.repairs || '—'} ремонтов, ${data.serviceHistory.maintenance || '—'} ТО)</p>
        </div>
        <h4 style="margin-bottom: 15px; font-size: 14px;">📌 Детализация записей</h4>
        ${data.serviceHistory.records.map(r => `
        <div style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 12px; border-left: 4px solid #4a4a8a;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: #4a4a8a; font-size: 14px;">${r.date || '—'}</span>
                <span style="color: #666; font-size: 13px;">${r.mileage ? `${r.mileage} км` : ''}</span>
            </div>
            ${r.description ? `<div style="margin-top: 8px; color: #333; font-size: 13px;"><strong>Описание:</strong> ${r.description}</div>` : ''}
            ${r.materials && r.materials.length > 0 ? `
            <div style="margin-top: 8px; padding-left: 15px; color: #666; font-size: 12px;">
                <strong>Материалы:</strong>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    ${r.materials.map(m => `<li>${m}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    <!-- 6. Информация об автомобиле -->
    ${data.vehicleInfo ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">6. Информация об автомобиле</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888;">Год выпуска</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.year || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Объём двигателя</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.engineVolume ? `${data.vehicleInfo.engineVolume} мл` : '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Мощность</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.power ? `${data.vehicleInfo.power} kW` : '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">КПП</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.transmission || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Масса</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.weight ? `${data.vehicleInfo.weight} кг` : '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Производство</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.vehicleInfo.production || '—'}</p>
            </div>
        </div>
    </div>
    ` : ''}
    
    <!-- 7. Информация о владельцах -->
    ${data.ownerInfo ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">7. Информация о владельцах</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888;">Тип собственника</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.ownerInfo.ownerType || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Срок с регистрации</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.ownerInfo.registrationTime || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Количество владельцев</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.ownerInfo.ownersCount || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Использование</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.ownerInfo.usage || '—'}</p>
            </div>
        </div>
    </div>
    ` : ''}
    
    <!-- 8. Страховая информация -->
    ${data.insuranceInfo ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">8. Страховая информация</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
                <span style="font-size: 11px; color: #888;">ОСАГО</span>
                <p style="font-size: 14px; font-weight: 600; color: ${data.insuranceInfo.osago === 'действует' ? '#28a745' : '#333'}; margin: 3px 0 0 0;">${data.insuranceInfo.osago || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">КАСКО</span>
                <p style="font-size: 14px; font-weight: 600; color: ${data.insuranceInfo.kasko === 'действует' ? '#28a745' : '#333'}; margin: 3px 0 0 0;">${data.insuranceInfo.kasko || '—'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Страховые случаи</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.insuranceInfo.claims || '0'}</p>
            </div>
            <div>
                <span style="font-size: 11px; color: #888;">Макс. ущерб</span>
                <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.insuranceInfo.maxDamage || '0'} юаней</p>
            </div>
        </div>
    </div>
    ` : ''}
    
    <!-- 9. Итоговое заключение -->
    ${data.conclusion ? `
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">9. Итоговое заключение</h2>
        <div style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius: 12px; padding: 20px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="color: ${data.conclusion.accidents === 'нет' ? '#28a745' : '#dc3545'}; font-size: 18px;">${data.conclusion.accidents === 'нет' ? '✔' : '❌'}</span>
                <span>Аварии: ${data.conclusion.accidents || 'не зафиксировано'}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="color: ${data.conclusion.bodyAnomalies === 'нет' ? '#28a745' : '#dc3545'}; font-size: 18px;">${data.conclusion.bodyAnomalies === 'нет' ? '✔' : '❌'}</span>
                <span>Аномалии кузова: ${data.conclusion.bodyAnomalies || 'нет'}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="color: ${data.conclusion.insuranceRepairs === 'нет' ? '#28a745' : '#dc3545'}; font-size: 18px;">${data.conclusion.insuranceRepairs === 'нет' ? '✔' : '❌'}</span>
                <span>Страховые ремонты: ${data.conclusion.insuranceRepairs || 'нет'}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="color: ${data.conclusion.componentProblems === 'нет' ? '#28a745' : '#dc3545'}; font-size: 18px;">${data.conclusion.componentProblems === 'нет' ? '✔' : '❌'}</span>
                <span>Проблемы по важным узлам: ${data.conclusion.componentProblems || 'не обнаружено'}</span>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #a5d6a7;">
                <strong>➡ Рекомендация:</strong> ${data.conclusion.recommendation || 'Нет особых замечаний'}
            </div>
        </div>
    </div>
    ` : ''}
    
    <!-- Футер -->
    <div style="text-align: center; color: #999; font-size: 11px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        Отчёт сгенерирован автоматически • ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}
    </div>
</div>
`;
}

function generateComponentHTML(name, component) {
    const isOk = !component || component.status === 'ok' || !component.status;
    return `
    <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: white; border-radius: 8px;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: ${isOk ? '#d4edda' : '#f8d7da'}; color: ${isOk ? '#28a745' : '#dc3545'}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${isOk ? '✔' : '❌'}</div>
        <span style="font-size: 13px;">${name}</span>
    </div>
    `;
}

// ============================================
// Экспорт в PDF
// ============================================

async function exportToPDF() {
    if (!appState.currentReport) return;
    
    showToast('Генерация PDF...', 'info');
    
    // Создаём iframe для печати
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-10000px';
    printFrame.style.left = '-10000px';
    document.body.appendChild(printFrame);
    
    const printDoc = printFrame.contentWindow.document;
    printDoc.open();
    printDoc.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Отчёт - ${appState.currentReport.vin}</title>
    <style>
        @media print {
            body { 
                margin: 0; 
                padding: 20px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            @page { 
                margin: 15mm; 
                size: A4;
            }
        }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: white;
        }
    </style>
</head>
<body>
    ${appState.currentReport.htmlContent}
</body>
</html>
    `);
    printDoc.close();
    
    // Ждём загрузки изображений
    await new Promise(resolve => setTimeout(resolve, 500));
    
    printFrame.contentWindow.print();
    
    // Удаляем iframe после печати
    setTimeout(() => {
        document.body.removeChild(printFrame);
    }, 1000);
}

// ============================================
// Экспорт в Google Docs
// ============================================

async function createGoogleDoc() {
    const apiKey = appState.settings.googleApiKey;
    
    if (!apiKey) {
        showToast('Укажите Google API Key в настройках', 'warning');
        // Fallback - копируем в буфер
        copyReportAsText();
        return;
    }
    
    showToast('Создание Google Doc...', 'info');
    
    try {
        // Конвертируем HTML в текст для Google Docs
        const textContent = htmlToGoogleDocsText(appState.currentReport.htmlContent);
        
        // Создаём документ через Google Docs API
        const response = await fetch(`https://docs.googleapis.com/v1/documents?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `Отчёт авто - ${appState.currentReport.vin} - ${formatDateForFile(appState.currentReport.createdAt)}`
            })
        });
        
        if (!response.ok) {
            throw new Error('Не удалось создать документ');
        }
        
        const doc = await response.json();
        const docId = doc.documentId;
        
        // Добавляем контент в документ
        await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    insertText: {
                        location: { index: 1 },
                        text: textContent
                    }
                }]
            })
        });
        
        const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
        
        // Сохраняем ссылку
        appState.currentReport.googleDocUrl = docUrl;
        await saveData();
        
        showToast('Google Doc создан!', 'success');
        openLink(docUrl);
        
    } catch (error) {
        console.error('Google Docs error:', error);
        showToast('Ошибка создания Google Doc. Копируем текст...', 'warning');
        copyReportAsText();
    }
}

function htmlToGoogleDocsText(html) {
    // Простое преобразование HTML в текст с сохранением структуры
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    let text = '';
    
    // Рекурсивно обходим элементы
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            
            if (tag === 'h1' || tag === 'h2') {
                text += '\n\n';
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag === 'h3' || tag === 'h4') {
                text += '\n';
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag === 'p' || tag === 'div') {
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag === 'br') {
                text += '\n';
            } else if (tag === 'li') {
                text += '• ';
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag === 'tr') {
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag === 'td' || tag === 'th') {
                for (const child of node.childNodes) processNode(child);
                text += '\t';
            } else if (tag === 'table') {
                text += '\n';
                for (const child of node.childNodes) processNode(child);
                text += '\n';
            } else if (tag !== 'style' && tag !== 'script') {
                for (const child of node.childNodes) processNode(child);
            }
        }
    }
    
    processNode(temp);
    
    // Очистка лишних пробелов
    return text.replace(/\n{3,}/g, '\n\n').trim();
}

function copyReportAsText() {
    const text = htmlToGoogleDocsText(appState.currentReport.htmlContent);
    navigator.clipboard.writeText(text).then(() => {
        window.open('https://docs.google.com/document/create', '_blank');
        showToast('Текст скопирован! Вставьте в Google Docs (Ctrl+V)', 'success');
    });
}

// ============================================
// Действия с отчётами
// ============================================

function filterReports() {
    renderReportsList();
}

async function deleteReport(reportId) {
    if (!confirm('Удалить этот отчёт?')) return;
    
    appState.reports = appState.reports.filter(r => r.id !== reportId);
    await saveData();
    updateUI();
    renderReportsList();
    showToast('Отчёт удалён', 'success');
}

function copyReportLink() {
    if (appState.currentReport?.googleDocUrl) {
        navigator.clipboard.writeText(appState.currentReport.googleDocUrl);
        showToast('Ссылка на Google Doc скопирована', 'success');
    } else {
        showToast('Google Doc ещё не создан', 'warning');
    }
}

async function exportReport() {
    if (!appState.currentReport) return;
    
    // Экспорт как HTML (для обратной совместимости)
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчёт - ${appState.currentReport.vin}</title>
</head>
<body style="background: white; padding: 20px;">
    ${appState.currentReport.htmlContent}
</body>
</html>`;
    
    const filename = `Отчёт_${appState.currentReport.vin}_${formatDateForFile(appState.currentReport.createdAt)}.html`;
    
    if (isElectron) {
        const result = await ipcRenderer.invoke('export-report', {
            content: html,
            defaultName: filename
        });
        if (result.success) {
            showToast('Отчёт сохранён', 'success');
        }
    } else {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('HTML скачан', 'success');
    }
}

// ============================================
// Вспомогательные функции
// ============================================

function generateId() {
    return 'report_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateForFile(dateString) {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
}

function openLink(url) {
    if (isElectron) {
        ipcRenderer.invoke('open-external', url);
    } else {
        window.open(url, '_blank');
    }
}

function toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${colors[type]} px-6 py-3 rounded-lg shadow-lg flex items-center gap-3`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Обработка клавиш
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeImageModal();
    }
});
