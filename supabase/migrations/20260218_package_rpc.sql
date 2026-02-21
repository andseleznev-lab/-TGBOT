-- [T-010] RPC функции для атомарного управления пакетом сессий

-- Декремент: вызывается при бронировании сессии из пакета (package_session)
CREATE OR REPLACE FUNCTION decrement_package_session(p_telegram_user_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row user_packages%ROWTYPE;
BEGIN
    UPDATE user_packages
    SET
        sessions_remaining = sessions_remaining - 1,
        updated_at = NOW()
    WHERE telegram_user_id = p_telegram_user_id
      AND status = 'active'
      AND sessions_remaining > 0
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'no_active_package');
    END IF;

    RETURN json_build_object(
        'success', true,
        'sessions_remaining', v_row.sessions_remaining,
        'package_id', v_row.id
    );
END;
$$;

-- Инкремент: вызывается при отмене сессии из пакета
CREATE OR REPLACE FUNCTION increment_package_session(p_telegram_user_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row user_packages%ROWTYPE;
BEGIN
    UPDATE user_packages
    SET
        sessions_remaining = sessions_remaining + 1,
        updated_at = NOW()
    WHERE telegram_user_id = p_telegram_user_id
      AND status = 'active'
      AND sessions_remaining < sessions_total
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'no_active_package_or_full');
    END IF;

    RETURN json_build_object(
        'success', true,
        'sessions_remaining', v_row.sessions_remaining,
        'package_id', v_row.id
    );
END;
$$;

-- Разрешаем вызов через anon key (фронтенд не вызывает, но Make.com с service_role — тем более ок)
GRANT EXECUTE ON FUNCTION decrement_package_session(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_package_session(BIGINT) TO anon, authenticated;
