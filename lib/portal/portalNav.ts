import { FINANCEIRO_NAV, FINANCEIRO_HOME_HREF } from "@/lib/portal/financeiroNav";
import { CADASTROS_SIDEBAR, CADASTROS_HOME_HREF } from "@/lib/portal/cadastrosNav";
import { CRIACAO_SIDEBAR, CRIACAO_HOME_HREF } from "@/lib/portal/criacaoNav";
import { CONFIG_NAV, CONFIG_HOME_HREF } from "@/lib/portal/configNav";
import { PORTAL_HOME_HREF } from "@/lib/portal/portalHome";

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
    items: [
      { href: PORTAL_HOME_HREF, icon: "🏠", label: "Visão geral" },
      { href: "/clientes", icon: "👥", label: "Clientes", exact: true },
      { href: "/clientes/likes", icon: "👍", label: "Likes" },
    ],
  },
  financeiro: {
    section: "Financeiro",
    items: FINANCEIRO_NAV.map((x) => ({
      href: x.href,
      icon: x.icon,
      label: x.label,
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
  suporte: {
    section: "Suporte",
    items: [
      { href: "/suporte", icon: "🎧", label: "Central de suporte", exact: true },
      { href: "/suporte/logins-clientes", icon: "🔑", label: "Logins clientes" },
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
  if (pathname.startsWith("/cadastros")) return "cadastros";
  if (pathname.startsWith("/criacao")) return "criacao";
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

export function topNavHref(item: PortalTopNavItem): string {
  if (item.id === "dashboard") return PORTAL_HOME_HREF;
  const sidebar = PORTAL_SIDEBARS[item.id];
  const first = sidebar.items.find((x) => !x.soon && !x.separator && x.href);
  return first?.href ?? item.href;
}
