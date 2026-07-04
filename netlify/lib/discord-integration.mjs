import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@netlify/database";

const DISCORD_API = "https://discord.com/api/v10";
const db = () => getDatabase();
const rows = (result) => result?.rows || result || [];

function configured(name) {
  return Boolean(String(process.env[name] || "").trim());
}

export function discordEnvironmentStatus() {
  const accountRequirements = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI"];
  const webhookRequirements = ["DISCORD_WEBHOOK_URL"];
  const guildRequirements = ["DISCORD_GUILD_ID", "DISCORD_BOT_TOKEN"];

  return {
    variables: {
      DISCORD_CLIENT_ID: configured("DISCORD_CLIENT_ID"),
      DISCORD_CLIENT_SECRET: configured("DISCORD_CLIENT_SECRET"),
      DISCORD_REDIRECT_URI: configured("DISCORD_REDIRECT_URI"),
      DISCORD_GUILD_ID: configured("DISCORD_GUILD_ID"),
      DISCORD_BOT_TOKEN: configured("DISCORD_BOT_TOKEN"),
      DISCORD_WEBHOOK_URL: configured("DISCORD_WEBHOOK_URL"),
    },
    accountVerificationReady: accountRequirements.every(configured),
    webhookReady: webhookRequirements.every(configured),
    guildCheckReady: guildRequirements.every(configured),
    missingAccountVariables: accountRequirements.filter((name) => !configured(name)),
    missingWebhookVariables: webhookRequirements.filter((name) => !configured(name)),
    missingGuildVariables: guildRequirements.filter((name) => !configured(name)),
  };
}

export async function getDiscordSettings() {
  const result = await db().sql`SELECT * FROM fn_discord_settings WHERE singleton_id = 1`;
  return rows(result)[0] || {
    singleton_id: 1,
    account_verification_enabled: false,
    webhook_posting_enabled: false,
    require_guild_membership: false,
  };
}

export async function getDiscordAdminStatus() {
  const [settings, countResult] = await Promise.all([
    getDiscordSettings(),
    db().sql`SELECT count(*)::int AS count FROM fn_discord_account_links`,
  ]);
  return {
    settings,
    environment: discordEnvironmentStatus(),
    linkedAccounts: rows(countResult)[0]?.count || 0,
  };
}

export async function saveDiscordSettings({
  accountVerificationEnabled,
  webhookPostingEnabled,
  requireGuildMembership,
  updatedBy,
}) {
  const environment = discordEnvironmentStatus();
  if (accountVerificationEnabled && !environment.accountVerificationReady) {
    throw new Error(`Discord account verification needs: ${environment.missingAccountVariables.join(", ")}`);
  }
  if (webhookPostingEnabled && !environment.webhookReady) {
    throw new Error(`Discord webhooks need: ${environment.missingWebhookVariables.join(", ")}`);
  }
  if (requireGuildMembership && !environment.guildCheckReady) {
    throw new Error(`Discord guild membership checking needs: ${environment.missingGuildVariables.join(", ")}`);
  }

  const verificationEnabled = Boolean(accountVerificationEnabled);
  const webhookEnabled = Boolean(webhookPostingEnabled);
  const guildRequired = Boolean(requireGuildMembership);
  const result = await db().sql`
    INSERT INTO fn_discord_settings (
      singleton_id, account_verification_enabled, webhook_posting_enabled,
      require_guild_membership, updated_by, updated_at
    ) VALUES (
      1, ${verificationEnabled}, ${webhookEnabled},
      ${guildRequired}, ${updatedBy || null}, now()
    )
    ON CONFLICT (singleton_id) DO UPDATE SET
      account_verification_enabled = EXCLUDED.account_verification_enabled,
      webhook_posting_enabled = EXCLUDED.webhook_posting_enabled,
      require_guild_membership = EXCLUDED.require_guild_membership,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING *
  `;

  await db().sql`
    UPDATE public.feature_flags
    SET enabled = CASE feature_key
      WHEN 'discord_oauth' THEN ${verificationEnabled}
      WHEN 'discord_webhooks' THEN ${webhookEnabled}
      ELSE enabled
    END,
    updated_at = now()
    WHERE feature_key IN ('discord_oauth', 'discord_webhooks')
  `;
  await db().sql`
    UPDATE public.site_settings
    SET setting_value = ${JSON.stringify({
      enabled: verificationEnabled || webhookEnabled,
      account_verification_enabled: verificationEnabled,
      webhook_posting_enabled: webhookEnabled,
      require_guild_membership: guildRequired,
      setup: "netlify_environment",
    })}::jsonb,
    updated_at = now()
    WHERE setting_key = 'discord_integration'
  `;
  return rows(result)[0];
}

export async function postDiscordWebhook({ content, embeds = [], username = null }) {
  const settings = await getDiscordSettings();
  const environment = discordEnvironmentStatus();
  if (!settings.webhook_posting_enabled) return { sent: false, reason: "disabled" };
  if (!environment.webhookReady) throw new Error("DISCORD_WEBHOOK_URL is not configured in Netlify");

  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: content || undefined,
      embeds: embeds.length ? embeds : undefined,
      username: username || undefined,
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  return { sent: true };
}

export async function testDiscordWebhook({ requestedBy }) {
  const result = await postDiscordWebhook({
    content: `Free Navy Netlify integration test${requestedBy ? ` requested by ${requestedBy}` : ""}.`,
  });
  if (!result.sent) throw new Error("Discord webhook posting is switched off");
  return result;
}

function stateHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createDiscordOauthState(user) {
  const rawState = randomBytes(32).toString("base64url");
  await db().sql`DELETE FROM fn_discord_oauth_states WHERE expires_at < now() OR used_at IS NOT NULL`;
  await db().sql`
    INSERT INTO fn_discord_oauth_states (state_hash, portal_user_id, portal_email, expires_at)
    VALUES (${stateHash(rawState)}, ${user.id}, ${user.email || null}, now() + interval '10 minutes')
  `;
  return rawState;
}

export async function consumeDiscordOauthState(rawState) {
  if (!rawState) return null;
  const result = await db().sql`
    UPDATE fn_discord_oauth_states
    SET used_at = now()
    WHERE state_hash = ${stateHash(rawState)}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING portal_user_id, portal_email
  `;
  return rows(result)[0] || null;
}

export function discordAuthorizeUrl(state) {
  const environment = discordEnvironmentStatus();
  if (!environment.accountVerificationReady) {
    throw new Error(`Discord account verification needs: ${environment.missingAccountVariables.join(", ")}`);
  }
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", process.env.DISCORD_REDIRECT_URI);
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeDiscordCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
  });
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.message || "Discord token exchange failed");
  }
  return payload.access_token;
}

export async function fetchDiscordProfile(accessToken) {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) throw new Error(payload.message || "Unable to read Discord profile");
  return payload;
}

export async function checkDiscordGuildMembership(discordUserId) {
  const environment = discordEnvironmentStatus();
  if (!environment.guildCheckReady) return null;
  const response = await fetch(`${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Discord guild check failed: ${response.status} ${response.statusText}`);
  return true;
}

export async function saveDiscordAccountLink({ stateRecord, profile, guildMember }) {
  const username = profile.discriminator && profile.discriminator !== "0"
    ? `${profile.username}#${profile.discriminator}`
    : profile.username;
  const result = await db().sql`
    INSERT INTO fn_discord_account_links (
      portal_user_id, portal_email, discord_user_id, discord_username,
      discord_global_name, discord_avatar, guild_member, linked_at,
      last_verified_at, raw_profile
    ) VALUES (
      ${stateRecord.portal_user_id}, ${stateRecord.portal_email || null}, ${profile.id}, ${username},
      ${profile.global_name || null}, ${profile.avatar || null}, ${guildMember}, now(), now(),
      ${JSON.stringify(profile)}::jsonb
    )
    ON CONFLICT (portal_user_id) DO UPDATE SET
      portal_email = EXCLUDED.portal_email,
      discord_user_id = EXCLUDED.discord_user_id,
      discord_username = EXCLUDED.discord_username,
      discord_global_name = EXCLUDED.discord_global_name,
      discord_avatar = EXCLUDED.discord_avatar,
      guild_member = EXCLUDED.guild_member,
      last_verified_at = now(),
      raw_profile = EXCLUDED.raw_profile
    RETURNING portal_user_id, portal_email, discord_user_id, discord_username,
      discord_global_name, discord_avatar, guild_member, linked_at, last_verified_at
  `;
  return rows(result)[0];
}

export async function getDiscordLinkStatus(user) {
  const [settings, linkResult] = await Promise.all([
    getDiscordSettings(),
    db().sql`
      SELECT portal_user_id, portal_email, discord_user_id, discord_username,
        discord_global_name, discord_avatar, guild_member, linked_at, last_verified_at
      FROM fn_discord_account_links
      WHERE portal_user_id = ${user.id}
    `,
  ]);
  return {
    enabled: settings.account_verification_enabled,
    requireGuildMembership: settings.require_guild_membership,
    linked: rows(linkResult)[0] || null,
  };
}
