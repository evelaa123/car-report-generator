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
function sanitizeForFilename(str) {
    // Заменяем недопустимые символы на подчёркивание
    return str.replace(/[<>:"/\\|?*]/g, '_');
}
// Инициализация Google Auth (для Electron OAuth)
async function initGoogleAuth() {
    if (!isElectron) return;
    
    // Проверяем авторизацию при запуске
    const isAuthorized = await ipcRenderer.invoke('check-google-auth');
    
    if (!isAuthorized) {
        // Показываем уведомление
        showGoogleAuthPrompt();
    }
}

function showGoogleAuthPrompt() {
    const promptDiv = document.createElement('div');
    promptDiv.id = 'google-auth-prompt';
    promptDiv.className = 'fixed top-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg z-50';
    promptDiv.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fab fa-google text-2xl"></i>
            <div>
                <p class="font-semibold">Требуется подключение Google Drive</p>
                <p class="text-sm text-blue-100">Для создания отчётов в Google Docs</p>
            </div>
            <button onclick="authorizeGoogleDrive()" class="ml-4 bg-white text-blue-600 px-4 py-2 rounded font-semibold hover:bg-blue-50">
                Подключить
            </button>
        </div>
    `;
    document.body.appendChild(promptDiv);
}

async function authorizeGoogleDrive() {
    const prompt = document.getElementById('google-auth-prompt');
    if (prompt) prompt.remove();
    
    showToast('Откроется браузер для авторизации...', 'info');
    
    const result = await ipcRenderer.invoke('authorize-google');
    
    if (result.success) {
        showToast('Google Drive подключен!', 'success');
    } else {
        showToast('Ошибка авторизации: ' + result.error, 'error');
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
async function uploadToGoogleDocs(report) {
    if (!isElectron) return;

    try {
        // Проверяем авторизацию
        const isAuthorized = await ipcRenderer.invoke('check-google-auth');
        if (!isAuthorized) {
            showToast('Сначала подключите Google Drive', 'warning');
            authorizeGoogleDrive();
            return;
        }

        // ← ДОБАВЬТЕ ПРОВЕРКУ
        if (!report || !report.htmlContent) {
            showToast('Отчёт не содержит данных для экспорта', 'error');
            return;
        }

        showToast('Создание Google документа...', 'info');
        
        const result = await ipcRenderer.invoke('create-google-doc', {
            title: `Отчёт Авто: ${report.brand || ''} ${report.vin || ''}`,
            contentHtml: report.htmlContent // ← Убедитесь что это не undefined
        });

        if (result.success) {
            report.googleDocUrl = result.url;
            await saveData();
            
            showToast('Google Doc успешно создан!', 'success');
            ipcRenderer.invoke('open-external', result.url);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Ошибка Google Docs: ' + error.message, 'error');
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
    
    // Обновить активность в сайдбаре
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    // Обновить активность в мобильной навигации
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
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
    
    // Группируем по VIN
    const groupedByVIN = {};
    filteredReports.forEach(report => {
        const vin = report.vin || 'Неизвестно';
        if (!groupedByVIN[vin]) {
            groupedByVIN[vin] = [];
        }
        groupedByVIN[vin].push(report);
    });
    
    // Сортируем группы по дате последнего отчёта
    const sortedVINs = Object.keys(groupedByVIN).sort((a, b) => {
        const latestA = Math.max(...groupedByVIN[a].map(r => new Date(r.createdAt)));
        const latestB = Math.max(...groupedByVIN[b].map(r => new Date(r.createdAt)));
        return latestB - latestA;
    });
    
    container.innerHTML = sortedVINs.map(vin => {
        const reports = groupedByVIN[vin].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const latestReport = reports[0];
        const hasMultiple = reports.length > 1;
        
        return `
            <div class="card-gradient rounded-2xl p-6 mb-4">
                <!-- Заголовок группы -->
                <div class="flex items-center justify-between mb-4 cursor-pointer" onclick="toggleVINGroup('${vin}')">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="bg-purple-600 text-xs px-2 py-1 rounded">${latestReport.brand || ''}</span>
                            <span class="text-gray-400 text-sm">${formatDate(latestReport.createdAt)}</span>
                            ${hasMultiple ? `<span class="bg-blue-600/30 text-blue-400 text-xs px-2 py-1 rounded">${reports.length} отчёта</span>` : ''}
                        </div>
                        <h3 class="text-xl font-bold">${vin}</h3>
                        <p class="text-gray-400 text-sm">${latestReport.model || ''}</p>
                        
                        <div class="flex items-center gap-4 mt-2 text-sm">
                            ${latestReport.rating ? `<span class="text-yellow-400"><i class="fas fa-star"></i> ${latestReport.rating}</span>` : ''}
                            ${latestReport.mileage ? `<span class="text-blue-400"><i class="fas fa-tachometer-alt"></i> ${latestReport.mileage} км</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        ${hasMultiple ? `
                            <i class="fas fa-chevron-down text-gray-400 transition-transform duration-200" id="arrow-${vin}"></i>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Список отчётов в группе -->
                <div id="group-${vin}" class="${hasMultiple ? 'hidden' : ''} space-y-3 mt-4 pt-4 border-t border-white/10" 
     style="transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out; max-height: ${hasMultiple ? '0px' : 'none'}; opacity: ${hasMultiple ? '0' : '1'}; overflow: hidden;">
                    ${reports.map(report => {
                        const typeLabel = report.type === 'insurance' ? 'Страховой' : 'Технический';
                        const typeIcon = report.type === 'insurance' ? 'fa-file-invoice' : 'fa-file-alt';
                        const typeColor = report.type === 'insurance' ? 'bg-orange-600' : 'bg-purple-600';
                        
                        return `
                            <div class="bg-black/30 rounded-lg p-4 hover:bg-black/40 transition cursor-pointer" onclick="showReportPage('${report.id}')">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <span class="text-xs px-2 py-1 rounded ${typeColor} flex items-center gap-1">
                                            <i class="fas ${typeIcon}"></i>
                                            ${typeLabel}
                                        </span>
                                        <span class="text-gray-400 text-sm">${formatDate(report.createdAt)}</span>
                                        <span class="text-xs px-2 py-1 rounded ${report.aiProvider === 'gemini' ? 'bg-blue-600' : 'bg-green-600'}">
                                            ${report.aiProvider === 'gemini' ? 'Gemini' : 'GPT'}
                                        </span>
                                    </div>
                                    
                                    <div class="flex gap-2">
                                        ${report.driveUrl ? `
                                            <button onclick="event.stopPropagation(); openLinkAndCopy('${report.driveUrl}')" 
                                                    class="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 flex items-center justify-center" 
                                                    title="Google Drive">
                                                <i class="fab fa-google-drive text-sm"></i>
                                            </button>
                                        ` : ''}
                                        <button onclick="event.stopPropagation(); deleteReport('${report.id}')" 
                                                class="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 flex items-center justify-center" 
                                                title="Удалить">
                                            <i class="fas fa-trash text-sm"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function toggleVINGroup(vin) {
    const group = document.getElementById(`group-${vin}`);
    const arrow = document.getElementById(`arrow-${vin}`);
    
    if (group && arrow) {
        if (group.classList.contains('hidden')) {
            group.classList.remove('hidden');
            // Даём время браузеру применить display
            setTimeout(() => {
                group.style.maxHeight = group.scrollHeight + 'px';
                group.style.opacity = '1';
            }, 10);
        } else {
            group.style.maxHeight = '0px';
            group.style.opacity = '0';
            setTimeout(() => {
                group.classList.add('hidden');
            }, 300);
        }
        arrow.classList.toggle('rotate-180');
    }
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
    
    const typeLabel = report.type === 'insurance' ? 'Страховой отчёт' : 'Технический отчёт';
    const isEditing = container.getAttribute('data-editing') === 'true';
    
    container.innerHTML = `
        <!-- Панель управления -->
        <div class="flex items-center justify-between mb-6 p-4 bg-black/30 rounded-xl">
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-400">${typeLabel}</span>
                ${report.type ? `<span class="text-xs px-2 py-1 rounded ${report.type === 'insurance' ? 'bg-orange-600' : 'bg-purple-600'}">
                    <i class="fas ${report.type === 'insurance' ? 'fa-file-invoice' : 'fa-file-alt'}"></i>
                </span>` : ''}
            </div>
            
            <div class="flex gap-2">
                <button onclick="toggleEditMode()" id="edit-btn" 
                        class="px-4 py-2 rounded-lg ${isEditing ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} transition flex items-center gap-2">
                    <i class="fas ${isEditing ? 'fa-save' : 'fa-edit'}"></i>
                    <span>${isEditing ? 'Сохранить' : 'Редактировать'}</span>
                </button>
            </div>
        </div>
        
        <!-- Контент отчёта -->
        <div id="report-editable" 
             contenteditable="false" 
             class="report-content-editable"
             style="outline: none; min-height: 400px; padding: 20px; border-radius: 12px; background: white; color: #333;">
            ${report.htmlContent || '<p class="text-gray-400">Отчёт пуст</p>'}
        </div>
    `;
}

async function toggleEditMode() {
    const container = document.getElementById('report-content');
    const editable = document.getElementById('report-editable');
    const btn = document.getElementById('edit-btn');
    
    if (!container || !editable || !appState.currentReport) return;
    
    const isEditing = container.getAttribute('data-editing') === 'true';
    
    if (isEditing) {
        // Сохраняем изменения
        appState.currentReport.htmlContent = editable.innerHTML;
        await saveData();
        
        editable.contentEditable = 'false';
        editable.style.border = 'none';
        container.setAttribute('data-editing', 'false');
        
        btn.innerHTML = '<i class="fas fa-edit"></i><span>Редактировать</span>';
        btn.className = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition flex items-center gap-2';
        
        showToast('Изменения сохранены!', 'success');
        
        // Обновляем PDF в Drive если он существует (для обеих версий)
        if (appState.currentReport.driveFileId) {
            console.log('[Save] Auto-updating Drive file...');
            
            if (isElectron) {
                showToast('Обновление PDF в Drive...', 'info');
                
                try {
                    const pdfFilename = `${sanitizeForFilename(appState.currentReport.vin)}_${appState.currentReport.type || 'technical'}_${formatDateForFile(appState.currentReport.createdAt)}.pdf`;
                    
                    const result = await ipcRenderer.invoke('update-pdf-in-drive', {
                        fileId: appState.currentReport.driveFileId,
                        htmlContent: appState.currentReport.htmlContent,
                        filename: pdfFilename
                    });
                    
                    if (result.success) {
                        showToast('PDF обновлён в Drive!', 'success');
                    } else {
                        console.error('[Save] Drive update failed:', result.error);
                        
                        // Если обновление не удалось - перезагружаем заново
                        showToast('Загрузка нового PDF...', 'info');
                        
                        const uploadResult = await ipcRenderer.invoke('save-and-upload-pdf', {
                            htmlContent: appState.currentReport.htmlContent,
                            filename: pdfFilename
                        });
                        
                        if (uploadResult.success && uploadResult.driveUrl) {
                            appState.currentReport.driveUrl = uploadResult.driveUrl;
                            appState.currentReport.driveFileId = uploadResult.driveFileId;
                            appState.currentReport.localPdfPath = uploadResult.localPath;
                            await saveData();
                            showToast('Новый PDF загружен в Drive!', 'success');
                        }
                    }
                } catch (error) {
                    console.error('[Save] Drive update error:', error);
                    showToast('Ошибка обновления Drive: ' + error.message, 'error');
                }
            } else {
                // Веб версия - обновляем в фоне
                uploadOrUpdateDriveFile().catch(error => {
                    console.error('[Save] Background Drive update failed:', error);
                });
            }
        } else if (isElectron && appState.currentReport.localPdfPath) {
            // Есть локальный PDF но нет в Drive - обновляем локально
            showToast('Обновление локального PDF...', 'info');
            
            try {
                const pdfFilename = `${sanitizeForFilename(appState.currentReport.vin)}_${appState.currentReport.type || 'technical'}_${formatDateForFile(appState.currentReport.createdAt)}.pdf`;
                
                const result = await ipcRenderer.invoke('save-and-upload-pdf', {
                    htmlContent: appState.currentReport.htmlContent,
                    filename: pdfFilename
                });
                
                if (result.success) {
                    appState.currentReport.localPdfPath = result.localPath;
                    if (result.driveUrl) {
                        appState.currentReport.driveUrl = result.driveUrl;
                        appState.currentReport.driveFileId = result.driveFileId;
                    }
                    await saveData();
                    showToast('PDF обновлён!', 'success');
                }
            } catch (error) {
                console.error('PDF update error:', error);
            }
        }
        
    } else {
        // Включаем режим редактирования
        editable.contentEditable = 'true';
        editable.style.border = '2px solid #4a4a8a';
        editable.style.transition = 'border 0.2s';
        editable.focus();
        container.setAttribute('data-editing', 'true');
        
        btn.innerHTML = '<i class="fas fa-save"></i><span>Сохранить</span>';
        btn.className = 'px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition flex items-center gap-2';
        
        showToast('Режим редактирования включён', 'info');
    }
}


// ============================================
// Работа с изображениями
// ============================================

async function selectFiles() {
    if (isElectron) {
        const result = await ipcRenderer.invoke('select-files');
        if (!result.canceled && result.files.length > 0) {
            // Вместо addImages(result.files) делаем так:
            for (const file of result.files) {
                // file.data уже содержит base64 из main.js
                const processed = await processImage(file.data, file.name);
                addImages(processed);
            }
        }
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
            console.log(`[processImage] ${fileName}: ${width}x${height}, ratio: ${height/width}`);
            console.log(`[processImage] Should split: ${height / width > 3}`);
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
    document.getElementById('report-options').classList.remove('hidden');
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
    document.getElementById('report-options').classList.add('hidden');
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
// Восстановление неполного JSON
// ============================================

function repairIncompleteJSON(jsonStr) {
    // Подсчитываем открытые и закрытые скобки и кавычки
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    let lastCharWasQuote = false;
    
    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        
        if (escaped) {
            escaped = false;
            continue;
        }
        
        if (char === '\\') {
            escaped = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            lastCharWasQuote = true;
        } else {
            lastCharWasQuote = false;
        }
        
        if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (char === '[') bracketCount++;
            if (char === ']') bracketCount--;
        }
    }
    
    // Если строка заканчивается незакрытой кавычкой, пытаемся понять контекст
    if (inString && jsonStr.trim().endsWith('"')) {
        // Скорее всего обрезана строка, удаляем незавершенную часть
        jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf('"'));
    }
    
    // Закрываем незакрытые структуры
    if (bracketCount > 0) {
        jsonStr += ']'.repeat(bracketCount);
    } else if (bracketCount < 0) {
        // Если закрывающих скобок больше, удаляем лишние
        jsonStr = jsonStr.replace(/\]+$/, '');
    }
    
    if (braceCount > 0) {
        jsonStr += '}'.repeat(braceCount);
    } else if (braceCount < 0) {
        // Если закрывающих скобок больше, удаляем лишние
        jsonStr = jsonStr.replace(/\}+$/, '');
    }
    
    return jsonStr;
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
            let jsonText = content;
            const codeBlockMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1];
            }
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                let jsonStr = jsonMatch[0];
                try {
                    reportData = JSON.parse(jsonStr);
                } catch (parseError) {
                    jsonStr = repairIncompleteJSON(jsonStr);
                    reportData = JSON.parse(jsonStr);
                }
            } else {
                throw new Error('JSON не найден в ответе ИИ');
            }
        } catch (e) {
            console.error('Parse error:', e);
            reportData = { rawContent: content, brand: 'Ошибка парсинга', vin: 'Неизвестно' };
        }
        
        // Создание отчётов
updateProgress('Создание отчётов...', 80);

const splitReports = document.getElementById('split-reports').checked;
const reports = [];

if (splitReports) {
    // Технический отчёт (полный)
    const htmlContentTechnical = generateHTMLReport(reportData);
    reports.push({
        id: Date.now().toString(),
        type: 'technical',
        createdAt: new Date().toISOString(),
        vin: reportData.vin || 'Неизвестно',
        brand: reportData.brand || 'Неизвестно',
        model: reportData.model || 'Неизвестно',
        rating: reportData.rating || null,
        mileage: reportData.lastMileage || null,
        data: reportData,
        htmlContent: htmlContentTechnical,
        driveUrl: null,
        driveFileId: null,
        localPdfPath: null,
        aiProvider: provider,
        images: appState.images.slice(0, 3).map(i => ({ name: i.name }))
    });
    
    // Страховой отчёт (краткий)
    const htmlContentInsurance = generateInsuranceReport(reportData);
    reports.push({
        id: (Date.now() + 1).toString(),
        type: 'insurance',
        createdAt: new Date().toISOString(),
        vin: reportData.vin || 'Неизвестно',
        brand: reportData.brand || 'Неизвестно',
        model: reportData.model || 'Неизвестно',
        rating: reportData.rating || null,
        mileage: reportData.lastMileage || null,
        data: reportData,
        htmlContent: htmlContentInsurance,
        driveUrl: null,
        driveFileId: null,
        localPdfPath: null,
        aiProvider: provider,
        images: appState.images.slice(0, 3).map(i => ({ name: i.name }))
    });
} else {
    // Один технический отчёт
    const htmlContent = generateHTMLReport(reportData);
    reports.push({
        id: Date.now().toString(),
        type: 'technical',
        createdAt: new Date().toISOString(),
        vin: reportData.vin || 'Неизвестно',
        brand: reportData.brand || 'Неизвестно',
        model: reportData.model || 'Неизвестно',
        rating: reportData.rating || null,
        mileage: reportData.lastMileage || null,
        data: reportData,
        htmlContent: htmlContent,
        driveUrl: null,
        driveFileId: null,
        localPdfPath: null,
        aiProvider: provider,
        images: appState.images.slice(0, 3).map(i => ({ name: i.name }))
    });
}

const report = reports[0]; // Для обратной совместимости с кодом ниже

// --- АВТОСОХРАНЕНИЕ PDF + GOOGLE DRIVE ---
if (isElectron) {
    for (let i = 0; i < reports.length; i++) {
        const rep = reports[i];
        const reportType = rep.type === 'technical' ? 'Технический' : 'Страховой';
        
        updateProgress(`Сохранение ${reportType} PDF (${i+1}/${reports.length})...`, 85 + (i * 5));
        
        try {
            const pdfFilename = `${sanitizeForFilename(rep.vin)}_${rep.type}_${formatDateForFile(rep.createdAt)}.pdf`;
            
            const result = await ipcRenderer.invoke('save-and-upload-pdf', {
                htmlContent: rep.htmlContent,
                filename: pdfFilename
            });
            
            if (result.success) {
                rep.localPdfPath = result.localPath;
                
                if (result.driveUrl) {
                    rep.driveUrl = result.driveUrl;
                    rep.driveFileId = result.driveFileId;
                }
            }
        } catch (pdfError) {
            console.error(`${reportType} PDF error:`, pdfError);
        }
    }
    
    if (reports.some(r => r.driveUrl)) {
        showToast('PDF загружены в Drive!', 'success');
        const firstDriveUrl = reports.find(r => r.driveUrl)?.driveUrl;
        if (firstDriveUrl) {
            navigator.clipboard.writeText(firstDriveUrl);
        }
    } else if (reports.some(r => r.localPdfPath)) {
        showToast('PDF сохранены локально', 'info');
    }
}
// ---------------------------------------------------

updateProgress('Отчёт готов!', 95);

appState.reports.unshift(...reports);
await saveData();

updateProgress('Завершено!', 100);

clearImages();
updateUI();

setTimeout(() => {
    document.getElementById('progress-section').classList.add('hidden');
    document.getElementById('generate-section').classList.remove('hidden');
    showReportPage(report.id);
}, 500);

        
    } catch (error) {
        console.error('Generation error:', error);
        document.getElementById('progress-section').classList.add('hidden');
        document.getElementById('generate-section').classList.remove('hidden');
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

function getSystemPrompt() {
    return `Ты — эксперт по анализу автомобилей. Проанализируй фотографии из истории обслуживания автомобиля и создай детальный отчёт в формате JSON.

ВАЖНО: Отчёт должен быть максимально подробным и информативным.
ИТОГ БЕЗ КИТАЙСКИХ СИМВОЛОВ.
Формат JSON (строго соблюдай структуру):

{
  "brand": "Марка",
  "model": "Модель",
  "vin": "VIN номер",
  "fuelType": "Тип топлива",
  "queryDate": "YYYY-MM-DD",
  
  "rating": 4.9,
  "componentClass": "A/B/C",
  "mileageAnomalies": "Не обнаружено / Обнаружено",
  
  "lastMileage": "11186 км",
  "lastMileageDate": "2024-09",
  "estimatedCurrentMileage": "16202 км",
  "avgYearlyMileage": "4377 км/год",
  "mileageAssessment": "очень маленький / нормальный / большой",
  
  "maintenanceHabits": "Отличные / Хорошие / Удовлетворительные",
  "maintenanceFrequency": "0.8 раза в год",
  "lastMaintenanceDate": "2024-09-01",
  "yearsWithoutDealer": "1.3 года",
  "lastDealerVisit": "2024-09-01",
  
  "safetyChecks": {
    "accident": 5.0,
    "fire": 5.0,
    "flood": 5.0
  },
  
  "components": {
    "airbags": {"status": "ok", "note": ""},
    "seatbelts": {"status": "ok", "note": ""},
    "axles": {"status": "ok", "note": ""},
    "suspension": {"status": "ok", "note": ""},
    "steering": {"status": "ok", "note": ""},
    "brakes": {"status": "ok", "note": ""},
    "airConditioner": {"status": "problem", "date": "06/2023", "description": "Проверка протечек в испарителе кондиционера"}
  },
  
  "bodyRepairMap": {
    "frontPart": "без аномалий",
    "frontRight": "без аномалий",
    "middleRight": "без аномалий",
    "rearRight": "без аномалий",
    "rearPart": "без аномалий",
    "rearLeft": "без аномалий",
    "middleLeft": "без аномалий",
    "frontLeft": "без аномалий",
    "roof": "без аномалий",
    "bottom": "без аномалий",
    "interior": "без аномалий",
    "engineTransmission": "без аномалий",
    "electronics": "без аномалий",
    "totalRepairZones": 0
  },
  
  "frameCheck": {
    "bodyFrame": "Не обнаружено аномалий",
    "reinforcedElements": "Не обнаружено аномалий"
  },
  
  "mileageHistory": [
    {"date": "2022-02", "mileage": "9 км", "status": "Первое посещение дилера"},
    {"date": "2022-07", "mileage": "2442 км", "status": "Нормальные данные"}
  ],
  
  "mileageSummary": {
    "maxMileage": "11186 км",
    "anomalies": 0,
    "estimatedCurrent": "16202 км",
    "avgYearly": "4377 км/год"
  },
  
  "serviceHistory": {
    "period": "2022.02.12 — 2024.09.01",
    "totalVisits": 8,
    "repairs": 5,
    "maintenance": 3,
    "records": [
      {
        "date": "02/2022",
        "mileage": "7 км",
        "description": "Предпродажная подготовка PDI",
        "materials": []
      },
      {
        "date": "07/2022",
        "mileage": "2442 км",
        "description": "Первое ТО, регламентное обслуживание + замена масла",
        "materials": ["Масляный фильтр", "Масло 0W-20 (4L)", "Воздушный фильтр"]
      }
    ]
  },
  
  "vehicleInfo": {
    "year": 2021,
    "brand": "Audi",
    "model": "A3 Sportback 35 TFSI",
    "vin": "LFV2B*****95",
    "bodyColor": "",
    "vehicleType": "Легковой",
    "fuelType": "Бензин",
    "emissionStandard": "",
    "weight": "1400 кг",
    "engineVolume": "1395 см³",
    "engineNumber": "T3****",
    "power": "110 kW",
    "dimensions": {
      "length": "4343 мм",
      "width": "1815 мм",
      "height": "1458 мм"
    },
    "transmission": "DCT 7-ступ. робот",
    "production": "Китай (локальная сборка)"
  },
  
  "ownerInfo": {
    "ownerType": "Частное лицо",
    "registrationTime": "3-4 года",
    "ownersCount": 2,
    "usage": "Личное (не такси)",
    "newEnergy": "Нет"
  },
  
  "insuranceInfo": {
    "osago": "Действует",
    "kasko": "Действует",
    "osagoRenewedContinuously": false,
    "kaskoRenewedContinuously": false,
    "claims": 0,
    "thirdPartyIncidents": 0,
    "maxDamage": "0 ₽",
    "risks": "Нет особых рекомендаций"
  },
  
  "conclusion": {
    "accidents": "Не зафиксировано",
    "bodyAnomalies": "Нет",
    "insuranceRepairs": "Нет",
    "componentProblems": "Не обнаружено",
    "recommendation": "Нет особых замечаний. Автомобиль в хорошем состоянии по базе данных."
  }
}

Анализируй ВСЕ детали на фотографиях. Если данных нет — используй "Нет информации". Строго JSON!`;
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
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-5.2',
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
            max_completion_tokens: 8192
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}
async function openDriveLink() {
    if (!appState.currentReport) return;
    
    console.log('[openDriveLink] Current driveUrl:', appState.currentReport.driveUrl);
    console.log('[openDriveLink] Current driveFileId:', appState.currentReport.driveFileId);
    
    // Если файл уже на Drive и мы в вебе - обновляем его перед открытием
    if (appState.currentReport.driveFileId && !isElectron) {
        console.log('[openDriveLink] Updating existing Drive file before opening...');
        await uploadOrUpdateDriveFile();
        return;
    }
    
    // Если уже есть ссылка (Electron версия) - просто открываем
    if (appState.currentReport.driveUrl) {
        const urlWithCache = appState.currentReport.driveUrl.includes('?') 
            ? `${appState.currentReport.driveUrl}&t=${Date.now()}`
            : `${appState.currentReport.driveUrl}?t=${Date.now()}`;
        console.log('[openDriveLink] Opening existing link with cache buster:', urlWithCache);
        if (isElectron) {
            ipcRenderer.invoke('open-external', urlWithCache);
        } else {
            window.open(urlWithCache, '_blank');
        }
        return;
    }
    
    console.log('[openDriveLink] No existing link, uploading to Drive...');
    await uploadOrUpdateDriveFile();
}

async function uploadOrUpdateDriveFile() {
    
    // Если ссылки нет - загружаем в Drive
    if (!isElectron) {
        // ЛОГИКА ДЛЯ ВЕБА
        try {
            console.log('[Drive Upload] Starting upload process...');
            showToast('Авторизация Google Drive...', 'info');
            
            const accessToken = await getGoogleAccessToken();
            
            if (!accessToken) {
                console.error('[Drive Upload] No access token');
                showToast('Необходима авторизация Google', 'error');
                return;
            }
            
            console.log('[Drive Upload] Access token obtained');
            
            let pdfBase64 = appState.currentReport.pdfBase64;
            
            // Если PDF ещё не сгенерирован - генерируем
            if (!pdfBase64) {
                console.log('[Drive Upload] PDF not generated yet, generating...');
                showToast('Генерация PDF...', 'info');
                
                const response = await fetch('/api/generate-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        htmlContent: appState.currentReport.htmlContent
                    })
                });

                const result = await response.json();
                console.log('[Drive Upload] PDF generation response:', result.success ? 'Success' : 'Failed');
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                pdfBase64 = result.pdfBase64;
                appState.currentReport.pdfBase64 = pdfBase64;
                await saveData();
            }
            
            console.log('[Drive Upload] PDF ready, base64 length:', pdfBase64.length);
            showToast('Загрузка в Google Drive...', 'info');
            
            const filename = `${sanitizeForFilename(appState.currentReport.vin)}_${formatDateForFile(appState.currentReport.createdAt)}.pdf`;
            const pdfBlob = base64ToBlob(pdfBase64, 'application/pdf');
            
            let uploadResponse;
            
            // Если файл уже существует на Drive - обновляем его
            if (appState.currentReport.driveFileId) {
                console.log('[Drive Upload] Updating existing file ID:', appState.currentReport.driveFileId);
                showToast('Обновление существующего файла...', 'info');
                
                const form = new FormData();
                const metadata = {
                    name: filename,
                    mimeType: 'application/pdf'
                };
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', pdfBlob);
                
                uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${appState.currentReport.driveFileId}?uploadType=multipart&fields=id,webViewLink`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: form
                });
            } else {
                // Создаём новый файл
                console.log('[Drive Upload] Creating new file');
                const metadata = {
                    name: filename,
                    mimeType: 'application/pdf',
                    parents: ['18EZxRYhO94_U545EICtvtHCf7CeVzP0D']
                };
                
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', pdfBlob);
                
                uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: form
                });
            }
            
            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error('[Drive Upload] Upload failed:', uploadResponse.status, errorText);
                throw new Error(`Drive API error: ${uploadResponse.status} - ${errorText}`);
            }
            
            const file = await uploadResponse.json();
            console.log('[Drive Upload] Upload successful:', file);
            
            // Делаем файл публичным
            console.log('[Drive Upload] Setting file permissions...');
            await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role: 'reader',
                    type: 'anyone'
                })
            });
            
            console.log('[Drive Upload] Permissions set, saving state...');
            appState.currentReport.driveUrl = file.webViewLink;
            appState.currentReport.driveFileId = file.id;
            await saveData();
            
            // Добавляем timestamp к ссылке для обхода кеша
            const urlWithCache = file.webViewLink.includes('?')
                ? `${file.webViewLink}&t=${Date.now()}&v=${Math.random().toString(36).substring(7)}`
                : `${file.webViewLink}?t=${Date.now()}&v=${Math.random().toString(36).substring(7)}`;
            
            // Копируем ссылку (может не сработать если окно не в фокусе)
            try {
                await navigator.clipboard.writeText(file.webViewLink);
                console.log('[Drive Upload] Link copied to clipboard');
            } catch (clipboardError) {
                console.warn('[Drive Upload] Clipboard write failed:', clipboardError.message);
            }
            
            const isUpdate = !!appState.currentReport.driveFileId;
            const message = isUpdate ? 'PDF обновлён в Drive!' : 'PDF загружен в Drive!';
            console.log('[Drive Upload] Complete:', message);
            showToast(message, 'success');
            window.open(urlWithCache, '_blank');
            
        } catch (error) {
            console.error('[Drive Upload] Error:', error);
            showToast('Ошибка загрузки в Drive: ' + error.message, 'error');
        }
        return;
    }
    
    try {
        showToast('Проверка авторизации Google Drive...', 'info');
        
        const isAuthorized = await ipcRenderer.invoke('check-google-auth');
        
        if (!isAuthorized) {
            const authConfirm = confirm('Google Drive не авторизован. Авторизовать сейчас?');
            if (authConfirm) {
                const result = await ipcRenderer.invoke('authorize-google');
                if (!result.success) {
                    showToast('Ошибка авторизации', 'error');
                    return;
                }
                showToast('Авторизация успешна!', 'success');
            } else {
                return;
            }
        }
        
        showToast('Загрузка PDF в Google Drive...', 'info');
        
        const pdfFilename = `${sanitizeForFilename(appState.currentReport.vin)}_${formatDateForFile(appState.currentReport.createdAt)}.pdf`;
        
        // Если есть локальный файл - используем его
        if (appState.currentReport.localPdfPath) {
            const result = await ipcRenderer.invoke('upload-existing-pdf-to-drive', {
                localPath: appState.currentReport.localPdfPath,
                filename: pdfFilename
            });
            
            if (result.success) {
                appState.currentReport.driveUrl = result.url;
                appState.currentReport.driveFileId = result.fileId;
                await saveData();
                
                navigator.clipboard.writeText(result.url);
                showToast('PDF загружен в Drive! Ссылка скопирована', 'success');
                
                ipcRenderer.invoke('open-external', result.url);
            } else {
                throw new Error(result.error || 'Ошибка загрузки');
            }
        } else {
            // Генерируем PDF заново и загружаем
            const result = await ipcRenderer.invoke('save-and-upload-pdf', {
                htmlContent: appState.currentReport.htmlContent,
                filename: pdfFilename
            });
            
            if (result.success) {
                appState.currentReport.localPdfPath = result.localPath;
                
                if (result.driveUrl) {
                    appState.currentReport.driveUrl = result.driveUrl;
                    appState.currentReport.driveFileId = result.fileId;
                    await saveData();
                    
                    navigator.clipboard.writeText(result.driveUrl);
                    showToast('PDF загружен в Drive! Ссылка скопирована', 'success');
                    
                    ipcRenderer.invoke('open-external', result.driveUrl);
                } else {
                    showToast('PDF сохранён, но не удалось загрузить в Drive', 'warning');
                }
            } else {
                throw new Error(result.error || 'Ошибка создания PDF');
            }
        }
    } catch (error) {
        console.error('Drive upload error:', error);
        
        // Если ошибка токена - предлагаем переавторизоваться
        if (error.message.includes('ECONNRESET') || error.message.includes('token') || error.message.includes('401')) {
            const reauth = confirm('Проблема с авторизацией Google Drive. Переавторизовать?');
            if (reauth) {
                try {
                    const result = await ipcRenderer.invoke('authorize-google');
                    if (result.success) {
                        showToast('Повторите попытку загрузки', 'info');
                    }
                } catch (e) {
                    showToast('Ошибка авторизации', 'error');
                }
            }
        } else {
            showToast(`Ошибка: ${error.message}`, 'error');
        }
    }
}



function openLinkAndCopy(url) {
    navigator.clipboard.writeText(url);
    showToast('Ссылка скопирована!', 'success');
    if (isElectron) {
        ipcRenderer.invoke('open-external', url);
    } else {
        window.open(url, '_blank');
    }
}

function copyReportLink() {
    if (appState.currentReport?.driveUrl) {
        navigator.clipboard.writeText(appState.currentReport.driveUrl);
        showToast('Ссылка на Drive скопирована!', 'success');
    } else {
        showToast('Файл ещё не загружен в Drive', 'warning');
    }
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
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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
                maxOutputTokens: 16384
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
    
    <!-- 2.5. Карта ремонта деталей -->
${data.bodyRepairMap ? `
<div style="page-break-inside: avoid; margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
    <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">Карта ремонта / замены деталей</h2>
    
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px;">
        ${Object.entries(data.bodyRepairMap).filter(([key]) => key !== 'totalRepairZones').map(([zone, status]) => {
            const zoneNames = {
                frontPart: 'Передняя часть',
                frontRight: 'Передняя правая',
                middleRight: 'Средняя правая',
                rearRight: 'Задняя правая',
                rearPart: 'Задняя часть',
                rearLeft: 'Задняя левая',
                middleLeft: 'Средняя левая',
                frontLeft: 'Передняя левая',
                roof: 'Крыша',
                bottom: 'Днище',
                interior: 'Салон',
                engineTransmission: 'Двигатель/КПП',
                electronics: 'Электрика'
            };
            const isOk = status.includes('без аномалий') || status === 'ok';
            return `
                <div style="background: ${isOk ? '#d4edda' : '#f8d7da'}; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px;">
                    <div style="font-weight: bold; margin-bottom: 5px; color: ${isOk ? '#28a745' : '#dc3545'};">
                        ${isOk ? '✓' : '✗'} ${zoneNames[zone] || zone}
                    </div>
                    <div style="color: #666; font-size: 10px;">${status}</div>
                </div>
            `;
        }).join('')}
    </div>
    
    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center;">
        <strong>Всего зон с ремонтом:</strong> ${data.bodyRepairMap.totalRepairZones || 0}
    </div>
</div>
` : ''}

<!-- 2.6. Проверка каркаса -->
${data.frameCheck ? `
<div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
    <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">Проверка каркаса кузова</h2>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div style="background: white; padding: 15px; border-radius: 8px;">
            <strong style="color: #666;">Каркас кузова:</strong>
            <p style="margin: 5px 0;">${data.frameCheck.bodyFrame}</p>
        </div>
        <div style="background: white; padding: 15px; border-radius: 8px;">
            <strong style="color: #666;">Усиленные элементы:</strong>
            <p style="margin: 5px 0;">${data.frameCheck.reinforcedElements}</p>
        </div>
    </div>
</div>
` : ''}


    <!-- 3. История пробега -->
${data.mileageHistory && data.mileageHistory.length > 0 ? `
<div style="page-break-inside: avoid; margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
    <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0;">3. История пробега</h2>
    
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
                    <td style="padding: 12px;">${m.date}</td>
                    <td style="padding: 12px;">${m.mileage ? m.mileage : '—'}</td>
                    <td style="padding: 12px;">${m.status}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    
    ${data.mileageSummary ? `
        <div style="margin-top: 20px; background: white; padding: 15px; border-radius: 8px;">
            <h4 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Сводка по пробегу</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                <div>
                    <span style="font-size: 11px; color: #888;">Максимальный зафиксированный:</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.maxMileage}</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Аномалий:</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.anomalies} шт.</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Прогнозируемый текущий:</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.estimatedCurrent || data.estimatedCurrentMileage || '—'}</p>
                </div>
                <div>
                    <span style="font-size: 11px; color: #888;">Среднегодовой:</span>
                    <p style="font-size: 14px; font-weight: 600; margin: 3px 0 0 0;">${data.mileageSummary.avgYearly || data.avgYearlyMileage || '—'} ${data.mileageAssessment ? '(' + data.mileageAssessment + ')' : ''}</p>
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
    
    <div style="margin-bottom: 15px; color: #666; font-size: 13px;">
        <p style="margin: 3px 0;"><strong>Период:</strong> ${data.serviceHistory.period}</p>
        <p style="margin: 3px 0;"><strong>Всего визитов:</strong> ${data.serviceHistory.totalVisits} (${data.serviceHistory.repairs} ремонтов, ${data.serviceHistory.maintenance} ТО)</p>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
        ${data.serviceHistory.records.map(r => `
            <div style="background: white; border-radius: 8px; padding: 10px; border-left: 3px solid #4a4a8a; font-size: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span style="font-weight: bold; color: #4a4a8a;">${r.date}</span>
                    <span style="color: #666; font-size: 10px;">${r.mileage ? r.mileage + ' км' : ''}</span>
                </div>
                ${r.description ? `<div style="color: #333; font-size: 10px;"><strong>Работы:</strong> ${r.description}</div>` : ''}
                ${r.materials && r.materials.length > 0 ? `
                    <div style="margin-top: 5px; color: #666; font-size: 10px;">
                        <strong>Материалы:</strong> ${r.materials.join(', ')}
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>
</div>
` : ''}

    
    <!-- 6-9. Компактная информация -->
<div style="page-break-inside: avoid; break-inside: avoid;">
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px;">
        
        <!-- 6. Характеристики автомобиля -->
        ${data.vehicleInfo ? `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 15px;">
            <h3 style="font-size: 14px; font-weight: bold; color: #2a2a5a; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">6. Характеристики ТС</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                <div><span style="color: #888;">Год:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.year}</p></div>
                <div><span style="color: #888;">Объём двигателя:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.engineVolume ? data.vehicleInfo.engineVolume + ' см³' : ''}</p></div>
                <div><span style="color: #888;">Мощность:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.power ? data.vehicleInfo.power + ' kW' : ''}</p></div>
                <div><span style="color: #888;">КПП:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.transmission}</p></div>
                <div><span style="color: #888;">Масса:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.weight ? data.vehicleInfo.weight + ' кг' : ''}</p></div>
                <div><span style="color: #888;">Производство:</span> <p style="font-weight: 600; margin: 2px 0;">${data.vehicleInfo.production}</p></div>
            </div>
        </div>
        ` : ''}
        
        <!-- 7. Информация о владельце -->
        ${data.ownerInfo ? `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 15px;">
            <h3 style="font-size: 14px; font-weight: bold; color: #2a2a5a; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">7. Владелец</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                <div><span style="color: #888;">Тип:</span> <p style="font-weight: 600; margin: 2px 0;">${data.ownerInfo.ownerType}</p></div>
                <div><span style="color: #888;">Регистрация:</span> <p style="font-weight: 600; margin: 2px 0;">${data.ownerInfo.registrationTime}</p></div>
                <div><span style="color: #888;">Владельцев:</span> <p style="font-weight: 600; margin: 2px 0;">${data.ownerInfo.ownersCount}</p></div>
                <div><span style="color: #888;">Использование:</span> <p style="font-weight: 600; margin: 2px 0;">${data.ownerInfo.usage}</p></div>
            </div>
        </div>
        ` : ''}
        
        <!-- 8. Информация о страховании -->
        ${data.insuranceInfo ? `
        <div style="background: #f8f9fa; border-radius: 12px; padding: 15px;">
            <h3 style="font-size: 14px; font-weight: bold; color: #2a2a5a; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">8. Страхование</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                <div><span style="color: #888;">ОСАГО:</span> <p style="font-weight: 600; color: ${data.insuranceInfo.osago ? '#28a745' : '#333'}; margin: 2px 0;">${data.insuranceInfo.osago}</p></div>
                <div><span style="color: #888;">КАСКО:</span> <p style="font-weight: 600; color: ${data.insuranceInfo.kasko ? '#28a745' : '#333'}; margin: 2px 0;">${data.insuranceInfo.kasko}</p></div>
                <div><span style="color: #888;">Страх. случаев:</span> <p style="font-weight: 600; margin: 2px 0;">${data.insuranceInfo.claims} шт.</p></div>
                <div><span style="color: #888;">Макс. ущерб:</span> <p style="font-weight: 600; margin: 2px 0;">${data.insuranceInfo.maxDamage} ₽</p></div>
            </div>
        </div>
        ` : ''}
        
        <!-- 9. Итоговая оценка -->
        ${data.conclusion ? `
        <div style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius: 12px; padding: 15px;">
            <h3 style="font-size: 14px; font-weight: bold; color: #2a2a5a; margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 2px solid #a5d6a7;">9. Итоговая оценка</h3>
            <div style="font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="color: ${data.conclusion.accidents ? '#28a745' : '#dc3545'}; font-size: 16px;">${data.conclusion.accidents ? '✓' : '✗'}</span>
                    <span>${data.conclusion.accidents}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="color: ${data.conclusion.bodyAnomalies ? '#28a745' : '#dc3545'}; font-size: 16px;">${data.conclusion.bodyAnomalies ? '✓' : '✗'}</span>
                    <span>${data.conclusion.bodyAnomalies}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="color: ${data.conclusion.insuranceRepairs ? '#28a745' : '#dc3545'}; font-size: 16px;">${data.conclusion.insuranceRepairs ? '✓' : '✗'}</span>
                    <span>${data.conclusion.insuranceRepairs}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: ${data.conclusion.componentProblems ? '#28a745' : '#dc3545'}; font-size: 16px;">${data.conclusion.componentProblems ? '✓' : '✗'}</span>
                    <span>${data.conclusion.componentProblems}</span>
                </div>
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #a5d6a7; font-size: 12px;">
                    <strong>Рекомендация:</strong> ${data.conclusion.recommendation}
                </div>
            </div>
        </div>
        ` : ''}
        
    </div>
</div>
`;
}

// Генерация краткого страхового отчёта
function generateInsuranceReport(data) {
    const logoSrc = appState.settings.logoBase64 || appState.settings.logoUrl;
    
    return `<div class="report-container" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 0 auto; color: #333; line-height: 1.6; background: white; padding: 30px;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4a4a8a;">
        <div>
            <h1 style="font-size: 26px; font-weight: bold; color: #2a2a5a; margin: 0;">Страховой отчёт</h1>
            <p style="font-size: 16px; color: #666; margin-top: 5px;">${data.brand || ''} ${data.model || ''}</p>
        </div>
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="max-height: 70px; max-width: 180px; object-fit: contain;">` : ''}
    </div>
    
    <div style="margin-bottom: 25px; background: #f8f9fa; border-radius: 12px; padding: 20px;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div><span style="font-size: 11px; color: #888;">Марка / Модель</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.brand || ''} ${data.model || ''}</p></div>
            <div><span style="font-size: 11px; color: #888;">VIN</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.vin || ''}</p></div>
            <div><span style="font-size: 11px; color: #888;">Рейтинг</span>
                <p style="margin: 5px 0 0 0;"><span style="background: linear-gradient(135deg, #ffd700, #ffb800); color: #333; padding: 4px 12px; border-radius: 12px; font-weight: bold;">★ ${data.rating || ''}</span></p></div>
            <div><span style="font-size: 11px; color: #888;">Пробег</span>
                <p style="font-size: 15px; font-weight: 600; margin: 5px 0 0 0;">${data.lastMileage || ''}</p></div>
        </div>
    </div>
    
    ${data.conclusion ? `
    <div style="margin-bottom: 25px; background: linear-gradient(135deg, #e8f5e9, #c8e6c9); border-radius: 12px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: bold; color: #2a2a5a; margin: 0 0 10px 0;">Заключение</h2>
        <p style="margin: 5px 0;"><strong>Аварии:</strong> ${data.conclusion.accidents || ''}</p>
        <p style="margin: 5px 0;"><strong>Рекомендация:</strong> ${data.conclusion.recommendation || ''}</p>
    </div>
    ` : ''}
    
    <div style="text-align: center; color: #999; font-size: 11px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        Отчёт сгенерирован ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}
    </div>
</div>`;
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
    
    const filename = `${sanitizeForFilename(appState.currentReport.vin)}_${formatDateForFile(appState.currentReport.createdAt)}.pdf`;

    if (!isElectron) {
        // ЛОГИКА ДЛЯ ВЕБА - используем API
        try {
            showToast('Генерация PDF...', 'info');
            
            const response = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    htmlContent: appState.currentReport.htmlContent
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success && result.pdfBase64) {
                console.log('PDF base64 length:', result.pdfBase64.length);
                console.log('PDF base64 first 100 chars:', result.pdfBase64.substring(0, 100));
                console.log('PDF base64 type:', typeof result.pdfBase64);
                
                // Скачиваем PDF
                const blob = base64ToBlob(result.pdfBase64, 'application/pdf');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // Сохраняем base64 для последующей загрузки в Drive
                appState.currentReport.pdfBase64 = result.pdfBase64;
                await saveData();
                
                showToast('PDF успешно скачан!', 'success');
            } else {
                throw new Error(result.error || 'Не удалось получить PDF');
            }
        } catch (error) {
            console.error('Web PDF Error:', error);
            showToast('Ошибка генерации PDF: ' + error.message, 'error');
        }
        return;
    }
    
    // ЛОГИКА ДЛЯ ELECTRON
    try {
        showToast('PDF экспортируется...', 'info');
        const result = await ipcRenderer.invoke('export-to-pdf', {
            htmlContent: appState.currentReport.htmlContent,
            filename: filename
        });
        if (result.success) showToast('PDF успешно сохранён!', 'success');
    } catch (error) {
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}


// ============================================
// Экспорт в Google Docs
// ============================================

async function createGoogleDoc() {
    if (!appState.currentReport) return;
    
    showToast('Создание Google Doc...', 'info');
    console.log('[App] Creating Google Doc...');
    
    try {
        let result;
        
        if (isElectron) {
            console.log('[App] Using Electron IPC');
            result = await ipcRenderer.invoke('create-google-doc', {
                title: `Отчёт авто - ${appState.currentReport.vin} - ${formatDateForFile(appState.currentReport.createdAt)}`,
                content: appState.currentReport.htmlContent
            });
            console.log('[App] IPC Result:', result);
        } else {
            console.log('[App] Using web version');
            showToast('Откройте Google Docs и вставьте текст (Ctrl+V)', 'info');
            copyReportAsText();
            return;
        }
        
        if (result.success && result.docUrl) {
            appState.currentReport.googleDocUrl = result.docUrl;
            await saveData();
            showToast('Google Doc создан!', 'success');
            openLink(result.docUrl);
        } else {
            throw new Error(result.error || 'Ошибка создания документа');
        }
    } catch (error) {
        console.error('[App] Error:', error);
        showToast('Ошибка: ' + error.message, 'error');
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
    if (appState.currentReport?.driveUrl) {
        // Для Electron используем альтернативный метод
        if (isElectron && navigator.clipboard) {
            navigator.clipboard.writeText(appState.currentReport.driveUrl).then(() => {
                showToast('Ссылка на Drive скопирована!', 'success');
            }).catch(err => {
                // Фоллбэк через textarea
                copyToClipboardFallback(appState.currentReport.driveUrl);
            });
        } else {
            copyToClipboardFallback(appState.currentReport.driveUrl);
        }
    } else {
        showToast('Файл ещё не загружен в Drive', 'warning');
    }
}

// Фоллбэк для копирования (работает всегда)
function copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        document.execCommand('copy');
        showToast('Ссылка на Drive скопирована!', 'success');
    } catch (err) {
        showToast('Не удалось скопировать ссылку', 'error');
    }
    
    document.body.removeChild(textarea);
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

// ============================================
// Вспомогательные функции для веб-версии
// ============================================

// Google OAuth для веба
async function getGoogleAccessToken() {
    // Проверяем сохраненный токен
    const savedToken = localStorage.getItem('google_access_token');
    const tokenExpiry = localStorage.getItem('google_token_expiry');
    
    if (savedToken && tokenExpiry) {
        const expiryTime = parseInt(tokenExpiry);
        const now = Date.now();
        
        // Если токен еще действителен (с запасом 5 минут)
        if (now < expiryTime - 5 * 60 * 1000) {
            console.log('[Google Auth] Using cached token, expires in', Math.round((expiryTime - now) / 1000 / 60), 'minutes');
            return savedToken;
        } else {
            console.log('[Google Auth] Cached token expired, getting new one');
            localStorage.removeItem('google_access_token');
            localStorage.removeItem('google_token_expiry');
        }
    }
    
    return new Promise((resolve, reject) => {
        const CLIENT_ID = '3349739192-b1anlk17l8c1ba1h1l6qnq7832aqimvf.apps.googleusercontent.com';
        const REDIRECT_URI = window.location.origin;
        const SCOPE = 'https://www.googleapis.com/auth/drive.file';
        
        console.log('[Google Auth] Opening authorization window...');
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${CLIENT_ID}&` +
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
            `response_type=token&` +
            `scope=${encodeURIComponent(SCOPE)}&` +
            `prompt=select_account`;
        
        const authWindow = window.open(authUrl, 'Google Auth', 'width=500,height=600');
        
        if (!authWindow) {
            reject(new Error('Не удалось открыть окно авторизации. Разрешите всплывающие окна.'));
            return;
        }
        
        const checkWindow = setInterval(() => {
            try {
                if (authWindow.closed) {
                    clearInterval(checkWindow);
                    reject(new Error('Окно авторизации закрыто'));
                    return;
                }
                
                const url = authWindow.location.href;
                
                if (url.includes('access_token')) {
                    const params = new URLSearchParams(url.split('#')[1]);
                    const accessToken = params.get('access_token');
                    const expiresIn = params.get('expires_in'); // в секундах
                    
                    // Сохраняем токен и время истечения
                    localStorage.setItem('google_access_token', accessToken);
                    const expiryTime = Date.now() + (parseInt(expiresIn || '3600') * 1000);
                    localStorage.setItem('google_token_expiry', expiryTime.toString());
                    
                    console.log('[Google Auth] Token obtained and cached, expires in', expiresIn, 'seconds');
                    
                    authWindow.close();
                    clearInterval(checkWindow);
                    resolve(accessToken);
                }
            } catch (e) {
                // Cross-origin error - ожидаемо
            }
        }, 100);
        
        setTimeout(() => {
            clearInterval(checkWindow);
            if (authWindow && !authWindow.closed) {
                authWindow.close();
            }
            reject(new Error('Timeout авторизации'));
        }, 5 * 60 * 1000);
    });
}

// Конвертация base64 в Blob
function base64ToBlob(base64, mimeType) {
    try {
        // Очищаем base64 от возможных пробелов и переносов строк
        const cleanBase64 = base64.replace(/\s/g, '');
        const byteCharacters = atob(cleanBase64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    } catch (error) {
        console.error('base64ToBlob error:', error);
        throw new Error('Ошибка декодирования base64: ' + error.message);
    }
}
