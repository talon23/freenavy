const RSI_ORIGIN = "https://robertsspaceindustries.com";
const PATCH_INDEX = `${RSI_ORIGIN}/en/patch-notes`;
const DEFAULT_PATCH_PAGE = `${RSI_ORIGIN}/en/comm-link/Patch-Notes/21168-Star-Citizen-Alpha-48`;
const USER_AGENT = "FreeNavyOrgPortal/1.0 (+LIVE-version-gate)";

function absoluteRsiUrl(value) {
  try {
    const url = new URL(value, RSI_ORIGIN);
    return url.origin === RSI_ORIGIN ? url.href : null;
  } catch { return null; }
}

function patchLinksFromHtml(html) {
  const matches = html.matchAll(/(?:href=["'])?([^"'<>\s]*\/en\/comm-link\/Patch-Notes\/[^"'<>\s?#]+)/gi);
  const links = [];
  for (const match of matches) {
    const url = absoluteRsiUrl(match[1]);
    if (url && !links.includes(url)) links.push(url);
  }
  return links;
}

function liveVersionFromHtml(html) {
  const match = html.match(/Star Citizen Alpha\s+([0-9]+(?:\.[0-9A-Za-z]+){1,3})\s+LIVE/i);
  return match?.[1] || null;
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" });
  if (!response.ok) throw new Error(`RSI returned HTTP ${response.status}`);
  return response.text();
}

export async function discoverOfficialLiveVersion() {
  const fallbackVersion = process.env.STAR_CITIZEN_LIVE_VERSION || "4.8.3";
  const configuredPage = absoluteRsiUrl(process.env.RSI_LIVE_PATCH_URL || DEFAULT_PATCH_PAGE) || DEFAULT_PATCH_PAGE;
  const candidates = [];
  try {
    const indexHtml = await fetchHtml(PATCH_INDEX);
    candidates.push(...patchLinksFromHtml(indexHtml).slice(0, 12));
  } catch {}
  if (!candidates.includes(configuredPage)) candidates.push(configuredPage);

  for (const sourceUrl of candidates) {
    try {
      const html = await fetchHtml(sourceUrl);
      const version = liveVersionFromHtml(html);
      if (version) return { version, environment: "LIVE", source: "Official RSI patch notes", source_url: sourceUrl, checked_at: new Date().toISOString(), fallback_used: false };
    } catch {}
  }
  return { version: fallbackVersion, environment: "LIVE", source: "Configured fallback", source_url: configuredPage, checked_at: new Date().toISOString(), fallback_used: true };
}
