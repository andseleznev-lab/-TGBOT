// ===== СТАТИЧНЫЕ ДАННЫЕ =====
const STATIC_SERVICES = [
    {
        id: "diagnosis",
        name: "Диагностика",
        description: "Бесплатная диагностическая консультация",
        price: 0,
        duration: "30 минут",
        days: ["Среда", "Пятница"]
    },
    {
        id: "club_info",
        name: "Вступить в клуб",
        description: "Информация о клубе",
        price: null,
        duration: null,
        days: null,
        type: "info_button"
    },
    {
        id: "package",
        name: "Пакет консультаций",
        description: "10 сессий",
        price: 75000,
        duration: "10 сессий по 1 часу",
        days: ["Вторник", "Четверг"]
    },
    {
        id: "family",
        name: "Семейная консультация",
        description: "Консультация для пары или семьи",
        price: 10000,
        duration: "2 часа",
        days: ["Вторник", "Четверг"]
    },
    {
        id: "single",
        name: "Индивидуальная консультация",
        description: "Персональная консультация",
        price: 8000,
        duration: "1 час",
        days: ["Вторник", "Четверг"]
    }
];

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
    userBookings: [],
    currentRequest: null,  // Для отмены запросов
    bookingsLoadTimeout: null,  // Для debounce загрузки записей
    isAppActive: true,  // 🔧 ИСПРАВЛЕНИЕ 1: Флаг активности приложения
    isPopupOpen: false  // 🔧 FIX: Флаг открытого popup (предотвращает "Popup is already opened")
};

// 🔧 ИСПРАВЛЕНИЕ 2: Обработка visibility change для корректной работы при выходе/входе
document.addEventListener('visibilitychange', () => {
    State.isAppActive = !document.hidden;
    
    if (State.isAppActive) {
        console.log('✅ Приложение стало активным');
        // При возвращении в приложение - рефреш текущего таба
        if (State.currentTab === 'mybookings') {
            switchTab('mybookings');
        }
    } else {
        console.log('⏸️ Приложение ушло в фон - отменяем активные запросы');
        // Отменяем все активные запросы при уходе в фон
        if (State.currentRequest) {
            State.currentRequest.abort();
            State.currentRequest = null;
        }
    }
});

// ===== API ФУНКЦИИ =====
class BookingAPI {
    /**
     * Универсальный метод для всех API запросов к Make.com
     * Теперь использует fetchWithErrorHandling для централизованной обработки ошибок
     * @param {string} action - действие (get_available_dates, book_slot, etc.)
     * @param {Object} data - дополнительные данные для запроса
     * @returns {Promise<Object>} результат от Make.com
     */
    static async request(action, data = {}) {
        const startTime = Date.now();

        // Проверка активности приложения
        if (!State.isAppActive) {
            console.log(`⏸️ [${action}] Приложение неактивно - запрос отменён`);
            const inactiveError = new Error('App is inactive');
            inactiveError.name = 'AbortError'; // Маркируем как AbortError чтобы не показывать popup
            throw inactiveError;
        }

        // Определяем retryable на основе типа операции
        // GET операции (чтение) - можно retry автоматически
        // POST операции (создание/изменение) - только manual retry
        const readOnlyActions = ['get_services', 'get_available_dates', 'get_slots', 'get_user_bookings'];
        const retryable = readOnlyActions.includes(action);

        try {
            // Используем fetchWithErrorHandling для обработки ошибок
            const response = await fetchWithErrorHandling(
                CONFIG.API.main,
                {
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
                },
                {
                    context: action, // Контекст для логов
                    retryable: retryable, // Auto-retry только для GET
                    timeout: CONFIG.API.timeout || 10000,
                    showError: true // Показываем popup при ошибках
                }
            );

            // Парсим ответ
            console.log(`📄 [${action}] Чтение текста...`);
            const text = await response.text();
            console.log(`🔍 [${action}] RAW response:`, text.substring(0, 200) + '...');

            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                console.error(`❌ [${action}] JSON parse error:`, e);
                console.error('Текст который не парсится:', text);
                throw new Error('Invalid JSON from server');
            }

            // Проверяем success флаг от Make.com
            if (!result.success) {
                throw new Error(result.error || 'Неизвестная ошибка от сервера');
            }

            const duration = Date.now() - startTime;
            console.log(`✅ [${action}] Успешно за ${duration}ms`);

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ [${action}] Request failed после ${duration}ms`);

            // Ошибка уже обработана в fetchWithErrorHandling
            // Просто пробрасываем дальше
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

// ===== ОБРАБОТКА СЕТЕВЫХ ОШИБОК =====

/**
 * Определяет тип ошибки для правильного сообщения пользователю
 * @param {Error} error - объект ошибки
 * @param {Response|null} response - объект response (если есть)
 * @returns {{type: string, message: string}} Тип и сообщение ошибки
 */
function getErrorType(error, response = null) {
    // Запрос отменён (переключение табов, выход из приложения)
    if (error.name === 'AbortError') {
        return { type: 'ABORT', message: 'Request cancelled' };
    }

    // Таймаут запроса (>10 секунд)
    if (error.name === 'TimeoutError' || error.message === 'Request timeout') {
        return { type: 'TIMEOUT', message: 'Сервер не отвечает. Попробуйте позже' };
    }

    // Проблемы с сетью (нет интернета, DNS failed, etc)
    if (error.message === 'Load failed' ||
        error.message === 'Failed to fetch' ||
        error.message === 'Network request failed') {
        return { type: 'NETWORK', message: 'Проверьте интернет-соединение' };
    }

    // Ошибка сервера (5xx)
    if (response && response.status >= 500) {
        return { type: 'SERVER', message: 'Сервер временно недоступен. Попробуйте позже' };
    }

    // Ошибка клиента (4xx)
    if (response && response.status >= 400) {
        return { type: 'CLIENT', message: 'Некорректный запрос' };
    }

    // Неизвестная ошибка
    return { type: 'UNKNOWN', message: 'Произошла ошибка. Попробуйте позже' };
}

/**
 * Показывает popup с ошибкой и кнопкой "Повторить"
 * @param {string} message - текст ошибки для пользователя
 * @param {Function|null} retryFn - функция для повторного запроса (если null - только кнопка "Отмена")
 * @returns {void}
 */
function showErrorPopup(message, retryFn = null) {
    // 🔧 FIX: Проверяем не открыт ли уже popup
    if (State.isPopupOpen) {
        console.warn('⚠️ Popup уже открыт - пропускаем показ нового popup');
        return;
    }

    const buttons = [];

    // Добавляем кнопку "Повторить" если передана функция retry
    if (retryFn) {
        buttons.push({ id: 'retry', type: 'default', text: 'Повторить' });
    }

    // Всегда добавляем кнопку "Отмена"
    buttons.push({ type: 'cancel' });

    // 🔧 FIX: Устанавливаем флаг что popup открыт
    State.isPopupOpen = true;

    try {
        // Показываем Telegram popup
        tg.showPopup({
            title: 'Ошибка',
            message: message,
            buttons: buttons
        }, (buttonId) => {
            // 🔧 FIX: Сбрасываем флаг при закрытии popup
            State.isPopupOpen = false;

            // Обработчик нажатия на кнопку
            if (buttonId === 'retry' && retryFn) {
                retryFn();
            }
        });
    } catch (error) {
        // 🔧 FIX: Если не удалось показать popup - сбрасываем флаг
        console.error('❌ Ошибка показа popup:', error);
        State.isPopupOpen = false;
    }
}

/**
 * Показывает индикатор повторной попытки запроса
 * @param {string} message - текст сообщения (например, "Повторная попытка...")
 * @returns {void}
 */
function showRetryIndicator(message) {
    // Безопасное создание элементов через DOM API (не innerHTML!)
    const overlay = document.createElement('div');
    overlay.id = 'retry-indicator';
    overlay.className = 'retry-overlay';

    const content = document.createElement('div');
    content.className = 'retry-content glass-card';

    const loader = document.createElement('div');
    loader.className = 'loader';

    const text = document.createElement('p');
    text.textContent = message; // Безопасно - используем textContent вместо innerHTML

    content.appendChild(loader);
    content.appendChild(text);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
}

/**
 * Скрывает индикатор повторной попытки
 * @returns {void}
 */
function hideRetryIndicator() {
    const overlay = document.getElementById('retry-indicator');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Выполняет повторный запрос с задержкой
 * @param {Function} requestFn - функция запроса для повтора
 * @param {number} delay - задержка перед retry в мс (default: 2000)
 * @returns {Promise<any>} результат выполнения requestFn
 */
async function retryRequest(requestFn, delay = 2000) {
    console.log(`🔄 Retry after ${delay}ms...`);

    // Показать индикатор retry
    showRetryIndicator('Повторная попытка...');

    // Ждём заданную задержку
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        // Выполняем запрос
        const result = await requestFn();
        hideRetryIndicator();
        return result;
    } catch (error) {
        // Скрываем индикатор даже при ошибке
        hideRetryIndicator();
        throw error;
    }
}

/**
 * Обработка сетевой ошибки - логирование, определение типа, показ popup, retry
 * @param {Error} error - объект ошибки
 * @param {string} context - контекст запроса (для логов, например "get_available_dates")
 * @param {Function|null} retryFn - функция для повторного запроса
 * @param {Object} config - конфигурация обработки ошибок
 * @param {boolean} config.retryable - можно ли делать auto-retry (true для GET запросов)
 * @param {boolean} config.showError - показывать ли popup ошибки
 * @param {boolean} config.hasRetried - флаг что retry уже был сделан
 * @returns {Promise<void>}
 */
async function handleNetworkError(error, context, retryFn = null, config = {}) {
    const {
        retryable = false,
        showError = true,
        hasRetried = false
    } = config;

    // 1. Определяем тип ошибки
    const errorInfo = getErrorType(error, null);

    // 2. Логируем детали (без чувствительных данных)
    console.error(`[${context}] ${errorInfo.type} error: ${error.message}`, {
        type: errorInfo.type,
        errorName: error.name,
        stack: error.stack
    });

    // 3. Haptic feedback при ошибке
    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
    }

    // 4. Игнорируем AbortError (запрос отменён пользователем или системой)
    if (errorInfo.type === 'ABORT') {
        console.log(`[${context}] Request cancelled - не показываем ошибку`);
        return;
    }

    // 5. Автоматический retry для retryable запросов (только 1 раз!)
    if (retryable && !hasRetried && retryFn) {
        console.log(`[${context}] Автоматический retry (1/1)...`);

        try {
            // Используем retryRequest для показа индикатора
            const result = await retryRequest(retryFn, 2000);

            // Если retry успешен - показываем success feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }

            return result;
        } catch (retryError) {
            // Retry failed - показываем popup с manual retry
            console.error(`[${context}] Автоматический retry failed`);

            // Помечаем что retry был сделан и показываем popup
            if (showError) {
                showErrorPopup(errorInfo.message, retryFn);
            }

            throw retryError;
        }
    }

    // 6. Показываем popup с ошибкой и кнопкой "Повторить" (если showError: true)
    if (showError) {
        showErrorPopup(errorInfo.message, retryFn);
    }

    // Пробрасываем ошибку дальше
    throw error;
}

/**
 * Универсальная обёртка для fetch с обработкой ошибок, timeout и retry
 * @param {string} url - URL для запроса
 * @param {Object} options - опции для fetch (method, headers, body, etc.)
 * @param {Object} config - конфигурация обработки ошибок
 * @param {number} config.timeout - таймаут в мс (default: 10000 из CONFIG.API.timeout)
 * @param {boolean} config.retryable - можно ли делать auto-retry (default: true для GET)
 * @param {string} config.context - контекст для логирования (например, "get_available_dates")
 * @param {boolean} config.showError - показывать ли popup ошибки (default: true)
 * @returns {Promise<Response>} Response объект или throws Error
 */
async function fetchWithErrorHandling(url, options = {}, config = {}) {
    const {
        timeout = CONFIG.API.timeout || 10000,
        retryable = (options.method || 'GET').toUpperCase() === 'GET', // GET по умолчанию retryable
        context = 'api_request',
        showError = true
    } = config;

    // 🔧 FIX: Отменяем предыдущий запрос если есть
    if (State.currentRequest && !config.hasRetried) {
        console.log(`🛑 [${context}] Отменяем предыдущий запрос`);
        State.currentRequest.abort();
        State.currentRequest = null;
    }

    // Создаём AbortController для этого запроса
    const controller = new AbortController();
    const signal = controller.signal;

    // 🔧 FIX: Сохраняем в State для возможности отмены при переключении табов
    State.currentRequest = controller;

    // Устанавливаем timeout
    const timeoutId = setTimeout(() => {
        console.log(`⏱️ [${context}] Timeout после ${timeout}ms - отменяем запрос`);
        controller.abort();
    }, timeout);

    // Функция для retry (будет передана в handleNetworkError)
    const retryFn = () => fetchWithErrorHandling(url, options, {
        ...config,
        hasRetried: true // Помечаем что retry уже был
    });

    try {
        console.log(`📤 [${context}] Начало запроса к ${url}`);

        // Выполняем fetch с signal для возможности отмены
        const response = await fetch(url, {
            ...options,
            signal: signal
        });

        // Очищаем timeout после успешного ответа
        clearTimeout(timeoutId);

        // 🔧 FIX: Очищаем State.currentRequest после успешного ответа
        if (State.currentRequest === controller) {
            State.currentRequest = null;
        }

        console.log(`📥 [${context}] Ответ получен: ${response.status}`);

        // Если ответ успешный - возвращаем response
        if (response.ok) {
            return response;
        }

        // Если ответ не успешный (4xx, 5xx) - обрабатываем как ошибку
        const errorInfo = getErrorType(null, response);
        const httpError = new Error(errorInfo.message);
        httpError.name = 'HTTPError';
        httpError.status = response.status;

        // Передаём в handleNetworkError
        await handleNetworkError(httpError, context, retryFn, {
            retryable,
            showError,
            hasRetried: config.hasRetried || false
        });

        // Если handleNetworkError не выбросил ошибку (не должно произойти), выбрасываем сами
        throw httpError;

    } catch (error) {
        // Очищаем timeout в любом случае
        clearTimeout(timeoutId);

        // 🔧 FIX: Очищаем State.currentRequest при ошибке
        if (State.currentRequest === controller) {
            State.currentRequest = null;
        }

        // Если это AbortError из-за timeout, создаём TimeoutError
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Request timeout');
            timeoutError.name = 'TimeoutError';

            await handleNetworkError(timeoutError, context, retryFn, {
                retryable,
                showError,
                hasRetried: config.hasRetried || false
            });

            throw timeoutError;
        }

        // Для всех остальных ошибок (Network, etc) - передаём в handleNetworkError
        await handleNetworkError(error, context, retryFn, {
            retryable,
            showError,
            hasRetried: config.hasRetried || false
        });

        // handleNetworkError уже выбросил ошибку, но на всякий случай:
        throw error;
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
                            <div class="service-duration">${service.duration}</div>
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
                <div class="payment-icon">💰</div>
                <div class="payment-info">
                    <div class="payment-name">Другие способы</div>
                    <div class="payment-description">Альтернативные методы</div>
                </div>
                <div class="payment-arrow">→</div>
            </div>
        </div>
    `;
    
    document.getElementById('app').innerHTML = html;
}

// Экран бронирования
function renderBookingScreen() {
    const services = State.services.filter(s => !s.type || s.type !== 'info_button');
    
    const html = `
        <h1 class="screen-title fade-in">Запись на консультацию</h1>
        
        <div class="booking-container fade-in">
            <div class="service-selector glass-card">
                <select class="service-select" onchange="onServiceSelect(this.value)">
                    <option value="">Выберите услугу</option>
                    ${services.map(s => `
                        <option value="${escapeHtml(s.name)}" ${State.selectedService === s.name ? 'selected' : ''}>
                            ${escapeHtml(s.name)}
                        </option>
                    `).join('')}
                </select>
            </div>
            
            ${State.selectedService ? `
                <div class="calendar-container glass-card">
                    <div class="calendar-header">
                        <div class="calendar-month">${getMonthName(State.currentMonth)}</div>
                        <div class="calendar-nav">
                            <button class="calendar-nav-btn" onclick="previousMonth()">‹</button>
                            <button class="calendar-nav-btn" onclick="nextMonth()">›</button>
                        </div>
                    </div>
                    <div class="weekdays">
                        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => 
                            `<div class="weekday">${d}</div>`
                        ).join('')}
                    </div>
                    <div class="calendar-grid">
                        ${renderCalendarDays()}
                    </div>
                </div>
            ` : ''}
            
            ${State.selectedDate ? `
                <div class="slots-container glass-card">
                    <div class="slots-date">Доступное время на ${State.selectedDate}</div>
                    ${State.availableSlots.length > 0 ? `
                        <div class="slots-grid">
                            ${State.availableSlots.map(slot => `
                                <button 
                                    class="slot-btn ${State.selectedSlot === slot.time ? 'selected' : ''}"
                                    onclick="selectSlot('${slot.time}')">
                                    ${slot.time}
                                </button>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="slots-empty">
                            На эту дату нет доступных слотов
                        </div>
                    `}
                </div>
            ` : ''}
            
            ${State.selectedSlot ? `
                <button class="confirm-button glass-card" onclick="confirmBooking()">
                    Подтвердить запись
                </button>
            ` : ''}
        </div>
    `;
    
    document.getElementById('app').innerHTML = html;
}

// Экран "Мои записи"
function renderMyBookingsScreen() {
    const bookings = State.userBookings;
    
    const html = `
        <h1 class="screen-title fade-in">Мои записи</h1>
        ${bookings.length > 0 ? `
            <div class="services-grid fade-in">
                ${bookings.map(booking => `
                    <div class="service-card glass-card">
                        <div class="service-header">
                            <div class="service-icon">📅</div>
                            <div class="service-info">
                                <div class="service-name">${escapeHtml(booking.service)}</div>
                                <div class="service-duration">${booking.date} в ${booking.time}</div>
                            </div>
                        </div>
                        ${booking.zoom_link ? `
                            <div class="service-description">
                                <a href="${booking.zoom_link}" class="zoom-link" target="_blank">
                                    Ссылка на Zoom
                                </a>
                            </div>
                        ` : ''}
                        <div class="service-footer">
                            <button class="service-btn" onclick="cancelBooking('${booking.id}')">
                                Отменить запись
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : `
            <div class="loader-container">
                <p>У вас пока нет записей</p>
            </div>
        `}
    `;
    
    document.getElementById('app').innerHTML = html;
}

// ===== КАЛЕНДАРЬ =====

function renderCalendarDays() {
    const year = State.currentMonth.getFullYear();
    const month = State.currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const availableDatesSet = new Set(State.availableDates.map(d => d.date));
    
    let html = '';
    
    for (let i = 0; i < startDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateDMY(date);
        
        const isPast = date < today;
        const isAvailable = availableDatesSet.has(dateStr);
        const isSelected = State.selectedDate === dateStr;
        
        let classes = 'calendar-day';
        if (isPast) classes += ' past';
        else if (isAvailable) classes += ' available';
        else classes += ' disabled';
        if (isSelected) classes += ' selected';
        
        const onclick = (!isPast && isAvailable) ? `onclick="selectDate('${dateStr}')"` : '';
        
        html += `
            <div class="${classes}" ${onclick}>
                <span class="day-number">${day}</span>
                ${isAvailable && !isSelected ? '<span class="slots-indicator"></span>' : ''}
            </div>
        `;
    }
    
    return html;
}

function formatDateDMY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function getMonthName(date) {
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function previousMonth() {
    State.currentMonth = new Date(State.currentMonth.getFullYear(), State.currentMonth.getMonth() - 1, 1);
    renderBookingScreen();
}

function nextMonth() {
    State.currentMonth = new Date(State.currentMonth.getFullYear(), State.currentMonth.getMonth() + 1, 1);
    renderBookingScreen();
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

function selectService(serviceName) {
    // Проверяем, это ли информационная кнопка
    const service = State.services.find(s => s.name === serviceName);
    if (service && service.type === 'info_button') {
        tg.showAlert('Информация о клубе появится позже');
        return;
    }
    
    // Переключаемся на экран бронирования
    switchTab('booking');
    
    // Устанавливаем выбранную услугу
    setTimeout(() => {
        onServiceSelect(serviceName);
    }, 100);
}

async function onServiceSelect(serviceName) {
    if (!serviceName) return;

    // 🔧 ИСПРАВЛЕНИЕ 6: Очищаем предыдущее состояние
    State.selectedService = serviceName;
    State.selectedDate = null;
    State.selectedSlot = null;
    State.availableSlots = [];
    State.currentMonth = new Date();

    renderBookingScreen();

    // Загружаем доступные даты
    try {
        showLoader();
        await loadAvailableDates(serviceName);
        hideLoader();
        renderBookingScreen();
    } catch (error) {
        hideLoader();
        renderBookingScreen(); // 🔧 FIX: Перерисовываем экран даже при ошибке

        // 🔧 ИСПРАВЛЕНИЕ 7: Не показываем ошибку при отмене
        if (!error.isCancelled) {
            console.error('Ошибка загрузки дат:', error);
            tg.showAlert('Не удалось загрузить доступные даты');
        }
    }
}

async function selectDate(dateStr) {
    State.selectedDate = dateStr;
    State.selectedSlot = null;
    State.availableSlots = [];

    renderBookingScreen();

    try {
        showLoader();
        await loadAvailableSlots(State.selectedService, dateStr);
        hideLoader();
        renderBookingScreen();

        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    } catch (error) {
        hideLoader();
        renderBookingScreen(); // 🔧 FIX: Перерисовываем экран даже при ошибке

        // 🔧 ИСПРАВЛЕНИЕ 8: Не показываем ошибку при отмене
        if (!error.isCancelled) {
            console.error('Ошибка загрузки слотов:', error);
            tg.showAlert('Не удалось загрузить доступные слоты');
        }
    }
}

function selectSlot(time) {
    State.selectedSlot = time;
    renderBookingScreen();
    
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

async function confirmBooking() {
    if (!State.selectedService || !State.selectedDate || !State.selectedSlot) {
        tg.showAlert('Пожалуйста, выберите услугу, дату и время');
        return;
    }
    
    const confirmed = confirm(
        `Подтвердить запись?\n\n` +
        `Услуга: ${State.selectedService}\n` +
        `Дата: ${State.selectedDate}\n` +
        `Время: ${State.selectedSlot}`
    );
    
    if (!confirmed) return;
    
    try {
        showLoader();
        const result = await BookingAPI.bookSlot(
            State.selectedService,
            State.selectedDate,
            State.selectedSlot
        );
        hideLoader();
        
        if (result.success) {
            tg.showAlert('Запись успешно создана!');
            
            // 🔧 ИСПРАВЛЕНИЕ 9: Очищаем состояние после успешной записи
            State.selectedService = null;
            State.selectedDate = null;
            State.selectedSlot = null;
            State.availableDates = [];
            State.availableSlots = [];
            
            switchTab('mybookings');
        }
    } catch (error) {
        hideLoader();
        console.error('Ошибка бронирования:', error);
        tg.showAlert('Не удалось создать запись. Попробуйте позже.');
    }
}

function openPayment(method) {
    const url = CONFIG.PAYMENT_URLS[method];
    if (url && !url.includes('your-payment-link')) {
        tg.openLink(url);
    } else {
        tg.showAlert('Ссылка на оплату будет добавлена позже');
    }
}

// ===== ЗАГРУЗКА ДАННЫХ =====

async function loadServices() {
    // Используем статичные данные из CONFIG вместо запроса к Make
    State.services = CONFIG.SERVICES;
    console.log('✅ Загружены статичные услуги:', State.services);
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

        console.log('✅ Обработанные даты (State.availableDates):', State.availableDates);
        console.log('🎯 Set для календаря:', Array.from(new Set(State.availableDates.map(d => d.date))));

    } catch (error) {
        // 🔧 FIX: Улучшенное логирование
        console.error('❌ Ошибка загрузки дат:', {
            name: error?.name,
            message: error?.message,
            isCancelled: error?.isCancelled
        });
        State.availableDates = [];
        // 🔧 ИСПРАВЛЕНИЕ 10: Пробрасываем ошибку дальше для обработки
        throw error;
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
        // 🔧 ИСПРАВЛЕНИЕ 11: Пробрасываем ошибку дальше
        throw error;
    }
}

// ===== УПРАВЛЕНИЕ БРОНИРОВАНИЯМИ =====

async function loadUserBookings() {
    // 🔧 ИСПРАВЛЕНИЕ 12: Проверяем активность приложения
    if (!State.isAppActive) {
        console.log('⏸️ Приложение неактивно - отмена загрузки записей');
        return;
    }
    
    showLoader();
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
            })).filter(b => b.id && b.date && b.time);  // Фильтруем пустые
        } else {
            State.userBookings = [];
        }
        
        console.log('✅ Обработанные бронирования:', State.userBookings);
        hideLoader();
    } catch (error) {
        console.error('❌ Ошибка загрузки бронирований:', error);
        State.userBookings = [];
        hideLoader();
        
        // 🔧 ИСПРАВЛЕНИЕ 13: Не показываем alert если запрос отменён или приложение неактивно
        if (!error.isCancelled && error.message !== 'App is inactive') {
            tg.showAlert('Не удалось загрузить записи');
        }
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
            tg.showAlert('Запись отменена');
            await loadUserBookings();
            renderMyBookingsScreen();
        }
    } catch (error) {
        hideLoader();
        console.error('❌ Ошибка отмены:', error);
        tg.showAlert('Не удалось отменить запись');
    }
}

// ===== НАВИГАЦИЯ МЕЖДУ ТАБАМИ =====

function switchTab(tabName) {
    // 🔧 ИСПРАВЛЕНИЕ 14: Отменяем предыдущие запросы при переключении таба
    if (State.currentRequest) {
        State.currentRequest.abort();
        State.currentRequest = null;
    }
    
    // 🔧 ИСПРАВЛЕНИЕ 15: Очищаем таймауты
    if (State.bookingsLoadTimeout) {
        clearTimeout(State.bookingsLoadTimeout);
        State.bookingsLoadTimeout = null;
    }
    
    State.currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // 🔧 ИСПРАВЛЕНИЕ 16: Очищаем состояние при переключении с booking
    if (tabName !== 'booking') {
        State.selectedService = null;
        State.selectedDate = null;
        State.selectedSlot = null;
        State.availableDates = [];
        State.availableSlots = [];
    }
    
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
            // Показываем loader сразу
            document.getElementById('app').innerHTML = `
                <h1 class="screen-title fade-in">Мои записи</h1>
                <div class="loader-container">
                    <div class="glass-loader"></div>
                    <p>Загрузка...</p>
                </div>
            `;

            // 🔧 ИСПРАВЛЕНИЕ 17: Увеличили debounce до 500ms для стабильности
            State.bookingsLoadTimeout = setTimeout(() => {
                loadUserBookings()
                    .then(() => {
                        // Проверяем что мы всё ещё на том же табе
                        if (State.currentTab === 'mybookings') {
                            renderMyBookingsScreen();
                        }
                    })
                    .catch((error) => {
                        // 🔧 FIX: Рендерим экран даже при ошибке
                        if (State.currentTab === 'mybookings') {
                            renderMyBookingsScreen();
                        }
                    });
            }, 500);
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
    console.log('🚀 Mini App initialized for user:', USER.fullName);
    console.log('📱 Telegram Web App version:', tg.version);
    
    // Настройка обработчиков табов
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 🔧 ИСПРАВЛЕНИЕ 18: Предотвращаем множественные клики
            if (btn.disabled) return;
            btn.disabled = true;
            
            switchTab(btn.dataset.tab);
            
            // Разблокируем кнопку через 300ms
            setTimeout(() => {
                btn.disabled = false;
            }, 300);
        });
    });
    
    await loadServices();
    renderServicesScreen();
    
    console.log('✅ Приложение инициализировано');
}

// 🔧 ИСПРАВЛЕНИЕ 19: Добавляем глобальный обработчик ошибок
window.addEventListener('error', (event) => {
    console.error('🚨 Глобальная ошибка:', event.error);
    // Не показываем alert для отменённых запросов
    if (event.error && !event.error.isCancelled) {
        // Можно добавить отправку логов на сервер
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Необработанный Promise rejection:', event.reason);
    // Не показываем alert для отменённых запросов
    if (event.reason && !event.reason.isCancelled) {
        // Можно добавить отправку логов на сервер
    }
});

// Запуск при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
