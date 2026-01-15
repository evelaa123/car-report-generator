// ============================================
// Генератор Отчётов Авто - Главный JavaScript
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
        logoUrl: '',
        googleFolderId: ''
    },
    currentReport: null,
    currentCar: null
};

// ============================================
// Инициализация
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await loadSettings();
    updateUI();
});

// ============================================
// Загрузка и сохранение данных
// ============================================

async function loadData() {
    if (isElectron) {
        const data = await ipcRenderer.invoke('load-data');
        appState.reports = data.reports || [];
        appState.cars = data.cars || {};
    } else {
        // Веб-версия - localStorage
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
    document.getElementById('openai-key').value = appState.settings.openaiKey || '';
    document.getElementById('logo-url').value = appState.settings.logoUrl || '';
    document.getElementById('google-folder-id').value = appState.settings.googleFolderId || '';
    
    // Превью логотипа
    if (appState.settings.logoUrl) {
        document.getElementById('logo-img').src = appState.settings.logoUrl;
        document.getElementById('logo-preview').classList.remove('hidden');
    }
}

async function saveSettings() {
    appState.settings.openaiKey = document.getElementById('openai-key').value;
    appState.settings.logoUrl = document.getElementById('logo-url').value;
    appState.settings.googleFolderId = document.getElementById('google-folder-id').value;
    
    if (isElectron) {
        await ipcRenderer.invoke('save-settings', appState.settings);
    } else {
        localStorage.setItem('carReportsSettings', JSON.stringify(appState.settings));
    }
    
    showToast('Настройки сохранены', 'success');
    
    // Обновить превью логотипа
    if (appState.settings.logoUrl) {
        document.getElementById('logo-img').src = appState.settings.logoUrl;
        document.getElementById('logo-preview').classList.remove('hidden');
    } else {
        document.getElementById('logo-preview').classList.add('hidden');
    }
}

// ============================================
// Навигация
// ============================================

function showPage(pageName) {
    // Скрыть все страницы
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    
    // Показать нужную страницу
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
        page.classList.remove('hidden');
    }
    
    // Обновить активный пункт меню
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    // Обновить контент страницы
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
    // Обновить счётчик отчётов
    document.getElementById('reports-count').textContent = appState.reports.length;
    
    // Обновить список автомобилей в сайдбаре
    renderCarsList();
    
    // Показать/скрыть сообщение об отсутствии отчётов
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
    
    const carVins = [...new Set(appState.reports.map(r => r.vin).filter(v => v))];
    
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
    
    // Сортировка от новых к старым
    filteredReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    container.innerHTML = filteredReports.map(report => `
        <div class="report-card card-gradient rounded-xl p-6 cursor-pointer" onclick="showReportPage('${report.id}')">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="bg-purple-600 text-xs px-2 py-1 rounded">${report.brand || 'Неизвестно'}</span>
                        <span class="text-gray-400 text-sm">${formatDate(report.createdAt)}</span>
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
                                class="w-10 h-10 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/40 flex items-center justify-center">
                            <i class="fab fa-google-drive"></i>
                        </button>
                    ` : ''}
                    <button onclick="event.stopPropagation(); deleteReport('${report.id}')" 
                            class="w-10 h-10 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 flex items-center justify-center">
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
                    <p class="font-semibold">${vin}</p>
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
                        <div class="flex gap-2">
                            <span class="bg-purple-600/20 text-purple-400 text-xs px-3 py-1 rounded-full">
                                <i class="fas fa-file-alt mr-1"></i> Посмотреть
                            </span>
                        </div>
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
// Работа с файлами
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

function processFiles(files) {
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            addImages([{
                name: file.name,
                data: e.target.result
            }]);
        };
        reader.readAsDataURL(file);
    });
}

function addImages(images) {
    appState.images.push(...images);
    renderImagesPreview();
    
    // Показать секцию генерации
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
                 onclick="openImageModal('${img.data}')">
            <button onclick="removeImage(${index})" 
                    class="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                <i class="fas fa-times"></i>
            </button>
            <p class="text-xs text-gray-400 truncate mt-1">${img.name}</p>
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

function openImageModal(src) {
    document.getElementById('modal-image').src = src;
    document.getElementById('image-modal').classList.remove('hidden');
    document.getElementById('image-modal').classList.add('flex');
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
    
    const apiKey = appState.settings.openaiKey;
    if (!apiKey) {
        showToast('Укажите API ключ OpenAI в настройках', 'error');
        showPage('settings');
        return;
    }
    
    // Показать прогресс
    document.getElementById('generate-section').classList.add('hidden');
    document.getElementById('progress-section').classList.remove('hidden');
    
    try {
        updateProgress('Подготовка изображений...', 10);
        
        // Создаём сообщения для GPT-4 Vision
        const imageContents = appState.images.map(img => ({
            type: 'image_url',
            image_url: {
                url: img.data,
                detail: 'high'
            }
        }));
        
        updateProgress('Отправка на анализ...', 30);
        
        const systemPrompt = `Ты эксперт по анализу китайских отчётов об автомобилях. Твоя задача - перевести и структурировать данные из скриншотов китайских отчётов в подробный русский отчёт.

ВАЖНО: Извлеки ВСЮ информацию с изображений и верни её в формате JSON:

{
  "brand": "Марка авто на русском",
  "model": "Полная модель",
  "vin": "VIN номер",
  "fuelType": "Тип топлива",
  "queryDate": "Дата запроса",
  "rating": "Оценка (например 4.9)",
  "componentClass": "Класс узлов (A/B/C)",
  "mileageAnomalies": "Есть/Нет",
  "lastMileage": "Последний пробег в км",
  "lastMileageDate": "Дата последнего пробега",
  "maintenanceHabits": "Привычки обслуживания",
  "lastMaintenanceDate": "Дата последнего ТО",
  "safetyChecks": {
    "accident": "Оценка ДТП",
    "fire": "Оценка пожар",
    "flood": "Оценка затопление"
  },
  "components": {
    "airbags": {"status": "ok/problem", "note": ""},
    "seatbelts": {"status": "ok/problem", "note": ""},
    "axles": {"status": "ok/problem", "note": ""},
    "suspension": {"status": "ok/problem", "note": ""},
    "steering": {"status": "ok/problem", "note": ""},
    "brakes": {"status": "ok/problem", "note": ""},
    "airConditioner": {"status": "ok/problem", "note": "", "date": "", "description": ""}
  },
  "mileageHistory": [
    {"date": "YYYY-MM", "mileage": "число", "status": "описание"}
  ],
  "mileageSummary": {
    "maxMileage": "число",
    "anomalies": "число",
    "estimatedCurrent": "число",
    "avgYearly": "число"
  },
  "maintenanceFrequency": "число раз в год",
  "lastDealerVisit": "дата",
  "yearsWithoutDealer": "число",
  "serviceHistory": {
    "period": "дата-дата",
    "totalVisits": "число",
    "repairs": "число",
    "maintenance": "число",
    "records": [
      {
        "date": "MM/YYYY",
        "mileage": "число км",
        "description": "описание работ",
        "materials": ["список материалов"]
      }
    ]
  },
  "vehicleInfo": {
    "year": "год выпуска",
    "engineVolume": "объём в мл",
    "power": "мощность в kW",
    "transmission": "тип КПП",
    "dimensions": {"length": "", "width": "", "height": ""},
    "weight": "масса в кг",
    "production": "место производства"
  },
  "ownerInfo": {
    "ownerType": "частное лицо/юр лицо",
    "registrationTime": "срок с регистрации",
    "ownersCount": "число владельцев",
    "usage": "тип использования"
  },
  "insuranceInfo": {
    "osago": "действует/нет",
    "kasko": "действует/нет",
    "claims": "число",
    "maxDamage": "сумма"
  },
  "conclusion": {
    "accidents": "обнаружено/нет",
    "bodyAnomalies": "есть/нет",
    "insuranceRepairs": "есть/нет",
    "componentProblems": "есть/нет",
    "recommendation": "текст рекомендации"
  }
}

Извлеки максимум информации. Если какое-то поле не найдено - поставь null.`;

        const userPrompt = 'Проанализируй эти скриншоты китайского отчёта об автомобиле и извлеки всю информацию в указанном JSON формате. Переведи все китайские тексты на русский.';
        
        // Отправляем запрос к API
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
                max_tokens: 4096
            })
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        updateProgress('Обработка ответа...', 70);
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Парсим JSON из ответа
        let reportData;
        try {
            // Ищем JSON в ответе
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                reportData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('JSON not found in response');
            }
        } catch (e) {
            console.error('Parse error:', e);
            // Если парсинг не удался, создаём базовый объект
            reportData = { rawContent: content };
        }
        
        updateProgress('Генерация HTML отчёта...', 85);
        
        // Генерируем HTML отчёт
        const htmlContent = generateHTMLReport(reportData);
        
        // Создаём объект отчёта
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
            images: appState.images.map(i => i.data)
        };
        
        updateProgress('Сохранение отчёта...', 95);
        
        // Сохраняем отчёт
        appState.reports.unshift(report);
        await saveData();
        
        updateProgress('Готово!', 100);
        
        // Очищаем изображения
        clearImages();
        
        // Обновляем UI
        updateUI();
        
        // Показываем отчёт
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

function updateProgress(status, percent) {
    document.getElementById('progress-status').textContent = status;
    document.getElementById('progress-bar').style.width = `${percent}%`;
}

// ============================================
// Генерация HTML отчёта
// ============================================

function generateHTMLReport(data) {
    const logoUrl = appState.settings.logoUrl || '';
    
    return `
<style>
    .report-container {
        font-family: 'Segoe UI', Arial, sans-serif;
        max-width: 900px;
        margin: 0 auto;
        color: #333;
        line-height: 1.6;
    }
    .report-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 3px solid #4a4a8a;
    }
    .report-logo {
        max-height: 80px;
        max-width: 200px;
    }
    .report-title {
        font-size: 28px;
        font-weight: bold;
        color: #2a2a5a;
        margin: 0;
    }
    .report-subtitle {
        font-size: 18px;
        color: #666;
        margin-top: 5px;
    }
    .section {
        margin-bottom: 30px;
        background: #f8f9fa;
        border-radius: 12px;
        padding: 20px;
    }
    .section-title {
        font-size: 20px;
        font-weight: bold;
        color: #2a2a5a;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e0e0e0;
    }
    .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
    }
    .info-item {
        display: flex;
        flex-direction: column;
    }
    .info-label {
        font-size: 12px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .info-value {
        font-size: 16px;
        font-weight: 600;
        color: #333;
    }
    .rating-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: linear-gradient(135deg, #ffd700, #ffb800);
        color: #333;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 18px;
    }
    .status-ok {
        color: #28a745;
    }
    .status-problem {
        color: #dc3545;
    }
    .component-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
    }
    .component-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        background: white;
        border-radius: 8px;
    }
    .check-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    }
    .check-ok {
        background: #d4edda;
        color: #28a745;
    }
    .check-fail {
        background: #f8d7da;
        color: #dc3545;
    }
    .mileage-table {
        width: 100%;
        border-collapse: collapse;
    }
    .mileage-table th,
    .mileage-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e0e0e0;
    }
    .mileage-table th {
        background: #e9ecef;
        font-weight: 600;
        color: #495057;
    }
    .mileage-table tr:hover {
        background: #f1f3f5;
    }
    .service-record {
        background: white;
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 15px;
        border-left: 4px solid #4a4a8a;
    }
    .service-date {
        font-weight: bold;
        color: #4a4a8a;
        font-size: 14px;
    }
    .service-mileage {
        color: #666;
        font-size: 14px;
    }
    .service-description {
        margin-top: 10px;
        color: #333;
    }
    .materials-list {
        margin-top: 10px;
        padding-left: 20px;
        color: #666;
        font-size: 14px;
    }
    .safety-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 15px;
    }
    .safety-item {
        text-align: center;
        padding: 15px;
        background: white;
        border-radius: 10px;
    }
    .safety-label {
        font-size: 14px;
        color: #666;
        margin-bottom: 5px;
    }
    .safety-value {
        font-size: 24px;
        font-weight: bold;
        color: #28a745;
    }
    .conclusion-box {
        background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
        border-radius: 12px;
        padding: 20px;
        margin-top: 20px;
    }
    .conclusion-item {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
    }
</style>

<div class="report-container">
    <div class="report-header">
        <div>
            <h1 class="report-title">Экспертный отчёт об автомобиле</h1>
            <p class="report-subtitle">Отчёт об истории автомобиля</p>
        </div>
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="report-logo">` : ''}
    </div>
    
    <div class="section">
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Марка / модель</span>
                <span class="info-value">${data.brand || '—'} ${data.model || ''}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Тип</span>
                <span class="info-value">${data.fuelType || 'Бензиновый автомобиль'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Дата запроса</span>
                <span class="info-value">${data.queryDate || new Date().toLocaleDateString('ru-RU')}</span>
            </div>
            <div class="info-item">
                <span class="info-label">VIN</span>
                <span class="info-value">${data.vin || '—'}</span>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">1. Общая оценка автомобиля</h2>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Оценка состояния</span>
                <span class="rating-badge">★ ${data.rating || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Класс важных узлов</span>
                <span class="info-value">${data.componentClass || 'A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Аномалии пробега</span>
                <span class="info-value ${data.mileageAnomalies === 'Нет' ? 'status-ok' : 'status-problem'}">${data.mileageAnomalies || 'Не обнаружено'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Последний пробег</span>
                <span class="info-value">${data.lastMileage ? `${data.lastMileage} км` : '—'} ${data.lastMileageDate ? `(${data.lastMileageDate})` : ''}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Привычки обслуживания</span>
                <span class="info-value">${data.maintenanceHabits || 'Отличные'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Последнее ТО</span>
                <span class="info-value">${data.lastMaintenanceDate || '—'}</span>
            </div>
        </div>
        
        ${data.safetyChecks ? `
        <h3 style="margin-top: 20px; margin-bottom: 15px; font-size: 16px; color: #666;">Безопасность / риски</h3>
        <div class="safety-grid">
            <div class="safety-item">
                <div class="safety-label">ДТП</div>
                <div class="safety-value">${data.safetyChecks.accident || '5.0'}</div>
            </div>
            <div class="safety-item">
                <div class="safety-label">Пожар</div>
                <div class="safety-value">${data.safetyChecks.fire || '5.0'}</div>
            </div>
            <div class="safety-item">
                <div class="safety-label">Затопление</div>
                <div class="safety-value">${data.safetyChecks.flood || '5.0'}</div>
            </div>
        </div>
        ` : ''}
    </div>
    
    ${data.components ? `
    <div class="section">
        <h2 class="section-title">2. Ключевые узлы автомобиля</h2>
        <div class="component-list">
            ${generateComponentItem('Подушки безопасности', data.components.airbags)}
            ${generateComponentItem('Ремни безопасности', data.components.seatbelts)}
            ${generateComponentItem('Передний/задний мосты', data.components.axles)}
            ${generateComponentItem('Подвеска', data.components.suspension)}
            ${generateComponentItem('Рулевое управление', data.components.steering)}
            ${generateComponentItem('Тормозная система', data.components.brakes)}
            ${generateComponentItem('Система кондиционирования', data.components.airConditioner)}
        </div>
        ${data.components.airConditioner?.status === 'problem' ? `
        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <strong>Система кондиционирования:</strong> обнаружена проблема<br>
            ${data.components.airConditioner.date ? `<span style="color: #666;">Дата: ${data.components.airConditioner.date}</span><br>` : ''}
            ${data.components.airConditioner.description ? `<span style="color: #666;">${data.components.airConditioner.description}</span>` : ''}
        </div>
        ` : ''}
    </div>
    ` : ''}
    
    ${data.mileageHistory && data.mileageHistory.length > 0 ? `
    <div class="section">
        <h2 class="section-title">3. Пробег (хронология)</h2>
        <table class="mileage-table">
            <thead>
                <tr>
                    <th>Дата</th>
                    <th>Пробег</th>
                    <th>Статус</th>
                </tr>
            </thead>
            <tbody>
                ${data.mileageHistory.map(m => `
                <tr>
                    <td>${m.date || '—'}</td>
                    <td>${m.mileage ? `${m.mileage} км` : '—'}</td>
                    <td>${m.status || '—'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        
        ${data.mileageSummary ? `
        <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px;">
            <h4 style="margin-bottom: 10px; color: #666;">Общее</h4>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Макс. пробег</span>
                    <span class="info-value">${data.mileageSummary.maxMileage || '—'} км</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Аномалий</span>
                    <span class="info-value">${data.mileageSummary.anomalies || '0'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Прогноз текущего</span>
                    <span class="info-value">${data.mileageSummary.estimatedCurrent || '—'} км</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Среднегодовой</span>
                    <span class="info-value">${data.mileageSummary.avgYearly || '—'} км/год</span>
                </div>
            </div>
        </div>
        ` : ''}
    </div>
    ` : ''}
    
    <div class="section">
        <h2 class="section-title">4. Привычки обслуживания</h2>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Средняя частота</span>
                <span class="info-value">${data.maintenanceFrequency || '—'} раз(а) в год</span>
            </div>
            <div class="info-item">
                <span class="info-label">Последнее ТО</span>
                <span class="info-value">${data.lastMaintenanceDate || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Без обслуживания у дилера</span>
                <span class="info-value">${data.yearsWithoutDealer ? `${data.yearsWithoutDealer} года` : '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Последнее посещение дилера</span>
                <span class="info-value">${data.lastDealerVisit || '—'}</span>
            </div>
        </div>
    </div>
    
    ${data.serviceHistory && data.serviceHistory.records && data.serviceHistory.records.length > 0 ? `
    <div class="section">
        <h2 class="section-title">5. История обслуживания</h2>
        <div style="margin-bottom: 20px; color: #666;">
            <p><strong>Период:</strong> ${data.serviceHistory.period || '—'}</p>
            <p><strong>Всего:</strong> ${data.serviceHistory.totalVisits || '—'} посещений (${data.serviceHistory.repairs || '—'} ремонтов, ${data.serviceHistory.maintenance || '—'} ТО)</p>
        </div>
        <h4 style="margin-bottom: 15px;">📌 Детализация записей</h4>
        ${data.serviceHistory.records.map(r => `
        <div class="service-record">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="service-date">${r.date || '—'}</span>
                <span class="service-mileage">${r.mileage ? `${r.mileage} км` : ''}</span>
            </div>
            ${r.description ? `<div class="service-description"><strong>Описание:</strong> ${r.description}</div>` : ''}
            ${r.materials && r.materials.length > 0 ? `
            <div class="materials-list">
                <strong>Материалы:</strong>
                <ul>
                    ${r.materials.map(m => `<li>${m}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${data.vehicleInfo ? `
    <div class="section">
        <h2 class="section-title">6. Информация об автомобиле</h2>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Год выпуска</span>
                <span class="info-value">${data.vehicleInfo.year || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Объём двигателя</span>
                <span class="info-value">${data.vehicleInfo.engineVolume ? `${data.vehicleInfo.engineVolume} мл` : '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Мощность</span>
                <span class="info-value">${data.vehicleInfo.power ? `${data.vehicleInfo.power} kW` : '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">КПП</span>
                <span class="info-value">${data.vehicleInfo.transmission || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Масса</span>
                <span class="info-value">${data.vehicleInfo.weight ? `${data.vehicleInfo.weight} кг` : '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Производство</span>
                <span class="info-value">${data.vehicleInfo.production || '—'}</span>
            </div>
        </div>
    </div>
    ` : ''}
    
    ${data.ownerInfo ? `
    <div class="section">
        <h2 class="section-title">7. Информация о владельцах</h2>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Тип собственника</span>
                <span class="info-value">${data.ownerInfo.ownerType || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Срок с регистрации</span>
                <span class="info-value">${data.ownerInfo.registrationTime || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Количество владельцев</span>
                <span class="info-value">${data.ownerInfo.ownersCount || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Использование</span>
                <span class="info-value">${data.ownerInfo.usage || '—'}</span>
            </div>
        </div>
    </div>
    ` : ''}
    
    ${data.insuranceInfo ? `
    <div class="section">
        <h2 class="section-title">8. Страховая информация</h2>
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">ОСАГО</span>
                <span class="info-value ${data.insuranceInfo.osago === 'действует' ? 'status-ok' : ''}">${data.insuranceInfo.osago || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">КАСКО</span>
                <span class="info-value ${data.insuranceInfo.kasko === 'действует' ? 'status-ok' : ''}">${data.insuranceInfo.kasko || '—'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Страховые случаи</span>
                <span class="info-value">${data.insuranceInfo.claims || '0'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Макс. ущерб</span>
                <span class="info-value">${data.insuranceInfo.maxDamage || '0'} юаней</span>
            </div>
        </div>
    </div>
    ` : ''}
    
    ${data.conclusion ? `
    <div class="section">
        <h2 class="section-title">9. Итоговое заключение</h2>
        <div class="conclusion-box">
            <div class="conclusion-item">
                <span class="${data.conclusion.accidents === 'нет' ? 'status-ok' : 'status-problem'}">
                    ${data.conclusion.accidents === 'нет' ? '✔' : '❌'}
                </span>
                <span>Аварии: ${data.conclusion.accidents || 'не зафиксировано'}</span>
            </div>
            <div class="conclusion-item">
                <span class="${data.conclusion.bodyAnomalies === 'нет' ? 'status-ok' : 'status-problem'}">
                    ${data.conclusion.bodyAnomalies === 'нет' ? '✔' : '❌'}
                </span>
                <span>Аномалии кузова: ${data.conclusion.bodyAnomalies || 'нет'}</span>
            </div>
            <div class="conclusion-item">
                <span class="${data.conclusion.insuranceRepairs === 'нет' ? 'status-ok' : 'status-problem'}">
                    ${data.conclusion.insuranceRepairs === 'нет' ? '✔' : '❌'}
                </span>
                <span>Страховые ремонты: ${data.conclusion.insuranceRepairs || 'нет'}</span>
            </div>
            <div class="conclusion-item">
                <span class="${data.conclusion.componentProblems === 'нет' ? 'status-ok' : 'status-problem'}">
                    ${data.conclusion.componentProblems === 'нет' ? '✔' : '❌'}
                </span>
                <span>Проблемы по важным узлам: ${data.conclusion.componentProblems || 'не обнаружено'}</span>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #a5d6a7;">
                <strong>➡ Рекомендация:</strong> ${data.conclusion.recommendation || 'Нет особых замечаний'}
            </div>
        </div>
    </div>
    ` : ''}
    
    <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        Отчёт сгенерирован автоматически • ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}
    </div>
</div>
`;
}

function generateComponentItem(name, component) {
    if (!component) {
        return `
        <div class="component-item">
            <div class="check-icon check-ok">✔</div>
            <span>${name}</span>
        </div>
        `;
    }
    
    const isOk = component.status === 'ok' || !component.status;
    return `
    <div class="component-item">
        <div class="check-icon ${isOk ? 'check-ok' : 'check-fail'}">${isOk ? '✔' : '❌'}</div>
        <span>${name}</span>
    </div>
    `;
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
    if (!appState.currentReport?.googleDocUrl) {
        // Копируем локальную ссылку или показываем сообщение
        showToast('Ссылка на Google Doc не создана', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(appState.currentReport.googleDocUrl);
    showToast('Ссылка скопирована', 'success');
}

function openGoogleDoc() {
    if (appState.currentReport?.googleDocUrl) {
        openLink(appState.currentReport.googleDocUrl);
    } else {
        // Открываем Google Docs с HTML контентом через data URL
        const html = appState.currentReport?.htmlContent || '';
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Отчёт об автомобиле</title></head><body>${html}</body></html>`;
        
        // Копируем HTML в буфер обмена
        navigator.clipboard.writeText(fullHtml).then(() => {
            // Открываем Google Docs
            window.open('https://docs.google.com/document/create', '_blank');
            showToast('HTML скопирован. Вставьте его в Google Docs (Ctrl+Shift+V)', 'success');
        });
    }
}

async function exportReport() {
    if (!appState.currentReport) return;
    
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчёт - ${appState.currentReport.vin}</title>
</head>
<body style="background: #f5f5f5; padding: 20px;">
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
        // Веб-версия - скачиваем через blob
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Отчёт скачан', 'success');
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

function toggleKeyVisibility() {
    const input = document.getElementById('openai-key');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
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
