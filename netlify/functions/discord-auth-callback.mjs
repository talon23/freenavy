import {
  checkDiscordGuildMembership,
  consumeDiscordOauthState,
  exchangeDiscordCode,
  fetchDiscordProfile,
  getDiscordSettings,
  saveDiscordAccountLink,
} from "../lib/discord-integration.mjs";

function portalRedirect(request, status, message = "") {
  const target = new URL("/", request.url);
  target.searchParams.set("discord", status);
  if (message) target.searchParams.set("discord_message", message.slice(0, 180));
  return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
}

export default async function discordAuthCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return portalRedirect(request, "error", "Discord authorisation was cancelled");
  if (!code || !state) return portalRedirect(request, "error", "Discord returned an incomplete response");

  try {
    const settings = await getDiscordSettings();
    if (!settings.account_verification_enabled) {
      return portalRedirect(request, "error", "Discord account verification is switched off");
    }

    const stateRecord = await consumeDiscordOauthState(state);
    if (!stateRecord) return portalRedirect(request, "error", "Discord verification link expired or was already used");

    const accessToken = await exchangeDiscordCode(code);
    const profile = await fetchDiscordProfile(accessToken);
    const guildMember = await checkDiscordGuildMembership(profile.id);
    if (settings.require_guild_membership && guildMember !== true) {
      return portalRedirect(request, "error", "Join the Free Navy Discord server before linking your account");
    }

    await saveDiscordAccountLink({ stateRecord, profile, guildMember });
    return portalRedirect(request, "linked");
  } catch (error) {
    console.error("discord-auth-callback", error);
    return portalRedirect(request, "error", error.message || "Discord verification failed");
  }
}

export const config = { path: "/api/discord-auth-callback" };
