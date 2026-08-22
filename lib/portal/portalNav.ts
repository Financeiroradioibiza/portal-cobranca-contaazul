import { FINANCEIRO_NAV, FINANCEIRO_HOME_HREF } from "@/lib/portal/financeiroNav";
import { CADASTROS_SIDEBAR, CADASTROS_HOME_HREF } from "@/lib/portal/cadastrosNav";
import { CRIACAO_SIDEBAR, CRIACAO_HOME_HREF } from "@/lib/portal/criacaoNav";
import { CONFIG_NAV, CONFIG_HOME_HREF } from "@/lib/portal/configNav";
import { PORTAL_HOME_HREF } from "@/lib/portal/portalHome";
import {
  isSidebarHrefAllowed,
  isTopNavModuleVisible,
} from "@/lib/portal/pathMenuMap";
import type { PortalPermissionsMap } from "@/lib/portal/menuPermissions";

const CONFIG_ICONS: Record<string, string> = {
  "/config/parametros": "⚙️",
  "/config/usuarios": "👥",
  "/config/servidores": "🖥️",
  "/config/integracoes": "🔗",
  "/config/seguranca": "🔒",
  "/config/logs": "📋",
  "/config/erros": "🐞",
};

export type PortalModuleId =
  | "dashboard"
  | "financeiro"
  | "cadastros"
  | "criacao"
  | "atendimento"
  | "suporte"
  | "chamados"
  | "config";

export type PortalSidebarItem = {
  href?: string;
  icon?: string;
  label?: string;
  soon?: boolean;
  /** Linha fina entre blocos do submenu (ex.: criação vs produção). */
  separator?: boolean;
  /** Só marca ativo na URL exata (ex.: /suporte vs /suporte/avisos-player). */
  exact?: boolean;
  /** Visível somente para Rafael Gasparian (fluxo interno). */
  fluxoRafaelOnly?: boolean;
};

export type PortalTopNavItem = {
  id: PortalModuleId;
  label: string;
  icon: string;
  href: string;
  masterOnly?: boolean;
};

export const PORTAL_TOP_NAV: PortalTopNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "🏠", href: PORTAL_HOME_HREF },
  { id: "financeiro", label: "Financeiro", icon: "💰", href: FINANCEIRO_HOME_HREF },
  { id: "cadastros", label: "Cadastros", icon: "📋", href: CADASTROS_HOME_HREF },
  { id: "criacao", label: "Criação", icon: "🎵", href: CRIACAO_HOME_HREF },
  { id: "atendimento", label: "Atendimento", icon: "💬", href: "/atendimento/rela" },
  { id: "suporte", label: "Suporte", icon: "🎧", href: "/suporte" },
  { id: "chamados", label: "Chamados", icon: "🎫", href: "/chamados" },
  {
    id: "config",
    label: "Configuração",
    icon: "⚙️",
    href: CONFIG_HOME_HREF,
    masterOnly: true,
  },
];

export const PORTAL_SIDEBARS: Record<PortalModuleId, { section: string; items: PortalSidebarItem[] }> = {
  dashboard: {
    section: "Dashboard",
    items: [{ href: PORTAL_HOME_HREF, icon: "🏠", label: "Visão geral" }],
  },
  financeiro: {
    section: "Financeiro",
    items: FINANCEIRO_NAV.map((x) => ({
      href: x.href,
      icon: x.icon,
      label: x.label,
      fluxoRafaelOnly: "fluxoRafaelOnly" in x ? x.fluxoRafaelOnly : undefined,
    })),
  },
  cadastros: {
    section: "Cadastros",
    items: CADASTROS_SIDEBAR.map((x) => ({
      href: x.href,
      icon: x.icon,
      label: x.label,
      soon: "soon" in x ? (x as { soon?: boolean }).soon : undefined,
    })),
  },
  criacao: {
    section: "Criação",
    items: CRIACAO_SIDEBAR.map((x) =>
      x.type === "separator"
        ? { separator: true as const }
        : {
            href: x.href,
            icon: x.icon,
            label: x.label,
            soon: "soon" in x ? (x as { soon?: boolean }).soon : undefined,
          },
    ),
  },
  atendimento: {
    section: "Atendimento",
    items: [
      { href: "/atendimento/rela", icon: "📋", label: "Rela" },
      { href: "/clientes", icon: "👥", label: "Clientes", exact: true },
      { href: "/clientes/likes", icon: "👍", label: "Likes" },
      { href: "/musicboard", icon: "🎨", label: "MusicBoard" },
      { href: "/cadastros/prospects", icon: "🆕", label: "Prospects" },
      { href: "/cadastros/solicitar-pdv", icon: "📻", label: "Cadastrar PDV" },
    ],
  },
  suporte: {
    section: "Suporte",
    items: [
      { href: "/suporte", icon: "🎧", label: "Central de suporte", exact: true },
      { href: "/suporte/logins-clientes", icon: "🔑", label: "Logins clientes" },
      { href: "/suporte/site-clientes", icon: "🌐", label: "Site clientes" },
      { href: "/suporte/avisos-player", icon: "📢", label: "Avisos player" },
      { href: "/suporte/instalacao", icon: "📦", label: "Instalação" },
    ],
  },
  chamados: {
    section: "Chamados",
    items: [{ href: "/chamados", icon: "🎫", label: "Quadro kanban" }],
  },
  config: {
    section: "Configuração",
    items: CONFIG_NAV.map((x) => ({
      href: x.href,
      icon: CONFIG_ICONS[x.href] ?? "•",
      label: x.label,
      soon: "soon" in x ? x.soon : undefined,
    })),
  },
};

export function resolvePortalModule(pathname: string): PortalModuleId {
  if (pathname.startsWith("/financeiro") || pathname.startsWith("/cobranca")) return "financeiro";
  if (
    pathname.startsWith("/clientes") ||
    pathname.startsWith("/musicboard") ||
    pathname.startsWith("/cadastros/prospects") ||
    pathname.startsWith("/cadastros/solicitar-pdv") ||
    pathname.startsWith("/cadastros/cliente-pdv-novo")
  ) {
    return "atendimento";
  }
  if (pathname.startsWith("/cadastros")) return "cadastros";
  if (pathname.startsWith("/criacao")) return "criacao";
  if (pathname.startsWith("/atendimento")) return "atendimento";
  if (pathname.startsWith("/suporte") || pathname.startsWith("/producao/suporte")) return "suporte";
  if (pathname.startsWith("/chamados")) return "chamados";
  if (pathname.startsWith("/config")) return "config";
  return "dashboard";
}

export function isSidebarActive(pathname: string, href: string, exact?: boolean): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (exact) return false;
  return pathname.startsWith(`${href}/`);
}

export function topNavHref(item: PortalTopNavItem, perm: PortalPermissionsMap | "all" = "all"): string {
  if (item.id === "dashboard") return PORTAL_HOME_HREF;
  const sidebar = PORTAL_SIDEBARS[item.id];
  const first = sidebar.items.find(
    (x) =>
      !x.soon &&
      !x.separator &&
      x.href &&
      isSidebarHrefAllowed(x.href, perm),
  );
  return first?.href ?? item.href;
}

export function filterTopNav(
  items: PortalTopNavItem[],
  perm: PortalPermissionsMap | "all",
  opts?: { isMaster?: boolean },
): PortalTopNavItem[] {
  return items.filter((item) => {
    if (item.masterOnly && !opts?.isMaster) return false;
    return isTopNavModuleVisible(item.id, perm);
  });
}

export function filterSidebarItems(
  items: PortalSidebarItem[],
  perm: PortalPermissionsMap | "all",
): PortalSidebarItem[] {
  return items.filter((item) => {
    if (item.separator || item.soon || !item.href) return true;
    return isSidebarHrefAllowed(item.href, perm);
  });
}
