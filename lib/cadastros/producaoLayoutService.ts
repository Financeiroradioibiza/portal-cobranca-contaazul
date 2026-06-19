import { prisma } from "@/lib/prisma";
import {
  PRODUCAO_CATALOGO_LAYOUT_YM,
  getProducaoRioSourceYm,
  isProducaoCatalogLayoutYm,
} from "@/lib/cadastros/producaoCatalogo";
import type {
  PdvPlacementOverride,
  ProducaoCustomCliente,
} from "@/lib/cadastros/producaoHierarchy";
import {
  enrichPlacementOverrides,
  ensureProducaoMovimentoBaseline,
  loadRioLinhasForProducao,
  safeMergePlacements,
} from "@/lib/cadastros/producaoMovimento";

export type ProducaoLayoutPayload = {
  yearMonth: number;
  clienteNomes: Record<string, string>;
  pdvPlacements: PdvPlacementOverride[];
  hiddenClienteKeys: string[];
  customClientes: ProducaoCustomCliente[];
  acknowledgedPdvs: string[];
  movimentoBaselineEntradaIds: string[];
  movimentoBaselineSaidaIds: string[];
  movimentoOrganizedAt: string | null;
  portalClienteIdsByBucketKey: Record<string, number>;
  portalPdvIdsByRioPdvKey: Record<string, number>;
};

function asBucketClienteIds(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = typeof val === "number" ? val : Number(val);
    if (k.trim() && Number.isFinite(n) && n > 0) out[k] = Math.trunc(n);
  }
  return out;
}

function asPdvIdsByKey(v: unknown): Record<string, number> {
  return asBucketClienteIds(v);
}

export async function getProducaoCatalogLayout(
  opts?: { repairPlacements?: boolean },
): Promise<ProducaoLayoutPayload> {
  return getProducaoLayout(PRODUCAO_CATALOGO_LAYOUT_YM, opts);
}

function asRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

function asPlacements(v: unknown): PdvPlacementOverride[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      rioPdvId: typeof x.rioPdvId === "string" ? x.rioPdvId : "",
      targetClienteKey: typeof x.targetClienteKey === "string" ? x.targetClienteKey : "",
      caPersonId: typeof x.caPersonId === "string" ? x.caPersonId : undefined,
      rioLinhaId: typeof x.rioLinhaId === "string" ? x.rioLinhaId : undefined,
    }))
    .filter((x) => x.rioPdvId && x.targetClienteKey);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asCustomClientes(v: unknown): ProducaoCustomCliente[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      key: typeof x.key === "string" ? x.key : "",
      nome: typeof x.nome === "string" ? x.nome : "",
    }))
    .filter((x) => x.key && x.nome);
}

export async function getProducaoLayout(
  yearMonth: number,
  opts?: { repairPlacements?: boolean },
): Promise<ProducaoLayoutPayload> {
  const row = await prisma.cadastroProducaoLayout.findUnique({ where: { yearMonth } });
  let pdvPlacements = asPlacements(row?.pdvPlacements);

  if (opts?.repairPlacements && pdvPlacements.length > 0) {
    const rioYm = isProducaoCatalogLayoutYm(yearMonth) ?
      await getProducaoRioSourceYm()
    : yearMonth;
    const linhas = await loadRioLinhasForProducao(rioYm);
    if (linhas.length > 0) {
      let withLinha = [...pdvPlacements];
      for (let i = 0; i < withLinha.length; i++) {
        const p = withLinha[i]!;
        if (p.rioLinhaId?.trim() || p.rioPdvId.startsWith("linha:")) continue;
        const pdv = await prisma.rioCompPdv.findUnique({
          where: { id: p.rioPdvId },
          select: { clienteId: true },
        });
        if (pdv) withLinha[i] = { ...p, rioLinhaId: pdv.clienteId };
      }
      const enriched = enrichPlacementOverrides(withLinha, linhas);
      if (JSON.stringify(enriched) !== JSON.stringify(pdvPlacements)) {
        pdvPlacements = enriched;
        // Só persiste reparo de metadados (IDs/linha); destino editorial nunca muda aqui.
        await prisma.cadastroProducaoLayout.upsert({
          where: { yearMonth },
          create: {
            yearMonth,
            clienteNomes: asRecord(row?.clienteNomes),
            pdvPlacements: enriched,
            hiddenClienteKeys: asStringArray(row?.hiddenClienteKeys),
            customClientes: asCustomClientes(row?.customClientes),
            acknowledgedPdvs: asStringArray(row?.acknowledgedPdvs),
          },
          update: { pdvPlacements: enriched },
        });
      }
    }
  }

  const baseline = await ensureProducaoMovimentoBaseline(yearMonth);

  return {
    yearMonth,
    clienteNomes: asRecord(row?.clienteNomes),
    pdvPlacements,
    hiddenClienteKeys: asStringArray(row?.hiddenClienteKeys),
    customClientes: asCustomClientes(row?.customClientes),
    acknowledgedPdvs: asStringArray(row?.acknowledgedPdvs),
    movimentoBaselineEntradaIds: baseline.movimentoBaselineEntradaIds,
    movimentoBaselineSaidaIds: baseline.movimentoBaselineSaidaIds,
    movimentoOrganizedAt: baseline.movimentoOrganizedAt,
    portalClienteIdsByBucketKey: asBucketClienteIds(row?.portalClienteIdsByBucketKey),
    portalPdvIdsByRioPdvKey: asPdvIdsByKey(row?.portalPdvIdsByRioPdvKey),
  };
}

export async function saveProducaoLayout(
  yearMonth: number,
  patch: Partial<
    Pick<
      ProducaoLayoutPayload,
      | "clienteNomes"
      | "pdvPlacements"
      | "hiddenClienteKeys"
      | "customClientes"
      | "acknowledgedPdvs"
    >
  >,
): Promise<ProducaoLayoutPayload> {
  const current = await getProducaoLayout(yearMonth);
  const incomingPlacements =
    patch.pdvPlacements !== undefined ? asPlacements(patch.pdvPlacements) : undefined;
  const next = {
    clienteNomes: patch.clienteNomes ?? current.clienteNomes,
    pdvPlacements:
      incomingPlacements !== undefined ?
        safeMergePlacements(current.pdvPlacements, incomingPlacements)
      : current.pdvPlacements,
    hiddenClienteKeys: patch.hiddenClienteKeys ?? current.hiddenClienteKeys,
    customClientes: patch.customClientes ?? current.customClientes,
    acknowledgedPdvs: patch.acknowledgedPdvs ?? current.acknowledgedPdvs,
  };
  await prisma.cadastroProducaoLayout.upsert({
    where: { yearMonth },
    create: { yearMonth, ...next },
    update: next,
  });
  const baseline = await ensureProducaoMovimentoBaseline(yearMonth);
  return {
    yearMonth,
    ...next,
    movimentoBaselineEntradaIds: baseline.movimentoBaselineEntradaIds,
    movimentoBaselineSaidaIds: baseline.movimentoBaselineSaidaIds,
    movimentoOrganizedAt: baseline.movimentoOrganizedAt,
    portalClienteIdsByBucketKey: current.portalClienteIdsByBucketKey,
    portalPdvIdsByRioPdvKey: current.portalPdvIdsByRioPdvKey,
  };
}
