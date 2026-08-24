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
/** Espelho Rio × Produção (Cadastros → grupos): leitura do mês, sem menu Financeiro. */
const RIO_PLANILHA_CADASTROS_READ: PortalRole[] = ["cobranca", "cadastros"];

const RIO_PLANILHA_CLIENTES_MONTH_YM = /^\/api\/rio-planilha\/clientes\/month\/(\d{6})\/?$/;
const CADASTROS_RELACIONAMENTO: PortalRole[] = ["relacionamento", "cadastros", "cobranca"];
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

/** GET espelho planilha Rio usado em Cadastros (Rio × Produção / lista de meses em vínculos). */
function resolveRioPlanilhaCadastrosReadRule(
  pathname: string,
  method: string | undefined,
): RouteAccessRule | null {
  const verb = (method ?? "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return null;

  if (pathname === "/api/rio-planilha/clientes/months") {
    return { kind: "roles", roles: CADASTROS_VINCULOS };
  }
  if (RIO_PLANILHA_CLIENTES_MONTH_YM.test(pathname)) {
    return { kind: "roles", roles: RIO_PLANILHA_CADASTROS_READ };
  }
  return null;
}

function cadastrosApiRule(pathname: string): RouteAccessRule {
  if (
    pathname.includes("/prospects") ||
    pathname.includes("/pedidos-cliente") ||
    pathname.includes("/cnpj-lookup")
  ) {
    return { kind: "roles", roles: CADASTROS_RELACIONAMENTO };
  }
  if (
    pathname.includes("/vinculos") ||
    pathname.includes("/primeiro-ping") ||
    pathname.startsWith("/api/cadastros/pdv-link")
  ) {
    return { kind: "roles", roles: CADASTROS_VINCULOS };
  }
  return { kind: "roles", roles: CADASTROS_FULL };
}

/** Regra de acesso por caminho (páginas e APIs autenticadas). */
export function resolveRouteAccessRule(
  pathname: string,
  method?: string,
): RouteAccessRule | null {
  const rioCadastrosRead = resolveRioPlanilhaCadastrosReadRule(pathname, method);
  if (rioCadastrosRead) return rioCadastrosRead;

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
    pathname.startsWith("/financeiro/fluxo-rafael") ||
    pathname.startsWith("/api/financeiro/fluxo-rafael") ||
    pathname.startsWith("/fluxo-rafael/")
  ) {
    return { kind: "authenticated" };
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
    pathname.startsWith("/api/contaazul") ||
    pathname.startsWith("/api/financeiro")
  ) {
    return { kind: "roles", roles: FINANCEIRO };
  }

  if (pathname.startsWith("/api/cadastros") || pathname.startsWith("/cadastros")) {
    if (pathname.startsWith("/cadastros/vinculos") || pathname.startsWith("/cadastros/primeiro-ping")) {
      return { kind: "roles", roles: CADASTROS_VINCULOS };
    }
    if (pathname.startsWith("/cadastros/atualizacoes") || pathname.includes("/atualizacoes")) {
      return { kind: "roles", roles: CADASTROS_FULL };
    }
    if (
      pathname.startsWith("/cadastros/prospects") ||
      pathname.startsWith("/cadastros/solicitar-pdv") ||
      pathname.startsWith("/cadastros/cliente-pdv-novo")
    ) {
      return { kind: "roles", roles: CADASTROS_RELACIONAMENTO };
    }
    if (pathname.startsWith("/cadastros")) {
      return { kind: "roles", roles: CADASTROS_FULL };
    }
    return cadastrosApiRule(pathname);
  }

  if (pathname.match(/\/api\/suporte\/pdv\/[^/]+\/regenerar-token\/?$/)) {
    return { kind: "roles", roles: ["suporte"] };
  }

  if (pathname.startsWith("/api/producao") || pathname.startsWith("/api/suporte") || pathname.startsWith("/producao")) {
    return { kind: "roles", roles: PRODUCAO };
  }

  if (pathname.startsWith("/chamados") || pathname.startsWith("/api/chamados")) {
    return { kind: "authenticated" };
  }

  if (pathname === "/" || pathname.startsWith("/suporte")) {
    return { kind: "authenticated" };
  }

  return null;
}
