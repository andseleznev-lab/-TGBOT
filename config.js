// ===== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ =====

const CONFIG = {
    // URL вебхука Make.com
    API: {
        main: 'https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba',
        timeout: 10000  // 10 секунд timeout для всех API запросов
    },

    // [T-002] URL для slots.json из Git (статический файл)
    SLOTS_JSON_URL: 'https://raw.githubusercontent.com/andseleznev-lab/-TGBOT/main/slots.json',

    // [T-002] Fallback на старый Make.com API если slots.json недоступен
    SLOTS_JSON_FALLBACK: true,
    
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
    
    // Иконки для услуг (emoji)
    SERVICE_ICONS: {
        'Диагностика': '🎯',
        'Пакет консультаций': '📦',
        'Семейная консультация': '👨‍👩‍👧',
        'Индивидуальная консультация': '💼'
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
