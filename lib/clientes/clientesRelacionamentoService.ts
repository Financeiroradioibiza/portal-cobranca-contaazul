import { prisma } from "@/lib/prisma";
import { listChamadosForCliente } from "@/lib/chamados/chamadoService";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import {
  getProducaoDashboard,
  type DashboardClienteDetail,
  type DashboardClienteRow,
  type DashboardPdvRow,
} from "@/lib/cadastros/producaoDashboardService";
import type { PlayerIngestView } from "@/lib/player/playerIngestService";

export type ClienteResumo = {
  key: string;
  nome: string;
  pdvCount: number;
  onlineCount: number;
  offlineCount: number;
  tagCobranca: DashboardClienteRow["tagCobranca"];
  isCustom: boolean;
};

export type ClienteInstalacaoItem = {
  rioPdvKey: string;
  pdvNome: string;
  instaladoEm: string | null;
  primeiroPingAt: string | null;
  ultimoPingAt: string | null;
  tocando: boolean;
  programacaoMusical: string;
};

export type ClienteAtualizacaoItem = {
  id: string;
  tipo: "cadastro" | "programacao";
  rotulo: string;
  quando: string;
  pdvNome: string | null;
  status: string | null;
  detalhe: string | null;
};

export type ClienteFeedbackItem = {
  id: string;
  pdvNome: string;
  rioPdvKey: string | null;
  mensagem: string;
  status: string;
  chamadoId: string | null;
  createdAt: string;
};

export type ClienteDetailPayload = {
  ok: true;
  cliente: DashboardClienteRow;
  detail: DashboardClienteDetail;
  pdvCount: number;
  pdvsTocando: number;
  chamados: ChamadoView[];
  instalacoes: ClienteInstalacaoItem[];
  atualizacoes: ClienteAtualizacaoItem[];
  feedbacks: ClienteFeedbackItem[];
  pdvs: DashboardPdvRow[];
};

export type ClientesListPayload = {
  ok: true;
  clientes: ClienteResumo[];
  total: number;
};

function pdvIsTocando(p: DashboardPdvRow): boolean {
  if (p.statusPlayer !== "Ativo") return false;
  if (p.telemetry.isOnline === true) return true;
  if (p.telemetry.isOnline === false) return false;
  return p.telemetry.lastPingAt != null;
}

function ingestToFeedback(row: {
  id: string;
  pdvNome: string;
  rioPdvKey: string | null;
  mensagem: string;
  status: string;
  chamadoId: string | null;
  createdAt: Date;
}): ClienteFeedbackItem {
  return {
    id: row.id,
    pdvNome: row.pdvNome,
    rioPdvKey: row.rioPdvKey,
    mensagem: row.mensagem,
    status: row.status,
    chamadoId: row.chamadoId,
    createdAt: row.createdAt.toISOString(),
  };
}

function ingestCadastroToAtualizacao(row: PlayerIngestView): ClienteAtualizacaoItem {
  const campos = Object.keys(row.payload).slice(0, 4).join(", ");
  return {
    id: row.id,
    tipo: "cadastro",
    rotulo: "Atualização de cadastro (Player)",
    quando: row.createdAt,
    pdvNome: row.pdvNome || null,
    status: row.status,
    detalhe: campos || row.mensagem || null,
  };
}

export async function listClientesRelacionamento(q?: string): Promise<ClientesListPayload> {
  const needle = q?.trim().toLowerCase() ?? "";
  if (needle.length < 2) {
    return { ok: true, clientes: [], total: 0 };
  }

  const dash = await getProducaoDashboard();
  const list = dash.clientes.filter((c) => {
    const blob = `${c.nome} ${c.pdvs.map((p) => p.nome).join(" ")}`.toLowerCase();
    return blob.includes(needle);
  });

  const clientes: ClienteResumo[] = list.map((c) => ({
    key: c.key,
    nome: c.nome,
    pdvCount: c.pdvCount,
    onlineCount: c.onlineCount,
    offlineCount: c.offlineCount,
    tagCobranca: c.tagCobranca,
    isCustom: c.isCustom,
  }));

  return { ok: true, clientes, total: clientes.length };
}

export async function getClienteRelacionamentoDetail(
  clienteKey: string,
): Promise<ClienteDetailPayload | null> {
  const dash = await getProducaoDashboard();
  const cliente = dash.clientes.find((c) => c.key === clienteKey);
  if (!cliente) return null;

  const rioPdvKeys = cliente.pdvs.map((p) => p.rioPdvKey);
  const pdvsTocando = cliente.pdvs.filter(pdvIsTocando).length;

  const emptyKeys = rioPdvKeys.length === 0;

  const [chamados, cadastros, ingestRows, programacaoAtualizacoes] = await Promise.all([
    listChamadosForCliente({
      rioLinhaId: cliente.rioLinhaId,
      rioPdvKeys,
    }),
    emptyKeys ?
      Promise.resolve([])
    : prisma.producaoPdvCadastro.findMany({
        where: { rioPdvKey: { in: rioPdvKeys } },
        select: {
          rioPdvKey: true,
          playerInstaladoEm: true,
          createdAt: true,
          programacaoId: true,
        },
      }),
    emptyKeys ?
      Promise.resolve([])
    : prisma.playerIngest.findMany({
        where: { rioPdvKey: { in: rioPdvKeys } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    emptyKeys ?
      Promise.resolve([])
    : (async () => {
        const programacaoIds = [
          ...new Set(
            (
              await prisma.producaoPdvCadastro.findMany({
                where: { rioPdvKey: { in: rioPdvKeys }, programacaoId: { not: null } },
                select: { programacaoId: true },
              })
            )
              .map((r) => r.programacaoId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (programacaoIds.length === 0) return [];
        return prisma.programacaoAtualizacao.findMany({
          where: { programacaoId: { in: programacaoIds } },
          orderBy: { disparadaEm: "desc" },
          take: 40,
          select: {
            id: true,
            codigo: true,
            tipoSubida: true,
            rotuloLog: true,
            disparadaEm: true,
            disparadaPor: true,
            pdvsLog: true,
          },
        });
      })(),
  ]);

  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const instalacoes: ClienteInstalacaoItem[] = cliente.pdvs.map((p) => {
    const cad = cadastroByKey.get(p.rioPdvKey);
    const instaladoEm = cad?.playerInstaladoEm?.toISOString() ?? cad?.createdAt?.toISOString() ?? null;
    return {
      rioPdvKey: p.rioPdvKey,
      pdvNome: p.nome,
      instaladoEm,
      primeiroPingAt: p.telemetry.firstPingAt,
      ultimoPingAt: p.telemetry.lastPingAt,
      tocando: pdvIsTocando(p),
      programacaoMusical: p.programacaoMusical,
    };
  });

  const feedbacks = ingestRows
    .filter((r) => r.tipo === "feedback")
    .map(ingestToFeedback);

  const atualizacoesCadastro = ingestRows
    .filter((r) => r.tipo === "cadastro")
    .map((r) =>
      ingestCadastroToAtualizacao({
        id: r.id,
        tipo: r.tipo,
        status: r.status,
        clienteGatewayId: r.clienteGatewayId,
        clienteNome: r.clienteNome,
        pdvGatewayId: r.pdvGatewayId,
        pdvNome: r.pdvNome,
        portalPdvId: r.portalPdvId,
        rioPdvKey: r.rioPdvKey,
        mensagem: r.mensagem,
        payload: (() => {
          try {
            return JSON.parse(r.payloadJson || "{}") as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
        chamadoId: r.chamadoId,
        conciliadoEm: r.conciliadoEm?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }),
    );

  const atualizacoesProgramacao: ClienteAtualizacaoItem[] = programacaoAtualizacoes.map((a) => ({
    id: a.id,
    tipo: "programacao" as const,
    rotulo: a.rotuloLog || a.codigo || a.tipoSubida,
    quando: a.disparadaEm.toISOString(),
    pdvNome: a.pdvsLog || null,
    status: a.tipoSubida,
    detalhe: a.disparadaPor ? `Por ${a.disparadaPor}` : null,
  }));

  const atualizacoes = [...atualizacoesCadastro, ...atualizacoesProgramacao].sort((a, b) =>
    b.quando.localeCompare(a.quando),
  );

  return {
    ok: true,
    cliente,
    detail: cliente.detail,
    pdvCount: cliente.pdvCount,
    pdvsTocando,
    chamados,
    instalacoes,
    atualizacoes,
    feedbacks,
    pdvs: cliente.pdvs,
  };
}
