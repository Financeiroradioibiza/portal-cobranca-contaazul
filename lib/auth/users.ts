export type PortalUserRecord = {
  username: string;
  passwordHash: string;
  totpSecret: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Usuários do portal (financeiro). JSON em PORTAL_USERS_JSON.
 *
 * Exemplo (uma linha no .env / Netlify):
 * [{"username":"joao","passwordHash":"$2a$12$...","totpSecret":"JBSWY3DPEHPK3PXP"}]
 */
export function getPortalUsers(): PortalUserRecord[] {
  const raw = process.env.PORTAL_USERS_JSON?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: PortalUserRecord[] = [];
  for (const row of parsed) {
    if (!isRecord(row)) continue;
    const username = typeof row.username === "string" ? row.username.trim() : "";
    const passwordHash =
      typeof row.passwordHash === "string" ? row.passwordHash.trim() : "";
    const totpSecret =
      typeof row.totpSecret === "string" ? row.totpSecret.trim().replace(/\s/g, "") : "";
    if (!username || !passwordHash || !totpSecret) continue;
    out.push({ username, passwordHash, totpSecret });
  }
  return out;
}

export function findPortalUser(username: string): PortalUserRecord | undefined {
  const u = username.trim();
  return getPortalUsers().find((x) => x.username === u);
}

export function isPortalAuthConfigured(): boolean {
  const secret = process.env.PORTAL_SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) return false;
  return getPortalUsers().length > 0;
}

export function isPortalAuthDisabled(): boolean {
  if (process.env.PORTAL_AUTH_DISABLED !== "true") return false;
  return process.env.NODE_ENV !== "production";
}
