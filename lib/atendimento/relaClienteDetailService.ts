import { fetchAllReceivableInstallments } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { isPastDueOpen } from "@/lib/contaazul/types";
import { getProducaoRioSourceYm } from "@/lib/cadastros/producaoCatalogo";
import { loadRioLinhasForProducao } from "@/lib/cadastros/producaoMovimento";
import {
  getClienteRelacionamentoDetail,
  type ClienteFeedbackItem,
} from "@/lib/clientes/clientesRelacionamentoService";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { defaultPeriodMonths } from "@/lib/format";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";

export type RelaAtrasadoItem = {
  id: string;
  descricao: string;
  dataVencimento: string;
  valorAberto: number;
  statusLabel: string;
};

export type RelaProducaoClienteDetailPayload = {
  ok: true;
  chamados: ChamadoView[];
  feedbacks: ClienteFeedbackItem[];
  atrasados: RelaAtrasadoItem[];
  cobranca: {
    caConnected: boolean;
    caLinked: boolean;
  };
};

async function listAtrasadosForRioLinha(rioLinhaId: string): Promise<{
  items: RelaAtrasadoItem[];
  caConnected: boolean;
  caLinked: boolean;
}> {
  const token = await getValidAccessToken();
  if (!token) {
    return { items: [], caConnected: false, caLinked: false };
  }

  const ym = await getProducaoRioSourceYm();
  const linhas = await loadRioLinhasForProducao(ym);
  const ln = linhas.find((l) => l.id === rioLinhaId);
  const caPersonId = ln?.caPersonId?.trim() ?? "";
  if (!ln || !isRioCaPersonLinked(caPersonId)) {
    return { items: [], caConnected: true, caLinked: false };
  }

  const period = defaultPeriodMonths(12);
  const maxPages = Math.min(12, Math.max(4, Number(process.env.CA_RELA_ATRASADOS_MAX_PAGES ?? "6") || 6));
  const all = await fetchAllReceivableInstallments(token, period.start, period.end, {
    maxPages,
    parallelBatch: 2,
  });

  const items = all
    .filter((it) => it.cliente?.id === caPersonId && isPastDueOpen(it))
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    .slice(0, 25)
    .map((it) => ({
      id: it.id,
      descricao: it.descricao?.trim() || "—",
      dataVencimento: it.data_vencimento,
      valorAberto: it.nao_pago,
      statusLabel: it.status_traduzido?.trim() || it.status?.trim() || "Em aberto",
    }));

  return { items, caConnected: true, caLinked: true };
}

export async function getRelaProducaoClienteDetail(
  clienteKey: string,
): Promise<RelaProducaoClienteDetailPayload | null> {
  const base = await getClienteRelacionamentoDetail(clienteKey);
  if (!base) return null;

  const { items, caConnected, caLinked } = await listAtrasadosForRioLinha(base.cliente.rioLinhaId);

  return {
    ok: true,
    chamados: base.chamados,
    feedbacks: base.feedbacks,
    atrasados: items,
    cobranca: { caConnected, caLinked },
  };
}
