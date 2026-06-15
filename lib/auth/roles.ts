/** Papéis do Portal Ibiza 2026 — ver docs/PORTAL-USUARIOS-PERMISSOES.md */
export const PORTAL_ROLES = [
  "master",
  "cobranca",
  "cadastros",
  "producao",
  "suporte",
  "relacionamento",
  "criacao",
] as const;

export type PortalRole = (typeof PORTAL_ROLES)[number];

export function parsePortalRoles(raw: unknown): PortalRole[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<PortalRole>();
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const key = r.trim().toLowerCase();
    if ((PORTAL_ROLES as readonly string[]).includes(key)) {
      set.add(key as PortalRole);
    }
  }
  return [...set];
}

export function userHasRole(roles: PortalRole[], role: PortalRole): boolean {
  return roles.includes("master") || roles.includes(role);
}
