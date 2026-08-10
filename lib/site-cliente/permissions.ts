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
