import crypto from "node:crypto";
import { json, errorResponse, httpError, assertSameOrigin, dbPool } from "../lib/netlify.mjs";
import { verifySignupToken } from "../lib/private-signup.mjs";

function clean(value, max = 500) { return String(value || "").trim().slice(0, max); }

export default async function membershipRequest(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    assertSameOrigin(request);
    const body = await request.json();
    if (clean(body.website, 200)) return json({ submitted: true, message: "Application received." }, 201);
    const client = dbPool();
    const forwarded = request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const clientHash = crypto.createHash("sha256").update(`${process.env.PRIVATE_SIGNUP_SECRET || "free-navy"}:${forwarded}`).digest("hex");
    const rate = await client.query(
      `insert into public.application_rate_limits(client_hash,attempts) values($1,1)
       on conflict(client_hash) do update set
         attempts=case when application_rate_limits.window_started_at < now()-interval '1 hour' then 1 else application_rate_limits.attempts+1 end,
         window_started_at=case when application_rate_limits.window_started_at < now()-interval '1 hour' then now() else application_rate_limits.window_started_at end,
         blocked_until=case when application_rate_limits.window_started_at >= now()-interval '1 hour' and application_rate_limits.attempts+1 > 10 then now()+interval '1 hour' else application_rate_limits.blocked_until end,
         updated_at=now()
       returning attempts,blocked_until`,
      [clientHash]
    );
    if (rate.rows[0]?.blocked_until && new Date(rate.rows[0].blocked_until) > new Date()) throw httpError(429, "Too many application attempts. Try again later.");
    const verified = await verifySignupToken(client, clean(body.token, 120));
    if (!verified) throw httpError(403, "This private recruitment link is invalid, exhausted, revoked or expired.");
    const email = clean(body.email, 320).toLowerCase();
    const displayName = clean(body.display_name, 120);
    const rsiHandle = clean(body.rsi_handle, 120);
    const discordHandle = clean(body.discord_handle, 120);
    const message = clean(body.message, 2000);
    const referrer = clean(body.referrer_name, 120);
    const requestedDepartment = clean(body.requested_department, 120);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, "Enter a valid email address.");
    if (!displayName || !rsiHandle) throw httpError(400, "Display name and RSI handle are required.");
    const blocked = await client.query("select id from public.recruitment_blocks where lower(email)=lower($1) limit 1", [email]);
    if (blocked.rows[0]) throw httpError(403, "This email address cannot submit a membership application.");
    try {
      const result = await client.query(
        `insert into public.membership_applications(
           email,display_name,rsi_handle,discord_handle,message,token_date,status,registration_link_id,referrer_name,requested_department
         ) values($1,$2,$3,$4,$5,$6::date,'pending',$7::uuid,$8,$9) returning id,created_at`,
        [email, displayName, rsiHandle, discordHandle, message, verified.token_date, verified.id, referrer, requestedDepartment]
      );
      await client.query("update public.registration_links set uses_count=uses_count+1 where id=$1::uuid", [verified.id]);
      await client.query(
        `insert into public.notifications(member_id,title,message,category)
         select distinct p.id,$1,$2,'recruitment' from public.profiles p
         left join public.member_roles mr on mr.profile_id=p.id and mr.role='admin' and mr.active=true and (mr.expires_at is null or mr.expires_at>now())
         where p.status='active' and (p.rank in ('president','vice_president','general','admiral','vice_admiral','rear_admiral','brigadier_general','officer') or mr.id is not null)`,
        ["New membership application", `${displayName} (${rsiHandle}) is waiting for command review.`]
      );
      return json({ submitted: true, application_id: result.rows[0].id, message: "Application sent to Free Navy command for review." }, 201);
    } catch (error) {
      if (error.code === "23505") throw httpError(409, "A pending application already exists for this email address.");
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/membership-request" };
