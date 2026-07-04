
-- Discord is installed but OFF by default. Secrets stay in Netlify environment
-- variables; only switches, non-secret settings and account links are stored here.

CREATE TABLE IF NOT EXISTS fn_discord_settings (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  account_verification_enabled boolean NOT NULL DEFAULT false,
  webhook_posting_enabled boolean NOT NULL DEFAULT false,
  require_guild_membership boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fn_discord_settings (singleton_id)
VALUES (1)
ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS fn_discord_account_links (
  id bigserial PRIMARY KEY,
  portal_user_id text NOT NULL UNIQUE,
  portal_email text,
  discord_user_id text NOT NULL UNIQUE,
  discord_username text NOT NULL,
  discord_global_name text,
  discord_avatar text,
  guild_member boolean,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  raw_profile jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS fn_discord_account_links_email_idx
  ON fn_discord_account_links (lower(portal_email));

CREATE TABLE IF NOT EXISTS fn_discord_oauth_states (
  state_hash text PRIMARY KEY,
  portal_user_id text NOT NULL,
  portal_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS fn_discord_oauth_states_expiry_idx
  ON fn_discord_oauth_states (expires_at, used_at);


UPDATE public.feature_flags
SET description = CASE feature_key
  WHEN 'discord_oauth' THEN 'Optional Discord account linking. Disabled until Netlify OAuth variables validate.'
  WHEN 'discord_webhooks' THEN 'Optional Discord webhook posting. Disabled until the Netlify webhook variable validates.'
  ELSE description
END,
updated_at = now()
WHERE feature_key IN ('discord_oauth', 'discord_webhooks');

UPDATE public.site_settings
SET setting_value = '{"enabled":false,"setup":"netlify_environment"}'::jsonb,
    description = 'Discord is installed but disabled until Netlify environment variables are configured.',
    updated_at = now()
WHERE setting_key = 'discord_integration';
