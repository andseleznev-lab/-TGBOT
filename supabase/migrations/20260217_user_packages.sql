-- [T-010] Пакет консультаций: бронирование без повторной оплаты
-- Создано: 2026-02-17

-- Таблица активных пакетов (один активный пакет на пользователя)
CREATE TABLE user_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id BIGINT NOT NULL,
    payment_id TEXT NOT NULL,
    sessions_total INT NOT NULL DEFAULT 10,
    sessions_remaining INT NOT NULL DEFAULT 9,
    status TEXT NOT NULL DEFAULT 'active',
    payment_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT sessions_non_negative CHECK (sessions_remaining >= 0)
);

CREATE INDEX idx_user_packages_telegram_user_id ON user_packages(telegram_user_id);

-- Лог событий: бронирование и отмена каждой сессии
CREATE TABLE package_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES user_packages(id),
    telegram_user_id BIGINT NOT NULL,
    event_type TEXT NOT NULL,  -- 'booked' | 'cancelled'
    booking_id TEXT,
    session_date TEXT,
    session_time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_events_package_id ON package_events(package_id);
CREATE INDEX idx_package_events_telegram_user_id ON package_events(telegram_user_id);

-- RLS: Make.com использует service_role key (обходит RLS)
-- Фронтенд читает только свои данные (anon key, фильтрация по telegram_user_id на уровне запроса)
ALTER TABLE user_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_packages"
    ON user_packages FOR SELECT
    USING (true);

CREATE POLICY "users_read_own_events"
    ON package_events FOR SELECT
    USING (true);
