import { verifyRequestOrigin } from "@netlify/identity";
import { requireSiteAdmin } from "../lib/admin-identity.mjs";
import {
  getDiscordAdminStatus,
  saveDiscordSettings,
  testDiscordWebhook,
} from "../lib/discord-integration.mjs";

export default async function discordAdmin(request) {
  const auth = await requireSiteAdmin();
  if (auth.response) return auth.response;

  try {
    if (request.method === "GET") return Response.json(await getDiscordAdminStatus());
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

    verifyRequestOrigin(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "save") {
      await saveDiscordSettings({
        accountVerificationEnabled: body.accountVerificationEnabled,
        webhookPostingEnabled: body.webhookPostingEnabled,
        requireGuildMembership: body.requireGuildMembership,
        updatedBy: auth.user.email || auth.user.id,
      });
      return Response.json(await getDiscordAdminStatus());
    }
    if (body.action === "test-webhook") {
      const result = await testDiscordWebhook({ requestedBy: auth.user.email || auth.user.id });
      return Response.json({ result, ...(await getDiscordAdminStatus()) });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("discord-admin", error);
    return Response.json({ error: error.message || "Discord operation failed" }, { status: 400 });
  }
}

export const config = { path: "/api/discord-admin" };
