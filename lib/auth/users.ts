export type PortalUserRecord = {
  username: string;
  passwordHash: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Usuários fixos do portal. Senhas só como bcrypt (cost 12).
 * Para alterar senhas sem redeploy, use PORTAL_USERS_JSON no servidor (mesmo formato, sem TOTP).
 */
const BUILT_IN_PORTAL_USERS: PortalUserRecord[] = [
  {
    username: "rafaelgasparian",
    passwordHash:
      "$2a$12$CvPFF1QEt9DKW1AcMoZRj.T1LVgnnDJ2azVZlRk.J6oyU6JB8kzJe",
  },
  {
    username: "rodolfogasparian",
    passwordHash:
      "$2a$12$CvPFF1QEt9DKW1AcMoZRj.T1LVgnnDJ2azVZlRk.J6oyU6JB8kzJe",
  },
];

/**
 * Opcional: sobrescreve / acrescenta usuários. Uma linha no .env / Netlify, ex.:
 * [{"username":"joao","passwordHash":"$2a$12$..."}]
 */
function getPortalUsersFromEnv(): PortalUserRecord[] {
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
    if (!username || !passwordHash) continue;
    out.push({ username, passwordHash });
  }
  return out;
}

export function getPortalUsers(): PortalUserRecord[] {
  const byName = new Map<string, PortalUserRecord>();
  for (const u of BUILT_IN_PORTAL_USERS) {
    byName.set(u.username, u);
  }
  for (const u of getPortalUsersFromEnv()) {
    byName.set(u.username, u);
  }
  return [...byName.values()];
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
