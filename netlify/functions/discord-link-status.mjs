import { getUser } from "@netlify/identity";
import { getDiscordLinkStatus } from "../lib/discord-integration.mjs";

export default async function discordLinkStatus(request) {
  if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const user = await getUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    return Response.json(await getDiscordLinkStatus(user));
  } catch (error) {
    console.error("discord-link-status", error);
    return Response.json({ error: error.message || "Unable to read Discord status" }, { status: 500 });
  }
}

export const config = { path: "/api/discord-link-status" };
