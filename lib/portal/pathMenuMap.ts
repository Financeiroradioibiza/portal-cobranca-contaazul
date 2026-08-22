import type { PortalMenuModuleId } from "@/lib/portal/menuPermissions";
import {
  hasLegacyAtendimentoModuleAccess,
  hasLegacySuporteModuleAccess,
  isSubAllowed,
  type PortalPermissionsMap,
} from "@/lib/portal/menuPermissions";
import type { PortalModuleId } from "@/lib/portal/portalNav";

function isSuporteModuleVisible(perm: PortalPermissionsMap): boolean {
  const p = perm.suporte;
  if (p === "all") return true;
  if (Array.isArray(p) && p.length > 0) return true;
  return hasLegacySuporteModuleAccess(perm);
}

/** Mapeia URL do portal para módulo + sub-id do painel Config → Usuários. */
export function resolvePathMenuPermission(
  pathname: string,
): { module: PortalMenuModuleId; subId: string } | null {
  const path = pathname.split("?")[0] ?? pathname;

  if (path === "/") {
    return { module: "producao", subId: "dashboard" };
  }

  if (path === "/clientes" || path.startsWith("/clientes/")) {
    if (path === "/clientes/likes" || path.startsWith("/clientes/likes/")) {
      return { module: "atendimento", subId: "likes" };
    }
    return { module: "atendimento", subId: "clientes" };
  }

  if (path.startsWith("/musicboard")) {
    return { module: "atendimento", subId: "musicboard" };
  }

  if (path.startsWith("/financeiro/")) {
    const sub = path.slice("/financeiro/".length).split("/")[0];
    return sub ? { module: "financeiro", subId: sub } : null;
  }

  if (path.startsWith("/cadastros/")) {
    const sub = path.slice("/cadastros/".length).split("/")[0];
    if (!sub) return null;
    if (sub === "cliente-pdv-novo" || sub === "solicitar-pdv") {
      return { module: "atendimento", subId: "solicitar-pdv" };
    }
    if (sub === "prospects") return { module: "atendimento", subId: "prospects" };
    return { module: "cadastros", subId: sub };
  }

  if (path.startsWith("/criacao/")) {
    const sub = path.slice("/criacao/".length).split("/")[0];
    if (!sub) return null;
    if (sub === "atl-crica") return { module: "criacao", subId: "atl-crica" };
    if (sub === "atualizacoes") return { module: "criacao", subId: "atualizacoes" };
    return { module: "criacao", subId: sub };
  }

  if (path.startsWith("/atendimento/")) {
    const sub = path.slice("/atendimento/".length).split("/")[0];
    return sub ? { module: "atendimento", subId: sub } : null;
  }

  if (path.startsWith("/suporte") || path.startsWith("/producao/suporte")) {
    if (path === "/suporte" || path === "/producao/suporte") {
      return { module: "suporte", subId: "central" };
    }
    const sub = path.replace(/^\/producao\/suporte\/?/, "").replace(/^\/suporte\/?/, "").split("/")[0];
    return sub ? { module: "suporte", subId: sub } : { module: "suporte", subId: "central" };
  }

  if (path.startsWith("/config/")) {
    const sub = path.slice("/config/".length).split("/")[0];
    if (!sub) return { module: "config", subId: "parametros" };
    if (sub === "usuarios") return { module: "config", subId: "usuarios" };
    if (sub === "servidores") return { module: "config", subId: "servidores" };
    if (sub === "parametros") return { module: "config", subId: "parametros" };
    if (sub === "logs") return { module: "config", subId: "logs" };
    if (sub === "erros") return { module: "config", subId: "erros" };
    return { module: "config", subId: sub };
  }

  return null;
}

export function isPathAllowedByMenuPermissions(
  pathname: string,
  perm: PortalPermissionsMap | "all",
): boolean {
  if (perm === "all") return true;
  const target = resolvePathMenuPermission(pathname);
  if (!target) return true;
  return isSubAllowed(target.module, target.subId, perm);
}

/** Item do topo visível se o perfil permite ao menos um submenu do módulo. */
export function isTopNavModuleVisible(
  moduleId: PortalModuleId,
  perm: PortalPermissionsMap | "all",
): boolean {
  if (perm === "all") return true;

  if (moduleId === "dashboard") {
    return isSubAllowed("producao", "dashboard", perm);
  }
  if (moduleId === "atendimento") {
    const p = perm.atendimento;
    if (p === "all") return true;
    if (Array.isArray(p) && p.length > 0) return true;
    if (hasLegacyAtendimentoModuleAccess(perm)) return true;
    return false;
  }
  if (moduleId === "suporte") {
    return isSuporteModuleVisible(perm);
  }
  if (moduleId === "chamados") {
    return true;
  }
  if (moduleId === "config") {
    const p = perm.config;
    if (p === "all") return true;
    return Array.isArray(p) && p.length > 0;
  }

  const menuModule = moduleId as PortalMenuModuleId;
  const p = perm[menuModule];
  if (p === "all") return true;
  return Array.isArray(p) && p.length > 0;
}

export function isSidebarHrefAllowed(href: string, perm: PortalPermissionsMap | "all"): boolean {
  if (perm === "all") return true;
  const target = resolvePathMenuPermission(href);
  if (!target) return true;
  return isSubAllowed(target.module, target.subId, perm);
}
