// ===== ПОЛНЫЙ app.js - РАБОТАЕТ С ДАТАМИ ИЗ MAKE.COM =====
const State = {
    currentTab: 'services', services: [], selectedService: null, availableDates: [],
    selectedDate: null, availableSlots: [], selectedSlot: null, currentMonth: new Date(),
    isLoading: false
};

// 🔥 CORS FIX + ВАШ WEBHOOK
const CONFIG = {
    API: {
        main: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba')
    },
    SERVICE_ICONS: {
        'Диагностика': '🔍', 'Индивидуальная консультация': '🧠', 
        'Семейная консультация': '👨‍👩‍👧'
    }
};

const tg = window.Telegram?.WebApp || {};
const USER = tg.initDataUnsafe?.user || { id: 12345, fullName: 'Гость' };
const generateRequestId = () => 'req_' + Date.now();

class BookingAPI {
    static async request(action, data = {}) {
        console.log("🚀 Запрос:", { action, service_name: data.service_name });
        
        try {
            const response = await fetch(CONFIG.API.main, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action, service_name: data.service_name || State.selectedService,
                    user_id: USER.id, user_name: USER.fullName,
                    init_data: tg.initData || 'test', request_id: generateRequestId(),
                    ...data
                })
            });

            console.log("📡 Ответ:", response.status);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            console.log("✅ Данные:", result);
            return result;
        } catch (error) {
            console.error('❌ Ошибка:', error);
            (tg.showAlert || alert)(`Ошибка: ${error.message}`);
            throw error;
        }
    }

    static async getServices() {
        return { success: true, services: [
            { name: 'Диагностика', duration: 60, price: 0 },
            { name: 'Индивидуальная консультация', duration: 60, price: 5000 }
        ]};
    }

    static async getAvailableDates(serviceName) {
        return await this.request('get_available_dates', { service_name: serviceName });
    }
}

async function initApp() {
    console.log('🚀 Старт для:', USER.fullName);
    if (tg.ready) tg.ready(); if (tg.expand) tg.expand();
    
    // 🔥 АВТОЗАГРУЗКА ДАТ ПРИ СТАРТЕ
    console.log("🔄 Загружаю даты 'Диагностика'...");
    try {
        const result = await BookingAPI.getAvailableDates('Диагностика');
        State.availableDates = (result.dates || []).map(date => ({ 
            date: date.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '2026-$2-$1'), 
            slots_count: 1 
        }));
        console.log("✅ Загружено дат:", State.availableDates.length);
    } catch (e) {
        console.error("❌ Ошибка дат:", e);
    }
    
    State.services = [
        { name: 'Диагностика', duration: 60, price: 0 },
        { name: 'Индивидуальная консультация', duration: 60, price: 5000 }
    ];
    renderServicesScreen();
}

function renderServicesScreen() {
    document.getElementById('app').innerHTML = `
        <h1 style="font-size: 24px; margin: 20px 0;">🎯 Выберите услугу</h1>
        <div style="display: flex; flex-direction: column; gap: 15px;">
            ${State.services.map(s => `
                <div style="padding: 20px; background: rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer;" 
                     onclick="selectService('${s.name}')">
                    <div style="font-size: 18px;">${CONFIG.SERVICE_ICONS[s.name]} ${s.name}</div>
                    <div>${s.duration} мин • ${s.price === 0 ? 'Бесплатно' : s.price + '₽'}</div>
                </div>
            `).join('')}
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
        State.availableDates = (result.dates || []).map(date => ({ 
            date: date.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '2026-$2-$1'), 
            slots_count: 1 
        }));
        console.log("📅 Даты обновлены:", State.availableDates);
    } catch (e) {
        State.availableDates = [];
    }
}

function renderBookingScreen() {
    document.getElementById('app').innerHTML = `
        <h1 style="font-size: 24px; margin: 20px 0;">📅 ${State.selectedService}</h1>
        <div style="padding: 20px; background: rgba(255,255,255,0.1); border-radius: 12px;">
            ${renderCalendar()}
        </div>
    `;
}

function renderCalendar() {
    const month = State.currentMonth.getMonth();
    const year = State.currentMonth.getFullYear();
    const days = new Date(year, month + 1, 0).getDate();
    const availableSet = new Set(State.availableDates.map(d => d.date));
    
    let html = `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 20px;">`;
    for (let day = 1; day <= days; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isAvailable = availableSet.has(dateStr);
        html += `
            <div style="padding: 12px; text-align: center; border-radius: 8px; 
                       background: ${isAvailable ? '#4CAF50' : 'rgba(255,255,255,0.1)'; color: ${isAvailable ? 'white' : 'inherit'}; cursor: ${isAvailable ? 'pointer' : 'default'};}"
                ${isAvailable ? `onclick="selectDate('${dateStr}')" title="Доступно!"` : ''}>
                ${day}
            </div>`;
    }
    html += '</div>';
    html += `<div style="margin-top: 20px; padding: 10px; background: #4CAF50; color: white; border-radius: 8px;">
                Доступно дат: ${State.availableDates.length}
             </div>`;
    return html;
}

function selectDate(dateStr) {
    State.selectedDate = dateStr;
    alert(`Выбрана дата: ${dateStr}`);
}

function formatPrice(price) { return price === 0 ? 'Бесплатно' : price + '₽'; }
function escapeHtml(text) { return text.replace(/[&<>"']/g, ''); }
function getServiceDescription(name) { return 'Описание услуги'; }

// ===== ЗАПУСК =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
