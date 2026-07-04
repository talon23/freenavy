import { requireMember, canViewSignupLink, canManageSignupLink, json, errorResponse, httpError, assertSameOrigin, audit } from "../lib/netlify.mjs";
import { ensureCurrentLink, tokenFor } from "../lib/private-signup.mjs";

function serialize(row, request) {
  const tokenDate = row.token_date?.toISOString?.().slice(0, 10) || String(row.token_date).slice(0, 10);
  const token = tokenFor(tokenDate, row.generation);
  const origin = process.env.URL || new URL(request.url).origin;
  return {
    id: row.id,
    url: `${origin}/?join=${encodeURIComponent(token)}`,
    token_date: tokenDate,
    generation: row.generation,
    max_uses: row.max_uses,
    uses_count: row.uses_count,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at
  };
}

export default async function signupLink(request) {
  if (!["GET","POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  try {
    const { profile, client } = await requireMember();
    if (!canViewSignupLink(profile)) throw httpError(403, "Officer access or above is required.");
    if (request.method === "GET") {
      const row = await ensureCurrentLink(client, profile.id);
      return json(serialize(row, request));
    }
    assertSameOrigin(request);
    if (!canManageSignupLink(profile)) throw httpError(403, "Recruitment-link management permission required.");
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "regenerate");
    if (action === "revoke") {
      await client.query("update public.registration_links set revoked_at=now(),revoked_by=$2::uuid where id=$1::uuid and revoked_at is null", [body.id, profile.id]);
      await audit(client, profile, "signup-link.revoke", "registration_links", { id: body.id, name: "Private signup link" });
      return json({ revoked: true });
    }
    if (action === "regenerate") {
      const today = new Date().toISOString().slice(0,10);
      await client.query("update public.registration_links set revoked_at=now(),revoked_by=$2::uuid where token_date=$1::date and revoked_at is null", [today, profile.id]);
      const generationResult = await client.query("select coalesce(max(generation),0)+1 as generation from public.registration_links where token_date=$1::date", [today]);
      const generation = Number(generationResult.rows[0]?.generation || 1);
      const maxUses = Math.max(1, Math.min(500, Number(body.max_uses || 25)));
      const result = await client.query(
        `insert into public.registration_links(token_date,generation,max_uses,expires_at,created_by)
         values($1::date,$2,$3,($1::date + interval '1 day'),$4::uuid) returning *`,
        [today, generation, maxUses, profile.id]
      );
      await audit(client, profile, "signup-link.regenerate", "registration_links", { ...result.rows[0], name: "Private signup link" });
      return json(serialize(result.rows[0], request));
    }
    throw httpError(400, "Unsupported signup-link action.");
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/signup-link" };
