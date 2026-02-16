// ===== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ =====

const CONFIG = {
    // URL вебхука Make.com
    API: {
        main: 'https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba',
        timeout: 10000  // 10 секунд timeout для всех API запросов
    },

    // [T-002] URL для slots.json из Git (статический файл)
    SLOTS_JSON_URL: 'https://raw.githubusercontent.com/andseleznev-lab/-TGBOT/main/slots.json',

    // [T-005] URL для club.json из Git (статический файл)
    CLUB_JSON_URL: 'https://raw.githubusercontent.com/andseleznev-lab/-TGBOT/main/club.json',

    // [T-005] Настройки клуба
    CLUB: {
        /** Цена абонемента в рублях */
        PRICE: 2990,
        /** Количество встреч в абонементе */
        MEETINGS_COUNT: 4,
        /** Время встреч (каждое воскресенье) */
        MEETING_TIME: '17:00',
        /** Zoom ссылка для встреч клуба */
        ZOOM_LINK: 'https://zoom.us/j/your-meeting-id'
    },

    // [T-006] Supabase PostgreSQL + Realtime
    SUPABASE: {
        /** URL проекта Supabase */
        URL: 'https://ujldixoiaqybtnifzhgy.supabase.co',
        /** Публичный anon ключ (безопасно для фронтенда) */
        ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbGRpeG9pYXF5YnRuaWZ6aGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTkyMDgsImV4cCI6MjA4NTQzNTIwOH0.rHbW1w3XZdcW1XcjQXz3jfFrWA0SzR6K851MAxMSV_E',
        /** Флаг миграции (true = Supabase, false = club.json fallback) */
        ENABLED: true
    },

    // [T-008] User Consents - Политика конфиденциальности и ПД
    CONSENTS: {
        /** Make.com webhook для логирования согласий */
        WEBHOOK_URL: 'https://hook.eu2.make.com/emmnhod6j0c9cc7tjqsj8x2aota4lbj2',
        /** Версия политики (для версионирования) */
        POLICY_VERSION: '1.0',
        /** Ссылки на документы */
        PRIVACY_POLICY_URL: 'https://arinaprovodnik.com/politica',
        PERSONAL_DATA_URL: 'https://arinaprovodnik.com/person'
    },

    // [T-003] YooKassa payment integration
    YOOKASSA: {
        // Используем существующий main webhook для создания платежей
        paymentEndpoint: 'https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba',
        // TODO: Заменить YourBotName на реальный username бота
        returnUrl: 'https://t.me/YourBotName/app?tab=mybookings'
    },

    // [T-003] Объект для удобного доступа к ценам услуг (используется в createPayment)
    SERVICE_PRICES: {
        diagnosis: 0,
        package: 75000,
        family: 10000,
        single: 8000,
        club: 2990  // [T-005] Абонемент клуба
    },

    // Статичный список услуг (не загружаем из Make)
    SERVICES: [
        {
            id: 'diagnosis',
            name: 'Диагностика',
            description: 'Бесплатная диагностическая консультация',
            price: 0,
            duration: '30 минут',
            days: ['Среда', 'Пятница']
        },
        {
            id: 'package',
            name: 'Пакет консультаций',
            description: '10 сессий',
            price: 75000,
            duration: '10 сессий по 1 часу',
            days: ['Вторник', 'Четверг']
        },
        {
            id: 'family',
            name: 'Семейная консультация',
            description: 'Консультация для пары или семьи',
            price: 10000,
            duration: '2 часа',
            days: ['Вторник', 'Четверг']
        },
        {
            id: 'single',
            name: 'Индивидуальная консультация',
            description: 'Персональная консультация',
            price: 8000,
            duration: '1 час',
            days: ['Вторник', 'Четверг']
        },
        {
            id: 'club_info',
            name: 'Вступить в клуб',
            description: 'Информация о клубе',
            price: null,
            duration: null,
            days: null,
            type: 'info_button'
        }
    ],
    
    // Иконки убраны для чистого дизайна
    SERVICE_ICONS: {
    },
    
    // URL для оплаты
    PAYMENT_URLS: {
        card: 'https://your-payment-link.com/card',
        sbp: 'https://your-payment-link.com/sbp',
        other: 'https://your-payment-link.com/other'
    },
    
    // Настройки календаря
    CALENDAR: {
        monthsToShow: 2,
        locale: 'ru-RU'
    }
};

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP =====
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.enableClosingConfirmation();

// Применяем тему Telegram
if (tg.themeParams.bg_color) {
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color);
}
if (tg.themeParams.text_color) {
    document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color);
}

// Получаем данные пользователя
const USER = {
    id: tg.initDataUnsafe?.user?.id || 0,
    firstName: tg.initDataUnsafe?.user?.first_name || 'Гость',
    lastName: tg.initDataUnsafe?.user?.last_name || '',
    username: tg.initDataUnsafe?.user?.username || '',
    get fullName() {
        return `${this.firstName} ${this.lastName}`.trim();
    }
};

// Генератор уникальных ID для защиты от двойного клика
function generateRequestId() {
    return `${USER.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Логирование для отладки
console.log('Mini App initialized');
console.log('User:', USER);
console.log('Webhook URL:', CONFIG.API.main);

// [T-008] Экспорт в window для глобального доступа и проверки загрузки
window.CONFIG = CONFIG;
window.USER = USER;
window.generateRequestId = generateRequestId;
