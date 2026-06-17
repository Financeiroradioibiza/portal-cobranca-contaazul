import { prisma } from "@/lib/prisma";
import {
  buildCaByLinhaId,
  buildProducaoClientes,
  mergeProducaoLayout,
  type ProducaoLayoutState,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { ensureProducaoLayoutCarriedFromDonor } from "@/lib/cadastros/producaoLayoutCarryService";
import { getProducaoLayout } from "@/lib/cadastros/producaoLayoutService";
import { donorYearMonthFor } from "@/lib/rio/rioTurnover";
import { resolveProgramacaoAndPlayerVersion } from "@/lib/cadastros/producaoPdvDisplay";
import type { PainelLinkBrief } from "@/lib/cadastros/rioProducaoTree";
import { effectiveRioTagCobranca } from "@/lib/rio/rioTagCobranca";

export type DashboardPdvTelemetry = {
  playerVersion: string | null;
  downloadPercent: number | null;
  firstPingAt: string | null;
  lastPingAt: string | null;
  isOnline: boolean | null;
};

export type DashboardPdvRow = {
  rioPdvKey: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  rioLinhaId: string;
  rioLinhaNome: string;
  rioLinhaTagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  programacaoMusical: string;
  statusPlayer: "Ativo" | "Inativo";
  controlarPlayer: boolean;
  controlarPlaylist: boolean;
  cnpj: string;
  cidade: string;
  estado: string;
  telemetry: DashboardPdvTelemetry;
};

export type DashboardClienteDetail = {
  key: string;
  nome: string;
  rioLinhaId: string;
  isCustom: boolean;
  razaoSocial: string;
  documento: string | null;
  grupoNome: string | null;
  emailCobranca: string | null;
  numeroPdvSite: number;
  movimento: string;
  contratosAtivosTexto: string;
  valorClienteTexto: string;
  observacoesLinha: string;
};

export type DashboardClienteRow = {
  key: string;
  nome: string;
  tagCobranca: import("@/lib/rio/rioTagCobranca").RioTagCobranca;
  rioLinhaId: string;
  isCustom: boolean;
  pdvCount: number;
  onlineCount: number;
  offlineCount: number;
  pdvs: DashboardPdvRow[];
  detail: DashboardClienteDetail;
};

export type DashboardOverview = {
  totalPdvs: number;
  onlinePdvs: number;
  offlinePdvs: number;
  semPingPdvs: number;
  cacheMedioPercent: number | null;
  pingsHoje: number | null;
  pingsVariacaoPercent: number | null;
  vinhetasGeradas: number | null;
  chamadosAbertos: number | null;
  pings24h: Array<{ hour: number; count: number }> | null;
  telemetriaDisponivel: boolean;
};

export type ProducaoDashboardPayload = {
  yearMonth: number;
  overview: DashboardOverview;
  clientes: DashboardClienteRow[];
};

function emptyTelemetry(): DashboardPdvTelemetry {
  return {
    playerVersion: null,
    downloadPercent: null,
    firstPingAt: null,
    lastPingAt: null,
    isOnline: null,
  };
}

function deriveOnlineStatus(
  statusPlayer: "Ativo" | "Inativo",
  controlarPlayer: boolean,
  telemetry: DashboardPdvTelemetry,
): boolean | null {
  if (telemetry.isOnline != null) return telemetry.isOnline;
  if (!controlarPlayer) return null;
  return statusPlayer === "Ativo";
}

async function loadPainelLinkMap(): Promise<Map<string, PainelLinkBrief>> {
  const links = await prisma.painelPdvLink.findMany({
    select: {
      rioCompPdvId: true,
      painelPdvId: true,
      painelClienteId: true,
      painelPdvNome: true,
      matchMethod: true,
    },
  });
  const map = new Map<string, PainelLinkBrief>();
  for (const row of links) {
    map.set(row.rioCompPdvId, {
      painelPdvId: row.painelPdvId,
      painelClienteId: row.painelClienteId,
      painelPdvNome: row.painelPdvNome,
      matchMethod: row.matchMethod,
    });
  }
  return map;
}

export async function getProducaoDashboard(yearMonth: number): Promise<ProducaoDashboardPayload> {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          rioGrupo: { select: { nome: true } },
          pdvs: { orderBy: [{ sortOrder: "asc" }] },
        },
      },
    },
  });

  if (!month) {
    return {
      yearMonth,
      overview: {
        totalPdvs: 0,
        onlinePdvs: 0,
        offlinePdvs: 0,
        semPingPdvs: 0,
        cacheMedioPercent: null,
        pingsHoje: null,
        pingsVariacaoPercent: null,
        vinhetasGeradas: null,
        chamadosAbertos: null,
        pings24h: null,
        telemetriaDisponivel: false,
      },
      clientes: [],
    };
  }

  const linkMap = await loadPainelLinkMap();
  const donorYm = donorYearMonthFor(yearMonth);
  if (donorYm !== yearMonth) {
    await ensureProducaoLayoutCarriedFromDonor(yearMonth, donorYm);
  }
  const rawLayout = await getProducaoLayout(yearMonth, { repairPlacements: true });

  const linhasForProd: RioLinhaForProducao[] = month.linhas
    .filter((ln) => ln.movimento !== "saida")
    .map((ln) => ({
      id: ln.id,
      caPersonId: ln.caPersonId,
      nomeFantasia: ln.nomeFantasia,
      razaoSocial: ln.razaoSocial,
      documento: ln.documento,
      movimento: ln.movimento,
      numeroPdvSite: ln.numeroPdvSite,
      tagCobranca: ln.tagCobranca,
      pdvs: ln.pdvs
        .filter((p) => p.movimento !== "saida")
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          documento: p.documento,
          movimento: p.movimento,
          tagCobranca: p.tagCobranca,
        })),
    }));

  const linhaMeta = new Map(
    month.linhas.map((ln) => [
      ln.id,
      {
        razaoSocial: ln.razaoSocial,
        documento: ln.documento,
        grupoNome: ln.rioGrupo?.nome ?? null,
        emailCobranca: ln.emailCobranca,
        numeroPdvSite: ln.numeroPdvSite,
        movimento: ln.movimento,
        contratosAtivosTexto: ln.contratosAtivosTexto,
        valorClienteTexto: ln.valorClienteTexto,
        observacoesLinha: ln.observacoesLinha,
        nomeFantasia: ln.nomeFantasia,
      },
    ]),
  );

  const base = buildProducaoClientes(linhasForProd, linkMap);
  const layoutState: ProducaoLayoutState = {
    clienteNomes: rawLayout.clienteNomes,
    pdvPlacements: rawLayout.pdvPlacements,
    hiddenClienteKeys: rawLayout.hiddenClienteKeys,
    customClientes: rawLayout.customClientes,
    acknowledgedPdvs: rawLayout.acknowledgedPdvs,
  };
  const caByLinhaId = buildCaByLinhaId(linhasForProd);
  const merged = mergeProducaoLayout(base, layoutState, { caByLinhaId }).filter(
    (c) => c.pdvCount > 0,
  );

  const pdvKeys = merged.flatMap((c) => c.pdvs.map((p) => p.rioPdvId));
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: pdvKeys } },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  let totalPdvs = 0;
  let onlinePdvs = 0;
  let offlinePdvs = 0;
  let semPingPdvs = 0;

  const clientes: DashboardClienteRow[] = merged.map((c) => {
    const meta = c.rioLinhaId ? linhaMeta.get(c.rioLinhaId) : undefined;
    let cOnline = 0;
    let cOffline = 0;

    const pdvs: DashboardPdvRow[] = c.pdvs.map((p) => {
      const cad = cadastroByKey.get(p.rioPdvId);
      const telemetry = emptyTelemetry();
      const statusPlayer = cad?.statusPlayer ?? "Ativo";
      const controlarPlayer = cad?.controlarPlayer ?? false;
      const controlarPlaylist = cad?.controlarPlaylist ?? false;
      const online = deriveOnlineStatus(statusPlayer, controlarPlayer, telemetry);

      totalPdvs += 1;
      if (online === true) {
        onlinePdvs += 1;
        cOnline += 1;
      } else if (online === false) {
        offlinePdvs += 1;
        cOffline += 1;
      } else if (controlarPlayer && statusPlayer === "Ativo") {
        semPingPdvs += 1;
      }

      const { programacaoMusical, playerVersion } = resolveProgramacaoAndPlayerVersion({
        programacaoMusical: cad?.programacaoMusical,
        versaoPlayer: cad?.versaoPlayer,
      });

      return {
        rioPdvKey: p.rioPdvId,
        nome: cad?.nome?.trim() || p.nome,
        tagCobranca: effectiveRioTagCobranca(p.tagCobranca, c.tagCobranca),
        rioLinhaId: p.rioLinhaId,
        rioLinhaNome: p.rioLinhaNome,
        rioLinhaTagCobranca: c.tagCobranca ?? "cobrando",
        programacaoMusical,
        statusPlayer,
        controlarPlayer,
        controlarPlaylist,
        cnpj: cad?.cnpj ?? p.documento ?? "",
        cidade: cad?.cidade ?? "",
        estado: cad?.estado ?? "",
        telemetry: {
          ...telemetry,
          playerVersion: playerVersion ?? telemetry.playerVersion,
        },
      };
    });

    const detail: DashboardClienteDetail = {
      key: c.key,
      nome: c.nome,
      rioLinhaId: c.rioLinhaId,
      isCustom: Boolean(c.isCustom),
      razaoSocial: meta?.razaoSocial ?? c.nome,
      documento: meta?.documento ?? c.documento,
      grupoNome: meta?.grupoNome ?? null,
      emailCobranca: meta?.emailCobranca ?? null,
      numeroPdvSite: meta?.numeroPdvSite ?? c.pdvCount,
      movimento: meta?.movimento ?? "estavel",
      contratosAtivosTexto: meta?.contratosAtivosTexto ?? "",
      valorClienteTexto: meta?.valorClienteTexto ?? "",
      observacoesLinha: meta?.observacoesLinha ?? "",
    };

    return {
      key: c.key,
      nome: c.nome,
      tagCobranca: c.tagCobranca ?? "cobrando",
      rioLinhaId: c.rioLinhaId,
      isCustom: Boolean(c.isCustom),
      pdvCount: pdvs.length,
      onlineCount: cOnline,
      offlineCount: cOffline,
      pdvs,
      detail,
    };
  });

  return {
    yearMonth,
    overview: {
      totalPdvs,
      onlinePdvs,
      offlinePdvs,
      semPingPdvs,
      cacheMedioPercent: null,
      pingsHoje: null,
      pingsVariacaoPercent: null,
      vinhetasGeradas: null,
      chamadosAbertos: null,
      pings24h: null,
      telemetriaDisponivel: false,
    },
    clientes,
  };
}
