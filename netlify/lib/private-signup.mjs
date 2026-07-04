import crypto from "node:crypto";

export function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }

function secret() {
  const value = String(process.env.PRIVATE_SIGNUP_SECRET || "").trim();
  if (value.length < 32) throw new Error("PRIVATE_SIGNUP_SECRET must contain at least 32 unpredictable characters.");
  return value;
}

export function tokenFor(tokenDate, generation = 1) {
  const token = crypto.createHmac("sha256", secret())
    .update(`free-navy-membership:${tokenDate}:${Number(generation)}`)
    .digest("base64url").slice(0, 48);
  return token;
}

export function safeTokenEqual(candidate, expected) {
  const supplied = Buffer.from(String(candidate || ""));
  const wanted = Buffer.from(String(expected || ""));
  return supplied.length === wanted.length && crypto.timingSafeEqual(supplied, wanted);
}

export async function ensureCurrentLink(client, createdBy = null) {
  const today = dateKey();
  const existing = await client.query(
    `select * from public.registration_links
     where token_date=$1::date and revoked_at is null and expires_at>now() and uses_count<max_uses
     order by generation desc limit 1`,
    [today]
  );
  if (existing.rows[0]) return existing.rows[0];
  const generationResult = await client.query(
    "select coalesce(max(generation),0)+1 as generation from public.registration_links where token_date=$1::date",
    [today]
  );
  const generation = Number(generationResult.rows[0]?.generation || 1);
  const result = await client.query(
    `insert into public.registration_links(token_date,generation,max_uses,expires_at,created_by)
     values($1::date,$2,25,($1::date + interval '1 day'),$3::uuid) returning *`,
    [today, generation, createdBy]
  );
  return result.rows[0];
}

export async function verifySignupToken(client, candidate) {
  if (!candidate) return null;
  const today = dateKey();
  const result = await client.query(
    `select * from public.registration_links
     where token_date=$1::date and revoked_at is null and expires_at>now() and uses_count<max_uses
     order by generation desc`,
    [today]
  );
  for (const row of result.rows) {
    if (safeTokenEqual(candidate, tokenFor(row.token_date.toISOString?.().slice(0,10) || String(row.token_date).slice(0,10), row.generation))) return row;
  }
  return null;
}
