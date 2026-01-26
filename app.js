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
    isLoading: false,
    userBookings: []
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

            // ✅ Читаем как ТЕКСТ чтобы увидеть сырой ответ
            const text = await response.text();
            console.log('🔍 RAW response:', text);
            
            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.error('JSON parse error:', e);
                console.error('Текст который не парсится:', text);
                throw new Error('Invalid JSON from server');
            }
            
            if (!result.success) {
                throw new Error(result.error || 'Неизвестная ошибка');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            // Убираем showAlert для старых версий Telegram
            if (tg.showAlert) {
                tg.showAlert(`Ошибка: ${error.message}`);
            }
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
    
    static async getUserBookings() {
        return await this.request('get_user_bookings');
    }
    
    static async cancelBooking(slotId) {
        return await this.request('cancel_booking', { slot_id: slotId });
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

// ===== ЭКРАН МОИ ЗАПИСИ =====

function renderMyBookingsScreen() {
    let bookingsHTML = '';
    
    if (State.userBookings.length === 0) {
        bookingsHTML = `
            <div class="glass-card fade-in" style="text-align: center; padding: 32px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
                <div style="color: var(--text-secondary);">У вас пока нет записей</div>
            </div>
        `;
    } else {
        bookingsHTML = State.userBookings.map(booking => `
            <div class="glass-card fade-in" style="margin-bottom: 16px; padding: 20px;">
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; font-size: 17px; margin-bottom: 6px; color: var(--text-primary);">
                        ${booking.date} в ${booking.time}
                    </div>
                    <div style="color: var(--text-secondary); font-size: 15px;">
                        ${booking.service}
                    </div>
                </div>
                ${booking.zoom_link ? `
                    <a href="${booking.zoom_link}" target="_blank" 
                       style="display: block; padding: 14px; 
                              background: var(--accent-gradient); 
                              color: var(--text-white); 
                              text-align: center; 
                              border-radius: 12px; 
                              text-decoration: none; 
                              margin-bottom: 10px;
                              font-weight: 500;
                              font-size: 15px;">
                        🔗 Открыть Zoom
                    </a>
                ` : ''}
                <button onclick="cancelBooking('${booking.id}')" 
                        style="width: 100%; 
                               padding: 14px; 
                               background: transparent; 
                               border: 1.5px solid var(--error); 
                               color: var(--error); 
                               border-radius: 12px; 
                               font-size: 15px; 
                               font-weight: 500;
                               cursor: pointer;">
                    Отменить запись
                </button>
            </div>
        `).join('');
    }
    
    const html = `
        <h1 class="screen-title fade-in">Мои записи</h1>
        ${bookingsHTML}
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
// Рендер календаря с форматом DD.MM.YYYY для Make.com
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
    
    // ✅ Преобразуем даты из Make.com формата (DD.MM.YYYY) в Set для быстрого поиска
    const availableDatesSet = new Set(
        State.availableDates
            .filter(d => d.slots_count > 0)
            .map(d => d.date) // Даты уже в формате "28.01.2026"
    );
    
    console.log('🎯 Доступные даты для календаря:', Array.from(availableDatesSet));
    
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
        const dateStr = formatDateISO(date); // ISO для внутреннего использования
        
        // ✅ Преобразуем дату в формат DD.MM.YYYY для сравнения с Make.com
        const dayStr = day.toString().padStart(2, '0');
        const monthStr = (month + 1).toString().padStart(2, '0');
        const dateMakeFormat = `${dayStr}.${monthStr}.${year}`; // "28.01.2026"
        
        const isPast = date < today;
        const isAvailable = availableDatesSet.has(dateMakeFormat); // ✅ Точное совпадение с Make.com!
        const isSelected = State.selectedDate === dateStr;
        
        let classes = ['calendar-day'];
        if (isPast) classes.push('past');
        else if (isAvailable) classes.push('available');
        else classes.push('disabled');
        if (isSelected) classes.push('selected');
        
        calendarHTML += `
            <div class="${classes.join(' ')}" 
                 ${isAvailable && !isPast ? `onclick="selectDate('${dateStr}')"` : ''}
                 data-date="${dateMakeFormat}" 
                 title="${isAvailable ? '✅ ' + dateMakeFormat : ''}">
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
    
    // ✅ Меняем активную вкладку БЕЗ рендера
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'booking');
    });
    
    showLoader();
    await loadAvailableDates(serviceName);
    hideLoader();
    
    // ✅ Рендерим ПОСЛЕ загрузки дат
    renderBookingScreen();
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
    
    // ✅ Первый рендер: показываем выбранную дату
    renderBookingScreen();
    
    // ✅ Конвертируем ISO "2026-01-28" → DD.MM.YYYY "28.01.2026"
    const [year, month, day] = dateStr.split('-');
    const dateMakeFormat = `${day}.${month}.${year}`;
    
    console.log(`🔄 Конвертация даты: ${dateStr} → ${dateMakeFormat}`);
    
    showLoader();
    await loadAvailableSlots(State.selectedService, dateMakeFormat);
    hideLoader();
    
    // ✅ Второй рендер: показываем слоты
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
    
    // ✅ Очищаем выбранную дату и слоты при смене месяца
    State.selectedDate = null;
    State.selectedSlot = null;
    State.availableSlots = [];
    
    renderBookingScreen();
}

async function handleBookingConfirm() {
    if (!State.selectedService || !State.selectedDate || !State.selectedSlot) {
        alert('Пожалуйста, выберите услугу, дату и время');
        return;
    }
    
    // ✅ Конвертируем дату ISO → DD.MM.YYYY
    const [year, month, day] = State.selectedDate.split('-');
    const dateMakeFormat = `${day}.${month}.${year}`;
    
    const confirmMessage = `Подтвердить запись на ${dateMakeFormat} в ${State.selectedSlot}?`;
    
    // Используем обычный confirm для совместимости
    if (!confirm(confirmMessage)) {
        return;
    }
    
    await performBooking(dateMakeFormat);
}

async function performBooking(dateFormatted) {
    showLoader();
    
    try {
        const result = await BookingAPI.bookSlot(
            State.selectedService,
            dateFormatted,
            State.selectedSlot
        );
        
        hideLoader();
        
        console.log('📥 Результат бронирования:', result);
        
        if (result.booking && result.booking.zoom_link) {
            // Бот отправит сообщение - закрываем Mini App
            State.selectedService = null;
            State.selectedDate = null;
            State.selectedSlot = null;
            State.availableSlots = [];
            
            // Закрываем Mini App чтобы пользователь увидел сообщение от бота
            setTimeout(() => {
                if (tg.close) {
                    tg.close();
                }
            }, 500);
        } else {
            alert('Запись создана, проверьте сообщения от бота');
            switchTab('services');
        }
    } catch (error) {
        hideLoader();
        console.error('❌ Ошибка бронирования:', error);
        alert('Ошибка при бронировании. Попробуйте еще раз.');
    }
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
        console.log('📥 RAW ответ от Make:', result);
        console.log('📥 Массив дат от Make:', result.dates);
        
        // ✅ ИСПРАВЛЕНИЕ: преобразуем строки в объекты
        State.availableDates = (result.dates || []).map(dateStr => ({ 
            date: dateStr,      // "28.01.2026"
            slots_count: 1      // Всегда доступна
        }));
        
        // ✅ Очищаем выбранную дату и слот при загрузке новых дат
        State.selectedDate = null;
        State.selectedSlot = null;
        State.availableSlots = [];
        
        console.log('✅ Обработанные даты (State.availableDates):', State.availableDates);
        console.log('🎯 Set для календаря:', Array.from(new Set(State.availableDates.map(d => d.date))));
        
    } catch (error) {
        console.error('❌ Ошибка загрузки дат:', error);
        State.availableDates = [];
        tg.showAlert('Не удалось загрузить доступные даты');
    }
}

async function loadAvailableSlots(serviceName, date) {
    try {
        const result = await BookingAPI.getAvailableSlots(serviceName, date);
        console.log('📥 RAW slots от Make:', result.slots);
        
        // ✅ Make возвращает {array: [...], __IMTAGGLENGTH__: N}
        // Берём массив из .array
        let slotsArray = [];
        
        if (Array.isArray(result.slots)) {
            slotsArray = result.slots;
        } else if (result.slots && Array.isArray(result.slots.array)) {
            slotsArray = result.slots.array;
        }
        
        // Преобразуем {"0":"id", "1":"date", "2":"time"} → {id, date, time}
        const allSlots = slotsArray
            .map(slot => ({
                id: slot["0"] || slot[0],
                date: slot["1"] || slot[1],
                time: slot["2"] || slot[2]
            }))
            .filter(s => s.time && s.date);
        
        console.log('✅ Обработанные слоты:', allSlots);
        
        // ✅ ФИЛЬТРУЕМ только слоты для выбранной даты
        State.availableSlots = allSlots.filter(slot => slot.date === date);
        
        console.log(`🎯 Слоты для даты ${date}:`, State.availableSlots);
    } catch (error) {
        console.error('❌ Ошибка загрузки слотов:', error);
        State.availableSlots = [];
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// ===== УПРАВЛЕНИЕ БРОНИРОВАНИЯМИ =====

async function loadUserBookings() {
    try {
        const result = await BookingAPI.getUserBookings();
        console.log('📥 Бронирования пользователя:', result);
        
        if (result.bookings && result.bookings.array) {
            // Обрабатываем массив бронирований
            State.userBookings = result.bookings.array.map(booking => ({
                id: booking["0"] || booking.id,
                date: booking["1"] || booking.date,
                time: booking["2"] || booking.start_time,
                service: booking["5"] || booking.service,
                zoom_link: booking["12"] || booking.zoom_link
            }));
        } else {
            State.userBookings = [];
        }
        
        console.log('✅ Обработанные бронирования:', State.userBookings);
    } catch (error) {
        console.error('❌ Ошибка загрузки бронирований:', error);
        State.userBookings = [];
    }
}

async function cancelBooking(slotId) {
    if (!confirm('Вы уверены что хотите отменить запись?')) {
        return;
    }
    
    showLoader();
    
    try {
        const result = await BookingAPI.cancelBooking(slotId);
        hideLoader();
        
        if (result.success) {
            alert('Запись отменена');
            await loadUserBookings();
            renderMyBookingsScreen();
        }
    } catch (error) {
        hideLoader();
        console.error('❌ Ошибка отмены:', error);
        alert('Не удалось отменить запись');
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
        case 'mybookings':
            loadUserBookings().then(() => renderMyBookingsScreen());
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
