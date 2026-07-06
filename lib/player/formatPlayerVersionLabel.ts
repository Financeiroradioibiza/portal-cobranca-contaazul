const PLATFORM_LABELS: Record<string, string> = {
  android: "Android",
  ios: "IOS",
  win: "WIN",
  w: "WIN",
  mac: "MAC",
  m: "MAC",
  linux: "LINUX",
  wl: "LINUX",
  multi: "MULTI",
};

function normalizePlatformLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return PLATFORM_LABELS[key] ?? raw.trim().toUpperCase();
}

/** Exibe versão do player na central de suporte — ex.: `5.05 Android`, `5.05 MULTI`. */
export function formatPlayerVersionLabel(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;

  const spaced = v.match(/^(\d+\.\d+)\s+(\S+)$/i);
  if (spaced) {
    return `${spaced[1]} ${normalizePlatformLabel(spaced[2])}`;
  }

  if (/^\d+\.\d+$/.test(v)) return v;

  const glued = v.match(/^(\d+\.\d+)(.*)$/i);
  if (!glued) return v;

  const base = glued[1];
  const suf = glued[2]?.trim() ?? "";
  if (!suf || suf === "5") return base;

  const label = PLATFORM_LABELS[suf.toLowerCase()];
  if (label) return `${base} ${label}`;

  return v;
}
