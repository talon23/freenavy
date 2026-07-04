const TEST_ENV_RE = /(?:^|[-_.\s])(PTU|EPTU|EVOCATI|TECH[-_.\s]?PREVIEW)(?:$|[-_.\s])/i;

export function normalisePatch(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)(?:[-.]LIVE(?:[.-](\d+))?)?/i);
  if (!match) return null;
  return {
    patch: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    build: match[4] || null,
    full: match[0],
  };
}

export function comparePatches(left, right) {
  const a = normalisePatch(left)?.patch?.split(".").map(Number) || [0, 0, 0];
  const b = normalisePatch(right)?.patch?.split(".").map(Number) || [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function isLiveRecord(record, fallbackVersion = "") {
  const environment = [record?.environment, record?.channel, record?.version, fallbackVersion]
    .filter(Boolean)
    .join(" ");
  return !TEST_ENV_RE.test(environment);
}

export function fullLiveVersion(value) {
  const parsed = normalisePatch(value);
  if (!parsed) return null;
  return parsed.build ? `${parsed.patch}-LIVE.${parsed.build}` : parsed.patch;
}
