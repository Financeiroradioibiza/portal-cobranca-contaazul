export type SiteClientePermissoes = {
  verStatusPdvs: boolean;
  verProgramacao: boolean;
  verEstiloAgora: boolean;
  verResumoProgramacao: boolean;
  verAtualizacoes: boolean;
  verFeedback: boolean;
  verLikes: boolean;
  verGraficoSemana: boolean;
  exportarPdf: boolean;
  verMoodboard: boolean;
  verCobrancas: boolean;
  baixarBoleto: boolean;
  baixarNota: boolean;
};

export const SITE_CLIENTE_PERMISSOES_DEFAULT: SiteClientePermissoes = {
  verStatusPdvs: true,
  verProgramacao: true,
  verEstiloAgora: true,
  verResumoProgramacao: true,
  verAtualizacoes: true,
  verFeedback: true,
  verLikes: true,
  verGraficoSemana: true,
  exportarPdf: true,
  verMoodboard: true,
  verCobrancas: false,
  baixarBoleto: false,
  baixarNota: false,
};

/** Preset para usuário exclusivo de grupo cobrança. */
export const SITE_CLIENTE_PERMISSOES_COBRANCA: SiteClientePermissoes = {
  verStatusPdvs: false,
  verProgramacao: false,
  verEstiloAgora: false,
  verResumoProgramacao: false,
  verAtualizacoes: false,
  verFeedback: false,
  verLikes: false,
  verGraficoSemana: false,
  exportarPdf: false,
  verMoodboard: false,
  verCobrancas: true,
  baixarBoleto: true,
  baixarNota: true,
};

export const SITE_CLIENTE_PERMISSAO_LABELS: Record<keyof SiteClientePermissoes, string> = {
  verStatusPdvs: "Status dos PDVs (online, cache, versão)",
  verProgramacao: "Playlist e pastas musicais",
  verEstiloAgora: "Estilo agora (cronograma)",
  verResumoProgramacao: "Resumo da programação por cliente",
  verAtualizacoes: "Logs de atualização (ATL)",
  verFeedback: "Feedbacks enviados",
  verLikes: "Likes e dislikes",
  verGraficoSemana: "Gráfico da semana",
  exportarPdf: "Exportar agenda em PDF",
  verMoodboard: "Moodboard estratégico",
  verCobrancas: "Cobranças e parcelas (12 meses)",
  baixarBoleto: "Download de boleto",
  baixarNota: "Download de nota fiscal",
};

export function parseSiteClientePermissoes(raw: unknown): SiteClientePermissoes {
  const base = { ...SITE_CLIENTE_PERMISSOES_DEFAULT };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof SiteClientePermissoes)[]) {
    if (typeof obj[key] === "boolean") base[key] = obj[key];
  }
  return base;
}
