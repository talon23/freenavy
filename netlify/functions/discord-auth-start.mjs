import { getUser } from "@netlify/identity";
import {
  createDiscordOauthState,
  discordAuthorizeUrl,
  getDiscordSettings,
} from "../lib/discord-integration.mjs";

export default async function discordAuthStart() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  try {
    const settings = await getDiscordSettings();
    if (!settings.account_verification_enabled) {
      return Response.json({ error: "Discord account verification is switched off" }, { status: 503 });
    }
    const state = await createDiscordOauthState(user);
    return new Response(null, {
      status: 302,
      headers: {
        location: discordAuthorizeUrl(state),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("discord-auth-start", error);
    return Response.json({ error: error.message || "Unable to start Discord verification" }, { status: 500 });
  }
}

export const config = { path: "/api/discord-auth-start" };
