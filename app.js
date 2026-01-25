// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ =====
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

// ===== КОНФИГУРАЦИЯ =====
const CONFIG = {
    API: {
        main: 'https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba'  // ← ВАШ WEBHOOK
    },
    SERVICE_ICONS: {
        'Диагностика': '🔍',
        'Индивидуальная консультация': '🧠',
        'Семейная консультация': '👨‍👩‍👧',
        'Пакет консультаций': '📦',
        'Вступить в клуб': '👑'
    }
};

// ===== ПОЛЬЗОВАТЕЛЬ =====
const tg = window.Telegram?.WebApp || {};
const USER = tg.initDataUnsafe?.user || { id: 12345, fullName: 'Гость' };
const generateRequestId = () => 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// ===== API ФУНКЦИИ =====
class BookingAPI {
    static async request(action, data = {}) {
        console.log("🚀 Отправляю запрос:", { action, ...data }); // ← ЛОГИРОВАНИЕ
        
        try {
            const response = await fetch(CONFIG.API.main, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: action,
                    service_name: data.service_name || State.selectedService,
                    user_id: USER.id,
                    user_name: USER.fullName,
                    init_data: tg.initData || 'test',
                    request_id: generateRequestId(),
                    ...data
                })
            });

            console.log("📡 Ответ сервера:", response.status); // ← ЛОГИРОВАНИЕ

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log("✅ Результат:", result); // ← ЛОГИРОВАНИЕ
            
            if (!result.success) {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

            return result;
        } catch (error) {
            console.error('❌ API Error:', error);
            // Безопасный showAlert для версии 6.0
            if (tg.showAlert && typeof tg.showAlert === 'function') {
                tg.showAlert(`Ошибка: ${error.message}`);
            } else {
                alert(`Ошибка: ${error.message}`);
            }
            throw error;
        }
    }

    static async getServices() {
        // Мок-данные для теста (Make.com пока не настроен)
        return {
            success: true,
            services: [
                { name: 'Диагностика', duration: 60, price: 0 },
                { name: 'Индивидуальная консультация', duration: 60, price: 5000 },
                { name: 'Семейная консультация', duration: 120, price: 8000 }
            ]
        };
    }

    static async getAvailableDates(serviceName) {
        return await this.request('get_available_dates', { service_name: serviceName });
    }

    static async getAvailableSlots(serviceName, date) {
        return await this.request('get_slots', { service_name: serviceName, date: date });
    }

    static async bookSlot(serviceName, date, time) {
        return await this.request('book_slot', { 
            service_name: serviceName, 
            date: date,
            time: time
        });
    }
}

// ===== УПРАВЛЕНИЕ ЗАГРУЗКОЙ =====
function showLoader() {
    State.isLoading = true;
    if (tg.MainButton?.showProgress) tg.MainButton.showProgress();
}

function hideLoader() {
    State.isLoading = false;
    if (tg.MainButton?.hideProgress) tg.MainButton.hideProgress();
}

// ===== РЕНДЕРИНГ ЭКРАНОВ ===== (остается БЕЗ ИЗМЕНЕНИЙ)
// ... все функции renderServicesScreen, renderPaymentScreen, renderBookingScreen 
// остаются точно такими же, как у вас были ...

// Экран услуг
function renderServicesScreen() {
    const services = State.services;
    
    const html = `
        <h1 class="screen-title fade-in">Выберите услугу</h1>
        <div class="services-grid fade-in">
            ${services.map(service => `
                <div class="service-card glass-card" onclick="selectService('${escapeHtml(service.name)}')">
                    <div class="service-header">
                        <div class="service-icon">${CONFIG.SERVICE_ICONS[service.name] || '📋'}</div>
                        <div class="service-info">
                            <div class="service-name">${escapeHtml(service.name)}</div>
                            <div class="service-duration">${service.duration} минут</div>
                        </div>
                    </div>
                    <div class="service-description">
                        ${getServiceDescription(service.name)}
                    </div>
                    <div class="service-footer">
                        <div class="service-price ${service.price === 0 ? 'free' : ''}">
                            ${service.price === 0 ? 'Бесплатно' : formatPrice(service.price)}
                        </div>
                        <button class="service-btn">
                            Записаться →
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('app').innerHTML = html;
}

// Экран бронирования (с КАЛЕНДАРЕМ)
function renderBookingScreen() {
    const html = `
        <h1 class="screen-title fade-in">Запись на консультацию</h1>
        
        <div class="glass-card service-selector fade-in">
            <select class="service-select" onchange="handleServiceSelect(this.value)">
                <option value="">Выберите услугу...</option>
                ${State.services.map(s => `
                    <option value="${escapeHtml(s.name)}" ${State.selectedService === s.name ? 'selected' : ''}>
                        ${escapeHtml(s.name)} (${s.price === 0 ? 'Бесплатно' : formatPrice(s.price)})
                    </option>
                `).join('')}
            </select>
        </div>
        
        <div id="calendar-section" class="${State.selectedService ? '' : 'hidden'}">
            ${renderCalendar()}
        </div>
        
        <div id="slots-section" class="${State.selectedDate ? '' : 'hidden'}">
            ${renderSlots()}
        </div>
        
        ${State.selectedSlot ? `
            <button class="confirm-button" onclick="handleBookingConfirm()">
                Подтвердить запись
            </button>
        ` : ''}
    `;
    
    document.getElementById('app').innerHTML = html;
}

// ===== КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ: Загрузка дат ПРИ ИНИЦИАЛИЗАЦИИ =====

async function initApp() {
    console.log('🚀 Mini App initialized for user:', USER.fullName);
    
    // Инициализация Telegram WebApp
    if (tg.ready) tg.ready();
    if (tg.expand) tg.expand();
    
    // ТЕСТОВЫЙ ЗАПРОС ДАТ ПРИ ЗАГРУЗКЕ (Диагностика)
    console.log("🔄 Тестирую загрузку дат для 'Диагностика'...");
    try {
        const datesResult = await BookingAPI.getAvailableDates('Диагностика');
        console.log("✅ Даты получены:", datesResult.dates);
        State.availableDates = (datesResult.dates || []).map(date => ({ 
            date: date, 
            slots_count: 1 
        }));
    } catch (error) {
        console.error("❌ Ошибка загрузки дат:", error);
        State.availableDates = [];
    }
    
    // Загрузка услуг
    await loadServices();
    
    // Настройка обработчиков табов
    document.querySelectorAll('.tab-btn')?.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    renderServicesScreen();
    
    console.log("🎉 Приложение готово! Даты в State.availableDates:", State.availableDates);
}

// ===== ОСТАЛЬНЫЕ ФУНКЦИИ БЕЗ ИЗМЕНЕНИЙ =====
// Вставьте сюда ВСЕ остальные функции из вашего кода:
// renderPaymentScreen, renderCalendar, renderSlots, selectService, handleServiceSelect, 
// selectDate, selectSlot, changeMonth, handleBookingConfirm, loadServices, loadAvailableDates, 
// loadAvailableSlots, switchTab, formatPrice, formatDateISO, escapeHtml, getServiceDescription

// Копировать из вашего оригинального кода:
function renderPaymentScreen() {
    const html = `
        <h1 class="screen-title fade-in">Способы оплаты</h1>
        <div class="payment-grid fade-in">
            <div class="payment-card glass-card" onclick="openPayment('card')">
                <div class="payment-icon">💳</div>
                <div class="payment-info">
                    <div class="payment-name">Банковская карта</div>
                    <div class="payment-description">Visa, MasterCard, МИР</div>
                </div>
                <div class="payment-arrow">→</div>
            </div>
            <div class="payment-card glass-card" onclick="openPayment('sbp')">
                <div class="payment-icon">🔗</div>
                <div class="payment-info">
                    <div class="payment-name">Система быстрых платежей</div>
                    <div class="payment-description">Оплата через СБП</div>
                </div>
                <div class="payment-arrow">→</div>
            </div>
            <div class="payment-card glass-card" onclick="openPayment('other')">
                <div class="payment-icon">📱</div>
                <div class="payment-info">
                    <div class="payment-name">Другие способы</div>
                    <div class="payment-description">ЮMoney, QIWI и другие</div>
                </div>
                <div class="payment-arrow">→</div>
            </div>
        </div>
        <div class="section-title" style="margin-top: 32px;">💡 Информация</div>
        <div class="glass-card" style="padding: 20px; margin-top: 16px;">
            <p style="color: var(--text-secondary); line-height: 1.6; font-size: 15px;">
                После оплаты вы получите подтверждение и ссылку на Zoom встречу. 
                Если у вас возникнут вопросы, свяжитесь с нами через бота.
            </p>
        </div>
    `;
    document.getElementById('app').innerHTML = html;
}

// Запуск при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
