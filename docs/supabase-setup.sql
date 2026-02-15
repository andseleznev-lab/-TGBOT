-- ==========================================
-- Supabase Setup Script для T-006
-- ==========================================
-- Описание: Создание таблицы club_payments с RLS политиками
-- Проект: ujldixoiaqybtnifzhgy
-- Дата: 2026-02-15
-- ==========================================

-- ==========================================
-- 1. Создание таблицы club_payments
-- ==========================================

CREATE TABLE IF NOT EXISTS club_payments (
  -- Основные поля
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  zoom_link TEXT,

  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  payment_data JSONB,

  -- Constraints
  CONSTRAINT unique_payment_id UNIQUE (payment_id),
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'succeeded', 'canceled'))
);

-- ==========================================
-- 2. Создание индексов для производительности
-- ==========================================

-- Индекс для быстрого поиска по telegram_user_id (часто используется на фронтенде)
CREATE INDEX IF NOT EXISTS idx_club_payments_telegram_user_id
ON club_payments(telegram_user_id);

-- Индекс для фильтрации по статусу (RLS политика использует status = 'succeeded')
CREATE INDEX IF NOT EXISTS idx_club_payments_status
ON club_payments(status);

-- Композитный индекс для фронтенд-запросов (telegram_user_id + status)
CREATE INDEX IF NOT EXISTS idx_club_payments_user_status
ON club_payments(telegram_user_id, status);

-- Индекс для сортировки по дате создания
CREATE INDEX IF NOT EXISTS idx_club_payments_created_at
ON club_payments(created_at DESC);

-- ==========================================
-- 3. Включение Row Level Security (RLS)
-- ==========================================

ALTER TABLE club_payments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. RLS Политики
-- ==========================================

-- Политика 1: Публичное чтение ВСЕХ succeeded платежей (для фронтенда с anon ключом)
-- Важно: Realtime будет работать для ВСЕХ succeeded платежей
-- Фильтрацию по telegram_user_id делаем на клиенте: .eq('telegram_user_id', userId)
CREATE POLICY "Allow public read succeeded payments"
ON club_payments
FOR SELECT
USING (status = 'succeeded');

-- Политика 2: Запретить INSERT для anon ключа (только service_role может создавать)
-- Make.com использует service_role ключ для записи платежей
CREATE POLICY "Deny public insert"
ON club_payments
FOR INSERT
WITH CHECK (false);

-- Политика 3: Запретить UPDATE для anon ключа
-- Только service_role может обновлять статусы платежей
CREATE POLICY "Deny public update"
ON club_payments
FOR UPDATE
USING (false);

-- Политика 4: Запретить DELETE для anon ключа
-- Удаление платежей запрещено для публичного доступа
CREATE POLICY "Deny public delete"
ON club_payments
FOR DELETE
USING (false);

-- ==========================================
-- 5. Включение Realtime для таблицы
-- ==========================================

-- Включаем Realtime публикацию для club_payments
-- Это позволит фронтенду подписаться на изменения через WebSocket
ALTER PUBLICATION supabase_realtime ADD TABLE club_payments;

-- ==========================================
-- 6. Триггер для автоматического обновления updated_at
-- ==========================================

-- Функция для обновления поля updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер, который вызывает функцию при UPDATE
CREATE TRIGGER update_club_payments_updated_at
BEFORE UPDATE ON club_payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 7. Комментарии к таблице и полям (документация в БД)
-- ==========================================

COMMENT ON TABLE club_payments IS
'Таблица для хранения платежей клуба (абонементы 2990₽).
Используется для Realtime уведомлений после оплаты через YooKassa.';

COMMENT ON COLUMN club_payments.id IS
'UUID первичный ключ (генерируется автоматически)';

COMMENT ON COLUMN club_payments.payment_id IS
'Уникальный ID платежа от YooKassa (например: "2d07e858-000f-5000-9000-1f7ed5b45678")';

COMMENT ON COLUMN club_payments.telegram_user_id IS
'Telegram User ID пользователя (BIGINT от 1 до 9223372036854775807)';

COMMENT ON COLUMN club_payments.amount IS
'Сумма платежа в копейках (2990₽ = 299000 копеек)';

COMMENT ON COLUMN club_payments.status IS
'Статус платежа: pending, succeeded, canceled';

COMMENT ON COLUMN club_payments.zoom_link IS
'Zoom ссылка для встреч клуба (одинаковая для всех встреч)';

COMMENT ON COLUMN club_payments.payment_data IS
'Дополнительные данные от YooKassa (JSONB): email, receipt, metadata';

-- ==========================================
-- 8. Проверка созданных объектов
-- ==========================================

-- Вывести информацию о таблице
SELECT
  'Table created' AS status,
  COUNT(*) AS columns_count
FROM information_schema.columns
WHERE table_name = 'club_payments';

-- Вывести индексы
SELECT
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE tablename = 'club_payments'
ORDER BY indexname;

-- Вывести RLS политики
SELECT
  policyname AS policy_name,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE tablename = 'club_payments'
ORDER BY policyname;

-- ==========================================
-- 9. Тестовые данные (опционально, для проверки)
-- ==========================================

-- ВАЖНО: Эти INSERT запросы ДОЛЖНЫ ПРОВАЛИТЬСЯ из-за RLS политики "Deny public insert"
-- Если выполняешь в SQL Editor (который использует service_role), то вставка пройдёт
-- Но с фронтенда (anon ключ) эти запросы будут заблокированы RLS

-- Вставка тестового платежа (ТОЛЬКО для проверки в SQL Editor)
-- Закомментируй этот блок, если не хочешь тестовые данные!

/*
INSERT INTO club_payments (payment_id, telegram_user_id, amount, status, payment_data)
VALUES
  ('test_payment_001', 156702946, 299000, 'succeeded', '{"email": "test@example.com", "test": true}'::jsonb),
  ('test_payment_002', 156702946, 299000, 'pending', '{"email": "test2@example.com", "test": true}'::jsonb);

-- Проверка: должно вернуть 2 записи
SELECT * FROM club_payments ORDER BY created_at DESC;
*/

-- ==========================================
-- 10. Полезные запросы для мониторинга
-- ==========================================

-- Посмотреть все платежи (service_role ключ)
-- SELECT * FROM club_payments ORDER BY created_at DESC LIMIT 10;

-- Посмотреть только succeeded платежи (то же самое, что видит фронтенд с anon ключом)
-- SELECT * FROM club_payments WHERE status = 'succeeded' ORDER BY created_at DESC;

-- Посмотреть статистику по пользователям
-- SELECT
--   telegram_user_id,
--   COUNT(*) AS total_payments,
--   SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded_count,
--   SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) / 100.0 AS total_amount_rub
-- FROM club_payments
-- GROUP BY telegram_user_id
-- ORDER BY total_amount_rub DESC;

-- ==========================================
-- СКРИПТ ЗАВЕРШЁН ✅
-- ==========================================
-- Что дальше:
-- 1. Скопируй этот скрипт
-- 2. Открой Supabase Dashboard → SQL Editor
-- 3. Вставь скрипт и нажми "Run"
-- 4. Проверь что таблица создана (вывод в конце скрипта)
-- 5. Сообщи мне результат!
-- ==========================================
