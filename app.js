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

// ===== API ФУНКЦИИ =====
class BookingAPI {
    static async request(action, data = {}) {
        try {
            const response = await fetch(CONFIG.API.main, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: action,
                    user_id: USER.id,
                    user_name: USER.fullName,
                    init_data: tg.initData,
                    request_id: generateRequestId(),
                    ...data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            tg.showAlert(`Ошибка: ${error.message}`);
            throw error;
        }
    }

    static async getServices() {
        return await this.request('get_services');
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
    tg.MainButton.showProgress();
}

function hideLoader() {
    State.isLoading = false;
    tg.MainButton.hideProgress();
}

// ===== РЕНДЕРИНГ ЭКРАНОВ =====

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

// Экран оплаты
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

// Экран бронирования
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

// Рендер календаря
function renderCalendar() {
    if (!State.selectedService) return '';
    
    const monthDate = State.currentMonth;
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    
    const monthName = monthDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const availableDatesSet = new Set(
        State.availableDates
            .filter(d => d.slots_count > 0)
            .map(d => d.date)
    );
    
    let calendarHTML = `
        <div class="glass-card calendar-container fade-in" style="margin-top: 16px;">
            <div class="calendar-header">
                <div class="calendar-month">${monthName}</div>
                <div class="calendar-nav">
                    <button class="calendar-nav-btn" onclick="changeMonth(-1)" ${month === today.getMonth() && year === today.getFullYear() ? 'disabled' : ''}>
                        ←
                    </button>
                    <button class="calendar-nav-btn" onclick="changeMonth(1)">
                        →
                    </button>
                </div>
            </div>
            
            <div class="weekdays">
                ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="weekday">${d}</div>`).join('')}
            </div>
            
            <div class="calendar-grid">
    `;
    
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) {
        calendarHTML += '<div class="calendar-day empty"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateISO(date);
        const isPast = date < today;
        const isAvailable = availableDatesSet.has(dateStr);
        const isSelected = State.selectedDate === dateStr;
        
        let classes = ['calendar-day'];
        if (isPast) classes.push('past');
        else if (isAvailable) classes.push('available');
        else classes.push('disabled');
        if (isSelected) classes.push('selected');
        
        calendarHTML += `
            <div class="${classes.join(' ')}" ${isAvailable && !isPast ? `onclick="selectDate('${dateStr}')"` : ''}>
                <span class="day-number">${day}</span>
                ${isAvailable ? '<div class="slots-indicator"></div>' : ''}
            </div>
        `;
    }
    
    calendarHTML += '</div></div>';
    
    return calendarHTML;
}

// Рендер слотов времени
function renderSlots() {
    if (!State.selectedDate) return '';
    
    const dateObj = new Date(State.selectedDate + 'T00:00:00');
    const dateFormatted = dateObj.toLocaleDateString('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
    
    const validSlots = State.availableSlots.filter(slot => slot && slot.time);
    
    if (validSlots.length === 0) {
        return `
            <div class="glass-card slots-container fade-in" style="margin-top: 16px;">
                <div class="slots-date">${dateFormatted}</div>
                <div class="slots-empty">
                    На эту дату нет свободных слотов
                </div>
            </div>
        `;
    }
    
    return `
        <div class="glass-card slots-container fade-in" style="margin-top: 16px;">
            <div class="slots-date">${dateFormatted}</div>
            <div class="slots-grid">
                ${validSlots.map(slot => `
                    <button 
                        class="slot-btn ${State.selectedSlot === slot.time ? 'selected' : ''}"
                        onclick="selectSlot('${escapeHtml(slot.time)}')">
                        ${escapeHtml(slot.time)}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

async function selectService(serviceName) {
    State.selectedService = serviceName;
    State.currentTab = 'booking';
    
    switchTab('booking');
    await loadAvailableDates(serviceName);
}

async function handleServiceSelect(serviceName) {
    if (!serviceName) return;
    
    State.selectedService = serviceName;
    State.selectedDate = null;
    State.selectedSlot = null;
    
    showLoader();
    await loadAvailableDates(serviceName);
    hideLoader();
    
    renderBookingScreen();
}

async function selectDate(dateStr) {
    State.selectedDate = dateStr;
    State.selectedSlot = null;
    
    showLoader();
    await loadAvailableSlots(State.selectedService, dateStr);
    hideLoader();
    
    renderBookingScreen();
}

function selectSlot(time) {
    State.selectedSlot = time;
    renderBookingScreen();
}

function changeMonth(direction) {
    const newMonth = new Date(State.currentMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    State.currentMonth = newMonth;
    renderBookingScreen();
}

async function handleBookingConfirm() {
    if (!State.selectedService || !State.selectedDate || !State.selectedSlot) {
        tg.showAlert('Пожалуйста, выберите услугу, дату и время');
        return;
    }
    
    tg.showConfirm('Подтвердить запись на ' + State.selectedDate + ' в ' + State.selectedSlot + '?', async (confirmed) => {
        if (!confirmed) return;
        
        showLoader();
        
        try {
            const result = await BookingAPI.bookSlot(
                State.selectedService,
                State.selectedDate,
                State.selectedSlot
            );
            
            hideLoader();
            
            if (result.zoom_link) {
                tg.showAlert('✅ Запись подтверждена! Ссылка на Zoom отправлена в чат.', () => {
                    State.selectedService = null;
                    State.selectedDate = null;
                    State.selectedSlot = null;
                    renderBookingScreen();
                });
            }
        } catch (error) {
            hideLoader();
        }
    });
}

function openPayment(type) {
    const url = CONFIG.PAYMENT_URLS[type];
    if (url && !url.includes('your-payment-link')) {
        tg.openLink(url);
    } else {
        tg.showAlert('Ссылка на оплату будет добавлена позже');
    }
}

// ===== ЗАГРУЗКА ДАННЫХ =====

async function loadServices() {
    try {
        showLoader();
        const result = await BookingAPI.getServices();
        State.services = result.services || [];
        hideLoader();
    } catch (error) {
        hideLoader();
        tg.showAlert('Не удалось загрузить список услуг');
    }
}

async function loadAvailableDates(serviceName) {
    try {
        const result = await BookingAPI.getAvailableDates(serviceName);
        // Преобразуем массив строк в массив объектов для совместимости с календарём
        State.availableDates = (result.dates || []).map(date => ({ 
            date: typeof date === 'string' ? date : date.date, 
            slots_count: typeof date === 'string' ? 1 : (date.slots_count || 1)
        }));
    } catch (error) {
        State.availableDates = [];
        tg.showAlert('Не удалось загрузить доступные даты');
    }
}

async function loadAvailableSlots(serviceName, date) {
    try {
        const result = await BookingAPI.getAvailableSlots(serviceName, date);
        State.availableSlots = (result.slots || []).filter(s => s && s.time);
    } catch (error) {
        State.availableSlots = [];
        tg.showAlert('Не удалось загрузить свободные слоты');
    }
}

// ===== НАВИГАЦИЯ МЕЖДУ ТАБАМИ =====

function switchTab(tabName) {
    State.currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    switch(tabName) {
        case 'services':
            renderServicesScreen();
            break;
        case 'payment':
            renderPaymentScreen();
            break;
        case 'booking':
            renderBookingScreen();
            break;
    }
}

// ===== УТИЛИТЫ =====

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getServiceDescription(serviceName) {
    const descriptions = {
        'Диагностика': 'Первичная консультация для знакомства и определения запроса',
        'Вступить в клуб': 'Эксклюзивный доступ к закрытому сообществу и материалам',
        'Пакет консультаций': '10 индивидуальных сессий со скидкой 25%',
        'Семейная консультация': 'Работа с парой или семьёй, длительность 2 часа',
        'Индивидуальная консультация': 'Персональная встреча один на один, 1 час'
    };
    return descriptions[serviceName] || '';
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====

async function initApp() {
    console.log('Mini App initialized for user:', USER.fullName);
    
    // Настройка обработчиков табов
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    await loadServices();
    renderServicesScreen();
}

// Запуск при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
