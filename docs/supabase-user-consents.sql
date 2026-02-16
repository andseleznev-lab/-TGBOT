-- ==========================================
-- Supabase Setup Script: user_consents
-- ==========================================
-- Тикет: T-008
-- Дата создания: 2026-02-15
-- Назначение: Таблица для хранения согласий пользователей
--             (политика конфиденциальности, ПД, договор оферты)
-- ==========================================

-- ==========================================
-- 1. Создание таблицы user_consents
-- ==========================================

CREATE TABLE IF NOT EXISTS user_consents (
  -- Основные поля
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  consent_type TEXT NOT NULL,
  consent_given BOOLEAN DEFAULT TRUE,

  -- Дополнительные поля (опционально)
  user_agent TEXT,
  policy_version TEXT DEFAULT '1.0',

  -- Метаданные
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Индексы и ограничения
  CONSTRAINT unique_user_consent UNIQUE (telegram_user_id, consent_type)
);

-- ==========================================
-- 2. Комментарии к таблице и столбцам
-- ==========================================

COMMENT ON TABLE user_consents IS
'Согласия пользователей на обработку данных и договоры оферты';

COMMENT ON COLUMN user_consents.id IS
'UUID согласия (автогенерация)';

COMMENT ON COLUMN user_consents.telegram_user_id IS
'Telegram User ID пользователя (BIGINT от 1 до 9223372036854775807)';

COMMENT ON COLUMN user_consents.telegram_username IS
'Telegram username или first_name пользователя';

COMMENT ON COLUMN user_consents.consent_type IS
'Тип согласия: privacy_policy, personal_data, offer_contract_booking, offer_contract_club';

COMMENT ON COLUMN user_consents.consent_given IS
'Согласие дано (TRUE) или отозвано (FALSE). По умолчанию TRUE.';

COMMENT ON COLUMN user_consents.user_agent IS
'User-Agent браузера (опционально, для юридической защиты)';

COMMENT ON COLUMN user_consents.policy_version IS
'Версия политики конфиденциальности (для версионирования)';

COMMENT ON COLUMN user_consents.created_at IS
'Дата и время создания согласия (UTC)';

COMMENT ON COLUMN user_consents.updated_at IS
'Дата и время последнего обновления (UTC)';

-- ==========================================
-- 3. Индексы для производительности
-- ==========================================

-- Индекс для быстрого поиска по user_id и типу согласия
CREATE INDEX IF NOT EXISTS idx_user_consents_user_type
ON user_consents (telegram_user_id, consent_type);

-- Индекс для поиска по дате создания (если нужна аналитика)
CREATE INDEX IF NOT EXISTS idx_user_consents_created_at
ON user_consents (created_at DESC);

-- ==========================================
-- 4. RLS (Row Level Security) политики
-- ==========================================

-- Включить RLS для таблицы
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Политика 1: SELECT - пользователь видит только свои согласия
-- (для будущего функционала "Мои согласия")
CREATE POLICY "Users can view own consents"
ON user_consents
FOR SELECT
USING (
  telegram_user_id::TEXT = current_setting('request.jwt.claims', true)::json->>'sub'
);

-- Политика 2: INSERT - только через service_role (Make.com webhook)
-- Фронтенд НЕ может напрямую вставлять данные (только через Make.com)
CREATE POLICY "Service role can insert consents"
ON user_consents
FOR INSERT
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Политика 3: UPDATE - только через service_role (для отзыва согласия в будущем)
CREATE POLICY "Service role can update consents"
ON user_consents
FOR UPDATE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- Политика 4: DELETE - запрещено для всех (для сохранения истории)
-- Нет политики DELETE → операция запрещена для всех ролей

-- ==========================================
-- 5. Триггер для автоматического обновления updated_at
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON user_consents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 6. Тестовые данные (опционально, для проверки)
-- ==========================================

-- Вставка тестового согласия (закомментировано, раскомментируй для теста)
/*
INSERT INTO user_consents (
  telegram_user_id,
  telegram_username,
  consent_type,
  consent_given,
  user_agent,
  policy_version
) VALUES (
  156702946,
  'Sam',
  'privacy_policy',
  TRUE,
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  '1.0'
);

INSERT INTO user_consents (
  telegram_user_id,
  telegram_username,
  consent_type,
  consent_given,
  policy_version
) VALUES (
  156702946,
  'Sam',
  'personal_data',
  TRUE,
  '1.0'
);
*/

-- ==========================================
-- 7. Полезные SQL запросы
-- ==========================================

-- Проверка созданной таблицы
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'user_consents'
ORDER BY ordinal_position;

-- Проверка индексов
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'user_consents';

-- Проверка RLS политик
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_consents';

-- Проверка триггеров
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_consents';

-- ==========================================
-- 8. Аналитические запросы (примеры)
-- ==========================================

-- Количество согласий по типам
SELECT
  consent_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE consent_given = TRUE) as active,
  COUNT(*) FILTER (WHERE consent_given = FALSE) as revoked
FROM user_consents
GROUP BY consent_type
ORDER BY total DESC;

-- Последние 10 согласий
SELECT
  telegram_user_id,
  telegram_username,
  consent_type,
  consent_given,
  created_at
FROM user_consents
ORDER BY created_at DESC
LIMIT 10;

-- Проверка дубликатов (не должно быть из-за UNIQUE constraint)
SELECT
  telegram_user_id,
  consent_type,
  COUNT(*) as duplicates
FROM user_consents
GROUP BY telegram_user_id, consent_type
HAVING COUNT(*) > 1;

-- Пользователи которые согласились со всеми типами
WITH consent_types AS (
  SELECT UNNEST(ARRAY[
    'privacy_policy',
    'personal_data'
  ]) as type
)
SELECT
  uc.telegram_user_id,
  uc.telegram_username,
  COUNT(DISTINCT uc.consent_type) as consents_count
FROM user_consents uc
WHERE uc.consent_given = TRUE
  AND uc.consent_type IN (SELECT type FROM consent_types)
GROUP BY uc.telegram_user_id, uc.telegram_username
HAVING COUNT(DISTINCT uc.consent_type) = (SELECT COUNT(*) FROM consent_types);

-- ==========================================
-- 9. Очистка (если нужно удалить таблицу)
-- ==========================================

-- ВНИМАНИЕ: Удаляет всю таблицу и данные!
-- DROP TABLE IF EXISTS user_consents CASCADE;

-- ==========================================
-- СКРИПТ ЗАВЕРШЁН ✅
-- ==========================================
-- Что дальше:
-- 1. Скопируй этот скрипт
-- 2. Открой Supabase Dashboard → SQL Editor
-- 3. Вставь скрипт и нажми "Run"
-- 4. Проверь что таблица создана (вывод в конце скрипта)
-- 5. Сообщи мне результат!
-- 6. Переходи к созданию Make.com webhook
-- ==========================================
