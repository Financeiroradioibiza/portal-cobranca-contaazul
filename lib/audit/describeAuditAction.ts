const PAGE_LABELS: Record<string, string> = {
  "/": "Acessou o dashboard",
  "/suporte": "Acessou Suporte",
  "/suporte/avisos-player": "Acessou Suporte — avisos player",
  "/chamados": "Acessou Chamados",
  "/cadastros": "Acessou Cadastros",
  "/cadastros/prospects": "Acessou Cadastros — prospects",
  "/cadastros/solicitar-pdv": "Acessou Cadastros — cadastrar PDV",
  "/cadastros/vinculos": "Acessou Cadastros — vínculos",
  "/cadastros/cliente-pdv-novo": "Acessou Cadastros — cliente PDV novo",
  "/producao": "Acessou Produção",
  "/financeiro/visao-geral": "Acessou Financeiro — visão geral",
  "/financeiro/cobranca-aberta": "Acessou Financeiro — cobrança aberta",
  "/financeiro/consulta-painel": "Acessou Financeiro — consulta painel",
  "/financeiro/envios-oc": "Acessou Financeiro — envios OC",
  "/financeiro/manual": "Acessou Financeiro — envios OC",
  "/config/usuarios": "Acessou Configuração — usuários",
  "/config/logs": "Acessou Configuração — logs",
};

const API_MUTATION_LABELS: Record<string, string> = {
  "/api/config/users": "Criou usuário do portal",
  "/api/auth/logout": "Saiu do portal",
};

function pageLabel(pathname: string): string | null {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]!;
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (prefix !== "/" && pathname.startsWith(`${prefix}/`)) return label;
  }
  if (pathname.startsWith("/cadastros/")) return `Acessou Cadastros (${pathname})`;
  if (pathname.startsWith("/financeiro/")) return `Acessou Financeiro (${pathname})`;
  if (pathname.startsWith("/config/")) return `Acessou Configuração (${pathname})`;
  if (pathname.startsWith("/producao/")) return `Acessou Produção (${pathname})`;
  return null;
}

function apiMutationLabel(pathname: string, method: string): string {
  if (API_MUTATION_LABELS[pathname]) return API_MUTATION_LABELS[pathname]!;

  if (pathname.startsWith("/api/config/users/") && method === "PATCH") {
    return "Alterou usuário do portal";
  }
  if (pathname.startsWith("/api/config/profiles/") && method === "PATCH") {
    return "Alterou permissões de perfil";
  }
  if (pathname.startsWith("/api/cadastros/")) {
    return `Alterou cadastro (${method} ${pathname})`;
  }
  if (pathname.startsWith("/api/chamados")) {
    return `Alterou chamado (${method})`;
  }
  if (pathname.startsWith("/api/producao") || pathname.startsWith("/api/suporte")) {
    return `Alterou produção/suporte (${method})`;
  }
  if (pathname.startsWith("/api/financeiro") || pathname.startsWith("/api/cobranca-aberta")) {
    return `Alterou financeiro (${method})`;
  }
  if (pathname.startsWith("/api/rio-planilha")) {
    return `Alterou planilha Rio (${method})`;
  }
  if (pathname.startsWith("/api/contaazul")) {
    return `Integração Conta Azul (${method})`;
  }
  if (pathname.startsWith("/api/manual-envios")) {
    return `Envios manuais (${method})`;
  }

  return `${method} ${pathname}`;
}

export function describePortalAuditAction(pathname: string, method: string, override?: string): string {
  if (override?.trim()) return override.trim();

  const m = method.toUpperCase();
  if (m === "GET" && !pathname.startsWith("/api")) {
    return pageLabel(pathname) ?? `Acessou ${pathname}`;
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
    return apiMutationLabel(pathname, m);
  }
  return `${m} ${pathname}`;
}

export function shouldRecordPortalAudit(pathname: string, method: string): boolean {
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/api/internal/audit-log" ||
    pathname === "/api/auth/me" ||
    pathname.startsWith("/login")
  ) {
    return false;
  }

  const m = method.toUpperCase();
  if (m === "GET" && !pathname.startsWith("/api")) return true;

  if (["POST", "PUT", "PATCH", "DELETE"].includes(m) && pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/login")) return false;
    if (pathname.startsWith("/api/auth/logout")) return false;
    if (pathname === "/api/manual-envios/oc-email/auto-dispatch") return false;
    return true;
  }

  return false;
}
