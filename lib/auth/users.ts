import { parsePortalRoles, type PortalRole } from "@/lib/auth/roles";

export type PortalUserRecord = {
  /** E-mail de login (normalizado minúsculas). */
  email: string;
  displayName?: string;
  passwordHash: string;
  /** Segredo Base32 do Google Authenticator. */
  totpSecret: string;
  roles: PortalRole[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizePortalEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function parseUserRow(row: Record<string, unknown>): PortalUserRecord | null {
  const emailRaw =
    typeof row.email === "string" ? row.email
    : typeof row.username === "string" ? row.username
    : "";
  const email = normalizePortalEmail(emailRaw);
  const passwordHash =
    typeof row.passwordHash === "string" ? row.passwordHash.trim() : "";
  const totpSecret =
    typeof row.totpSecret === "string" ? row.totpSecret.replace(/\s/g, "").toUpperCase() : "";
  if (!email || !email.includes("@") || !passwordHash || !totpSecret) return null;

  const displayName =
    typeof row.displayName === "string" && row.displayName.trim() ?
      row.displayName.trim()
    : undefined;

  return {
    email,
    displayName,
    passwordHash,
    totpSecret,
    roles: parsePortalRoles(row.roles),
  };
}

/**
 * Usuários do portal via `PORTAL_USERS_JSON` (Netlify / .env).
 * Formato: array JSON com email, passwordHash, totpSecret, roles, displayName opcional.
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
    const user = parseUserRow(row);
    if (user) out.push(user);
  }
  return out;
}

export function getPortalUsers(): PortalUserRecord[] {
  const byEmail = new Map<string, PortalUserRecord>();
  for (const u of getPortalUsersFromEnv()) {
    byEmail.set(u.email, u);
  }
  return [...byEmail.values()];
}

export function findPortalUserByEmail(emailRaw: string): PortalUserRecord | undefined {
  const email = normalizePortalEmail(emailRaw);
  return getPortalUsers().find((x) => x.email === email);
}

/** @deprecated Use findPortalUserByEmail — sessão JWT usa e-mail em `sub`. */
export function findPortalUser(identifier: string): PortalUserRecord | undefined {
  return findPortalUserByEmail(identifier);
}

export function isPortalAuthConfigured(): boolean {
  const secret = process.env.PORTAL_SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) return false;
  if (getPortalUsers().length > 0) return true;
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isPortalAuthDisabled(): boolean {
  if (process.env.PORTAL_AUTH_DISABLED !== "true") return false;
  return process.env.NODE_ENV !== "production";
}
