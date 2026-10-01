import { parseRolesJson } from "@/lib/portal/menuPermissions";

/** Setor do chamado (ex.: producao) ↔ perfil portal (slug operador + papel producao nos roles). */
export function portalProfileMatchesChamadoSetor(
  profile: { slug: string; rolesJson: string },
  setorId: string,
): boolean {
  const s = setorId.trim().toLowerCase();
  if (!s) return false;
  if (profile.slug.trim().toLowerCase() === s) return true;
  const roles = parseRolesJson(profile.rolesJson).map((r) => r.toLowerCase());
  return roles.includes(s);
}

export function userContextMatchesChamadoSetor(
  ctx: { profileSlug: string; profileRoles: string[] },
  setorId: string,
): boolean {
  const s = setorId.trim().toLowerCase();
  if (!s) return false;
  if (ctx.profileSlug.trim().toLowerCase() === s) return true;
  return ctx.profileRoles.some((r) => r.toLowerCase() === s);
}
