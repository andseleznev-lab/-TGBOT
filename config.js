// ===== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ =====

const CONFIG = {
    // URL вебхука Make.com
    // ⚠️ ВАЖНО: После создания сценария в Make замените YOUR_WEBHOOK_URL_HERE на реальный URL
    API: {
        main: 'https://hook.eu2.make.com/YOUR_WEBHOOK_URL_HERE'
    },
    
    // Иконки для услуг (emoji)
    SERVICE_ICONS: {
        'Диагностика': '🎯',
        'Вступить в клуб': '🌟',
        'Пакет консультаций': '📦',
        'Семейная консультация': '👨‍👩‍👧',
        'Индивидуальная консультация': '💼'
    },
    
    // URL для оплаты
    // ⚠️ ВАЖНО: Добавьте свои ссылки на оплату после их создания
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

// Логирование для отладки (можно удалить в production)
console.log('Mini App initialized');
console.log('User:', USER);
console.log('Theme:', tg.themeParams);