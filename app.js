// НЕ объявляем tg повторно - используем глобальную из config.js
const State = {
    currentTab: 'services',
    services: [],
    selectedService: null,
    availableDates: [],
    selectedDate: null,
    availableSlots: [],
    selectedSlot: null,
    currentMonth: new Date(),
    isLoading: false
};

const CONFIG = {
    API: {
        // 🔥 CORS исправлен
        main: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba')
    },
    SERVICE_ICONS: {
        'Диагностика': '🔍',
        'Индивидуальная консультация': '🧠',
        'Семейная консультация': '👨‍👩‍👧'
    }
};

// tg уже объявлен в config.js - используем window.Telegram.WebApp
const USER = window.Telegram?.WebApp?.initDataUnsafe?.user || { id: 12345, fullName: 'Гость' };
const generateRequestId = () => 'req_' + Date.now();

class BookingAPI {
    static async request(action, data = {}) {
        console.log("🚀 Запрос:", { action, service_name: data.service_name });
        
        try {
            const response = await fetch(CONFIG.API.main, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    service_name: data.service_name || State.selectedService,
                    user_id: USER.id,
                    user_name: USER.fullName,
                    init_data: window.Telegram?.WebApp?.initData || 'test',
                    request_id: generateRequestId(),
                    ...data
                })
            });

            console.log("📡 Ответ:", response.status);
            
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const result = await response.json();
            console.log("✅ Данные:", result);
            return result;
        } catch (error) {
            console.error('❌ Ошибка:', error);
            const tg = window.Telegram?.WebApp;
            if (tg?.showAlert) tg.showAlert('Ошибка: ' + error.message);
            else alert('Ошибка: ' + error.message);
            throw error;
        }
    }

    static async getServices() {
        return {
            success: true,
            services: [
                { name: 'Диагностика', duration: 60, price: 0 },
                { name: 'Индивидуальная консультация', duration: 60, price: 5000 }
            ]
        };
    }

    static async getAvailableDates(serviceName) {
        return await this.request('get_available_dates', { service_name: serviceName });
    }
}

async function initApp() {
    console.log('🚀 Старт для:', USER.fullName);
    
    const tg = window.Telegram?.WebApp;
    if (tg?.ready) tg.ready();
    if (tg?.expand) tg.expand();
    
    // 🔥 ТЕСТ ДАТ при запуске
    console.log("🔄 Загружаю даты...");
    try {
        const result = await BookingAPI.getAvailableDates('Диагностика');
        State.availableDates = (result.dates || []).map(date => {
            const parts = date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
            if (parts) {
                return { 
                    date: '2026-' + parts[2].padStart(2, '0') + '-' + parts[1].padStart(2, '0'), 
                    slots_count: 1 
                };
            }
            return { date, slots_count: 1 };
        });
        console.log("✅ Загружено:", State.availableDates.length, "дат");
    } catch (e) {
        console.error("❌ Ошибка загрузки:", e);
    }
    
    State.services = [
        { name: 'Диагностика', duration: 60, price: 0 },
        { name: 'Индивидуальная консультация', duration: 60, price: 5000 }
    ];
    
    renderServicesScreen();
}

function renderServicesScreen() {
    document.getElementById('app').innerHTML = `
        <h1 style="font-size: 24px; margin: 20px 0; text-align: center;">🎯 Выберите услугу</h1>
        <div style="display: flex; flex-direction: column; gap: 15px; padding: 0 20px;">
            ${State.services.map(s => `
                <div style="padding: 20px; background: rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.2);" 
                     onclick="selectService('${s.name.replace(/'/g, "\\'")}')">
                    <div style="font-size: 18px; font-weight: bold;">${CONFIG.SERVICE_ICONS[s.name] || '📋'} ${s.name}</div>
                    <div style="color: #ccc; margin-top: 5px;">${s.duration} мин • ${s.price === 0 ? 'Бесплатно' : s.price + '₽'}</div>
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 30px; padding: 15px; background: #4CAF50; color: white; border-radius: 12px; text-align: center;">
            ✅ Дат загружено: ${State.availableDates.length}
        </div>
    `;
}

async function selectService(serviceName) {
    State.selectedService = serviceName;
    renderBookingScreen();
    await loadAvailableDates(serviceName);
}

async function loadAvailableDates(serviceName) {
    try {
        const result = await BookingAPI.getAvailableDates(serviceName);
        State.availableDates = (result.dates || []).map(date => {
            const parts = date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
            if (parts) {
                return { 
                    date: '2026-' + parts[2].padStart(2, '0') + '-' + parts[1].padStart(2, '0'), 
                    slots_count: 1 
                };
            }
            return { date, slots_count: 1 };
        });
        console.log("📅 Обновлено:", State.availableDates);
        renderBookingScreen();
    } catch (e) {
        State.availableDates = [];
        console.error("❌ Ошибка:", e);
    }
}

function renderBookingScreen() {
    document.getElementById('app').innerHTML = `
        <div style="padding: 20px;">
            <h1 style="font-size: 24px; margin: 0 0 20px 0;">📅 ${State.selectedService}</h1>
            ${renderCalendar()}
        </div>
    `;
}

function renderCalendar() {
    const month = State.currentMonth.getMonth();
    const year = State.currentMonth.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const availableSet = new Set(State.availableDates.map(d => d.date));
    
    let html = `
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px; font-size: 18px;">
                ${State.currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px;">`;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isAvailable = availableSet.has(dateStr);
        
        html += `
            <div style="padding: 15px 5px; text-align: center; border-radius: 10px; 
                       background: ${isAvailable ? '#4CAF50' : 'rgba(0,0,0,0.3)'}; 
                       color: ${isAvailable ? 'white' : '#999'}; 
                       cursor: ${isAvailable ? 'pointer' : 'default'}; 
                       font-weight: ${isAvailable ? 'bold' : 'normal'}; font-size: 16px;"
                ${isAvailable ? `onclick="selectDate('${dateStr}')" title="Доступно!"` : ''}>
                ${day}
            </div>`;
    }
    
    html += `</div>
            <div style="margin-top: 25px; padding: 15px; background: #4CAF50; color: white; border-radius: 12px; text-align: center; font-size: 16px;">
                ✅ Доступно дат: ${State.availableDates.length}
            </div>
        </div>`;
    
    return html;
}

function selectDate(dateStr) {
    State.selectedDate = dateStr;
    const tg = window.Telegram?.WebApp;
    if (tg?.showAlert) {
        tg.showAlert('✅ Выбрана дата: ' + dateStr);
    } else {
        alert('✅ Выбрана дата: ' + dateStr);
    }
}

// ===== ЗАПУСК =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
