# Conventions - Правила проекта Mini App

## О проекте

**Название**: Telegram Mini App для бронирования психологических консультаций  
**Технологии**: Vanilla JS + HTML5 + CSS3 + Telegram WebApp API + Make.com  
**Хостинг**: GitHub Pages  
**Репозиторий**: GitHub (папка -TGBOT)  
**IDE**: VS Code + Claude Code CLI

---

## Архитектура приложения

### Структура файлов

LogIos                # логи из Eruda
LogMake               # логи из Make
index.html           # Главная страница с 4 табами
config.js           # Конфигурация (services, Make.com URL, USER)
app.js              # Вся логика приложения
styles.css          # Все стили (Glassmorphism + Beige)
docs/                   # Документация и артефакты (создаём далее)
```

### Основные компоненты

**4 основных экрана (табы)**:
1. **Services** - список услуг с выбором
2. **Payment** - выбор способа оплаты
3. **Booking** - календарь и слоты времени
4. **My Bookings** - история бронирований

**Глобальные переменные**:
- `tg` - объект Telegram WebApp
- `USER` - данные пользователя из Telegram
- `CONFIG` - конфигурация приложения
- `STATE` - глобальное состояние приложения

---

## Стиль кодирования

### JavaScript

**Стандарт**: ES6+ (const/let, arrow functions, async/await)

**Именование**:
- Переменные и функции: `camelCase` (например: `selectedService`, `handleTabClick`)
- Константы: `UPPER_SNAKE_CASE` (например: `CONFIG`, `USER`, `API_TIMEOUT`)
- DOM элементы: префикс `el` или `$` (например: `elTabBar`, `$calendar`)
- Классы CSS: `kebab-case` (например: `glass-card`, `service-btn`)

**Структура функций**:
```javascript
/**
 * Краткое описание функции
 * @param {string} serviceId - ID услуги
 * @param {Date} date - Дата бронирования
 * @returns {Promise<Object>} Результат бронирования
 */
async function createBooking(serviceId, date) {
  // Валидация параметров
  if (!serviceId || !date) {
    console.error('Invalid parameters');
    return null;
  }
  
  try {
    // Основная логика
    const result = await apiCall('/create-booking', { serviceId, date });
    return result;
  } catch (error) {
    console.error('Booking failed:', error);
    showUserError('Не удалось создать бронирование');
    return null;
  }
}
```

**Обработка ошибок**:
- **Всегда** используем try/catch для async операций
- **Логируем** ошибки в console.error
- **Показываем** пользователю понятное сообщение (не техническую ошибку!)

**Async/Await**:
```javascript
// ✅ ПРАВИЛЬНО
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch failed:', error);
    return null;
  }
}

// ❌ НЕПРАВИЛЬНО (не используем .then/.catch цепочки)
function fetchData() {
  return fetch(url)
    .then(res => res.json())
    .catch(err => console.error(err));
}
```

---

### HTML

**Семантика**:
- Используем семантические теги: `<main>`, `<section>`, `<article>`, `<nav>`
- ID для уникальных элементов: `id="app"`, `id="services-screen"`
- Классы для стилизации: `class="glass-card service-card"`

**Data-атрибуты**:
```html
<!-- Для хранения динамических данных -->
<div class="service-card" data-service-id="diagnosis" data-price="0">
  ...
</div>
```

---

### CSS

**Дизайн-система**: Glassmorphism + Beige палитра

**CSS Variables** (в `:root`):
```css
--bg-primary: linear-gradient(135deg, #FAF3E0 0%, #F5E6D3 100%);
--glass-bg: rgba(255, 252, 248, 0.4);
--accent-primary: #D4A574;
--text-primary: #4A4238;
--border-radius: 20px;
--border-radius-lg: 28px;
--transition-normal: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

**Именование классов**: BEM-подобный стиль
```css
/* Блок */
.service-card { }

/* Элемент блока */
.service-card__header { }
.service-card__icon { }

/* Модификатор */
.service-card--selected { }

/* Утилитные классы */
.hidden { display: none !important; }
.fade-in { animation: fadeIn 0.3s ease-in; }
```

**Glassmorphism эффекты**:
```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}
```

**Transitions**:
- Быстрые (0.2s): hover эффекты кнопок
- Нормальные (0.3s): анимации карточек, табов
- Медленные (0.5s): сложные трансформации

**Mobile-first**:
- Базовые стили для мобильных (320px+)
- Media queries для планшетов (768px+)

---

## Работа с Telegram WebApp API

### Инициализация
```javascript
const tg = window.Telegram.WebApp;
tg.ready();                      // Сигнализируем готовность
tg.expand();                     // Разворачиваем на весь экран
tg.enableClosingConfirmation(); // Подтверждение при закрытии
```

### Получение данных пользователя
```javascript
const USER = {
  id: tg.initDataUnsafe?.user?.id || 0,
  firstName: tg.initDataUnsafe?.user?.first_name || 'Гость',
  lastName: tg.initDataUnsafe?.user?.last_name || '',
  username: tg.initDataUnsafe?.user?.username || '',
};
```

### MainButton (кнопка внизу экрана)
```javascript
// Показать кнопку
tg.MainButton.text = 'Подтвердить бронирование';
tg.MainButton.color = '#D4A574';
tg.MainButton.show();

// Обработчик клика
tg.MainButton.onClick(() => {
  // Действие
  tg.MainButton.hide();
});

// Скрыть после использования
tg.MainButton.hide();
```

### HapticFeedback (вибрация)
```javascript
// При успешном действии
tg.HapticFeedback.notificationOccurred('success');

// При ошибке
tg.HapticFeedback.notificationOccurred('error');

// При выборе
tg.HapticFeedback.selectionChanged();
```

---

## Работа с Make.com Backend

### Структура вебхука
**Единый endpoint**: `https://hook.eu2.make.com/r61db3c6xvtw765yx3hy8629561k23ba`

**7 типов операций** (определяется через `action`):
1. `get-services` - получить список услуг (НЕ используется, услуги хардкод в config.js)
2. `get-available-dates` - получить доступные даты
3. `get-time-slots` - получить свободные слоты времени
4. `create-booking` - создать бронирование
5. `get-bookings` - получить бронирования пользователя
6. `cancel-booking` - отменить бронирование
7. `update-booking` - обновить бронирование


## Обработка ошибок

### Уровни ошибок

**1. Технические ошибки** (логируем в консоль):
```javascript
console.error('API request failed:', error); 
console.error('Invalid data format:', data);
```

**2. Пользовательские ошибки** (показываем в UI):
```javascript
function showUserError(message) {
  // Показать Toast/Alert
  alert(message); // Временное решение
  
  // Haptic feedback
  tg.HapticFeedback.notificationOccurred('error');
}
```

### Типичные ошибки и их обработка

```javascript
try {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }
  
  return data.data;
  
} catch (error) {
  // Отменённый запрос - молча игнорируем
  if (error.name === 'AbortError') {
    console.log('Request cancelled');
    return null;
  }
  
  // Сетевая ошибка
  if (error.message === 'Failed to fetch') {
    console.error('Network error:', error);
    showUserError('Проверьте интернет-соединение');
    return null;
  }
  
  // Остальные ошибки
  console.error('Request failed:', error);
  showUserError('Произошла ошибка. Попробуйте позже.');
  return null;
}
```

---

## Тестирование

### Обязательные проверки перед релизом

- [ ] Все 4 таба переключаются плавно без зависаний
- [ ] Нет лишних API вызовов при переключении табов
- [ ] Загрузка данных показывает loader
- [ ] Ошибки сети обрабатываются корректно
- [ ] MainButton появляется и скрывается правильно
- [ ] HapticFeedback срабатывает при действиях
- [ ] Дизайн соответствует beige палитре
- [ ] Нет console.log в продакшен коде

### Стресс-тесты

**Быстрое переключение табов**:
- 10 + кликов по табам за 10 секунд
- Приложение не должно зависнуть
- Должна быть отмена предыдущих запросов

**Множественные клики по кнопкам**:
- 10+ кликов по "Забронировать" за секунду
- Должно создаться только 1 бронирование

**Потеря сети**:
- Включить Airplane mode
- Попробовать создать бронирование
- Должна быть понятная ошибка

---

## Безопасность

### Секреты и API ключи

❌ **НИКОГДА не коммитим**:
- Make.com webhook URLs (если содержат токены)
- API ключи Zoom, Google Calendar
- Пароли, токены доступа

### Валидация данных

**Frontend (перед отправкой в Make)**:
```javascript
function validateBookingData(data) {
  if (!data.service_id || typeof data.service_id !== 'string') {
    return { valid: false, error: 'Выберите услугу' };
  }
  
  if (!data.date || !(data.date instanceof Date)) {
    return { valid: false, error: 'Выберите дату' };
  }
  
  if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) {
    return { valid: false, error: 'Выберите время' };
  }
  
  return { valid: true };
}
```

---

## Git Workflow

### Формат коммитов

```
[TICKET-ID] Краткое описание изменений

- Детальное описание что сделано

**Примеры**:
```
[T-104] Добавлена валидация формы бронирования

- Реализована validateBookingData() с проверкой всех полей
- Добавлена обработка edge cases
- Обновлены стили для ошибок валидации
```

```
[FIX] Исправлено зависание при переключении табов

- Добавлен AbortController для отмены запросов
- Реализован debouncing 500ms для кликов
- Оптимизирован рендеринг календаря
```

### Ветки

- `main` - Production (GitHub Pages)
- `dev` - Development
- `feature/T-XXX-description` - Фичи
- `fix/description` - Hotfixes

---

## Запрещённые практики

❌ **Никогда не делаем**:

- Игнорирование ошибок (всегда try/catch)

---

## Рекомендуемые практики

✅ **Всегда делаем**:
- Используем const/let (не var)
- Async/await вместо промисов
- Валидация перед отправкой данных
- Отмена предыдущих запросов (AbortController)
- Debouncing для частых событий
- Понятные сообщения об ошибках для пользователя
- JSDoc комментарии для функций
- Мобильное тестирование (Eruda DevTools)

---

## Отладка

### Инструменты

**Desktop (VS Code)**:
- Chrome DevTools
- Network tab для API запросов
- Console для логов

**Mobile (Telegram)**:             # всегда делает человек присылает логи в @logIos
```javascript
// Подключаем Eruda в index.html       # уже подключен 
<script src="https://cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>      
```

### Логирование

```javascript
// Режим разработки
const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log('[MiniApp]', ...args);
  }
}

// Использование
log('User selected service:', serviceId);
log('Available slots:', slots);
```

**Перед релизом**: установить `DEBUG = false`

---

## Производительность

### Критичные моменты

1. **Минимизация API вызовов**
   - Услуги хардкод в config.js (не грузим каждый раз)
   - Кеширование доступных дат (5 сек TTL)
   - Отмена предыдущих запросов

2. **Оптимизация рендеринга**
   - Не перерисовываем весь экран, только изменённые элементы
   - Используем DocumentFragment для множественных вставок
   - CSS transitions вместо JS анимаций

3. **Debouncing частых событий**
   - Tab clicks: 500ms
   - Calendar navigation: 300ms
   - Search/filter: 500ms

---

Этот файл - **источник истины** для всего проекта. При любых сомнениях - смотрим сюда.
