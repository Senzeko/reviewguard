-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_purge_name_plain_temp
-- Adds the purge_expired_name_plain_temp() Postgres function.
--
-- This function is called:
--   a) By the Session 2 scheduler (pg_cron or application-level cron) hourly.
--   b) Directly from application code via `npm run db:purge-names` as a fallback.
--
-- It nulls out name_plain_temp for any transaction row whose 14-day retention
-- window has expired, satisfying the privacy requirement without deleting the
-- transaction record (the name_hash is retained for permanent forensic matching).
-- ─────────────────────────────────────────────────────────────────────────────

-- Purge name_plain_temp for expired rows
-- This runs via pg_cron or a scheduled job in Session 2
-- The function is defined here so it can be called from application code as a fallback
CREATE OR REPLACE FUNCTION purge_expired_name_plain_temp()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE transactions_vault
  SET name_plain_temp = NULL
  WHERE name_plain_expires_at IS NOT NULL
    AND name_plain_expires_at < NOW()
    AND name_plain_temp IS NOT NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION purge_expired_name_plain_temp() IS
  'Nulls out name_plain_temp for rows past their 14-day retention window.
   Called by the Session 2 scheduler every hour. Returns row count purged.';
