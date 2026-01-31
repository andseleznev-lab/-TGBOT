// app.js - FIXED VERSION с агрессивной отменой запросов

import { CONFIG } from './config.js';
import * as API from './api.js';

// Состояние приложения
export const State = {
    currentTab: 'services',
    selectedService: null,
    selectedDate: null,
    selectedSlot: null,
    availableDates: [],
    availableSlots: [],
    userBookings: [],
    isLoading: false
};

// Debounce для быстрого переключения вкладок
let tabSwitchTimeout = null;
const TAB_SWITCH_DEBOUNCE = 150; // мс

/**
 * Переключение вкладок с агрессивной отменой
 */
export function switchTab(tabName) {
    // Очищаем предыдущий таймер
    if (tabSwitchTimeout) {
        clearTimeout(tabSwitchTimeout);
    }

    // КРИТИЧНО: Отменяем ВСЕ активные запросы немедленно
    console.log(`🔄 Переключение на вкладку: ${tabName}`);
    API.cancelAllRequests();

    tabSwitchTimeout = setTimeout(() => {
        const previousTab = State.currentTab;
        State.currentTab = tabName;

        // Обновляем UI вкладок
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Загружаем данные для новой вкладки
        console.log(`📍 Загрузка данных для вкладки: ${tabName}`);
        loadTabData(tabName, previousTab);
    }, TAB_SWITCH_DEBOUNCE);
}

/**
 * Загрузка данных для вкладки
 */
async function loadTabData(tabName, previousTab) {
    try {
        if (tabName === 'booking' && State.selectedService) {
            // Только если уже выбрана услуга
            await loadAvailableDates();
        } else if (tabName === 'my-bookings') {
            await loadUserBookings();
        }
        // Вкладка services не требует загрузки
    } catch (error) {
        // Игнорируем ошибки отмены
        if (!error.isCancelled) {
            console.error(`❌ Ошибка загрузки данных для ${tabName}:`, error);
        }
    }
}

/**
 * Выбор услуги
 */
export async function selectService(serviceId) {
    console.log(`🎯 Выбрана услуга: ${serviceId}`);
    
    const service = CONFIG.SERVICES.find(s => s.id === serviceId);
    
    // Специальная обработка для информационной кнопки
    if (service?.type === 'info_button') {
        window.Telegram.WebApp.openLink('https://t.me/+vAocvo_EEX01NmMy');
        return;
    }

    State.selectedService = serviceId;
    State.selectedDate = null;
    State.selectedSlot = null;

    // Переключаемся на вкладку бронирования
    switchTab('booking');
}

/**
 * Загрузка доступных дат
 */
async function loadAvailableDates() {
    if (!State.selectedService) {
        console.log('⚠️ Услуга не выбрана');
        window.Telegram.WebApp.showAlert('Пожалуйста, сначала выберите услугу', () => {
            switchTab('services');
        });
        return;
    }

    const loadingEl = document.getElementById('calendar-loading');
    const calendarEl = document.getElementById('calendar');
    const errorEl = document.getElementById('calendar-error');

    try {
        // Показываем загрузку
        if (loadingEl) loadingEl.style.display = 'block';
        if (calendarEl) calendarEl.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';

        const response = await API.getAvailableDates(State.selectedService);

        console.log('📥 RAW ответ от Make:', response);

        if (!response.success || !response.dates) {
            throw new Error('Некорректный ответ от сервера');
        }

        console.log('📥 Массив дат от Make:', response.dates);

        // Обрабатываем даты
        State.availableDates = response.dates.map(date => ({
            date: date,
            slots_count: 1 // Предполагаем 1 слот на дату
        }));

        console.log('✅ Обработанные даты (State.availableDates):', State.availableDates);

        // Создаём Set для быстрого поиска
        const dateSet = new Set(State.availableDates.map(d => d.date));
        console.log('🎯 Set для календаря:', Array.from(dateSet));

        // Рендерим календарь
        renderCalendar(dateSet);

        // Скрываем загрузку
        if (loadingEl) loadingEl.style.display = 'none';
        if (calendarEl) calendarEl.style.display = 'block';

    } catch (error) {
        console.error('❌ Ошибка загрузки дат:', error);

        // Игнорируем ошибки отмены
        if (error.isCancelled) {
            console.log('⚠️ Запрос загрузки дат был отменён');
            return;
        }

        if (loadingEl) loadingEl.style.display = 'none';
        if (calendarEl) calendarEl.style.display = 'block';

        // Показываем понятное сообщение пользователю
        window.Telegram.WebApp.showAlert(
            'Не удалось загрузить доступные даты. Попробуйте обновить страницу.',
            () => {
                // Предлагаем вернуться к выбору услуги
                switchTab('services');
            }
        );
    }
}

/**
 * Рендеринг календаря
 */
function renderCalendar(availableDatesSet) {
    const calendar = document.getElementById('calendar');
    if (!calendar) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    calendar.innerHTML = '';

    // Рендерим 3 месяца вперёд
    for (let i = 0; i < 3; i++) {
        const monthDate = new Date(currentYear, currentMonth + i, 1);
        const monthDiv = renderMonth(monthDate, availableDatesSet);
        calendar.appendChild(monthDiv);
    }
}

/**
 * Рендеринг одного месяца
 */
function renderMonth(date, availableDatesSet) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    const monthDiv = document.createElement('div');
    monthDiv.className = 'month';
    
    const monthHeader = document.createElement('div');
    monthHeader.className = 'month-header';
    monthHeader.textContent = `${monthNames[month]} ${year}`;
    monthDiv.appendChild(monthHeader);
    
    const daysGrid = document.createElement('div');
    daysGrid.className = 'days-grid';
    
    // Заголовки дней недели
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.textContent = name;
        daysGrid.appendChild(dayHeader);
    });
    
    // Первый день месяца
    const firstDay = new Date(year, month, 1);
    let dayOfWeek = firstDay.getDay();
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Воскресенье = 7
    
    // Пустые ячейки до первого дня
    for (let i = 1; i < dayOfWeek; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'day empty';
        daysGrid.appendChild(emptyDiv);
    }
    
    // Дни месяца
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= lastDay; day++) {
        const currentDate = new Date(year, month, day);
        const dateStr = formatDateForAPI(currentDate);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        dayDiv.textContent = day;
        
        // Проверяем доступность даты
        const isAvailable = availableDatesSet.has(dateStr);
        const isPast = currentDate < today;
        
        if (isPast) {
            dayDiv.classList.add('disabled');
        } else if (isAvailable) {
            dayDiv.classList.add('available');
            dayDiv.addEventListener('click', () => selectDate(dateStr));
        } else {
            dayDiv.classList.add('disabled');
        }
        
        // Выделяем выбранную дату
        if (State.selectedDate === dateStr) {
            dayDiv.classList.add('selected');
        }
        
        daysGrid.appendChild(dayDiv);
    }
    
    monthDiv.appendChild(daysGrid);
    return monthDiv;
}

/**
 * Выбор даты
 */
async function selectDate(dateStr) {
    console.log(`📅 Выбрана дата: ${dateStr}`);
    State.selectedDate = dateStr;
    State.selectedSlot = null;

    // Обновляем календарь
    const availableDatesSet = new Set(State.availableDates.map(d => d.date));
    renderCalendar(availableDatesSet);

    // Загружаем слоты
    await loadAvailableSlots();
}

/**
 * Загрузка доступных слотов
 */
async function loadAvailableSlots() {
    if (!State.selectedService || !State.selectedDate) {
        console.log('⚠️ Услуга или дата не выбраны');
        return;
    }

    const slotsContainer = document.getElementById('time-slots');
    if (!slotsContainer) return;

    try {
        slotsContainer.innerHTML = '<div class="loading">Загрузка слотов...</div>';

        const response = await API.getAvailableSlots(State.selectedService, State.selectedDate);

        if (!response.success || !response.slots) {
            throw new Error('Некорректный ответ от сервера');
        }

        State.availableSlots = response.slots.array || [];

        if (State.availableSlots.length === 0) {
            slotsContainer.innerHTML = '<div class="empty-state">Нет доступных слотов</div>';
            return;
        }

        renderTimeSlots();

    } catch (error) {
        console.error('❌ Ошибка загрузки слотов:', error);
        
        if (error.isCancelled) {
            return;
        }

        slotsContainer.innerHTML = '<div class="error">Не удалось загрузить слоты</div>';
    }
}

/**
 * Рендеринг слотов времени
 */
function renderTimeSlots() {
    const slotsContainer = document.getElementById('time-slots');
    if (!slotsContainer) return;

    slotsContainer.innerHTML = '';

    State.availableSlots.forEach(slot => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'time-slot';
        slotDiv.textContent = slot['2']; // Время в индексе 2
        
        if (State.selectedSlot === slot['0']) {
            slotDiv.classList.add('selected');
        }

        slotDiv.addEventListener('click', () => selectSlot(slot));
        slotsContainer.appendChild(slotDiv);
    });
}

/**
 * Выбор слота
 */
function selectSlot(slot) {
    State.selectedSlot = slot['0']; // ID слота
    renderTimeSlots();

    // Показываем кнопку подтверждения
    showBookButton();
}

// Флаг для отслеживания подписки на MainButton
let mainButtonHandlerAttached = false;

/**
 * Показать кнопку бронирования
 */
function showBookButton() {
    const service = CONFIG.SERVICES.find(s => s.id === State.selectedService);
    const buttonText = service?.price > 0
        ? `Забронировать за ${service.price} ₸`
        : 'Забронировать бесплатно';

    window.Telegram.WebApp.MainButton.setText(buttonText);
    window.Telegram.WebApp.MainButton.show();

    // Удаляем предыдущий обработчик перед добавлением нового
    if (mainButtonHandlerAttached) {
        window.Telegram.WebApp.MainButton.offClick(handleBooking);
    }
    window.Telegram.WebApp.MainButton.onClick(handleBooking);
    mainButtonHandlerAttached = true;
}

/**
 * Обработка бронирования
 */
async function handleBooking() {
    if (!State.selectedService || !State.selectedDate || !State.selectedSlot) {
        window.Telegram.WebApp.showAlert('Пожалуйста, выберите услугу, дату и время');
        return;
    }

    try {
        window.Telegram.WebApp.MainButton.showProgress();

        const slot = State.availableSlots.find(s => s['0'] === State.selectedSlot);
        const time = slot['2'];

        const response = await API.bookSlot(
            State.selectedSlot,
            State.selectedService,
            State.selectedDate,
            time
        );

        window.Telegram.WebApp.MainButton.hideProgress();

        if (response.success) {
            window.Telegram.WebApp.showAlert('Бронирование успешно!', () => {
                // Очищаем кэш и переключаемся на "Мои записи"
                API.clearCache();
                switchTab('my-bookings');
            });
        } else {
            throw new Error(response.error || 'Ошибка бронирования');
        }

    } catch (error) {
        window.Telegram.WebApp.MainButton.hideProgress();
        
        if (error.isCancelled) {
            return;
        }

        window.Telegram.WebApp.showAlert('Не удалось забронировать слот');
        console.error('❌ Ошибка бронирования:', error);
    }
}

/**
 * Загрузка бронирований пользователя
 */
async function loadUserBookings() {
    const bookingsContainer = document.getElementById('bookings-list');
    if (!bookingsContainer) return;

    try {
        bookingsContainer.innerHTML = '<div class="loading">Загрузка записей...</div>';

        const response = await API.getUserBookings();

        console.log('📥 Бронирования пользователя:', response);

        if (!response.success) {
            throw new Error('Некорректный ответ от сервера');
        }

        // Обрабатываем массив бронирований
        const bookingsArray = response.bookings?.array || [];
        
        State.userBookings = bookingsArray.map(booking => ({
            id: booking['0'],
            date: booking['1'],
            time: booking['2'],
            service: booking['5'],
            zoom_link: booking['12']
        }));

        console.log('✅ Обработанные бронирования:', State.userBookings);

        if (State.userBookings.length === 0) {
            bookingsContainer.innerHTML = '<div class="empty-state">У вас пока нет записей</div>';
            return;
        }

        renderBookings();

    } catch (error) {
        console.error('❌ Ошибка загрузки бронирований:', error);

        if (error.isCancelled) {
            console.log('⚠️ Запрос загрузки бронирований был отменён');
            return;
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = 'Не удалось загрузить записи. Попробуйте обновить страницу.';
        bookingsContainer.innerHTML = '';
        bookingsContainer.appendChild(errorDiv);

        window.Telegram.WebApp.showAlert('Не удалось загрузить ваши записи. Проверьте подключение к интернету и попробуйте снова.');
    }
}

/**
 * Рендеринг списка бронирований
 */
function renderBookings() {
    const bookingsContainer = document.getElementById('bookings-list');
    if (!bookingsContainer) return;

    bookingsContainer.innerHTML = '';

    State.userBookings.forEach(booking => {
        const service = CONFIG.SERVICES.find(s => s.id === booking.service);
        
        const bookingDiv = document.createElement('div');
        bookingDiv.className = 'booking-card';
        bookingDiv.innerHTML = `
            <div class="booking-header">
                <span class="booking-service">${service?.name || booking.service}</span>
                <span class="booking-date">${booking.date}</span>
            </div>
            <div class="booking-time">${booking.time}</div>
            ${booking.zoom_link ? `
                <button class="btn-zoom" onclick="window.open('${booking.zoom_link}', '_blank')">
                    📹 Открыть Zoom
                </button>
            ` : ''}
            <button class="btn-cancel" data-booking-id="${booking.id}">
                Отменить запись
            </button>
        `;

        bookingsContainer.appendChild(bookingDiv);
    });

    // Добавляем обработчики для кнопок отмены
    document.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => handleCancelBooking(btn.dataset.bookingId));
    });
}

/**
 * Отмена бронирования
 */
async function handleCancelBooking(bookingId) {
    const confirmed = await new Promise(resolve => {
        window.Telegram.WebApp.showConfirm(
            'Вы уверены, что хотите отменить запись?',
            resolve
        );
    });

    if (!confirmed) return;

    try {
        const response = await API.cancelBooking(bookingId);

        if (response.success) {
            window.Telegram.WebApp.showAlert('Запись отменена', () => {
                loadUserBookings();
            });
        } else {
            throw new Error(response.error || 'Ошибка отмены');
        }

    } catch (error) {
        if (error.isCancelled) {
            return;
        }

        window.Telegram.WebApp.showAlert('Не удалось отменить запись');
        console.error('❌ Ошибка отмены:', error);
    }
}

/**
 * Форматирование даты для API (DD.MM.YYYY)
 */
function formatDateForAPI(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Инициализация приложения
 */
export function initApp() {
    console.log('✅ Приложение инициализировано');

    // Обработчики вкладок
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });

    // Рендерим услуги
    renderServices();

    // Загружаем начальные данные для активной вкладки
    loadTabData(State.currentTab, null);
}

/**
 * Рендеринг списка услуг
 */
function renderServices() {
    const servicesContainer = document.getElementById('services-list');
    if (!servicesContainer) return;

    servicesContainer.innerHTML = '';

    CONFIG.SERVICES.forEach(service => {
        const serviceDiv = document.createElement('div');
        serviceDiv.className = 'service-card';
        
        if (service.type === 'info_button') {
            serviceDiv.classList.add('info-card');
        }

        serviceDiv.innerHTML = `
            <div class="service-name">${service.name}</div>
            <div class="service-description">${service.description}</div>
            ${service.price !== null ? `
                <div class="service-footer">
                    <span class="service-price">${service.price > 0 ? service.price + ' ₸' : 'Бесплатно'}</span>
                    <span class="service-duration">${service.duration}</span>
                </div>
            ` : ''}
        `;

        serviceDiv.addEventListener('click', () => selectService(service.id));
        servicesContainer.appendChild(serviceDiv);
    });
}
