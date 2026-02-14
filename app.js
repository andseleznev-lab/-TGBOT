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

// ===== HELPER FUNCTIONS =====

/**
 * Получает объект услуги по её ID
 * @param {string} serviceId - ID услуги (diagnosis, package, family, single)
 * @returns {Object|null} - Объект услуги или null если не найдена
 */
function getServiceById(serviceId) {
    return STATIC_SERVICES.find(s => s.id === serviceId) || null;
}

// ===== [T-003] YOOKASSA PAYMENT FUNCTIONS =====

/**
 * [T-003] Вычисляет оставшееся время до истечения блокировки слота
 * @param {string} lockedUntil - ISO timestamp когда истекает блокировка (например, "2026-02-08T15:30:00Z")
 * @returns {Object} - { hours: number, minutes: number, isExpired: boolean }
 *
 * @example
 * const remaining = calculateTimeRemaining('2026-02-08T15:30:00Z');
 * console.log(`Осталось ${remaining.hours}ч ${remaining.minutes}м`);
 */
function calculateTimeRemaining(lockedUntil) {
    try {
        const now = Date.now();
        const lockExpiry = new Date(lockedUntil).getTime();
        const diff = lockExpiry - now;

        if (diff <= 0) {
            return { hours: 0, minutes: 0, isExpired: true };
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return { hours, minutes, isExpired: false };
    } catch (error) {
        console.error('❌ [calculateTimeRemaining] Ошибка парсинга даты:', error);
        return { hours: 0, minutes: 0, isExpired: true };
    }
}

/**
 * [T-003] Рендерит locking слот с таймером и кнопкой оплаты (если свой слот)
 * @param {Object} slot - Объект слота с полями { id, time, date, status, user_id, locked_until }
 * @returns {string} - HTML строка для вставки в slots-grid
 *
 * @example
 * const lockingSlotHTML = renderLockingSlot({
 *   id: 'slot_123', time: '14:00', status: 'locking',
 *   user_id: 123456, locked_until: '2026-02-08T15:00:00Z'
 * });
 */
function renderLockingSlot(slot) {
    const isOwnSlot = slot.user_id === USER.id;
    const remaining = calculateTimeRemaining(slot.locked_until);
    const timerText = remaining.isExpired
        ? 'Истёк'
        : `${remaining.hours}ч ${remaining.minutes}м`;

    // Класс: slot--locking для чужих, slot--own для своих
    const slotClass = isOwnSlot ? 'slot--own' : 'slot--locking';

    return `
        <div class="slot-btn ${slotClass}">
            <div>${slot.time}</div>
            <div class="payment-timer">${timerText}</div>
            ${isOwnSlot && !remaining.isExpired ? `
                <button class="payment-btn" onclick="event.stopPropagation(); handlePaymentFromBooking('${slot.id}', '${State.selectedService}', '${slot.date || State.selectedDate}', '${slot.time}')">
                    Оплатить
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * [T-003] Создаёт платёж через Make.com и возвращает payment_url
 * @param {string} slotId - ID слота для бронирования
 * @param {string} serviceId - ID услуги (diagnosis, package, family, single)
 * @returns {Promise<string>} - URL страницы оплаты YooKassa
 * @throws {Error} - Если создание платежа не удалось
 *
 * @example
 * const paymentUrl = await createPayment('slot_123', 'single');
 * openPaymentWindow(paymentUrl);
 */
async function createPayment(slotId, serviceId) {
    try {
        console.log(`💳 [createPayment] Создание платежа для слота ${slotId}, услуга ${serviceId}`);

        // Проверяем цену услуги
        const price = CONFIG.SERVICE_PRICES[serviceId];
        if (price === undefined || price === null) {
            throw new Error(`Неизвестная услуга: ${serviceId}`);
        }

        // Для бесплатных услуг (diagnosis: 0) - пропускаем оплату
        if (price === 0) {
            console.log('✅ Услуга бесплатная - пропускаем создание платежа');
            tg.showAlert('Бесплатная услуга - платёж не требуется');
            return null;
        }

        // Показываем loader
        showLoader();

        // Отправляем запрос на создание платежа
        // ⚠️ amount НЕ отправляем - Make.com сам определяет цену по service ID (security)
        const result = await BookingAPI.request('create_payment', {
            slot_id: slotId,
            service: serviceId
        });

        hideLoader();

        // Проверяем результат
        if (!result.success) {
            throw new Error(result.error || 'Не удалось создать платёж');
        }

        if (!result.payment_url) {
            throw new Error('Не получен payment_url от сервера');
        }

        console.log('✅ [createPayment] Платёж создан, URL получен');

        // Возвращаем полный результат (для модального окна)
        return result;

    } catch (error) {
        hideLoader();
        console.error('❌ [createPayment] Ошибка создания платежа:', error);

        // Не показываем ошибку если запрос был отменён (race condition)
        if (error.isCancelled) {
            console.log('ℹ️ [createPayment] Запрос отменён - не показываем ошибку пользователю');
            throw error;
        }

        // Показываем понятное сообщение пользователю
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        tg.showAlert('Не удалось создать платёж. Попробуйте позже.');

        throw error;
    }
}

/**
 * [T-003] Открывает окно оплаты YooKassa в Telegram WebView
 * @param {string} paymentUrl - URL страницы оплаты от YooKassa
 * @returns {void}
 *
 * @example
 * openPaymentWindow('https://yoomoney.ru/checkout/payments/v2/contract?orderId=...');
 */
function openPaymentWindow(paymentUrl) {
    try {
        console.log('🌐 [openPaymentWindow] Открытие окна оплаты:', paymentUrl);

        // Haptic feedback при открытии
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }

        // Открываем внешнюю ссылку в Telegram WebView
        tg.openLink(paymentUrl);

        console.log('✅ [openPaymentWindow] Окно оплаты открыто');

    } catch (error) {
        console.error('❌ [openPaymentWindow] Ошибка открытия окна:', error);

        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
        tg.showAlert('Не удалось открыть окно оплаты');
    }
}

/**
 * [T-003] Показывает модальное окно подтверждения оплаты
 * @param {Object} paymentData - Данные платежа
 * @param {string} paymentData.payment_url - URL страницы оплаты YooKassa
 * @param {string} paymentData.payment_id - ID платежа
 * @param {string} paymentData.service - ID услуги
 * @param {string} paymentData.date - Дата бронирования
 * @param {string} paymentData.time - Время бронирования
 * @param {number} paymentData.price - Сумма оплаты
 * @returns {void}
 */
function showPaymentConfirmModal(paymentData) {
    try {
        console.log('💳 [showPaymentConfirmModal] Показ модального окна:', paymentData);

        // Haptic feedback
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }

        // Получаем название услуги
        const service = getServiceById(paymentData.service);
        const serviceName = service ? service.name : 'Консультация';

        // Форматируем сумму
        const formattedPrice = paymentData.price.toLocaleString('ru-RU');

        // Создаём HTML модального окна
        const modalHTML = `
            <div class="payment-modal-overlay" id="paymentModalOverlay">
                <div class="payment-modal">
                    <div class="payment-modal-header">
                        <span>💳</span>
                        <h2>Подтверждение оплаты</h2>
                    </div>
                    <div class="payment-modal-body">
                        <div class="payment-detail">
                            <div class="payment-detail-label">Услуга</div>
                            <div class="payment-detail-value">${serviceName}</div>
                        </div>
                        <div class="payment-detail">
                            <div class="payment-detail-label">Дата и время</div>
                            <div class="payment-detail-value">${paymentData.date}, ${paymentData.time}</div>
                        </div>
                        <div class="payment-amount">
                            <div class="payment-amount-label">Сумма к оплате</div>
                            <div class="payment-amount-value">${formattedPrice} ₽</div>
                        </div>
                    </div>
                    <div class="payment-modal-footer">
                        <button class="payment-modal-button payment-modal-button-primary" id="paymentConfirmBtn">
                            Оплатить ${formattedPrice} ₽
                        </button>
                        <button class="payment-modal-button payment-modal-button-secondary" id="paymentCancelBtn">
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модалку в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Получаем элементы
        const overlay = document.getElementById('paymentModalOverlay');
        const confirmBtn = document.getElementById('paymentConfirmBtn');
        const cancelBtn = document.getElementById('paymentCancelBtn');

        // Функция закрытия модалки
        const closeModal = () => {
            console.log('🚪 [showPaymentConfirmModal] Закрытие модального окна');

            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
            }, 300); // Время анимации fadeOut
        };

        // Обработчик кнопки "Оплатить"
        confirmBtn.addEventListener('click', () => {
            console.log('✅ [showPaymentConfirmModal] Нажата кнопка "Оплатить"');

            // Haptic feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }

            // Закрываем модалку
            closeModal();

            // Открываем окно оплаты
            openPaymentWindow(paymentData.payment_url);

            // Инвалидируем кеш (слот переведён в locking)
            console.log('🗑️ Инвалидация кеша после подтверждения оплаты...');
            CacheManager.clear(`bookings_${USER.id}`);
            CacheManager.clear('slots_json');
            CacheManager.clearPattern('dates_');
            CacheManager.clearPattern('slots_');
        });

        // Обработчик кнопки "Отмена"
        cancelBtn.addEventListener('click', () => {
            console.log('❌ [showPaymentConfirmModal] Нажата кнопка "Отмена"');

            // Haptic feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }

            closeModal();
        });

        // Обработчик клика вне модалки (на overlay)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log('🚪 [showPaymentConfirmModal] Клик вне модалки - закрытие');

                // Haptic feedback
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }

                closeModal();
            }
        });

        console.log('✅ [showPaymentConfirmModal] Модальное окно показано');

    } catch (error) {
        console.error('❌ [showPaymentConfirmModal] Ошибка показа модального окна:', error);
        tg.showAlert('Не удалось показать окно подтверждения');
    }
}

/**
 * [T-003] Обработчик оплаты из карточки бронирования (таб "Мои записи") или locking слота
 * Показывает loading modal, создаёт платёж и открывает модальное окно подтверждения
 * @param {string} bookingId - ID слота бронирования
 * @param {string} serviceId - ID услуги (diagnosis, package, family, single)
 * @param {string|null} dateOverride - Опциональная дата слота (если вызывается не из карточки бронирования)
 * @param {string|null} timeOverride - Опциональное время слота (если вызывается не из карточки бронирования)
 * @returns {Promise<void>}
 */
async function handlePaymentFromBooking(bookingId, serviceId, dateOverride = null, timeOverride = null) {
    // Защита от двойного клика
    if (State.isCreatingPayment) {
        console.log('⚠️ [handlePaymentFromBooking] Платёж уже создаётся - игнорируем клик');
        return;
    }

    State.isCreatingPayment = true;

    try {
        console.log(`💳 [handlePaymentFromBooking] Начало оплаты для слота ${bookingId}`);

        // Показываем loading modal
        showLoadingModal('Создание платежа...');

        // Создаём платёж
        const paymentResult = await createPayment(bookingId, serviceId);

        // Скрываем loading modal
        hideLoadingModal();

        // Если платёж создан - показываем модальное окно подтверждения
        if (paymentResult && paymentResult.payment_url) {
            // Получаем данные бронирования из State или используем переданные параметры
            const booking = State.userBookings.find(b => b.id === bookingId);
            const date = dateOverride || (booking ? booking.date : State.selectedDate);
            const time = timeOverride || (booking ? booking.time : State.selectedSlot);

            if (!date || !time) {
                throw new Error('Не удалось определить дату и время слота');
            }

            const price = CONFIG.SERVICE_PRICES[serviceId] || 0;

            showPaymentConfirmModal({
                payment_url: paymentResult.payment_url,
                payment_id: paymentResult.payment_id,
                service: serviceId,
                date: date,
                time: time,
                price: price
            });
        }

    } catch (error) {
        // Скрываем loading modal в случае ошибки
        hideLoadingModal();

        // Ошибка уже залогирована в createPayment(), просто пробрасываем
        console.error('❌ [handlePaymentFromBooking] Ошибка обработки оплаты:', error);

    } finally {
        // Всегда снимаем флаг в конце
        State.isCreatingPayment = false;
    }
}

// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ =====
const State = {
    currentTab: 'services',
    services: [],
    selectedService: null,
    availableDates: [],
    selectedDate: null,
    availableSlots: [],
    selectedSlot: null,
    selectedSlotId: null,  // ID выбранного слота (например "dslot_62")
    currentMonth: new Date(),
    isLoading: false,
    isLoadingSlots: false,  // 🔧 HOTFIX v20: Флаг загрузки слотов (для отображения loading в секции слотов)
    isLoadingDates: false,  // 🔧 HOTFIX v22: Флаг загрузки дат (для отображения loading в календаре)
    isLoadingBookings: false,  // 🔧 HOTFIX v22: Флаг загрузки записей (для отображения loading в "Мои записи")
    userBookings: [],
    requestControllers: {},  // Для отмены запросов по context (исправление race condition)
    bookingsLoadTimeout: null,  // Для debounce загрузки записей
    selectDateDebounceTimer: null,  // 🔧 HOTFIX v20: Debounce для быстрых кликов по датам
    isAppActive: true,  // 🔧 ИСПРАВЛЕНИЕ 1: Флаг активности приложения
    isBooking: false,  // Защита от двойного клика при бронировании
    isPopupOpen: false,  // 🔧 FIX: Флаг открытого popup (предотвращает "Popup is already opened")
    isSelectingSlot: false,  // [T-003] Флаг выбора слота (защита от двойного клика)
    isCreatingPayment: false,  // [T-003] Флаг создания платежа (защита от двойного клика из карточки бронирования)
    clubPayments: [],  // [T-005] Массив платежей клуба для текущего пользователя
    isLoadingClub: false,  // [T-005] Флаг загрузки данных клуба
    clubZoomLink: '',  // [T-005] Ссылка на Zoom-встречу клуба
    clubPaymentProcessing: localStorage.getItem('clubPaymentProcessing') === 'true'  // [UX] Флаг создания встреч после оплаты (сохраняется между сессиями)
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
        Object.keys(State.requestControllers).forEach(context => {
            if (State.requestControllers[context]) {
                State.requestControllers[context].abort();
                delete State.requestControllers[context];
            }
        });
    }
});

// ===== CACHE MANAGER =====

/**
 * Модуль для управления кешированием данных в localStorage
 * Реализует паттерн "stale-while-revalidate" для оптимизации производительности
 *
 * @module CacheManager
 */
const CacheManager = {
    /**
     * Префикс для ключей кеша (чтобы не конфликтовать с другими данными в localStorage)
     */
    PREFIX: 'tgbot_cache_',

    /**
     * Сохраняет данные в кеш с указанным временем жизни (TTL)
     *
     * @param {string} key - Ключ для сохранения (без префикса)
     * @param {any} data - Данные для сохранения (будут сериализованы в JSON)
     * @param {number} ttl - Время жизни в миллисекундах (например, 300000 = 5 минут)
     * @returns {boolean} - true если успешно сохранено, false если ошибка
     *
     * @example
     * CacheManager.set('bookings_123', bookingsData, 300000); // 5 минут
     */
    set(key, data, ttl) {
        try {
            const cacheKey = this.PREFIX + key;
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                ttl: ttl
            };

            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`📦 [Cache] Сохранено: ${key} (TTL: ${ttl}ms)`);
            return true;
        } catch (error) {
            // QuotaExceededError - localStorage переполнен
            if (error.name === 'QuotaExceededError') {
                console.warn(`⚠️ [Cache] localStorage переполнен - не удалось сохранить ${key}`);
                console.warn('💡 Попробуйте очистить старые данные или уменьшить объём кеша');
            } else {
                console.error(`❌ [Cache] Ошибка сохранения ${key}:`, error);
            }
            return false;
        }
    },

    /**
     * Получает данные из кеша с проверкой срока годности
     *
     * @param {string} key - Ключ для получения (без префикса)
     * @returns {{data: any, isExpired: boolean}|null} - Объект с данными и флагом устаревания, или null если нет в кеше
     *
     * @example
     * const cached = CacheManager.get('bookings_123');
     * if (cached) {
     *   if (!cached.isExpired) {
     *     // Данные свежие - используем
     *     renderBookings(cached.data);
     *   } else {
     *     // Данные устарели - показываем, но обновляем в фоне
     *     renderBookings(cached.data);
     *     loadFreshData();
     *   }
     * }
     */
    get(key) {
        try {
            const cacheKey = this.PREFIX + key;
            const cached = localStorage.getItem(cacheKey);

            if (!cached) {
                console.log(`📭 [Cache] Нет данных: ${key}`);
                return null;
            }

            const cacheData = JSON.parse(cached);
            const age = Date.now() - cacheData.timestamp;
            const isExpired = age > cacheData.ttl;

            if (isExpired) {
                console.log(`⏰ [Cache] Данные устарели: ${key} (возраст: ${Math.round(age / 1000)}s, TTL: ${Math.round(cacheData.ttl / 1000)}s)`);
            } else {
                console.log(`✅ [Cache] Данные актуальны: ${key} (возраст: ${Math.round(age / 1000)}s)`);
            }

            return {
                data: cacheData.data,
                isExpired: isExpired
            };
        } catch (error) {
            console.error(`❌ [Cache] Ошибка чтения ${key}:`, error);
            return null;
        }
    },

    /**
     * Удаляет конкретные данные из кеша
     *
     * @param {string} key - Ключ для удаления (без префикса)
     * @returns {boolean} - true если успешно удалено
     *
     * @example
     * CacheManager.clear('bookings_123');
     */
    clear(key) {
        try {
            const cacheKey = this.PREFIX + key;
            localStorage.removeItem(cacheKey);
            console.log(`🗑️ [Cache] Удалено: ${key}`);
            return true;
        } catch (error) {
            console.error(`❌ [Cache] Ошибка удаления ${key}:`, error);
            return false;
        }
    },

    /**
     * Очищает весь кеш приложения (все ключи с префиксом)
     *
     * @returns {number} - Количество удалённых записей
     *
     * @example
     * const cleared = CacheManager.clearAll();
     * console.log(`Удалено ${cleared} записей из кеша`);
     */
    clearAll() {
        try {
            let count = 0;
            const keysToRemove = [];

            // Собираем все ключи с нашим префиксом
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.PREFIX)) {
                    keysToRemove.push(key);
                }
            }

            // Удаляем собранные ключи
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                count++;
            });

            console.log(`🗑️ [Cache] Очищен весь кеш: ${count} записей`);
            return count;
        } catch (error) {
            console.error('❌ [Cache] Ошибка очистки всего кеша:', error);
            return 0;
        }
    },

    /**
     * Вспомогательный метод для инвалидации кеша по паттерну
     * Удаляет все ключи, которые соответствуют паттерну (например, 'cache_dates_*')
     *
     * @param {string} pattern - Паттерн для поиска (например, 'dates_' удалит все cache_dates_*)
     * @returns {number} - Количество удалённых записей
     *
     * @example
     * // Удалить все кеши дат для всех услуг
     * CacheManager.clearPattern('dates_');
     */
    clearPattern(pattern) {
        try {
            let count = 0;
            const keysToRemove = [];
            const searchPattern = this.PREFIX + pattern;

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(searchPattern)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                count++;
            });

            console.log(`🗑️ [Cache] Удалено по паттерну '${pattern}': ${count} записей`);
            return count;
        } catch (error) {
            console.error(`❌ [Cache] Ошибка удаления по паттерну '${pattern}':`, error);
            return 0;
        }
    }
};

// ===== API ФУНКЦИИ =====
class BookingAPI {
    /**
     * Универсальный метод для всех API запросов к Make.com
     * Теперь использует fetchWithErrorHandling для централизованной обработки ошибок
     * @param {string} action - действие (get_available_dates, book_slot, etc.)
     * @param {Object} data - дополнительные данные для запроса
     * @param {Object} options - опции запроса
     * @param {boolean} options.showError - показывать ли popup при ошибке (default: true)
     * @returns {Promise<Object>} результат от Make.com
     */
    static async request(action, data = {}, options = {}) {
        const { showError = true } = options;
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
        // [T-002] Только get_user_bookings остался - все остальные read операции через Git
        const readOnlyActions = ['get_user_bookings'];
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
                    showError: showError // 🔧 HOTFIX v16: Передаём параметр для фоновых запросов
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
                const error = new Error(result.error || 'Неизвестная ошибка от сервера');
                // Сохраняем дополнительные поля из ответа (для кастомных попапов)
                error.apiResponse = result;
                throw error;
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

    // [T-002] Методы удалены, используем данные из Git:
    // - getServices() → CONFIG.SERVICES (статичный список)
    // - getAvailableDates() → fetchSlotsFromGit() + getAvailableDatesFromSlots()
    // - getAvailableSlots() → fetchSlotsFromGit() + getAvailableSlotsForDate()

    static async bookSlot(serviceName, date, time, slotId = null) {
        const payload = {
            service_name: serviceName,
            date: date,
            time: time
        };

        // Добавляем slot_id если передан (для диагностики и других услуг)
        if (slotId) {
            payload.slot_id = slotId;
        }

        return await this.request('book_slot', payload);
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
    // Сначала проверяем HTTP статус коды (если error = null, но есть response)
    // Ошибка сервера (5xx)
    if (response && response.status >= 500) {
        return { type: 'SERVER', message: 'Сервер временно недоступен. Попробуйте позже' };
    }

    // Ошибка клиента (4xx)
    if (response && response.status >= 400) {
        return { type: 'CLIENT', message: 'Некорректный запрос' };
    }

    // Если error = null, но нет response - неизвестная ошибка
    if (!error) {
        return { type: 'UNKNOWN', message: 'Произошла ошибка. Попробуйте позже' };
    }

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

    // Неизвестная ошибка
    return { type: 'UNKNOWN', message: 'Произошла ошибка. Попробуйте позже' };
}

/**
 * Показывает popup с ошибкой и кнопкой "Повторить"
 * @param {string} message - текст ошибки для пользователя
 * @param {Function|null} retryFn - функция для повторного запроса (если null - только кнопка "Отмена")
 * @returns {boolean} true если popup успешно показан, false если popup уже открыт
 */
function showErrorPopup(message, retryFn = null) {
    // 🔧 FIX: Проверяем не открыт ли уже popup
    if (State.isPopupOpen) {
        console.warn('⚠️ Popup уже открыт - пропускаем показ нового popup');
        return false; // Возвращаем false - popup НЕ показан
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

    // 🔧 HOTFIX: Fallback сброс флага через 5 секунд
    // Гарантирует что флаг сбросится даже если Telegram не вызовет callback
    const fallbackTimeoutId = setTimeout(() => {
        if (State.isPopupOpen) {
            console.warn('⚠️ Fallback сброс State.isPopupOpen через 5 секунд');
            State.isPopupOpen = false;
        }
    }, 5000);

    try {
        // Показываем Telegram popup
        tg.showPopup({
            title: 'Ошибка',
            message: message,
            buttons: buttons
        }, (buttonId) => {
            // 🔧 FIX: Сбрасываем флаг при закрытии popup
            State.isPopupOpen = false;

            // Очищаем fallback timeout так как callback сработал
            clearTimeout(fallbackTimeoutId);

            // Обработчик нажатия на кнопку
            if (buttonId === 'retry' && retryFn) {
                retryFn();
            }
        });

        return true; // Popup успешно показан

    } catch (error) {
        // 🔧 FIX: Если не удалось показать popup - сбрасываем флаг
        console.error('❌ Ошибка показа popup:', error);
        State.isPopupOpen = false;
        clearTimeout(fallbackTimeoutId);
        return false; // Popup НЕ показан
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
 * @param {boolean} showIndicator - показывать ли индикатор "Повторная попытка" (default: true)
 * @returns {Promise<any>} результат выполнения requestFn
 */
async function retryRequest(requestFn, delay = 2000, showIndicator = true) {
    console.log(`🔄 Retry after ${delay}ms...`);

    // 🔧 HOTFIX v16: Показываем индикатор только если showIndicator = true
    if (showIndicator) {
        showRetryIndicator('Повторная попытка...');
    }

    // Ждём заданную задержку
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        // Выполняем запрос
        const result = await requestFn();
        if (showIndicator) {
            hideRetryIndicator();
        }
        return result;
    } catch (error) {
        // Скрываем индикатор даже при ошибке
        if (showIndicator) {
            hideRetryIndicator();
        }
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

    // 🔧 HOTFIX v25: Сначала проверяем ABORT, потом haptic
    // Игнорируем AbortError (запрос отменён пользователем или системой)
    if (errorInfo.type === 'ABORT') {
        console.log(`[${context}] Request cancelled - не показываем ошибку`);
        return; // Выходим БЕЗ haptic feedback
    }

    // 3. Haptic feedback при реальной ошибке (не ABORT)
    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('error');
    }

    // 5. Автоматический retry для retryable запросов (только 1 раз!)
    if (retryable && !hasRetried && retryFn) {
        console.log(`[${context}] Автоматический retry (1/1)...`);

        try {
            // 🔧 HOTFIX v16: Показываем индикатор только если showError = true
            const result = await retryRequest(retryFn, 2000, showError);

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
                const popupShown = showErrorPopup(errorInfo.message, retryFn);

                // 🔧 HOTFIX: Если popup не показан (уже открыт другой popup),
                // НЕ выбрасываем ошибку - иначе получим unhandled rejection
                if (!popupShown) {
                    console.warn(`[${context}] Popup не показан (уже открыт) - не выбрасываем ошибку`);
                    return; // Выходим без выброса ошибки
                }
            }

            throw retryError;
        }
    }

    // 6. Показываем popup с ошибкой и кнопкой "Повторить" (если showError: true)
    if (showError) {
        const popupShown = showErrorPopup(errorInfo.message, retryFn);

        // 🔧 HOTFIX: Если popup не показан (уже открыт другой popup),
        // НЕ выбрасываем ошибку - иначе получим unhandled rejection
        if (!popupShown) {
            console.warn(`[${context}] Popup не показан (уже открыт) - не выбрасываем ошибку`);
            return; // Выходим без выброса ошибки
        }
    }

    // Пробрасываем ошибку дальше только если popup был показан
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

    // 🔧 FIX: Отменяем предыдущий запрос ТОЛЬКО с тем же context (исправление race condition)
    // Теперь get_slots не отменяет get_available_dates и наоборот
    if (State.requestControllers[context] && !config.hasRetried) {
        console.log(`🛑 [${context}] Отменяем предыдущий запрос с тем же context`);
        State.requestControllers[context].abort();
        delete State.requestControllers[context];
    }

    // Создаём AbortController для этого запроса
    const controller = new AbortController();
    const signal = controller.signal;

    // 🔧 FIX: Сохраняем в State по context для возможности отмены
    State.requestControllers[context] = controller;

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

        // 🔧 FIX: Очищаем контроллер после успешного ответа
        if (State.requestControllers[context] === controller) {
            delete State.requestControllers[context];
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

        // 🔧 HOTFIX v16: Различаем timeout от ручной отмены запроса
        if (error.name === 'AbortError') {
            // Проверяем, был ли abort из-за timeout или из-за ручной отмены
            // Если контроллер ещё в State - это timeout (setTimeout вызвал abort)
            // Если контроллера нет в State - это ручная отмена (новый запрос/переключение таба)
            const wasTimeout = State.requestControllers[context] === controller;

            // Очищаем контроллер если это был timeout
            if (wasTimeout) {
                delete State.requestControllers[context];
            }

            if (wasTimeout) {
                // Это timeout - создаём TimeoutError и показываем popup
                const timeoutError = new Error('Request timeout');
                timeoutError.name = 'TimeoutError';

                await handleNetworkError(timeoutError, context, retryFn, {
                    retryable,
                    showError,
                    hasRetried: config.hasRetried || false
                });

                throw timeoutError;
            } else {
                // 🔧 HOTFIX: Это ручная отмена (новый запрос/переключение таба)
                // НЕ показываем ошибку - это нормальное поведение
                console.log(`[${context}] Request cancelled (new request) - не показываем ошибку`);
                error.isCancelled = true;
                throw error;
            }
        }

        // 🔧 FIX: Очищаем контроллер при ошибке
        if (State.requestControllers[context] === controller) {
            delete State.requestControllers[context];
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

/**
 * [T-003] Показывает модальное окно загрузки в glassmorphism стиле
 * @param {string} message - Сообщение для отображения (например, "Создание платежа...")
 */
function showLoadingModal(message = 'Загрузка...') {
    // Удаляем старую модалку если есть
    hideLoadingModal();

    const modalHTML = `
        <div class="loading-modal-overlay" id="loadingModalOverlay">
            <div class="loading-modal glass-card">
                <div class="loading-spinner"></div>
                <div class="loading-text">${escapeHtml(message)}</div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    console.log('⏳ [showLoadingModal] Показано окно загрузки:', message);
}

/**
 * [T-003] Скрывает модальное окно загрузки
 */
function hideLoadingModal() {
    const modal = document.getElementById('loadingModalOverlay');
    if (modal) {
        modal.remove();
        console.log('✅ [hideLoadingModal] Окно загрузки скрыто');
    }
}

/**
 * Показывает кастомный попап успеха
 * @param {string} title Заголовок попапа
 * @param {string} message Текст сообщения
 */
function showSuccessPopup(title = 'Готово', message = 'Операция выполнена') {
    const overlay = document.getElementById('success-popup-overlay');
    const titleEl = document.getElementById('success-popup-title');
    const messageEl = document.getElementById('success-popup-message');

    if (overlay && titleEl && messageEl) {
        titleEl.textContent = title;
        messageEl.textContent = message;
        overlay.classList.remove('hidden', 'closing');

        console.log(`✅ [showSuccessPopup] Показан попап: ${title} - ${message}`);
    }
}

/**
 * Скрывает кастомный попап успеха
 */
function hideSuccessPopup() {
    const overlay = document.getElementById('success-popup-overlay');

    if (overlay) {
        overlay.classList.add('closing');

        // Haptic feedback при закрытии
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }

        // Удаляем класс hidden после анимации
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('closing');
        }, 300); // Совпадает с transition-normal (0.3s)

        console.log('✅ [hideSuccessPopup] Попап скрыт');
    }
}

/**
 * Показывает кастомный попап ошибки (слот занят)
 * @param {string} message Текст сообщения из JSON (поле message)
 */
function showSlotTakenPopup(message = 'Слот уже забронирован другим пользователем') {
    const overlay = document.getElementById('error-popup-overlay');
    const titleEl = document.getElementById('error-popup-title');
    const messageEl = document.getElementById('error-popup-message');

    if (overlay && titleEl && messageEl) {
        titleEl.textContent = 'Упс!';
        messageEl.textContent = message;
        overlay.classList.remove('hidden', 'closing');

        // Haptic feedback ошибки
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }

        console.log(`⚠️ [showSlotTakenPopup] Показан попап: ${message}`);

        // Автозакрытие через 4 секунды
        setTimeout(() => {
            hideSlotTakenPopup();
        }, 4000);
    }
}

/**
 * Скрывает кастомный попап ошибки
 */
function hideSlotTakenPopup() {
    const overlay = document.getElementById('error-popup-overlay');

    if (overlay) {
        overlay.classList.add('closing');

        // Haptic feedback при закрытии
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }

        // Удаляем класс hidden после анимации
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('closing');
        }, 300); // Совпадает с transition-normal (0.3s)

        console.log('✅ [hideSlotTakenPopup] Попап скрыт');
    }
}

// ===== РЕНДЕРИНГ ЭКРАНОВ =====

// Экран услуг
function renderServicesScreen() {
    // [T-005] Фильтруем club_info - он отображается только во вкладке "Клуб"
    const services = State.services.filter(s => s.id !== 'club_info');

    const html = `
        <h1 class="screen-title fade-in">Диагностика - это первый шаг перед консультацией</h1>
        <div class="services-grid fade-in">
            ${services.map(service => `
                <div class="service-card glass-card" onclick="selectService('${escapeHtml(service.id)}')">
                    <div class="service-header">
                        ${CONFIG.SERVICE_ICONS[service.name] ? `<div class="service-icon">${CONFIG.SERVICE_ICONS[service.name]}</div>` : ''}
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

// Экран бронирования
function renderBookingScreen() {
    console.log(`🎨 renderBookingScreen: service=${State.selectedService}, date=${State.selectedDate}, slots=${State.availableSlots?.length || 0}, dates=${State.availableDates?.length || 0}`);

    const services = State.services.filter(s => !s.type || s.type !== 'info_button');
    
    const html = `
        <h1 class="screen-title fade-in">Запись на консультацию</h1>
        
        <div class="booking-container fade-in">
            <div class="service-selector glass-card">
                <select class="service-select" onchange="onServiceSelect(this.value)">
                    <option value="">Выберите услугу</option>
                    ${services.map(s => `
                        <option value="${escapeHtml(s.id)}" ${State.selectedService === s.id ? 'selected' : ''}>
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
                        ${State.isLoadingDates && State.availableDates.length === 0 ? `
                            <div class="dates-loading">
                                <div class="dates-spinner"></div>
                                <span>Загрузка дат...</span>
                            </div>
                        ` : renderCalendarDays()}
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
                    ` : State.isLoadingSlots ? `
                        <div class="slots-loading">
                            <div class="slots-spinner"></div>
                            <span>Загрузка слотов...</span>
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
/**
 * [T-003] Рендерит booking card для слота в статусе locking (ожидает оплаты)
 * Все данные экранированы через escapeHtml для защиты от XSS
 * @param {Object} booking - Объект бронирования со статусом 'locking'
 * @returns {string} - HTML строка для service-card
 */
function renderLockingBookingCard(booking) {
    const remaining = calculateTimeRemaining(booking.locked_until);
    const timerText = remaining.isExpired
        ? 'Время истекло'
        : `Осталось: ${remaining.hours}ч ${remaining.minutes}м`;

    const service = getServiceById(booking.service_id || booking.service);
    const price = CONFIG.SERVICE_PRICES[booking.service_id || booking.service] || 0;
    const serviceName = escapeHtml(service ? service.name : booking.service);
    const bookingDate = escapeHtml(booking.date);
    const bookingTime = escapeHtml(booking.time);
    const bookingId = escapeHtml(booking.id);
    const serviceId = escapeHtml(booking.service_id || booking.service);

    return `
        <div class="service-card glass-card">
            <div class="service-header">
                <div class="service-icon">📅</div>
                <div class="service-info">
                    <div class="service-name">${serviceName}</div>
                    <div class="service-duration">${bookingDate} в ${bookingTime}</div>
                </div>
            </div>
            <div class="service-description">
                <div class="payment-timer" style="font-size: 13px; color: var(--text-primary); margin-bottom: 8px;">
                    ${timerText}
                </div>
                ${!remaining.isExpired ? `
                    <button
                        class="payment-btn"
                        style="width: 100%; padding: 10px; font-size: 14px;"
                        onclick="handlePaymentFromBooking('${bookingId}', '${serviceId}')">
                        Оплатить ${price.toLocaleString('ru-RU')} ₽
                    </button>
                ` : `
                    <p style="color: var(--error); font-size: 13px;">
                        Время для оплаты истекло. Забронируйте слот заново.
                    </p>
                `}
            </div>
            <div class="service-footer">
                <button class="service-btn" onclick="cancelBooking('${bookingId}')">
                    Отменить запись
                </button>
            </div>
        </div>
    `;
}

/**
 * [T-003] Экран "Мои записи" с поддержкой locking слотов
 * Разделяет записи на: ожидающие оплаты (locking) и подтверждённые (book)
 * Все пользовательские данные экранированы через escapeHtml для защиты от XSS
 */
function renderMyBookingsScreen() {
    const bookings = State.userBookings;

    // [T-003] Разделяем bookings на locking и completed
    const lockingBookings = bookings.filter(b => b.status === 'locking');
    const completedBookings = bookings.filter(b => b.status !== 'locking');

    const html = `
        <h1 class="screen-title fade-in">Мои записи</h1>

        ${lockingBookings.length > 0 ? `
            <div class="fade-in" style="margin-bottom: 24px;">
                <h2 style="font-size: 16px; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500;">
                    ⏳ Ожидают оплаты
                </h2>
                <div class="services-grid">
                    ${lockingBookings.map(booking => renderLockingBookingCard(booking)).join('')}
                </div>
            </div>
        ` : ''}

        ${completedBookings.length > 0 ? `
            ${lockingBookings.length > 0 ? `
                <h2 style="font-size: 16px; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500;">
                    ✅ Подтверждённые записи
                </h2>
            ` : ''}
            <div class="services-grid fade-in">
                ${completedBookings.map(booking => `
                    <div class="service-card glass-card">
                        <div class="service-header">
                            <div class="service-icon">📅</div>
                            <div class="service-info">
                                <div class="service-name">${escapeHtml(booking.service)}</div>
                                <div class="service-duration">${escapeHtml(booking.date)} в ${escapeHtml(booking.time)}</div>
                            </div>
                        </div>
                        ${booking.zoom_link ? `
                            <div class="service-description">
                                <a href="${escapeHtml(booking.zoom_link)}" class="zoom-link" target="_blank">
                                    Ссылка на Zoom
                                </a>
                            </div>
                        ` : ''}
                        <div class="service-footer">
                            <button class="service-btn" onclick="cancelBooking('${escapeHtml(booking.id)}')">
                                Отменить запись
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : (bookings.length === 0 && !State.isLoadingBookings) ? `
            <div class="loader-container">
                <p>У вас пока нет записей</p>
            </div>
        ` : ''}

        ${State.isLoadingBookings ? `
            <div class="bookings-loading">
                <div class="bookings-spinner"></div>
                <span>Загрузка записей...</span>
            </div>
        ` : ''}
    `;

    document.getElementById('app').innerHTML = html;
}

// ===== КАЛЕНДАРЬ =====

function renderCalendarDays() {
    console.log(`📅 renderCalendarDays: availableDates=${State.availableDates?.length || 0}, selectedDate=${State.selectedDate}`);

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

function selectService(serviceId) {
    // Проверяем, это ли информационная кнопка
    const service = State.services.find(s => s.id === serviceId);
    if (service && service.type === 'info_button') {
        tg.showAlert('Информация о клубе появится позже');
        return;
    }

    // Переключаемся на экран бронирования
    switchTab('booking');

    // Устанавливаем выбранную услугу
    setTimeout(() => {
        onServiceSelect(serviceId);
    }, 100);
}

async function onServiceSelect(serviceId) {
    if (!serviceId) return;

    // 🔧 HOTFIX v24: Отменяем ВСЕ активные запросы при смене услуги
    // Это предотвращает накопление "мёртвых" запросов к Make.com
    Object.keys(State.requestControllers).forEach(context => {
        if (State.requestControllers[context]) {
            console.log(`🛑 [onServiceSelect] Отменяем активный запрос: ${context}`);
            State.requestControllers[context].abort();
            delete State.requestControllers[context];
        }
    });

    // 🔧 ИСПРАВЛЕНИЕ 6: Очищаем предыдущее состояние
    State.selectedService = serviceId;
    State.selectedDate = null;
    State.selectedSlot = null;
    State.selectedSlotId = null;
    State.availableSlots = [];
    State.availableDates = []; // 🔧 HOTFIX v19: Очищаем даты при смене услуги
    State.currentMonth = new Date();

    console.log(`🔄 onServiceSelect: выбрана услуга "${serviceId}", state очищен`);

    renderBookingScreen();

    // Загружаем доступные даты
    try {
        showLoader();
        await loadAvailableDates(serviceId);
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
    // 🔧 HOTFIX v20: Debounce для быстрых кликов по датам (300ms)
    // Если пользователь быстро кликает по датам, не запускаем запросы сразу
    if (State.selectDateDebounceTimer) {
        clearTimeout(State.selectDateDebounceTimer);
    }

    State.selectedDate = dateStr;
    State.selectedSlot = null;
    State.selectedSlotId = null;

    // 🔧 HOTFIX v20: Проверяем есть ли кеш для этой даты
    const cacheKey = `slots_${State.selectedService}_${dateStr}`;
    const cached = CacheManager.get(cacheKey);

    if (cached) {
        // Есть кеш (свежий или устаревший) - показываем сразу
        State.availableSlots = cached.data;
        State.isLoadingSlots = !cached.isExpired; // Если кеш устарел - покажем loading на фоне
        console.log(`📦 [selectDate] Мгновенно показаны слоты из кеша для ${dateStr}`);
    } else {
        // Кеша нет - показываем loading
        State.availableSlots = [];
        State.isLoadingSlots = true;
        console.log(`⏳ [selectDate] Нет кеша для ${dateStr} - показываем loading`);
    }

    renderBookingScreen();

    // 🔧 HOTFIX v20: Debounce запроса к API
    State.selectDateDebounceTimer = setTimeout(async () => {
        try {
            await loadAvailableSlots(State.selectedService, dateStr);

            // Проверяем что дата не изменилась за время загрузки
            if (State.selectedDate === dateStr) {
                State.isLoadingSlots = false;
                renderBookingScreen();

                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }
            }
        } catch (error) {
            // Проверяем что дата не изменилась
            if (State.selectedDate === dateStr) {
                State.isLoadingSlots = false;
                renderBookingScreen();

                // 🔧 ИСПРАВЛЕНИЕ 8: Не показываем ошибку при отмене
                if (!error.isCancelled) {
                    console.error('Ошибка загрузки слотов:', error);
                }
            }
        }
    }, 150); // 150ms debounce - баланс между отзывчивостью и экономией запросов
}

/**
 * [T-003] Выбор слота с защитой от двойного клика
 * @param {string} time - Время слота в формате "HH:MM"
 */
function selectSlot(time) {
    // Защита от двойного клика
    if (State.isSelectingSlot) {
        console.log('⚠️ [selectSlot] Слот уже выбирается, игнорируем повторный клик');
        return;
    }

    State.isSelectingSlot = true;
    State.selectedSlot = time;

    // Находим слот по времени и сохраняем его ID
    const slotObj = State.availableSlots.find(slot => slot.time === time);
    State.selectedSlotId = slotObj ? slotObj.id : null;
    console.log(`✅ [selectSlot] Выбран слот: time="${time}", id="${State.selectedSlotId}"`);

    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }

    renderBookingScreen();

    // Сбрасываем флаг после завершения рендеринга
    setTimeout(() => {
        State.isSelectingSlot = false;
    }, 300);
}

/**
 * [T-003] Подтверждение бронирования с поддержкой платных услуг
 * Для платных услуг (price > 0): создаёт платёж через YooKassa
 * Для бесплатных услуг (price === 0): прямое бронирование через Make.com
 * @returns {Promise<void>}
 */
async function confirmBooking() {
    if (!State.selectedService || !State.selectedDate || !State.selectedSlot) {
        tg.showAlert('Пожалуйста, выберите услугу, дату и время');
        return;
    }

    // Защита от двойного клика
    if (State.isBooking) {
        console.log('⚠️ [confirmBooking] Запрос уже выполняется, игнорируем повторный клик');
        tg.HapticFeedback.notificationOccurred('warning');
        return;
    }

    // [T-003] Проверяем является ли услуга платной
    const price = CONFIG.SERVICE_PRICES[State.selectedService];
    const isPaidService = price && price > 0;

    // [T-003] Для платных услуг - создаём платёж через YooKassa
    if (isPaidService) {
        State.isBooking = true;  // Блокируем повторные клики
        try {
            // Находим слот в availableSlots чтобы получить slot.id
            const slot = State.availableSlots.find(s => s.time === State.selectedSlot);
            if (!slot || !slot.id) {
                console.error('❌ [confirmBooking] Слот не найден в availableSlots:', State.selectedSlot);
                tg.showAlert('Слот не найден. Попробуйте выбрать другое время.');
                return;
            }

            console.log(`💳 [confirmBooking] Платная услуга (${price} ₽) - создание платежа для слота ${slot.id}`);

            // Показываем loading modal
            showLoadingModal('Создание платежа...');

            // Создаём платёж
            const paymentResult = await createPayment(slot.id, State.selectedService);

            // Скрываем loading modal
            hideLoadingModal();

            // Показываем модальное окно подтверждения оплаты
            if (paymentResult && paymentResult.payment_url) {
                showPaymentConfirmModal({
                    payment_url: paymentResult.payment_url,
                    payment_id: paymentResult.payment_id,
                    service: State.selectedService,
                    date: State.selectedDate,
                    time: State.selectedSlot,
                    price: price
                });
            }

            // НЕ очищаем State - пользователь может вернуться и оплатить позже
            // НЕ переключаемся на mybookings - пользователь сам вернётся после оплаты
            // НЕ инвалидируем кеш здесь - это делается в модалке при нажатии "Оплатить"

        } catch (error) {
            hideLoadingModal(); // Скрываем loading modal при ошибке
            console.error('❌ [confirmBooking] Ошибка создания платежа:', error);
            tg.HapticFeedback.notificationOccurred('error');
            // Ошибка уже показана в createPayment()
        } finally {
            State.isBooking = false;  // Всегда разблокируем после завершения
        }
        return;
    }

    // [T-003] Для бесплатных услуг - прямое бронирование (старая логика)
    State.isBooking = true;  // Блокируем повторные клики
    try {
        console.log(`✅ [confirmBooking] Бесплатная услуга - прямое бронирование`);

        showLoader();
        const result = await BookingAPI.bookSlot(
            State.selectedService,
            State.selectedDate,
            State.selectedSlot,
            State.selectedSlotId  // Передаём ID слота для вебхука
        );
        hideLoader();

        if (result.success) {
            // Попап не показываем - пользователь видит запись в "Мои записи"
            tg.HapticFeedback.notificationOccurred('success');

            // 🗑️ CACHE: Инвалидируем кеш после создания бронирования
            console.log('🗑️ Инвалидация кеша после создания бронирования...');
            CacheManager.clear(`bookings_${USER.id}`); // Список бронирований изменился
            CacheManager.clear('slots_json'); // [T-002] Инвалидация slots.json
            CacheManager.clearPattern('dates_'); // Доступные даты могли измениться
            CacheManager.clearPattern('slots_'); // Слоты изменились

            // 🔧 ИСПРАВЛЕНИЕ 9: Очищаем состояние после успешной записи
            State.selectedService = null;
            State.selectedDate = null;
            State.selectedSlot = null;
            State.selectedSlotId = null;
            State.availableDates = [];
            State.availableSlots = [];

            switchTab('mybookings');
        }
    } catch (error) {
        hideLoader();
        console.error('Ошибка бронирования:', error);

        // Проверяем, это ошибка "слот занят" от Make.com
        if (error.apiResponse?.slot_status === 'book') {
            // Показываем кастомный попап с сообщением из JSON
            const message = error.apiResponse.message || error.message;
            showSlotTakenPopup(message);
        } else {
            // Обычная ошибка - стандартный alert
            tg.showAlert('Не удалось создать запись. Попробуйте позже.');
            tg.HapticFeedback.notificationOccurred('error');
        }
    } finally {
        State.isBooking = false;  // Всегда разблокируем после завершения
    }
}

// ===== ЗАГРУЗКА ДАННЫХ =====

/**
 * [T-002] Загружает slots.json из GitHub raw URL с кешированием и fallback
 * Реализует паттерн "stale-while-revalidate" для оптимальной производительности
 *
 * @returns {Promise<Object>} Объект со структурой { slots: [...], generated_at: "..." }
 * @throws {Error} Если не удалось загрузить данные ни из Git, ни из fallback API
 *
 * @example
 * const slotsData = await fetchSlotsFromGit();
 * console.log('Загружено слотов:', slotsData.slots.length);
 */
async function fetchSlotsFromGit() {
    const CACHE_KEY = 'slots_json';
    const CACHE_TTL = 10 * 60 * 1000; // 10 минут

    // Проверяем кеш
    const cached = CacheManager.get(CACHE_KEY);

    if (cached && !cached.isExpired) {
        // Кеш свежий - возвращаем мгновенно
        console.log('📦 [fetchSlotsFromGit] Данные из кеша (свежие)');

        // Фоновое обновление (stale-while-revalidate)
        fetchSlotsFromGitAPI(CACHE_KEY, CACHE_TTL, true).catch(err => {
            console.warn('🔄 Фоновое обновление slots.json не удалось:', err.message);
        });

        return cached.data;
    }

    if (cached && cached.isExpired) {
        // Кеш устарел - показываем старые данные, обновляем в фоне
        console.log('📦 [fetchSlotsFromGit] Данные из кеша (устаревшие) - обновление...');
    }

    // Загружаем свежие данные
    return await fetchSlotsFromGitAPI(CACHE_KEY, CACHE_TTL, false);
}

/**
 * [T-002] Вспомогательная функция для загрузки slots.json из GitHub или fallback API
 * @param {string} cacheKey - Ключ кеша
 * @param {number} cacheTTL - Время жизни кеша в мс
 * @param {boolean} isBackground - Фоновая загрузка (без ошибок пользователю)
 * @returns {Promise<Object>} Объект со слотами
 */
async function fetchSlotsFromGitAPI(cacheKey, cacheTTL, isBackground = false) {
    try {
        // Пытаемся загрузить из GitHub
        console.log('🌐 [fetchSlotsFromGit] Загрузка из GitHub:', CONFIG.SLOTS_JSON_URL);

        const response = await fetch(CONFIG.SLOTS_JSON_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 секунд timeout
        });

        if (!response.ok) {
            throw new Error(`GitHub HTTP ${response.status}`);
        }

        const data = await response.json();

        // Валидация структуры
        if (!data.slots || !Array.isArray(data.slots)) {
            throw new Error('Invalid slots.json structure: missing slots array');
        }

        if (!data.generated_at) {
            console.warn('⚠️ slots.json не содержит generated_at');
        }

        console.log(`✅ [fetchSlotsFromGit] Загружено ${data.slots.length} слотов из GitHub`);

        // Сохраняем в кеш
        CacheManager.set(cacheKey, data, cacheTTL);

        return data;

    } catch (error) {
        console.error('❌ [fetchSlotsFromGit] Ошибка загрузки из GitHub:', error.message);

        // [T-002] Попытка использовать устаревший кеш при ошибке GitHub
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            console.log('📦 [fetchSlotsFromGit] Используем устаревший кеш при ошибке GitHub');
            return cached.data;
        }

        // Нет ни свежих данных, ни кеша - бросаем ошибку
        if (!isBackground) {
            console.error('❌ [fetchSlotsFromGit] Нет кеша, не удалось загрузить из GitHub');
            throw new Error('Не удалось загрузить расписание');
        } else {
            // Фоновая загрузка - не бросаем ошибку
            console.warn('⚠️ [fetchSlotsFromGit] Фоновое обновление не удалось, кеша нет');
            return null;
        }
    }
}

/**
 * [T-002] Фильтрует массив слотов по типу услуги
 *
 * @param {Array} slots - Массив всех слотов из slots.json
 * @param {string} serviceId - ID услуги ('package', 'single', 'family', 'diagnosis')
 * @returns {Array} Отфильтрованные слоты для указанной услуги
 *
 * @example
 * const allSlots = await fetchSlotsFromGit();
 * const packageSlots = filterSlotsByService(allSlots.slots, 'package');
 * console.log('Слотов для пакета:', packageSlots.length);
 */
function filterSlotsByService(slots, serviceId) {
    if (!Array.isArray(slots)) {
        console.error('❌ [filterSlotsByService] slots не является массивом:', slots);
        return [];
    }

    if (!serviceId) {
        console.warn('⚠️ [filterSlotsByService] serviceId не указан');
        return [];
    }

    const filtered = slots.filter(slot => slot.service === serviceId);

    console.log(`🔍 [filterSlotsByService] Отфильтровано ${filtered.length} слотов для услуги "${serviceId}"`);

    return filtered;
}

/**
 * [T-002] Извлекает уникальные доступные даты из массива слотов (только free слоты)
 *
 * @param {Array} slots - Массив слотов для конкретной услуги
 * @returns {Array<Object>} Массив объектов с датами в формате { date: 'DD.MM.YYYY', slots_count: N }
 *
 * @example
 * const slots = filterSlotsByService(allSlots.slots, 'single');
 * const availableDates = getAvailableDatesFromSlots(slots);
 * // [{ date: '03.02.2026', slots_count: 3 }, { date: '05.02.2026', slots_count: 2 }, ...]
 */
function getAvailableDatesFromSlots(slots) {
    if (!Array.isArray(slots)) {
        console.error('❌ [getAvailableDatesFromSlots] slots не является массивом:', slots);
        return [];
    }

    // Фильтруем только free слоты
    const freeSlots = slots.filter(slot => slot.status === 'free');

    // Группируем по датам и считаем количество
    const dateMap = {};
    freeSlots.forEach(slot => {
        if (slot.date) {
            dateMap[slot.date] = (dateMap[slot.date] || 0) + 1;
        }
    });

    // Преобразуем в массив объектов
    const dates = Object.entries(dateMap).map(([date, count]) => ({
        date: date,
        slots_count: count
    }));

    // Сортируем по дате
    dates.sort((a, b) => {
        // Предполагаем формат DD.MM.YYYY
        const [dayA, monthA, yearA] = a.date.split('.');
        const [dayB, monthB, yearB] = b.date.split('.');
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateA - dateB;
    });

    console.log(`📅 [getAvailableDatesFromSlots] Найдено ${dates.length} уникальных дат со свободными слотами`);

    return dates;
}

/**
 * [T-002] Получает доступные слоты для конкретной даты
 *
 * @param {Array} slots - Массив слотов для конкретной услуги
 * @param {string} date - Дата в формате 'DD.MM.YYYY'
 * @returns {Array} Массив слотов для указанной даты со статусом 'free', отсортированный по времени
 *
 * @example
 * const slots = filterSlotsByService(allSlots.slots, 'diagnosis');
 * const slotsFor03Feb = getAvailableSlotsForDate(slots, '03.02.2026');
 * // [{ id: 'dslot_19', time: '13:00', date: '03.02.2026', ... }, { id: 'dslot_20', time: '14:00', ... }]
 */
function getAvailableSlotsForDate(slots, date) {
    if (!Array.isArray(slots)) {
        console.error('❌ [getAvailableSlotsForDate] slots не является массивом:', slots);
        return [];
    }

    if (!date) {
        console.warn('⚠️ [getAvailableSlotsForDate] date не указана');
        return [];
    }

    // Фильтруем слоты: date === указанная && status === 'free'
    const filtered = slots.filter(slot =>
        slot.date === date && slot.status === 'free'
    );

    // Сортируем по времени
    filtered.sort((a, b) => {
        // Предполагаем формат HH:MM
        const [hourA, minA] = (a.time || '00:00').split(':').map(Number);
        const [hourB, minB] = (b.time || '00:00').split(':').map(Number);
        return (hourA * 60 + minA) - (hourB * 60 + minB);
    });

    console.log(`🕐 [getAvailableSlotsForDate] Найдено ${filtered.length} свободных слотов для даты ${date}`);

    return filtered;
}

async function loadServices() {
    // Используем статичные данные из CONFIG вместо запроса к Make
    State.services = CONFIG.SERVICES;
    console.log('✅ Загружены статичные услуги:', State.services);
}

async function loadAvailableDates(serviceId) {
    // 📦 CACHE: Ключ кеша для дат услуги
    const cacheKey = `dates_${serviceId}`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 минут

    // 📦 CACHE: Проверяем кеш перед загрузкой
    const cached = CacheManager.get(cacheKey);

    if (cached && !cached.isExpired) {
        // ✅ Кеш свежий - показываем мгновенно
        console.log(`📦 Загружены даты из кеша для ${serviceId} (свежие)`);
        State.availableDates = cached.data;
        renderCalendarDays(); // Сразу отрисовываем календарь

        // 🔄 В фоне обновляем данные от Make.com (stale-while-revalidate)
        console.log(`🔄 Обновление дат для ${serviceId} в фоне...`);
        loadAvailableDatesFromAPI(serviceId, cacheKey, CACHE_TTL, true);
        return;
    }

    if (cached && cached.isExpired) {
        // ⏰ Кеш устарел - показываем старые данные
        console.log(`📦 Загружены даты из кеша для ${serviceId} (устаревшие) - обновление...`);
        State.availableDates = cached.data;
        State.isLoadingDates = false;  // 🔧 HOTFIX v22: Есть данные из кеша - не показываем loading
        renderCalendarDays(); // Показываем старые данные
    } else if (!cached) {
        // 🔧 HOTFIX v23: Кеша нет - показываем loading
        State.isLoadingDates = true;
        console.log(`⏳ [loadAvailableDates] Нет кеша для ${serviceId} - показываем loading`);
        renderBookingScreen();  // 🔧 HOTFIX v23: Рендерим сразу чтобы показать спиннер "Загрузка дат..."
    }

    // 🌐 Загружаем свежие данные от Make.com
    await loadAvailableDatesFromAPI(serviceId, cacheKey, CACHE_TTL, false);
}

/**
 * [T-002] Вспомогательная функция для загрузки доступных дат из slots.json
 * @param {string} serviceId - ID услуги
 * @param {string} cacheKey - Ключ для сохранения в кеш
 * @param {number} cacheTTL - Время жизни кеша
 * @param {boolean} isBackground - Фоновая загрузка
 */
async function loadAvailableDatesFromAPI(serviceId, cacheKey, cacheTTL, isBackground = false) {
    try {
        // [T-002] Загружаем все слоты из Git
        const slotsData = await fetchSlotsFromGit();

        if (!slotsData) {
            throw new Error('Не удалось загрузить slots.json');
        }

        console.log(isBackground ? '🔄 Фоновое обновление дат из slots.json' : '📥 Данные из slots.json загружены');

        // [T-002] Фильтруем слоты по услуге
        const serviceSlots = filterSlotsByService(slotsData.slots, serviceId);

        // [T-002] Извлекаем доступные даты
        const dates = getAvailableDatesFromSlots(serviceSlots);

        // 📦 CACHE: Сохраняем в кеш (всегда, даже если услуга уже сменилась)
        CacheManager.set(cacheKey, dates, cacheTTL);

        // 🔧 HOTFIX v17: Проверяем что услуга не сменилась во время запроса
        if (State.selectedService !== serviceId) {
            console.log(`⏭️ Пропускаем обновление дат: услуга изменилась с ${serviceId} на ${State.selectedService}`);
            return;
        }

        // Сохраняем в state
        State.availableDates = dates;
        State.isLoadingDates = false;  // 🔧 HOTFIX v22: Сбрасываем флаг загрузки

        console.log('✅ Обработанные даты (State.availableDates):', State.availableDates);

        // Обновляем календарь
        renderCalendarDays();

    } catch (error) {
        // 🔧 HOTFIX: НЕ пробрасываем ошибку - она уже обработана в handleNetworkError
        console.error('❌ Ошибка загрузки дат:', {
            name: error?.name,
            message: error?.message,
            isCancelled: error?.isCancelled
        });

        // 🔧 HOTFIX v17: Проверяем что услуга не сменилась во время запроса
        if (State.selectedService !== serviceId) {
            console.log(`⏭️ Пропускаем обработку ошибки дат: услуга изменилась с ${serviceId} на ${State.selectedService}`);
            return; // Не обновляем State - это старый запрос
        }

        // 🔧 HOTFIX v22: Сбрасываем флаг загрузки при ошибке
        State.isLoadingDates = false;

        // 📦 CACHE: При ошибке пытаемся показать старые данные из кеша
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            console.log('📦 Показываем старые даты из кеша при ошибке');
            State.availableDates = cached.data;
            renderCalendarDays();
        } else {
            // Кеша нет - показываем пустой массив
            State.availableDates = [];
            renderCalendarDays();  // 🔧 HOTFIX v22: Рендерим календарь чтобы убрать спиннер
        }

        // НЕ пробрасываем ошибку - иначе получим unhandled rejection
        // Popup уже показан пользователю в handleNetworkError
    }
}

async function loadAvailableSlots(serviceId, date) {
    // 📦 CACHE: Ключ кеша для слотов услуги и даты
    const cacheKey = `slots_${serviceId}_${date}`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 минут

    // 📦 CACHE: Проверяем кеш перед загрузкой
    const cached = CacheManager.get(cacheKey);

    // 🔧 HOTFIX v20: Кеш уже обработан в selectDate, здесь только решаем делать ли фоновое обновление
    const isBackground = cached && !cached.isExpired;

    if (isBackground) {
        // ✅ Кеш свежий - только фоновое обновление
        console.log(`🔄 [loadAvailableSlots] Фоновое обновление для ${serviceId}/${date}`);
    } else {
        console.log(`🌐 [loadAvailableSlots] Загрузка от API для ${serviceId}/${date}`);
    }

    // 🌐 Загружаем данные от Make.com
    await loadAvailableSlotsFromAPI(serviceId, date, cacheKey, CACHE_TTL, isBackground);
}

/**
 * [T-002] Вспомогательная функция для загрузки доступных слотов из slots.json
 * @param {string} serviceId - ID услуги
 * @param {string} date - Дата в формате DD.MM.YYYY
 * @param {string} cacheKey - Ключ для сохранения в кеш
 * @param {number} cacheTTL - Время жизни кеша
 * @param {boolean} isBackground - Фоновая загрузка
 */
async function loadAvailableSlotsFromAPI(serviceId, date, cacheKey, cacheTTL, isBackground = false) {
    try {
        // [T-002] Загружаем все слоты из Git
        const slotsData = await fetchSlotsFromGit();

        if (!slotsData) {
            throw new Error('Не удалось загрузить slots.json');
        }

        console.log(isBackground ? '🔄 Фоновое обновление слотов из slots.json' : '📥 Данные из slots.json загружены');

        // [T-002] Фильтруем слоты по услуге
        const serviceSlots = filterSlotsByService(slotsData.slots, serviceId);

        // [T-002] Получаем слоты для конкретной даты
        const filteredSlots = getAvailableSlotsForDate(serviceSlots, date);

        // 📦 CACHE: Сохраняем в кеш (всегда, даже если дата уже сменилась)
        CacheManager.set(cacheKey, filteredSlots, cacheTTL);

        // 🔧 HOTFIX v17: Проверяем что дата не сменилась во время запроса
        // Если пользователь уже выбрал другую дату - не обновляем State
        if (State.selectedDate !== date) {
            console.log(`⏭️ Пропускаем обновление слотов: дата изменилась с ${date} на ${State.selectedDate}`);
            return;
        }

        // Сохраняем в state
        State.availableSlots = filteredSlots;

        console.log(`🎯 Слоты для даты ${date}:`, State.availableSlots);

        // 🔧 HOTFIX v18: Обновляем UI сразу после загрузки
        renderBookingScreen();

    } catch (error) {
        console.error('❌ Ошибка загрузки слотов:', {
            name: error?.name,
            isCancelled: error?.isCancelled
        });

        // 🔧 HOTFIX v17: Проверяем что дата не сменилась во время запроса
        // Если пользователь уже выбрал другую дату - не обновляем State
        if (State.selectedDate !== date) {
            console.log(`⏭️ Пропускаем обработку ошибки: дата изменилась с ${date} на ${State.selectedDate}`);
            return; // Не обновляем State и не показываем ошибку - это старый запрос
        }

        // 📦 CACHE: При ошибке пытаемся показать старые данные из кеша
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            console.log('📦 Показываем старые слоты из кеша при ошибке:', cached.data);
            State.availableSlots = cached.data;
            renderBookingScreen(); // 🔧 HOTFIX v18: Обновляем UI при fallback на кеш
        } else {
            // Кеша нет - показываем пустой массив
            State.availableSlots = [];
            // 🔧 HOTFIX v25: Не показываем error haptic при отменённых запросах
            if (tg.HapticFeedback && !error.isCancelled) {
                tg.HapticFeedback.notificationOccurred('error');
            }
            // Пробрасываем ошибку только если нет кеша
            throw error;
        }
    }
}

// ===== УПРАВЛЕНИЕ БРОНИРОВАНИЯМИ =====

async function loadUserBookings() {
    // 🔧 ИСПРАВЛЕНИЕ 12: Проверяем активность приложения
    if (!State.isAppActive) {
        console.log('⏸️ Приложение неактивно - отмена загрузки записей');
        return;
    }

    // 📦 CACHE: Ключ кеша для бронирований пользователя
    const cacheKey = `bookings_${USER.id}`;
    const CACHE_TTL = 5 * 60 * 1000; // 5 минут

    // 📦 CACHE: Проверяем кеш перед загрузкой
    const cached = CacheManager.get(cacheKey);

    if (cached && !cached.isExpired) {
        // ✅ Кеш свежий - показываем мгновенно
        console.log(`✅ [Cache] Данные актуальны: ${cacheKey} (возраст: ${Math.round(cached.age / 1000)}s)`);
        State.userBookings = cached.data;
        renderMyBookingsScreen(); // Сразу отрисовываем

        // 🔄 Оптимизация: обновляем в фоне только если кеш не очень свежий
        const FRESH_THRESHOLD = 10 * 1000; // 10 секунд
        if (cached.age > FRESH_THRESHOLD) {
            console.log('🔄 Обновление бронирований в фоне...');
            loadUserBookingsFromAPI(cacheKey, CACHE_TTL, true); // background = true
        } else {
            console.log(`⚡ Кеш очень свежий (${Math.round(cached.age / 1000)}s) - пропуск фонового обновления`);
        }
        return;
    }

    if (cached && cached.isExpired) {
        // ⏰ Кеш устарел - показываем старые данные, но с индикатором загрузки
        console.log('📦 Загружены бронирования из кеша (устаревшие) - обновление...');
        State.userBookings = cached.data;
        State.isLoadingBookings = false;  // 🔧 HOTFIX v22: Есть данные из кеша - не показываем loading
        renderMyBookingsScreen(); // Показываем старые данные
    } else if (!cached) {
        // 🔧 HOTFIX v22: Кеша нет - показываем loading
        State.isLoadingBookings = true;
        console.log(`⏳ [loadUserBookings] Нет кеша - показываем loading`);
        renderMyBookingsScreen();  // Рендерим сразу чтобы показать спиннер
    }

    // 🌐 Загружаем свежие данные от Make.com
    showLoader();
    await loadUserBookingsFromAPI(cacheKey, CACHE_TTL, false);
}

/**
 * Вспомогательная функция для загрузки бронирований от API
 * @param {string} cacheKey - Ключ для сохранения в кеш
 * @param {number} cacheTTL - Время жизни кеша
 * @param {boolean} isBackground - Фоновая загрузка (без loader)
 */
async function loadUserBookingsFromAPI(cacheKey, cacheTTL, isBackground = false) {
    try {
        const result = await BookingAPI.getUserBookings();
        console.log(isBackground ? '🔄 Фоновое обновление бронирований:' : '📥 Бронирования пользователя:', result);

        let bookings = [];
        if (result.bookings && result.bookings.array) {
            // Обрабатываем массив бронирований
            bookings = result.bookings.array.map(booking => ({
                id: booking["0"] || booking.id,
                date: booking["1"] || booking.date,
                time: booking["2"] || booking.start_time,
                service: booking["5"] || booking.service,
                status: booking["7"] || booking.status,
                zoom_link: booking["12"] || booking.zoom_link,
                locked_until: booking["22"] || booking.locked_until
            })).filter(b => b.id && b.date && b.time);  // Фильтруем пустые
        }

        // Сохраняем в state
        State.userBookings = bookings;
        State.isLoadingBookings = false;  // 🔧 HOTFIX v22: Сбрасываем флаг загрузки

        // 📦 CACHE: Сохраняем в кеш
        CacheManager.set(cacheKey, bookings, cacheTTL);

        console.log('✅ Обработанные бронирования:', State.userBookings);

        // Обновляем UI если это не фоновая загрузка
        if (!isBackground) {
            hideLoader();
            renderMyBookingsScreen();
        } else {
            // При фоновой загрузке просто обновляем UI без loader
            renderMyBookingsScreen();
        }
    } catch (error) {
        // 🔧 HOTFIX: НЕ пробрасываем ошибку и НЕ показываем дублирующий alert
        // Ошибка уже обработана в handleNetworkError (показан popup)
        console.error('❌ Ошибка загрузки бронирований:', error);

        // 🔧 HOTFIX v22: Сбрасываем флаг загрузки при ошибке
        State.isLoadingBookings = false;

        // 📦 CACHE: При ошибке пытаемся показать старые данные из кеша
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            console.log('📦 Показываем старые данные из кеша при ошибке');
            State.userBookings = cached.data;
            if (!isBackground) {
                hideLoader();
            }
            renderMyBookingsScreen();
        } else {
            // Кеша нет - показываем пустой массив
            State.userBookings = [];
            if (!isBackground) {
                hideLoader();
            }
            renderMyBookingsScreen();  // 🔧 HOTFIX v22: Рендерим чтобы убрать спиннер
        }

        // НЕ показываем дублирующий alert - popup уже показан в handleNetworkError
        // НЕ пробрасываем ошибку - иначе получим unhandled rejection
    }
}

/**
 * Отменяет бронирование слота
 * @param {string} slotId - ID слота для отмены
 */
async function cancelBooking(slotId) {
    console.log('🚫 [cancelBooking] Запрос на отмену слота:', slotId);

    // Haptic feedback
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }

    // Показываем модальное окно подтверждения
    tg.showPopup({
        title: 'Отмена записи',
        message: 'Вы уверены, что хотите отменить запись?',
        buttons: [
            { id: 'cancel', type: 'cancel', text: 'Назад' },
            { id: 'confirm', type: 'destructive', text: 'Отменить запись' }
        ]
    }, async (buttonId) => {
        if (buttonId !== 'confirm') {
            console.log('❌ [cancelBooking] Отмена отменена пользователем');
            return;
        }

        console.log('✅ [cancelBooking] Подтверждение получено, начинаем отмену');

        // Показываем loading modal
        showLoadingModal('Отмена бронирования...');

        try {
            const result = await BookingAPI.cancelBooking(slotId);
            hideLoadingModal();

            if (result.success) {
                console.log('✅ [cancelBooking] Запись успешно отменена');

                // Haptic feedback успеха
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }

                // Показываем кастомный попап успеха
                showSuccessPopup('Готово', 'Запись отменена');

                // 🗑️ CACHE: Инвалидируем кеш после отмены бронирования
                console.log('🗑️ Инвалидация кеша после отмены бронирования...');
                CacheManager.clear(`bookings_${USER.id}`);
                CacheManager.clear('slots_json');
                CacheManager.clearPattern('dates_');
                CacheManager.clearPattern('slots_');

                // Обновляем список бронирований
                await loadUserBookings();
                renderMyBookingsScreen();
            } else {
                throw new Error(result.error || 'Не удалось отменить запись');
            }
        } catch (error) {
            hideLoadingModal();
            console.error('❌ [cancelBooking] Ошибка отмены:', error);

            // Haptic feedback ошибки
            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('error');
            }

            // Показываем сообщение об ошибке
            tg.showPopup({
                title: 'Ошибка',
                message: 'Не удалось отменить запись. Попробуйте позже.',
                buttons: [{ type: 'ok' }]
            });
        }
    });
}

// ===== НАВИГАЦИЯ МЕЖДУ ТАБАМИ =====

function switchTab(tabName) {
    // 🔧 ИСПРАВЛЕНИЕ 14: Отменяем все активные запросы при переключении таба
    Object.keys(State.requestControllers).forEach(context => {
        if (State.requestControllers[context]) {
            State.requestControllers[context].abort();
            delete State.requestControllers[context];
        }
    });
    
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
        State.selectedSlotId = null;
        State.availableDates = [];
        State.availableSlots = [];
    }
    
    switch(tabName) {
        case 'services':
            renderServicesScreen();
            break;
        case 'booking':
            renderBookingScreen();
            break;
        case 'club':
            // [T-005] Вкладка "Клуб"
            // Показываем loader через renderClubScreen (он сам обрабатывает isLoadingClub)
            State.isLoadingClub = true;
            renderClubScreen();

            // Загружаем данные клуба (с кешем 60 сек)
            loadClubData()
                .then(() => {
                    // Проверяем что мы всё ещё на том же табе
                    if (State.currentTab === 'club') {
                        renderClubScreen();
                    }
                })
                .catch((error) => {
                    console.error('❌ [switchTab:club] Ошибка загрузки данных клуба:', error);
                    // Рендерим экран даже при ошибке (renderClubScreen показывает fallback UI)
                    if (State.currentTab === 'club') {
                        renderClubScreen();
                    }
                });
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
        'Пакет консультаций': 'Лучшее решение для работы с психологом',
        'Семейная консультация': 'Работа с парой или семьёй, длительность 2 часа',
        'Индивидуальная консультация': 'Персональная консультация с психологом, 1 час'
    };
    return descriptions[serviceName] || '';
}

// ===== [T-005] ФУНКЦИИ КЛУБА =====

/**
 * Рассчитывает следующие N воскресений начиная с указанной даты
 * @param {Date} startDate - Дата начала отсчета
 * @param {number} count - Количество воскресений (по умолчанию 4)
 * @returns {Date[]} Массив дат воскресений
 */
function getNextSundays(startDate, count = 4) {
    try {
        // Валидация входных данных
        if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
            console.error('getNextSundays: невалидная дата', startDate);
            return [];
        }

        if (count < 1) {
            console.error('getNextSundays: count должен быть >= 1', count);
            return [];
        }

        const sundays = [];
        const current = new Date(startDate);

        // Находим ближайшее воскресенье (день недели 0)
        const daysUntilSunday = (7 - current.getDay()) % 7;

        // Если сегодня не воскресенье, переходим к ближайшему
        if (daysUntilSunday > 0) {
            current.setDate(current.getDate() + daysUntilSunday);
        }
        // Если сегодня воскресенье, берём следующее
        else if (current.getDay() === 0) {
            current.setDate(current.getDate() + 7);
        }

        // Собираем N воскресений
        for (let i = 0; i < count; i++) {
            sundays.push(new Date(current));
            current.setDate(current.getDate() + 7);  // +7 дней для следующего воскресенья
        }

        return sundays;
    } catch (error) {
        console.error('getNextSundays: ошибка при расчете воскресений', error);
        return [];
    }
}

/**
 * Загружает данные о платежах клуба из club.json
 * @param {boolean} forceRefresh - Игнорировать кеш и загрузить свежие данные
 * @returns {Promise<void>}
 */
async function loadClubData(forceRefresh = false) {
    const cacheKey = 'club_data';
    const cacheTTL = 60000; // 60 секунд

    try {
        State.isLoadingClub = true;

        // Проверяем кеш (если не форсируем обновление)
        if (!forceRefresh) {
            const cached = CacheManager.get(cacheKey);
            if (cached && !cached.isExpired) {
                console.log('✅ [loadClubData] Используем кеш');
                const clubData = cached.data;

            // Фильтруем payments по текущему user_id (user_id в JSON — строка)
            State.clubPayments = clubData.payments.filter(p => String(p.user_id) === String(USER.id));
            State.clubZoomLink = clubData.zoom_link || '';
            console.log(`📋 [loadClubData] Найдено ${State.clubPayments.length} платежей для пользователя ${USER.id}`);

            // Сбрасываем флаг создания встреч если платежи появились
            if (State.clubPayments.length > 0 && State.clubPaymentProcessing) {
                State.clubPaymentProcessing = false;
                localStorage.removeItem('clubPaymentProcessing');
                console.log('✅ [loadClubData] Встречи появились - сбрасываем флаг clubPaymentProcessing');
            }

            State.isLoadingClub = false;
            return;
            }
        }

        // Загружаем из GitHub
        console.log('🌐 [loadClubData] Загрузка из GitHub:', CONFIG.CLUB_JSON_URL);

        const response = await fetch(`${CONFIG.CLUB_JSON_URL}?t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(5000) // 5 секунд timeout
        });

        if (!response.ok) {
            throw new Error(`GitHub HTTP ${response.status}`);
        }

        const clubData = await response.json();

        // Валидация структуры
        if (!clubData.payments || !Array.isArray(clubData.payments)) {
            throw new Error('Invalid club.json structure: missing payments array');
        }

        if (!clubData.zoom_link) {
            console.warn('⚠️ club.json не содержит zoom_link');
        }

        console.log(`✅ [loadClubData] Загружено ${clubData.payments.length} платежей из GitHub`);

        // Сохраняем в кеш
        CacheManager.set(cacheKey, clubData, cacheTTL);

        // Фильтруем payments по текущему user_id (user_id в JSON — строка)
        State.clubPayments = clubData.payments.filter(p => String(p.user_id) === String(USER.id));
        State.clubZoomLink = clubData.zoom_link || '';
        console.log(`📋 [loadClubData] Найдено ${State.clubPayments.length} платежей для пользователя ${USER.id}`);

        // Сбрасываем флаг создания встреч если платежи появились
        if (State.clubPayments.length > 0 && State.clubPaymentProcessing) {
            State.clubPaymentProcessing = false;
            console.log('✅ [loadClubData] Встречи появились - сбрасываем флаг clubPaymentProcessing');
        }

        State.isLoadingClub = false;

    } catch (error) {
        State.isLoadingClub = false;

        console.error('❌ [loadClubData] Ошибка загрузки:', error.message);

        // Попытка использовать устаревший кеш при ошибке
        const cached = CacheManager.get(cacheKey);
        if (cached) {
            console.log('📦 [loadClubData] Используем устаревший кеш при ошибке');
            const clubData = cached.data;
            State.clubPayments = clubData.payments.filter(p => p.user_id === USER.id);
            State.clubZoomLink = clubData.zoom_link || '';
            return;
        }

        // Нет ни свежих данных, ни кеша
        State.clubPayments = [];
        State.clubZoomLink = '';
        showToast('Не удалось загрузить данные клуба');
    }
}

/**
 * Рендерит HTML карточки встречи клуба
 * @param {Object} meeting - Объект встречи
 * @param {Date} meeting.date - Дата встречи
 * @param {string} meeting.time - Время встречи (например, "17:00")
 * @param {string} meeting.zoomLink - Ссылка на Zoom встречу
 * @returns {string} HTML строка карточки встречи
 */
function renderClubMeetingCard(meeting) {
    try {
        // Валидация входных данных
        if (!meeting || !(meeting.date instanceof Date) || isNaN(meeting.date.getTime())) {
            console.error('renderClubMeetingCard: невалидная дата', meeting);
            return '';
        }

        if (!meeting.time || typeof meeting.time !== 'string') {
            console.error('renderClubMeetingCard: невалидное время', meeting);
            return '';
        }

        if (!meeting.zoomLink || typeof meeting.zoomLink !== 'string') {
            console.error('renderClubMeetingCard: невалидная ссылка Zoom', meeting);
            return '';
        }

        // Форматируем дату: "Воскресенье, 16 февраля"
        const dayName = meeting.date.toLocaleDateString('ru-RU', { weekday: 'long' });
        const day = meeting.date.getDate();
        const monthName = meeting.date.toLocaleDateString('ru-RU', { month: 'long' });
        const formattedDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${day} ${monthName}`;

        // Проверка: встреча в прошлом?
        const now = new Date();
        const isPast = meeting.date < now;

        return `
            <div class="service-card glass-card ${isPast ? 'meeting-past' : ''}">
                <div class="service-header">
                    <div class="service-icon">📅</div>
                    <div class="service-info">
                        <div class="service-name">${formattedDate}</div>
                        <div class="service-duration">${meeting.time}</div>
                    </div>
                </div>
                ${isPast ? `
                    <div class="service-footer">
                        <div class="service-price" style="opacity: 0.5;">Встреча завершена</div>
                    </div>
                ` : `
                    <div class="service-footer">
                        <button class="service-btn" onclick="openZoomLink('${escapeHtml(meeting.zoomLink)}')">
                            Подключиться к Zoom →
                        </button>
                    </div>
                `}
            </div>
        `;
    } catch (error) {
        console.error('renderClubMeetingCard: ошибка рендеринга', error);
        return '';
    }
}

/**
 * Рендерит экран вкладки "Клуб"
 * @returns {void}
 *
 * Security note: Использует innerHTML только с безопасными данными:
 * - CONFIG константы (не пользовательский ввод)
 * - formatPrice() (Intl.NumberFormat - безопасно)
 * - renderClubMeetingCard() (использует escapeHtml для zoomLink)
 */
function renderClubScreen() {
    try {
        const container = document.getElementById('app');

        // 1. Показываем loader при загрузке
        if (State.isLoadingClub) {
            container.innerHTML = `
                <h1 class="screen-title fade-in">Встречи клуба - каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}</h1>
                <div class="services-grid fade-in">
                    <div class="service-card glass-card" style="text-align: center; padding: 40px 20px;">
                        <div class="dates-spinner"></div>
                        <p style="margin-top: 20px; color: var(--tg-theme-hint-color, #999);">Загрузка данных клуба...</p>
                    </div>
                </div>
            `;
            return;
        }

        // 2. Разделяем платежи на success и pending
        const successPayments = State.clubPayments.filter(p => p.status === 'succeeded');
        const pendingPayments = State.clubPayments.filter(p => p.status === 'pending');

        // 3. Если нет success, но есть pending - показываем "Ожидает оплаты"
        if (successPayments.length === 0 && pendingPayments.length > 0) {
            const pendingPayment = pendingPayments[0]; // Берём первый pending

            container.innerHTML = `
                <h1 class="screen-title fade-in">Встречи клуба - каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}</h1>
                <div class="services-grid fade-in">
                    <div class="service-card glass-card">
                        <div class="service-header">
                            <div class="service-icon">⏳</div>
                            <div class="service-info">
                                <div class="service-name">Ожидает оплаты</div>
                                <div class="service-duration">Платёж ${pendingPayment.payment_id.slice(0, 8)}...</div>
                            </div>
                        </div>
                        <div class="service-description">
                            Платёж создан, но ещё не оплачен. Если вы закрыли окно оплаты, вернитесь в него или создайте новый платёж.
                        </div>
                        <div class="service-footer" style="display: flex; gap: 10px;">
                            <button class="service-btn" onclick="switchTab('club')" style="flex: 1; background: var(--tg-theme-button-color, #3390ec);">
                                Обновить →
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // 4. Если нет платежей вообще
        if (State.clubPayments.length === 0) {
            // 4a. Если оплата в процессе (GitHub deployment delay) - показываем лоадер
            if (State.clubPaymentProcessing) {
                container.innerHTML = `
                    <h1 class="screen-title fade-in">Встречи клуба - каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}</h1>
                    <div class="services-grid fade-in">
                        <div class="service-card glass-card">
                            <div class="service-header">
                                <div class="service-icon">
                                    <div class="spinner"></div>
                                </div>
                                <div class="service-info">
                                    <div class="service-name">Проверяем оплату...</div>
                                    <div class="service-duration">Это может занять до 3 минут</div>
                                </div>
                            </div>
                            <div class="service-description">
                                Приглашение на встречи клуба появится автоматически после подтверждения платежа.
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            // 4b. Обычная карточка "Вступить в клуб"
            container.innerHTML = `
                <h1 class="screen-title fade-in">Встречи клуба - каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}</h1>
                <div class="services-grid fade-in">
                    <div class="service-card glass-card">
                        <div class="service-header">
                            <div class="service-icon">🏛️</div>
                            <div class="service-info">
                                <div class="service-name">Вступить в клуб</div>
                                <div class="service-duration">4 встречи по воскресеньям</div>
                            </div>
                        </div>
                        <div class="service-description">
                            Эксклюзивный клуб встреч каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}. Абонемент на 4 встречи с доступом к закрытой Zoom-комнате.
                        </div>
                        <div class="service-footer">
                            <div class="service-price">${formatPrice(CONFIG.CLUB.PRICE)}</div>
                            <button class="service-btn" onclick="handleClubPayment()">
                                Купить абонемент →
                            </button>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // 5. Есть success платежи - показываем карточки встреч
        // Берём последний success платёж (самый свежий по paid_at)
        const latestPayment = successPayments.reduce((latest, current) => {
            const latestDate = new Date(latest.paid_at);
            const currentDate = new Date(current.paid_at);
            return currentDate > latestDate ? current : latest;
        }, successPayments[0]);

        // Рассчитываем 4 воскресенья от даты платежа
        const paidDate = new Date(latestPayment.paid_at);
        const sundays = getNextSundays(paidDate, CONFIG.CLUB.MEETINGS_COUNT);

        // Фильтруем прошедшие встречи (сравниваем только даты, без времени)
        const now = new Date();
        now.setHours(0, 0, 0, 0);  // Обнуляем время для корректного сравнения

        const upcomingMeetings = sundays.filter(sunday => {
            const meetingDate = new Date(sunday);
            meetingDate.setHours(0, 0, 0, 0);
            return meetingDate >= now;
        });

        // Формируем карточки встреч
        const meetingCards = sundays.map(sunday => {
            return renderClubMeetingCard({
                date: sunday,
                time: CONFIG.CLUB.MEETING_TIME,
                zoomLink: State.clubZoomLink
            });
        }).join('');

        // Если все встречи прошли - показываем кнопку "Купить следующий абонемент"
        const renewButton = upcomingMeetings.length === 0 ? `
            <div class="service-card glass-card" style="margin-top: 20px;">
                <div class="service-header">
                    <div class="service-icon">🎫</div>
                    <div class="service-info">
                        <div class="service-name">Все встречи завершены</div>
                        <div class="service-duration">Купите следующий абонемент</div>
                    </div>
                </div>
                <div class="service-footer">
                    <div class="service-price">${formatPrice(CONFIG.CLUB.PRICE)}</div>
                    <button class="service-btn" onclick="handleClubPayment()">
                        Купить следующий абонемент →
                    </button>
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <h1 class="screen-title fade-in">Встречи клуба - каждое воскресенье в ${CONFIG.CLUB.MEETING_TIME}</h1>
            <div class="services-grid fade-in">
                ${meetingCards}
                ${renewButton}
            </div>
        `;

    } catch (error) {
        console.error('❌ [renderClubScreen] Ошибка рендеринга:', error);

        // Fallback UI при ошибке
        document.getElementById('app').innerHTML = `
            <h1 class="screen-title fade-in">Встречи клуба</h1>
            <div class="services-grid fade-in">
                <div class="service-card glass-card" style="text-align: center; padding: 40px 20px;">
                    <p style="color: var(--tg-theme-destructive-text-color, #ff3b30);">
                        Ошибка загрузки данных клуба
                    </p>
                    <button class="service-btn" onclick="switchTab('club')" style="margin-top: 20px;">
                        Попробовать снова
                    </button>
                </div>
            </div>
        `;
    }
}

/**
 * Показывает модальное окно подтверждения покупки абонемента клуба
 * @param {Object} paymentData - данные платежа
 * @param {string} paymentData.payment_url - URL для оплаты
 * @param {string} paymentData.payment_id - ID платежа
 */
function showClubPaymentConfirmModal(paymentData) {
    try {
        console.log('💳 [showClubPaymentConfirmModal] Показ модального окна:', paymentData);

        // Haptic feedback
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }

        // Получаем даты следующих 4 воскресений
        const nextSundays = getNextSundays(new Date(), 4);
        const sundaysText = nextSundays
            .map(date => formatDateDMY(date))
            .join(', ');

        // Форматируем сумму
        const formattedPrice = CONFIG.CLUB.PRICE.toLocaleString('ru-RU');

        // Создаём HTML модального окна
        const modalHTML = `
            <div class="payment-modal-overlay" id="clubPaymentModalOverlay">
                <div class="payment-modal">
                    <div class="payment-modal-header">
                        <span>🎯</span>
                        <h2>Абонемент в клуб</h2>
                    </div>
                    <div class="payment-modal-body">
                        <div class="payment-detail">
                            <div class="payment-detail-label">Встречи</div>
                            <div class="payment-detail-value">${CONFIG.CLUB.MEETINGS_COUNT} воскресенья в ${CONFIG.CLUB.MEETING_TIME}</div>
                        </div>
                        <div class="payment-detail">
                            <div class="payment-detail-label">Даты</div>
                            <div class="payment-detail-value" style="font-size: 13px; line-height: 1.4;">${sundaysText}</div>
                        </div>
                        <div class="payment-amount">
                            <div class="payment-amount-label">Сумма к оплате</div>
                            <div class="payment-amount-value">${formattedPrice} ₽</div>
                        </div>
                    </div>
                    <div class="payment-modal-footer">
                        <button class="payment-modal-button payment-modal-button-primary" id="clubPaymentConfirmBtn">
                            Оплатить ${formattedPrice} ₽
                        </button>
                        <button class="payment-modal-button payment-modal-button-secondary" id="clubPaymentCancelBtn">
                            Отмена
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модалку в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Получаем элементы
        const overlay = document.getElementById('clubPaymentModalOverlay');
        const confirmBtn = document.getElementById('clubPaymentConfirmBtn');
        const cancelBtn = document.getElementById('clubPaymentCancelBtn');

        // Функция закрытия модалки
        const closeModal = () => {
            console.log('🚪 [showClubPaymentConfirmModal] Закрытие модального окна');

            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
            }, 300); // Время анимации fadeOut
        };

        // Обработчик кнопки "Оплатить"
        confirmBtn.addEventListener('click', () => {
            console.log('✅ [showClubPaymentConfirmModal] Нажата кнопка "Оплатить"');

            // Haptic feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }

            // Закрываем модалку
            closeModal();

            // Открываем окно оплаты
            openPaymentWindow(paymentData.payment_url);

            // Устанавливаем флаг проверки оплаты (покажем карточку с лоадером)
            State.clubPaymentProcessing = true;
            localStorage.setItem('clubPaymentProcessing', 'true');

            // Переключаемся на вкладку "Клуб" чтобы показать лоадер
            switchTab('club');

            // Запускаем polling club.json в фоне (без блокирующей модалки)
            startClubPaymentPolling();
        });

        // Обработчик кнопки "Отмена"
        cancelBtn.addEventListener('click', () => {
            console.log('❌ [showClubPaymentConfirmModal] Нажата кнопка "Отмена"');

            // Haptic feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }

            closeModal();
        });

        // Обработчик клика вне модалки (на overlay)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log('🚪 [showClubPaymentConfirmModal] Клик вне модалки - закрытие');

                // Haptic feedback
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }

                closeModal();
            }
        });

        console.log('✅ [showClubPaymentConfirmModal] Модальное окно показано');

    } catch (error) {
        console.error('❌ [showClubPaymentConfirmModal] Ошибка показа модального окна:', error);
        tg.showAlert('Не удалось показать окно подтверждения');
    }
}

/**
 * Показывает модалку успешной оплаты (когда встречи ещё создаются)
 */
function showClubPaymentSuccessModal() {
    try {
        console.log('✅ [showClubPaymentSuccessModal] Показ модального окна успешной оплаты');

        // Haptic feedback
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('success');
        }

        // Создаём HTML модального окна (упрощённая версия)
        const modalHTML = `
            <div class="payment-modal-overlay" id="clubSuccessModalOverlay">
                <div class="payment-modal">
                    <div class="payment-modal-header">
                        <span>✅</span>
                        <h2>Оплата прошла!</h2>
                    </div>
                    <div class="payment-modal-body">
                        <p style="text-align: center; color: var(--tg-theme-hint-color); margin: 0;">
                            Приглашение на встречи клуба появится через 2-3 минуты
                        </p>
                    </div>
                    <div class="payment-modal-footer">
                        <button class="payment-modal-button payment-modal-button-primary" id="clubSuccessCloseBtn">
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Добавляем модалку в DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Получаем элементы
        const overlay = document.getElementById('clubSuccessModalOverlay');
        const closeBtn = document.getElementById('clubSuccessCloseBtn');

        // Функция закрытия модалки
        const closeModal = () => {
            console.log('🚪 [showClubPaymentSuccessModal] Закрытие модального окна');
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        };

        // Обработчик кнопки "Закрыть"
        closeBtn.addEventListener('click', () => {
            console.log('✅ [showClubPaymentSuccessModal] Нажата кнопка "Закрыть"');

            // Haptic feedback
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }

            closeModal();

            // Переключаемся на таб "Клуб" (покажет placeholder)
            if (State.currentTab !== 'club') {
                switchTab('club');
            }
        });

        // Обработчик клика вне модалки (на overlay)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                console.log('🚪 [showClubPaymentSuccessModal] Клик вне модалки - закрытие');

                // Haptic feedback
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }

                closeModal();
            }
        });

        console.log('✅ [showClubPaymentSuccessModal] Модальное окно показано');

    } catch (error) {
        console.error('❌ [showClubPaymentSuccessModal] Ошибка показа модального окна:', error);
        showToast('Встречи появятся через 2-3 минуты. Обновите вкладку "Клуб".');
    }
}

/**
 * Запускает медленный фоновый polling club.json (после таймаута быстрого)
 * Опрашивает каждые 10 секунд, максимум 30 попыток (5 минут)
 */
function startBackgroundPolling() {
    console.log('🕒 [startBackgroundPolling] Начало фонового опроса');

    const maxBackgroundAttempts = 30;  // 30 × 10 сек = 5 минут
    const backgroundInterval = 10000; // 10 секунд
    let backgroundAttempts = 0;

    const backgroundPoll = async () => {
        backgroundAttempts++;
        console.log(`🕒 [startBackgroundPolling] Фоновый опрос (попытка ${backgroundAttempts}/${maxBackgroundAttempts})`);

        try {
            // Принудительно загружаем свежие данные
            const response = await fetch(CONFIG.CLUB_JSON_URL + '?t=' + Date.now(), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                throw new Error(`GitHub HTTP ${response.status}`);
            }

            const clubData = await response.json();
            const userPayments = clubData.payments.filter(p => String(p.user_id) === String(USER.id));
            const successPayments = userPayments.filter(p => p.status === 'succeeded');
            const hadSuccess = State.clubPayments.some(p => p.status === 'succeeded');

            console.log(`🕒 [DEBUG] Background poll: successPayments=${successPayments.length}, hadSuccess=${hadSuccess}`);

            if (successPayments.length > 0 && !hadSuccess) {
                console.log('✅ [startBackgroundPolling] Платёж найден в фоновом опросе!');

                // Обновляем кеш и State
                CacheManager.set('club_data', clubData, 60000);
                State.clubPayments = userPayments;
                State.clubZoomLink = clubData.zoom_link || '';

                // Перерендериваем экран
                if (State.currentTab === 'club') {
                    renderClubScreen();
                }

                // Haptic feedback успеха
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }

                showToast('✅ Абонемент успешно куплен!');
                return; // Прекращаем фоновый опрос
            }

            // Продолжаем опрос если не исчерпан лимит
            if (backgroundAttempts < maxBackgroundAttempts) {
                setTimeout(backgroundPoll, backgroundInterval);
            } else {
                console.warn('⏱️ [startBackgroundPolling] Превышен лимит фонового опроса (5 минут)');
                console.log('ℹ️ [startBackgroundPolling] Переключите вкладку "Клуб" для обновления');
            }

        } catch (error) {
            console.error('❌ [startBackgroundPolling] Ошибка фонового опроса:', error);

            // При ошибке продолжаем попытки
            if (backgroundAttempts < maxBackgroundAttempts) {
                setTimeout(backgroundPoll, backgroundInterval);
            }
        }
    };

    // Запускаем первую попытку фонового polling
    backgroundPoll();
}

/**
 * Запускает polling club.json для проверки оплаты
 */
function startClubPaymentPolling() {
    console.log('🔄 [startClubPaymentPolling] Начало опроса club.json');

    // Опрашиваем club.json каждые 2 секунды (макс 15 попыток = 30 сек)
    const maxAttempts = 15;  // 30 секунд - достаточно для быстрой проверки
    const pollInterval = 2000; // 2 секунды
    let attempts = 0;

    const pollClubData = async () => {
        attempts++;
        console.log(`🔄 [startClubPaymentPolling] Опрос club.json (попытка ${attempts}/${maxAttempts})`);

        try {
            // Принудительно загружаем свежие данные (игнорируем кеш)
            const response = await fetch(CONFIG.CLUB_JSON_URL + '?t=' + Date.now(), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                throw new Error(`GitHub HTTP ${response.status}`);
            }

            const clubData = await response.json();
            const userPayments = clubData.payments.filter(p => String(p.user_id) === String(USER.id));

            // 🔍 DEBUG: что нашли в club.json
            console.log(`🔍 [DEBUG] Total payments: ${clubData.payments.length}, User payments: ${userPayments.length}`);
            console.log(`🔍 [DEBUG] State.clubPayments.length: ${State.clubPayments.length}`);

            // Проверяем появление success платежа (вместо проверки длины массива)
            const successPayments = userPayments.filter(p => p.status === 'succeeded');
            const hadSuccess = State.clubPayments.some(p => p.status === 'succeeded');

            console.log(`🔍 [DEBUG] successPayments: ${successPayments.length}, hadSuccess: ${hadSuccess}`);

            if (successPayments.length > 0 && !hadSuccess) {
                console.log('✅ [startClubPaymentPolling] Новый платёж найден!');

                // Обновляем кеш
                CacheManager.set('club_data', clubData, 60000);

                // Обновляем State
                State.clubPayments = userPayments;
                State.clubZoomLink = clubData.zoom_link || '';

                // Перерендериваем экран
                if (State.currentTab === 'club') {
                    renderClubScreen();
                }

                // Haptic feedback успеха
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('success');
                }

                showToast('✅ Абонемент успешно куплен!');
                return; // Прекращаем опрос
            }

            // Если платёж ещё не появился и есть попытки - повторяем
            if (attempts < maxAttempts) {
                setTimeout(pollClubData, pollInterval);
            } else {
                // Превышен лимит попыток быстрого опроса (30 сек)
                console.warn('⏱️ [startClubPaymentPolling] Превышен лимит быстрого опроса');
                console.log('🕒 [startClubPaymentPolling] Запускаем медленный фоновый опрос (каждые 10 сек)');

                // Запускаем медленный фоновый polling
                startBackgroundPolling();

                // Перерендериваем экран клуба (покажет лоадер)
                if (State.currentTab === 'club') {
                    renderClubScreen();
                }
            }

        } catch (error) {
            console.error('❌ [startClubPaymentPolling] Ошибка опроса club.json:', error);

            // При ошибке продолжаем попытки если не исчерпан лимит
            if (attempts < maxAttempts) {
                setTimeout(pollClubData, pollInterval);
            } else {
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('error');
                }

                showToast('Ошибка проверки оплаты. Переключите таб "Клуб" через минуту для обновления.');
            }
        }
    };

    // Запускаем первую попытку
    pollClubData();
}

/**
 * Обрабатывает покупку абонемента клуба
 * @returns {Promise<void>}
 */
async function handleClubPayment() {
    // Защита от двойного клика
    if (State.isCreatingPayment) {
        console.log('⚠️ [handleClubPayment] Платёж уже создаётся - игнорируем клик');
        return;
    }

    State.isCreatingPayment = true;

    try {
        console.log('💳 [handleClubPayment] Начало покупки абонемента клуба');

        // Haptic feedback при клике
        if (tg.HapticFeedback) {
            tg.HapticFeedback.selectionChanged();
        }

        // Показываем loading modal
        showLoadingModal('Создание платежа...');

        // Создаём платёж для клуба
        const paymentResult = await BookingAPI.request('create_payment', {
            service: 'club'
            // amount НЕ передаём - Make.com сам определяет по service_id из CONFIG.SERVICE_PRICES
        });

        // Скрываем loading modal
        hideLoadingModal();

        // Проверяем результат
        if (!paymentResult || !paymentResult.payment_url) {
            throw new Error('Не получен payment_url от сервера');
        }

        console.log('✅ [handleClubPayment] Платёж создан, показываем модалку подтверждения');

        // Показываем модалку подтверждения с информацией о клубе
        showClubPaymentConfirmModal({
            payment_url: paymentResult.payment_url,
            payment_id: paymentResult.payment_id
        });

    } catch (error) {
        // Скрываем loading modal в случае ошибки
        hideLoadingModal();

        console.error('❌ [handleClubPayment] Ошибка создания платежа:', error);

        // Не показываем ошибку если запрос был отменён
        if (error.name === 'AbortError' || error.isCancelled) {
            console.log('ℹ️ [handleClubPayment] Запрос отменён');
            return;
        }

        // Haptic feedback ошибки
        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }

        showToast('Не удалось создать платёж. Попробуйте позже.');

    } finally {
        // Всегда снимаем флаг в конце
        State.isCreatingPayment = false;
    }
}

/**
 * Открывает Zoom-ссылку встречи клуба
 * @param {string} zoomLink - URL Zoom-встречи
 * @returns {void}
 */
function openZoomLink(zoomLink) {
    try {
        console.log('🎥 [openZoomLink] Открытие Zoom-встречи:', zoomLink);

        // Haptic feedback при клике
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }

        // Открываем Zoom-ссылку через Telegram
        tg.openLink(zoomLink);

        console.log('✅ [openZoomLink] Zoom-ссылка открыта');

    } catch (error) {
        console.error('❌ [openZoomLink] Ошибка открытия Zoom:', error);

        if (tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }

        showToast('Не удалось открыть Zoom. Попробуйте позже.');
    }
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

    // Обработчик клика вне error-popup для закрытия
    const errorPopupOverlay = document.getElementById('error-popup-overlay');
    if (errorPopupOverlay) {
        errorPopupOverlay.addEventListener('click', (e) => {
            // Закрываем только при клике на overlay (не на сам попап)
            if (e.target === errorPopupOverlay) {
                hideSlotTakenPopup();
            }
        });
    }
    
    await loadServices();
    renderServicesScreen();

    // 🔧 Обработка автоматического перехода на вкладку "Клуб" (для YooKassa return_url)
    // Ссылка формата: https://t.me/Testarinalnk_bot/app?startapp=club
    const startParam = tg.initDataUnsafe?.start_param;
    if (startParam === 'club') {
        console.log('🔗 [initApp] Обнаружен start_param=club - переключаем на вкладку Клуб');
        switchTab('club');
    }

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
