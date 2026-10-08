import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";
import { isSidebarHrefAllowed } from "@/lib/portal/pathMenuMap";

/** Sidebar do módulo Cadastros. */
export const CADASTROS_SIDEBAR = [
  { href: "/cadastros/grupos", label: "Rio × Produção", icon: "👥" },
  { href: "/cadastros/vinculos", label: "IDs Player", icon: "🔢" },
  { href: "/cadastros/primeiro-ping", label: "Primeiro ping", icon: "📡" },
  { href: "/cadastros/atualizacoes", label: "Atl. cadastros", icon: "🔄" },
] as const;

/** URLs sob /cadastros concedidas pelo perfil Atendimento (ex.: Relacionamento). */
export const CADASTROS_ATENDIMENTO_HREFS = [
  "/cadastros/prospects",
  "/cadastros/solicitar-pdv",
] as const;

/** Fallback legado — preferir `resolveCadastrosHomeHref(perm)`. */
export const CADASTROS_HOME_HREF = "/cadastros/grupos";

/** Primeira tela de Cadastros permitida no perfil (ex.: Financeiro → IDs Player, não Grupos). */
export function resolveCadastrosHomeHref(perm: PortalPermissionsMap | "all"): string {
  for (const item of CADASTROS_SIDEBAR) {
    if (item.href && isSidebarHrefAllowed(item.href, perm)) {
      return item.href;
    }
  }
  for (const href of CADASTROS_ATENDIMENTO_HREFS) {
    if (isSidebarHrefAllowed(href, perm)) {
      return href;
    }
  }
  return CADASTROS_HOME_HREF;
}

/** @deprecated */
export const CADASTROS_NAV = CADASTROS_SIDEBAR.map((x) => ({
  href: x.href,
  label: x.label,
  short: x.label.split(" ")[0] ?? x.label,
}));
