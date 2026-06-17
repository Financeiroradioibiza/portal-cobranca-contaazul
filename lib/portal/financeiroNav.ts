/** Painel boleto + NF hospedado na Vercel (fora deste Next.js). */
export const ENVIOS_MANUAIS_EXTERNAL_URL = "https://radioibiza.vercel.app/";

/** Submenu do módulo Financeiro (antigo Cobrança). */
export const FINANCEIRO_NAV = [
  { href: "/financeiro/visao-geral", label: "Visão geral", icon: "📈" },
  { href: "/financeiro/planilha-rio", label: "Planilha Rio", icon: "📊" },
  { href: "/financeiro/vencidos", label: "Vencidos", icon: "🚨" },
  { href: "/financeiro/envios-oc", label: "Envios manuais", icon: "📅" },
  { href: "/financeiro/consulta-painel", label: "Consulta painel", icon: "🔍" },
] as const;

export const FINANCEIRO_HOME_HREF = "/financeiro/visao-geral";
