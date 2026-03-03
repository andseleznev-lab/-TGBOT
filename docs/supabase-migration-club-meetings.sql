-- ==========================================
-- Миграция: T-013 — Таблицы club_meetings и club_registrations
-- ==========================================
-- Описание: Нормализованная схема для расписания встреч клуба
--           и уникальных Zoom-ссылок для каждого участника
-- Дата: 2026-03-03
-- Тикет: T-013
-- ==========================================

-- ==========================================
-- 1. Таблица встреч клуба
-- ==========================================

CREATE TABLE IF NOT EXISTS club_meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date    DATE NOT NULL,
  zoom_meeting_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_meeting_date UNIQUE (meeting_date)
);

COMMENT ON TABLE club_meetings IS
'Расписание встреч клуба. Одна запись = одна среда. '
'Создаётся автоматически Make.com сценарием за 2 дня до встречи.';

COMMENT ON COLUMN club_meetings.meeting_date IS
'Дата встречи (всегда среда). Уникальна.';

COMMENT ON COLUMN club_meetings.zoom_meeting_id IS
'ID Zoom-встречи (числовой, от Zoom API). Нужен для регистрации участников.';

-- ==========================================
-- 2. Таблица регистраций участников
-- ==========================================

CREATE TABLE IF NOT EXISTS club_registrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       UUID NOT NULL REFERENCES club_meetings(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  zoom_join_url    TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_member_meeting UNIQUE (meeting_id, telegram_user_id)
);

COMMENT ON TABLE club_registrations IS
'Уникальные Zoom join_url для каждого участника каждой встречи. '
'Все участники попадают на одну встречу, но через персональную ссылку регистрации.';

COMMENT ON COLUMN club_registrations.zoom_join_url IS
'Персональная ссылка участника для входа в Zoom (от Zoom API Add Registrant).';

-- ==========================================
-- 3. Индексы
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_club_meetings_date
  ON club_meetings(meeting_date DESC);

CREATE INDEX IF NOT EXISTS idx_club_registrations_user
  ON club_registrations(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_club_registrations_meeting
  ON club_registrations(meeting_id);

-- ==========================================
-- 4. RLS (Row Level Security)
-- ==========================================

ALTER TABLE club_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_registrations ENABLE ROW LEVEL SECURITY;

-- club_meetings: публичное чтение (анонимный пользователь видит расписание)
CREATE POLICY "Allow public read club_meetings"
  ON club_meetings FOR SELECT USING (true);

CREATE POLICY "Deny public insert club_meetings"
  ON club_meetings FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny public update club_meetings"
  ON club_meetings FOR UPDATE USING (false);

CREATE POLICY "Deny public delete club_meetings"
  ON club_meetings FOR DELETE USING (false);

-- club_registrations: публичное чтение (фильтрация по telegram_user_id на стороне бота)
-- Zoom join_url не является критическим секретом (только вход в Zoom с именем)
CREATE POLICY "Allow public read club_registrations"
  ON club_registrations FOR SELECT USING (true);

CREATE POLICY "Deny public insert club_registrations"
  ON club_registrations FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny public update club_registrations"
  ON club_registrations FOR UPDATE USING (false);

CREATE POLICY "Deny public delete club_registrations"
  ON club_registrations FOR DELETE USING (false);

-- ==========================================
-- 5. Проверка результата
-- ==========================================

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('club_meetings', 'club_registrations')
ORDER BY table_name, ordinal_position;

-- ==========================================
-- МИГРАЦИЯ ЗАВЕРШЕНА ✅
-- ==========================================
-- Что дальше:
-- 1. Скопируй этот SQL
-- 2. Открой Supabase Dashboard → SQL Editor
-- 3. Вставь и нажми "Run"
-- 4. Убедись что обе таблицы появились (видно в Table Editor)
-- 5. Проверь RLS: SELECT с anon ключом должен работать
--
-- Откат (если нужно):
-- DROP TABLE IF EXISTS club_registrations;
-- DROP TABLE IF EXISTS club_meetings;
-- ==========================================
