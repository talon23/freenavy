import crypto from "node:crypto";
import { admin, requestPasswordRecovery } from "@netlify/identity";
import {
  assertSameOrigin, requireMember, json, errorResponse, httpError, dbPool, audit,
  canManageMembers, canAssignRanks, RANKS
} from "../lib/netlify.mjs";

export default async function inviteMember(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    assertSameOrigin(request);
    const { profile } = await requireMember();
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const { email, displayName, rank = "enlisted", rsiHandle = "", discordHandle = "", probationDays = 0 } = await request.json();
    const nextRank = String(rank || "enlisted").toLowerCase();
    if (!email || !displayName) throw httpError(400, "Email and display name are required.");
    if (!RANKS.includes(nextRank)) throw httpError(400, "Invalid rank.");
    if (nextRank !== "enlisted" && !canAssignRanks(profile)) throw httpError(403, "Only the President or Vice President can invite directly into a higher rank.");
    if (nextRank === "president" && profile.rank !== "president") throw httpError(403, "Only the President can appoint another President.");

    const temporaryPassword = crypto.randomBytes(32).toString("base64url");
    const user = await admin.createUser({
      email,
      password: temporaryPassword,
      data: {
        role: nextRank,
        app_metadata: { roles: [nextRank], session_version: 1 },
        user_metadata: { full_name: displayName }
      }
    });
    const client = dbPool();
    const result = await client.query(
      `insert into public.profiles(id,email,display_name,rsi_handle,discord_handle,role,rank,status,points_balance,membership_stage,probation_ends_at,session_version)
       values($1::uuid,$2,$3,$4,$5,$6,$7,'invited',0,$8,case when $9>0 then now()+($9||' days')::interval else null end,1)
       on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,rsi_handle=excluded.rsi_handle,discord_handle=excluded.discord_handle,
         rank=excluded.rank,status='invited',membership_stage=excluded.membership_stage,probation_ends_at=excluded.probation_ends_at
       returning *`,
      [user.id, email, displayName, rsiHandle, discordHandle, nextRank === "president" ? "owner" : "member", nextRank, Number(probationDays)>0 ? "probationary" : "full", Math.max(0,Math.min(365,Number(probationDays)||0))]
    );
    await requestPasswordRecovery(email);
    await audit(client, profile, "member.invite", "profiles", result.rows[0]);
    return json({ invited: true, email, message: "Account setup email sent." });
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/invite-member" };
