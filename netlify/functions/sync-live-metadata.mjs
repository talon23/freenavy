import { discoverOfficialLiveVersion } from "../lib/official-live.mjs";
import { dbPool } from "../lib/netlify.mjs";

export default async function syncLiveMetadata() {
  const client = dbPool();
  const previousResult = await client.query("select version from public.live_patch_records where id='current-live'");
  const previousVersion = String(previousResult.rows[0]?.version || "");
  const result = await discoverOfficialLiveVersion();
  await client.query(
    `insert into public.live_patch_records(id,environment,version,status,source_name,source_url,checked_at)
     values('current-live','LIVE',$1,'active',$2,$3,$4)
     on conflict(id) do update set environment='LIVE',version=excluded.version,status='active',source_name=excluded.source_name,source_url=excluded.source_url,checked_at=excluded.checked_at,updated_at=now()`,
    [result.version, result.source, result.source_url, result.checked_at]
  );
  await client.query("update public.sync_sources set last_success_at=$2,required_patch=$3,status=$4 where source_name=$1", ["Official RSI LIVE version", result.checked_at, result.version, result.fallback_used ? "fallback" : "configured"]);
  await client.query("update public.sync_sources set required_patch=$1 where source_name in ('UEX commodities and routes','Free Navy member verification','Star Citizen Wiki game data','UEX item and location data')", [result.version]);
  await client.query("update public.member_roles set active=false where active=true and expires_at is not null and expires_at<=now()");
  await client.query("update public.member_capability_overrides set expires_at=now() where expires_at is not null and expires_at<=now()");
  await client.query("update public.profiles set membership_stage='full',probation_ends_at=null,updated_at=now() where membership_stage='probationary' and probation_ends_at is not null and probation_ends_at<=now() and status='active'");
  await client.query("update public.wreck_reports set status='expired' where expires_at<now() and status in ('open','reported','available','claimed')");
  await client.query("update public.salvage_locations set status='stale',confidence='pending' where expires_at<now() and status in ('approved','pending')");
  await client.query("update public.intel_reports set status='expired' where expires_at<now() and status in ('active','unverified')");

  if (previousVersion && previousVersion !== result.version && !result.fallback_used) {
    const campaign = await client.query(
      `insert into public.verification_campaigns(game_version,title,status)
       values($1,$2,'active') on conflict(game_version) do update set title=excluded.title,status='active',started_at=now(),completed_at=null returning *`,
      [result.version, `LIVE ${result.version} reconfirmation`]
    );
    const sources = [
      ["knowledge_locations", "item_name"],
      ["mining_locations", "material_name"],
      ["salvage_locations", "material_name"]
    ];
    for (const [table, nameColumn] of sources) {
      const rows = await client.query(`select id,coalesce(${nameColumn},location_name,'Record') as name from public.${table} where status not in ('rejected','removed')`);
      for (const row of rows.rows) {
        await client.query(
          `insert into public.verification_tasks(campaign_id,entity_type,entity_id,entity_name,category,reward_points)
           values($1::uuid,$2,$3,$4,$2,10) on conflict(campaign_id,entity_type,entity_id) do nothing`,
          [campaign.rows[0].id, table, String(row.id), row.name]
        );
      }
      await client.query(`update public.${table} set confidence='pending',status=case when status='approved' then 'pending' else status end`);
    }
    await client.query(
      `insert into public.notifications(member_id,title,message,category)
       select id,$1,$2,'patch' from public.profiles where status='active'`,
      [`LIVE ${result.version} detected`, "Patch-sensitive locations are being reconfirmed. Existing information remains visible with freshness warnings."]
    );
  }
  return new Response(null, { status: 204 });
}

export const config = { schedule: "0 */3 * * *" };
