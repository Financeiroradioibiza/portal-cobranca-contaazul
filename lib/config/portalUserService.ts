import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parsePortalRoles, type PortalRole } from "@/lib/auth/roles";
import {
  findPortalUserByEmail as findEnvPortalUser,
  getPortalUsers,
  normalizePortalEmail,
  type PortalUserRecord,
} from "@/lib/auth/users";
import { generatePortalTotpSecret } from "@/lib/auth/totp";
import { parseRolesJson } from "@/lib/portal/menuPermissions";

export type DbPortalUserView = {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string;
  active: boolean;
  lastLoginAt: Date | null;
  profile: {
    id: string;
    slug: string;
    name: string;
    icon: string;
  };
};

function dbUserToRecord(row: {
  email: string;
  displayName: string;
  passwordHash: string;
  totpSecret: string;
  active: boolean;
  profile: { rolesJson: string };
}): PortalUserRecord | null {
  if (!row.active) return null;
  const roles = parseRolesJson(row.profile.rolesJson) as PortalRole[];
  return {
    email: row.email,
    displayName: row.displayName || undefined,
    passwordHash: row.passwordHash,
    totpSecret: row.totpSecret,
    roles: parsePortalRoles(roles),
  };
}

export async function findPortalUserForLogin(
  emailRaw: string,
): Promise<PortalUserRecord | undefined> {
  const email = normalizePortalEmail(emailRaw);
  try {
    const row = await prisma.portalUser.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (row) {
      const rec = dbUserToRecord(row);
      if (rec) return rec;
    }
  } catch {
    /* DB indisponível */
  }
  return findEnvPortalUser(email);
}

export async function touchPortalUserLastLogin(emailRaw: string): Promise<void> {
  const email = normalizePortalEmail(emailRaw);
  try {
    await prisma.portalUser.updateMany({
      where: { email, active: true },
      data: { lastLoginAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}

export async function ensureDefaultProfiles(): Promise<void> {
  const { DEFAULT_PORTAL_PROFILES } = await import("@/lib/portal/menuPermissions");
  for (const [slug, cfg] of Object.entries(DEFAULT_PORTAL_PROFILES)) {
    const permissionsJson =
      cfg.perm === "all" ? JSON.stringify("all") : JSON.stringify(cfg.perm);
    const rolesJson = JSON.stringify(cfg.roles);
    await prisma.portalProfile.upsert({
      where: { slug },
      create: {
        slug,
        name: cfg.name,
        icon: cfg.icon,
        description: cfg.desc,
        permissionsJson,
        rolesJson,
        sortOrder: cfg.sortOrder,
        isSystem: true,
      },
      update: {
        name: cfg.name,
        icon: cfg.icon,
        description: cfg.desc,
        sortOrder: cfg.sortOrder,
      },
    });
  }
}

export async function listPortalUsers(): Promise<DbPortalUserView[]> {
  await ensureDefaultProfiles();
  const rows = await prisma.portalUser.findMany({
    orderBy: [{ active: "desc" }, { displayName: "asc" }, { email: "asc" }],
    include: {
      profile: { select: { id: true, slug: true, name: true, icon: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    jobTitle: r.jobTitle,
    active: r.active,
    lastLoginAt: r.lastLoginAt,
    profile: r.profile,
  }));
}

export async function listPortalProfiles() {
  await ensureDefaultProfiles();
  const profiles = await prisma.portalProfile.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: { where: { active: true } } } } },
  });
  return profiles.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    icon: p.icon,
    description: p.description,
    permissionsJson: p.permissionsJson,
    rolesJson: p.rolesJson,
    isSystem: p.isSystem,
    userCount: p._count.users,
  }));
}

export async function createPortalUser(input: {
  email: string;
  displayName: string;
  jobTitle: string;
  profileId: string;
  password: string;
}): Promise<{ user: DbPortalUserView; totpSecret: string }> {
  const email = normalizePortalEmail(input.email);
  if (!email.includes("@")) throw new Error("invalid_email");

  const profile = await prisma.portalProfile.findUnique({ where: { id: input.profileId } });
  if (!profile) throw new Error("profile_not_found");

  const existing = await prisma.portalUser.findUnique({ where: { email } });
  if (existing) throw new Error("email_exists");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const totpSecret = generatePortalTotpSecret();

  const row = await prisma.portalUser.create({
    data: {
      email,
      displayName: input.displayName.trim(),
      jobTitle: input.jobTitle.trim(),
      passwordHash,
      totpSecret,
      profileId: profile.id,
    },
    include: {
      profile: { select: { id: true, slug: true, name: true, icon: true } },
    },
  });

  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      jobTitle: row.jobTitle,
      active: row.active,
      lastLoginAt: row.lastLoginAt,
      profile: row.profile,
    },
    totpSecret,
  };
}

export async function updatePortalUser(
  id: string,
  patch: {
    displayName?: string;
    jobTitle?: string;
    profileId?: string;
    active?: boolean;
    password?: string;
    resetTotp?: boolean;
  },
): Promise<{ user: DbPortalUserView; totpSecret?: string }> {
  const data: {
    displayName?: string;
    jobTitle?: string;
    profileId?: string;
    active?: boolean;
    passwordHash?: string;
    totpSecret?: string;
  } = {};

  if (patch.displayName !== undefined) data.displayName = patch.displayName.trim();
  if (patch.jobTitle !== undefined) data.jobTitle = patch.jobTitle.trim();
  if (patch.profileId !== undefined) data.profileId = patch.profileId;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.password?.trim()) {
    data.passwordHash = await bcrypt.hash(patch.password, 12);
  }
  let newTotp: string | undefined;
  if (patch.resetTotp) {
    newTotp = generatePortalTotpSecret();
    data.totpSecret = newTotp;
  }

  const row = await prisma.portalUser.update({
    where: { id },
    data,
    include: {
      profile: { select: { id: true, slug: true, name: true, icon: true } },
    },
  });

  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      jobTitle: row.jobTitle,
      active: row.active,
      lastLoginAt: row.lastLoginAt,
      profile: row.profile,
    },
    totpSecret: newTotp,
  };
}

export async function updatePortalProfilePermissions(
  id: string,
  permissionsJson: string,
  rolesJson: string,
): Promise<void> {
  await prisma.portalProfile.update({
    where: { id },
    data: { permissionsJson, rolesJson },
  });
}

export function computeUserStats(users: DbPortalUserView[]) {
  const active = users.filter((u) => u.active);
  const bySlug = (slug: string) => active.filter((u) => u.profile.slug === slug).length;
  return {
    total: active.length,
    admins: bySlug("admin"),
    operadores: bySlug("operador") + bySlug("curador") + bySlug("suporte") + bySlug("financeiro"),
    convidados: bySlug("cliente"),
  };
}

export function initials(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function formatRelativeLogin(at: string | null): string {
  if (!at) return "—";
  const date = new Date(at);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `${days} dias`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 sem" : `${weeks} sem`;
}

export function profileBadgeLabel(slug: string): string {
  if (slug === "admin") return "ADMIN";
  if (slug === "cliente") return "CONVIDADO";
  return slug === "financeiro" ? "FINANCEIRO" : "OPERADOR";
}

export function profileBadgeClass(slug: string): string {
  if (slug === "admin") return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  if (slug === "cliente") return "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200";
  return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
}

export function isPortalUsersDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function hasAnyPortalUsersSource(): boolean {
  return getPortalUsers().length > 0 || isPortalUsersDbAvailable();
}
