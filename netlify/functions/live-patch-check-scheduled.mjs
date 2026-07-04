import { detectOfficialLivePatch, getAdminSummary } from "../lib/live-patch-data.mjs";

export default async function livePatchCheckScheduled() {
  try {
    const result = await detectOfficialLivePatch();
    console.log("Free Navy RSI LIVE patch check", result);
    return Response.json({ ok: true, result, summary: await getAdminSummary() });
  } catch (error) {
    console.error("Free Navy RSI LIVE patch check failed", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const config = {
  schedule: "0 */6 * * *",
};
