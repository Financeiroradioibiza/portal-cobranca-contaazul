import type { PortalRole } from "@/lib/auth/roles";

export type RouteAccessRule =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "master" }
  | { kind: "roles"; roles: PortalRole[] };

const FINANCEIRO: PortalRole[] = ["cobranca"];
const CONSULTA_PAINEL: PortalRole[] = ["cobranca", "suporte"];
const CADASTROS_FULL: PortalRole[] = ["cadastros"];
const CADASTROS_VINCULOS: PortalRole[] = ["cadastros", "cobranca", "suporte"];
const PRODUCAO: PortalRole[] = ["producao", "suporte", "criacao", "relacionamento", "cadastros"];

function hasAnyRole(userRoles: PortalRole[], allowed: PortalRole[]): boolean {
  if (userRoles.includes("master")) return true;
  return allowed.some((r) => userRoles.includes(r));
}

export function isRouteAccessAllowed(rule: RouteAccessRule, roles: PortalRole[]): boolean {
  switch (rule.kind) {
    case "public":
      return true;
    case "authenticated":
      return true;
    case "master":
      return roles.includes("master");
    case "roles":
      return hasAnyRole(roles, rule.roles);
  }
}

function cadastrosApiRule(pathname: string): RouteAccessRule {
  if (
    pathname.includes("/vinculos") ||
    pathname.startsWith("/api/cadastros/pdv-link")
  ) {
    return { kind: "roles", roles: CADASTROS_VINCULOS };
  }
  return { kind: "roles", roles: CADASTROS_FULL };
}

/** Regra de acesso por caminho (páginas e APIs autenticadas). */
export function resolveRouteAccessRule(pathname: string): RouteAccessRule | null {
  if (pathname.startsWith("/config") || pathname.startsWith("/api/config")) {
    return { kind: "master" };
  }

  if (pathname.startsWith("/api/radio-painel")) {
    return { kind: "roles", roles: CONSULTA_PAINEL };
  }

  if (pathname === "/financeiro/consulta-painel") {
    return { kind: "roles", roles: CONSULTA_PAINEL };
  }

  if (
    pathname === "/api/contaazul/disconnect" ||
    pathname.startsWith("/api/contaazul/disconnect/")
  ) {
    return { kind: "master" };
  }

  if (
    pathname.startsWith("/financeiro") ||
    pathname.startsWith("/api/cobranca-aberta") ||
    pathname.startsWith("/api/manual-envios") ||
    pathname.startsWith("/api/clients") ||
    pathname.startsWith("/api/rio-planilha") ||
    pathname.startsWith("/api/contaazul")
  ) {
    return { kind: "roles", roles: FINANCEIRO };
  }

  if (pathname.startsWith("/api/cadastros") || pathname.startsWith("/cadastros")) {
    if (pathname.startsWith("/cadastros/vinculos")) {
      return { kind: "roles", roles: CADASTROS_VINCULOS };
    }
    if (pathname.startsWith("/cadastros")) {
      return { kind: "roles", roles: CADASTROS_FULL };
    }
    return cadastrosApiRule(pathname);
  }

  if (pathname.startsWith("/api/producao") || pathname.startsWith("/producao")) {
    return { kind: "roles", roles: PRODUCAO };
  }

  if (pathname === "/" || pathname.startsWith("/suporte")) {
    return { kind: "authenticated" };
  }

  return null;
}
