import {
  enrichPlacementOverrides,
  loadRioLinhasForProducao,
  remapPlacementsToActivePdvs,
} from "@/lib/cadastros/producaoMovimento";
import {
  isCustomClienteKey,
  isLinhaAsPdvKey,
  linhaAsPdvKey,
  linhaIdFromAsPdvKey,
  type PdvPlacementOverride,
  type ProducaoCustomCliente,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { stripDiacritics } from "@/lib/radioPainel/exportClientesCsv";

function normalizeNomeToken(nome: string): string {
  return stripDiacritics(nome).toLowerCase().trim();
}
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

export type CarryProducaoLayoutResult = {
  donorYearMonth: number;
  targetYearMonth: number;
  carried: boolean;
  placementCount: number;
  customGroupCount: number;
  skippedReason?: string;
};

type CrossMonthMaps = {
  oldLinhaToNew: Map<string, string>;
  oldPdvToNew: Map<string, string>;
  newLinhaById: Map<string, RioLinhaForProducao>;
};

function layoutHasEditorialContent(layout: {
  pdvPlacements: PdvPlacementOverride[];
  customClientes: ProducaoCustomCliente[];
  clienteNomes: Record<string, string>;
  hiddenClienteKeys: string[];
}): boolean {
  if (layout.pdvPlacements.length > 0) return true;
  if (layout.customClientes.length > 0) return true;
  if (layout.hiddenClienteKeys.length > 0) return true;
  return Object.keys(layout.clienteNomes).length > 0;
}

function linhaMatchKey(ln: RioLinhaForProducao): string {
  const doc = (ln.documento ?? "").replace(/\D/g, "");
  return `${normalizeNomeToken(ln.nomeFantasia)}|${doc}`;
}

function buildCrossMonthMaps(
  donorLinhas: RioLinhaForProducao[],
  targetLinhas: RioLinhaForProducao[],
): CrossMonthMaps {
  const oldLinhaToNew = new Map<string, string>();
  const oldPdvToNew = new Map<string, string>();
  const newLinhaById = new Map(targetLinhas.map((ln) => [ln.id, ln]));

  const targetByCa = new Map<string, RioLinhaForProducao>();
  const targetByNomeDoc = new Map<string, RioLinhaForProducao>();
  for (const tLn of targetLinhas) {
    const ca = tLn.caPersonId?.trim();
    if (ca) targetByCa.set(ca, tLn);
    targetByNomeDoc.set(linhaMatchKey(tLn), tLn);
  }

  for (const dLn of donorLinhas) {
    const ca = dLn.caPersonId?.trim();
    const tLn = (ca ? targetByCa.get(ca) : undefined) ?? targetByNomeDoc.get(linhaMatchKey(dLn));
    if (!tLn) continue;

    oldLinhaToNew.set(dLn.id, tLn.id);

    const dPdvs = dLn.pdvs.filter((p) => p.movimento !== "saida");
    const tPdvs = tLn.pdvs.filter((p) => p.movimento !== "saida");
    const usedTarget = new Set<string>();

    for (const dp of dPdvs) {
      const norm = normalizeNomeToken(dp.nome);
      const tp = tPdvs.find(
        (t) => !usedTarget.has(t.id) && normalizeNomeToken(t.nome) === norm,
      );
      if (tp) {
        oldPdvToNew.set(dp.id, tp.id);
        usedTarget.add(tp.id);
      }
    }

    if (dPdvs.length === 0 && tPdvs.length === 0) {
      oldPdvToNew.set(linhaAsPdvKey(dLn.id), linhaAsPdvKey(tLn.id));
    }
  }

  return { oldLinhaToNew, oldPdvToNew, newLinhaById };
}

function remapClienteKey(key: string, maps: CrossMonthMaps): string {
  if (isCustomClienteKey(key)) return key;
  return maps.oldLinhaToNew.get(key) ?? key;
}

function remapPlacement(p: PdvPlacementOverride, maps: CrossMonthMaps): PdvPlacementOverride | null {
  let rioPdvId = p.rioPdvId;
  if (isLinhaAsPdvKey(rioPdvId)) {
    const oldLinha = linhaIdFromAsPdvKey(rioPdvId);
    const newLinha = oldLinha ? maps.oldLinhaToNew.get(oldLinha) : undefined;
    if (!newLinha) return null;
    rioPdvId = linhaAsPdvKey(newLinha);
  } else {
    const mapped = maps.oldPdvToNew.get(rioPdvId);
    if (!mapped) return null;
    rioPdvId = mapped;
  }

  const oldLinhaId = p.rioLinhaId?.trim();
  const newLinhaId = oldLinhaId ? maps.oldLinhaToNew.get(oldLinhaId) : undefined;
  const linhaForMeta =
    newLinhaId ? maps.newLinhaById.get(newLinhaId) : undefined;

  const targetClienteKey = remapClienteKey(p.targetClienteKey, maps);

  return {
    rioPdvId,
    targetClienteKey,
    ...(newLinhaId ? { rioLinhaId: newLinhaId } : {}),
    ...(linhaForMeta?.caPersonId ? { caPersonId: linhaForMeta.caPersonId } : {}),
  };
}

/**
 * Copia organização editorial da produção (pastas, arrastes, nomes) do mês doador
 * para o mês vigente recém-clonado — só remapeia IDs Rio; não reorganiza pastas.
 */
export async function carryProducaoLayoutFromDonor(
  donorYm: number,
  targetYm: number,
): Promise<CarryProducaoLayoutResult> {
  const empty: CarryProducaoLayoutResult = {
    donorYearMonth: donorYm,
    targetYearMonth: targetYm,
    carried: false,
    placementCount: 0,
    customGroupCount: 0,
  };

  if (donorYm === targetYm) return { ...empty, skippedReason: "same_month" };

  const donorLayout = await getProducaoLayout(donorYm);
  if (!layoutHasEditorialContent(donorLayout)) {
    return { ...empty, skippedReason: "donor_empty" };
  }

  const targetLayout = await getProducaoLayout(targetYm);
  if (layoutHasEditorialContent(targetLayout)) {
    return { ...empty, skippedReason: "target_has_layout" };
  }

  const [donorLinhas, targetLinhas] = await Promise.all([
    loadRioLinhasForProducao(donorYm),
    loadRioLinhasForProducao(targetYm),
  ]);

  if (targetLinhas.length === 0) {
    return { ...empty, skippedReason: "target_rio_empty" };
  }

  const maps = buildCrossMonthMaps(donorLinhas, targetLinhas);

  const pdvPlacements: PdvPlacementOverride[] = [];
  for (const p of donorLayout.pdvPlacements) {
    const remapped = remapPlacement(p, maps);
    if (remapped) pdvPlacements.push(remapped);
  }

  const enriched = enrichPlacementOverrides(pdvPlacements, targetLinhas);
  const { placements: finalized } = remapPlacementsToActivePdvs(targetLinhas, enriched);

  const clienteNomes: Record<string, string> = {};
  for (const [key, nome] of Object.entries(donorLayout.clienteNomes)) {
    clienteNomes[remapClienteKey(key, maps)] = nome;
  }

  const hiddenClienteKeys = [
    ...new Set(donorLayout.hiddenClienteKeys.map((k) => remapClienteKey(k, maps))),
  ];

  const acknowledgedPdvs = [
    ...new Set(
      donorLayout.acknowledgedPdvs
        .map((id) => {
          if (isLinhaAsPdvKey(id)) {
            const oldLinha = linhaIdFromAsPdvKey(id);
            const newLinha = oldLinha ? maps.oldLinhaToNew.get(oldLinha) : undefined;
            return newLinha ? linhaAsPdvKey(newLinha) : null;
          }
          return maps.oldPdvToNew.get(id) ?? null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  await saveProducaoLayout(targetYm, {
    clienteNomes,
    customClientes: [...donorLayout.customClientes],
    pdvPlacements: finalized,
    hiddenClienteKeys,
    acknowledgedPdvs,
  });

  return {
    donorYearMonth: donorYm,
    targetYearMonth: targetYm,
    carried: true,
    placementCount: finalized.length,
    customGroupCount: donorLayout.customClientes.length,
  };
}

/** Na primeira abertura do mês vigente: traz layout do mês anterior se o destino ainda estiver vazio. */
export async function ensureProducaoLayoutCarriedFromDonor(
  targetYm: number,
  donorYm: number,
): Promise<CarryProducaoLayoutResult | null> {
  const result = await carryProducaoLayoutFromDonor(donorYm, targetYm);
  if (!result.carried && result.skippedReason === "target_has_layout") return null;
  return result;
}
