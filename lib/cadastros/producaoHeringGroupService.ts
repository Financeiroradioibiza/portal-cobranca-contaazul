import { remapPlacementsByCaPerson } from "@/lib/cadastros/producaoMovimento";
import {
  applyMovesToDraft,
  ensureCustomGroupKey,
  loadProducaoMergeContext,
  planGroupMoves,
  type ProducaoLayoutDraft,
} from "@/lib/cadastros/producaoCustomGroupService";
import { mergeProducaoLayout } from "@/lib/cadastros/producaoHierarchy";
import {
  HERING_MASTER_GROUP_NAME,
  heringMasterGroupRule,
  matchesHeringFranchiseBucket,
  type GroupMatchContext,
} from "@/lib/cadastros/producaoGroupRestoreRules";
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

export const HERING_TODAS_GROUP_NAME = "HERINGTODAS";

function pdvNomeStartsWithHering(nome: string): boolean {
  return nome.trim().toLowerCase().startsWith("hering");
}

function matchesHeringTodasSinglePdv(ctx: GroupMatchContext, bucketPdvCount: number): boolean {
  if (bucketPdvCount !== 1) return false;
  if (matchesHeringFranchiseBucket(ctx, bucketPdvCount)) return false;
  return pdvNomeStartsWithHering(ctx.pdvNome);
}

export type GroupHeringResult = {
  yearMonth: number;
  heringGroupKey: string;
  heringMasterGroupKey: string;
  movedCount: number;
  movedNames: string[];
  heringMasterMovedCount: number;
  heringTodasMovedCount: number;
  skippedMultiPdv: string[];
  remappedCount: number;
};

/**
 * Botão «Hering → HERINGTODAS»:
 * - Clientes franquia (Dubelas, CIA MARCAS, Hering 2, etc.) → pasta «Hering»
 * - Lojas avulsas com 1 PDV cujo nome começa com HERING → HERINGTODAS
 * - Hering Próprias ficam onde estão
 */
export async function groupHeringSinglePointPdvs(yearMonth: number): Promise<GroupHeringResult> {
  const layout = await getProducaoLayout(yearMonth, { repairPlacements: true });
  const { caByLinhaId, base, linhasForProd } = await loadProducaoMergeContext(yearMonth);

  const remappedBefore = remapPlacementsByCaPerson(linhasForProd, layout.pdvPlacements);
  const remappedCount = remappedBefore.filter(
    (p, i) => p.rioPdvId !== layout.pdvPlacements[i]?.rioPdvId,
  ).length;

  const layoutSeed: ProducaoLayoutDraft = {
    customClientes: layout.customClientes,
    clienteNomes: layout.clienteNomes,
    pdvPlacements: remappedBefore,
    hiddenClienteKeys: layout.hiddenClienteKeys,
  };

  const draft: ProducaoLayoutDraft = {
    customClientes: [...layout.customClientes],
    clienteNomes: { ...layout.clienteNomes },
    pdvPlacements: [...remappedBefore],
    hiddenClienteKeys: [...layout.hiddenClienteKeys],
  };

  const heringMasterKey = ensureCustomGroupKey(HERING_MASTER_GROUP_NAME, draft);
  const heringTodasKey = ensureCustomGroupKey(HERING_TODAS_GROUP_NAME, draft);

  let merged = mergeProducaoLayout(base, draft, { showHidden: true, caByLinhaId });

  const masterPlan = planGroupMoves(merged, heringMasterKey, {
    moveWholeBucket: heringMasterGroupRule.moveWholeBucket,
    match: heringMasterGroupRule.match,
  }, caByLinhaId);

  if (masterPlan.toMove.length > 0) {
    applyMovesToDraft(draft, heringMasterKey, masterPlan.toMove, base, caByLinhaId, layoutSeed);
  }

  merged = mergeProducaoLayout(base, draft, { showHidden: true, caByLinhaId });

  const todasPlan = planGroupMoves(merged, heringTodasKey, {
    match: matchesHeringTodasSinglePdv,
  }, caByLinhaId);

  if (todasPlan.toMove.length > 0) {
    applyMovesToDraft(draft, heringTodasKey, todasPlan.toMove, base, caByLinhaId, layoutSeed);
  }

  const heringMasterMovedCount = masterPlan.toMove.length;
  const heringTodasMovedCount = todasPlan.toMove.length;
  const movedCount = heringMasterMovedCount + heringTodasMovedCount;
  const movedNames = [
    ...masterPlan.toMove.map((x) => x.nome),
    ...todasPlan.toMove.map((x) => x.nome),
  ].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  if (movedCount > 0) {
    await saveProducaoLayout(yearMonth, draft);
  } else if (remappedCount > 0) {
    await saveProducaoLayout(yearMonth, {
      clienteNomes: draft.clienteNomes,
      customClientes: draft.customClientes,
      pdvPlacements: draft.pdvPlacements,
      hiddenClienteKeys: draft.hiddenClienteKeys,
    });
  }

  return {
    yearMonth,
    heringGroupKey: heringTodasKey,
    heringMasterGroupKey: heringMasterKey,
    movedCount,
    movedNames,
    heringMasterMovedCount,
    heringTodasMovedCount,
    skippedMultiPdv: masterPlan.skippedMultiPdv,
    remappedCount,
  };
}
