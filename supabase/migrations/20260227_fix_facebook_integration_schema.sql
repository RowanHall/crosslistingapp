-- ============================================================
-- Fix Facebook integration schema
-- ============================================================
-- Problems addressed:
--   1. No UNIQUE(user_id, platform) constraint on user_integrations
--      → upsert silently fell back to INSERT, creating duplicate rows
--      → .single() query then failed with "Cannot coerce the result
--        to a single JSON object"
--   2. platforms_status JSONB column missing from listings
--      → backend update spread was silently dropped / erroring
-- ============================================================


-- 1. De-duplicate any existing rows, keeping the most recently created one
DELETE FROM user_integrations a
USING user_integrations b
WHERE a.user_id   = b.user_id
  AND a.platform  = b.platform
  AND a.created_at < b.created_at;


-- 2. Add UNIQUE constraint so future upserts work correctly
--    (drop first in case a broken version was added previously)
ALTER TABLE user_integrations
    DROP CONSTRAINT IF EXISTS user_integrations_user_id_platform_key;

ALTER TABLE user_integrations
    ADD CONSTRAINT user_integrations_user_id_platform_key
    UNIQUE (user_id, platform);


-- 3. Add platforms_status JSONB column to listings
--    Used by the crosslist route to track per-platform listing state
ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS platforms_status JSONB NOT NULL DEFAULT '{}';
