/** Submenu do módulo Financeiro / Cobrança (ordem acordada). */
export const COBRANCA_NAV = [
  { href: "/cobranca/planilha-rio", label: "Planilha Rio", short: "Rio" },
  { href: "/cobranca/vencidos", label: "Vencidos", short: "Vencidos" },
  { href: "/cobranca/envios-oc", label: "Envios manuais OC", short: "Envios OC" },
  { href: "/cobranca/consulta-painel", label: "Consulta painel", short: "Painel" },
] as const;

export const COBRANCA_HOME_HREF = "/cobranca/vencidos";
