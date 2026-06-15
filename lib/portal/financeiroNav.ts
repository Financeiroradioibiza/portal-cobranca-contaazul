/** Submenu do módulo Financeiro (antigo Cobrança). */
export const FINANCEIRO_NAV = [
  { href: "/financeiro/planilha-rio", label: "Planilha Rio", icon: "📊" },
  { href: "/financeiro/vencidos", label: "Vencidos", icon: "🚨" },
  { href: "/financeiro/envios-oc", label: "Envios manuais OC", icon: "📅" },
  { href: "/financeiro/consulta-painel", label: "Consulta painel", icon: "🔍" },
] as const;

export const FINANCEIRO_HOME_HREF = "/financeiro/planilha-rio";
