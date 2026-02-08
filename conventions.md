# Conventions (compact)

## О проекте

**Название**: Telegram Mini App для бронирования психологических консультаций  
**Технологии**: Vanilla JS + HTML5 + CSS3 + Telegram WebApp API + Make.com  
**Хостинг**: GitHub Pages  
**Репозиторий**: GitHub (папка -TGBOT)  
**IDE**: VS Code + Claude Code CLI

## Комментарии и документация

**JSDoc обязателен для функций** — описывает назначение и контракт.
```js
/**
 * Создаёт бронирование в Make.com
 * @param {string} serviceId ID услуги из CONFIG.SERVICES
 * @param {Date} date Дата бронирования
 * @param {string} time Время "HH:MM"
 * @returns {Promise<Object|null>} Результат или null при ошибке
 */
async function createBooking(serviceId, date, time) {
  // ...
}


**Inline-комментарии** — только для неочевидной логики и причин
  js
// Отменяем предыдущий запрос (race condition)
if (currentRequest) currentRequest.abort();

// Новый AbortController для текущего запроса
currentRequest = new AbortController();
```
# Стиль кодирования

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

**Правила**:

- Не комментировать очевидный код
- Объяснять «почему», а не «что»

## Работа с Make.com Backend

**Важно**: прямого доступа к Make.com нет.

**Можно**:
- Предлагать изменения структуры запросов
- Давать краткие альтернативы

**Обработка ошибок**:

- **Всегда** используем try/catch для async операций
- **Логируем** ошибки в Eruda
- **Показываем** пользователю понятное сообщение (не техническую ошибку!)

## CSS

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

**Glassmorphism эффекты**:
```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}


**Transitions**:
- Быстрые (0.2s): hover эффекты кнопок
- Нормальные (0.3s): анимации карточек, табов
- Медленные (0.5s): сложные трансформации

**Mobile-first**:
- Базовые стили для мобильных (320px+)
- Media queries для планшетов (768px+)

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

**Множественные клики по кнопкам**:
- 10+ кликов по "Забронировать" за секунду
- Должно создаться только 1 бронирование

## Безопасность

### Секреты и API ключи

**НИКОГДА не коммитим**:
- Make.com webhook URLs (если содержат токены)
- API ключи Zoom, Google Calendar
- Пароли, токены доступа


## Git Workflow

### Формат коммитов

[TICKET-ID] Краткое описание изменений

**Примеры**:

[T-104] Добавлена валидация формы бронирования

- Реализована validateBookingData() с проверкой всех полей
- Добавлена обработка edge cases
- Обновлены стили для ошибок валидации

[FIX] Исправлено зависание при переключении табов

- Добавлен AbortController для отмены запросов
- Реализован debouncing 500ms для кликов
- Оптимизирован рендеринг календаря

# Производительность

### Критичные моменты

1. **Минимизация API вызовов**
   
   - Кеширование доступных дат и слотов
   - Отмена предыдущих запросов

2. **Оптимизация рендеринга**

   - Не перерисовываем весь экран, только изменённые элементы
   - Используем DocumentFragment для множественных вставок
  

3. **Debouncing частых событий**

   - Tab clicks: 500ms
   - Calendar navigation: 300ms
   - Search/filter: 500ms

Этот файл - **источник истины** для всего проекта. При любых сомнениях - смотрим сюда.

