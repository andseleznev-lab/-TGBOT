// api.js - API модуль для работы с Make.com webhook

// AbortController для отмены запросов
let currentController = null;

// Кэш для запросов
const cache = new Map();
const CACHE_TTL = 60000; // 60 секунд

// Таймаут запросов
const REQUEST_TIMEOUT = 30000; // 30 секунд

// Получаем данные пользователя из Telegram
function getUserData() {
    const tg = window.Telegram?.WebApp;
    return {
        user_id: tg?.initDataUnsafe?.user?.id || 0,
        username: tg?.initDataUnsafe?.user?.username || '',
        first_name: tg?.initDataUnsafe?.user?.first_name || 'Guest',
        init_data: tg?.initData || ''
    };
}

// Получаем URL webhook из config
function getWebhookUrl() {
    return window.CONFIG?.API?.main || 'https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba';
}

/**
 * Отмена всех активных запросов
 */
export function cancelAllRequests() {
    if (currentController) {
        currentController.abort();
        currentController = null;
        console.log('🛑 Все запросы отменены');
    }
}

/**
 * Очистка кэша
 */
export function clearCache() {
    cache.clear();
    console.log('🗑️ Кэш очищен');
}

/**
 * Базовая функция для API запросов
 */
async function apiRequest(action, params = {}) {
    // Создаём новый AbortController
    cancelAllRequests();
    currentController = new AbortController();
    const signal = currentController.signal;

    const userData = getUserData();
    const requestId = `${userData.user_id}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const body = {
        action,
        request_id: requestId,
        ...userData,
        ...params
    };

    const startTime = Date.now();
    console.log(`⏱️ [${action}] Начало запроса...`);
    console.log(`📤 [${action}] Отправка запроса...`);

    try {
        // Таймаут через AbortController
        const timeoutId = setTimeout(() => {
            currentController?.abort();
        }, REQUEST_TIMEOUT);

        const response = await fetch(getWebhookUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal
        });

        clearTimeout(timeoutId);

        const elapsed = Date.now() - startTime;
        console.log(`📥 [${action}] Ответ получен: ${response.status}`);
        console.log(`📄 [${action}] Чтение текста...`);

        const text = await response.text();
        console.log(`🔍 [${action}] RAW response: ${text.substring(0, 200)}...`);

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Ошибка парсинга JSON: ${text.substring(0, 100)}`);
        }

        console.log(`✅ [${action}] Успешно за ${elapsed}ms`);
        return data;

    } catch (error) {
        const elapsed = Date.now() - startTime;

        if (error.name === 'AbortError' || signal.aborted) {
            console.log(`⏱️ [${action}] ОТМЕНЁН или ТАЙМАУТ после ${elapsed}ms`);
            const cancelError = new Error('Request cancelled');
            cancelError.isCancelled = true;
            throw cancelError;
        }

        console.error(`❌ [${action}] Ошибка после ${elapsed}ms:`, error);
        throw error;
    }
}

/**
 * Получение доступных дат для услуги
 */
export async function getAvailableDates(serviceId) {
    const cacheKey = `dates_${serviceId}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`📦 [get_available_dates] Из кэша`);
        return cached.data;
    }

    const response = await apiRequest('get_available_dates', {
        service_id: serviceId
    });

    cache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
    });

    return response;
}

/**
 * Получение доступных слотов для даты
 */
export async function getAvailableSlots(serviceId, date) {
    const cacheKey = `slots_${serviceId}_${date}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`📦 [get_available_slots] Из кэша`);
        return cached.data;
    }

    const response = await apiRequest('get_available_slots', {
        service_id: serviceId,
        date: date
    });

    cache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
    });

    return response;
}

/**
 * Бронирование слота
 */
export async function bookSlot(slotId, serviceId, date, time) {
    // Бронирование не кэшируем
    clearCache(); // Очищаем кэш после бронирования

    return await apiRequest('book_slot', {
        slot_id: slotId,
        service_id: serviceId,
        date: date,
        time: time
    });
}

/**
 * Получение бронирований пользователя
 */
export async function getUserBookings() {
    const cacheKey = 'user_bookings';
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`📦 [get_user_bookings] Из кэша`);
        return cached.data;
    }

    const response = await apiRequest('get_user_bookings');

    cache.set(cacheKey, {
        data: response,
        timestamp: Date.now()
    });

    return response;
}

/**
 * Отмена бронирования
 */
export async function cancelBooking(bookingId) {
    clearCache(); // Очищаем кэш после отмены

    return await apiRequest('cancel_booking', {
        booking_id: bookingId
    });
}
