import { ETAPAS, ETAPA_LABEL } from "@/lib/criacao/filaService";

export type FilaItemEtapa = (typeof ETAPAS)[number];

export type FilaItemForKanban = {
  id: string;
  arquivoNome: string;
  status: string;
  etapaAtual: string;
  kanbanEtapa: FilaItemEtapa;
  musicaId: string | null;
  duplicataDeId: string | null;
  erroMsg: string;
};

/** Coluna do Kanban quando o worker ainda não grava etapa por item. */
export function inferKanbanEtapa(
  item: { status: string; etapaAtual?: string | null },
  jobEtapaAtual?: string | null,
): FilaItemEtapa {
  const stored = item.etapaAtual?.trim();
  if (stored && (ETAPAS as readonly string[]).includes(stored)) {
    return stored as FilaItemEtapa;
  }

  switch (item.status) {
    case "concluido":
      return "armazenamento";
    case "duplicata":
      return "deduplicacao";
    case "processando": {
      const jobEtapa = jobEtapaAtual?.trim();
      if (jobEtapa && (ETAPAS as readonly string[]).includes(jobEtapa)) {
        return jobEtapa as FilaItemEtapa;
      }
      return "upload";
    }
    case "erro": {
      const jobEtapa = jobEtapaAtual?.trim();
      if (jobEtapa && (ETAPAS as readonly string[]).includes(jobEtapa)) {
        return jobEtapa as FilaItemEtapa;
      }
      return "upload";
    }
    default:
      return "upload";
  }
}

export function toKanbanItem(
  item: {
    id: string;
    arquivoNome: string;
    status: string;
    etapaAtual?: string | null;
    musicaId?: string | null;
    duplicataDeId?: string | null;
    erroMsg?: string | null;
  },
  jobEtapaAtual?: string | null,
): FilaItemForKanban {
  const etapaAtual = item.etapaAtual ?? "upload";
  return {
    id: item.id,
    arquivoNome: item.arquivoNome,
    status: item.status,
    etapaAtual,
    kanbanEtapa: inferKanbanEtapa(item, jobEtapaAtual),
    musicaId: item.musicaId ?? null,
    duplicataDeId: item.duplicataDeId ?? null,
    erroMsg: item.erroMsg ?? "",
  };
}

export { ETAPAS, ETAPA_LABEL };
