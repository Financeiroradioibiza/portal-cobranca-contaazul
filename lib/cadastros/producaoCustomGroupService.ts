import { prisma } from "@/lib/prisma";
import {
  buildCaByLinhaId,
  buildProducaoClientes,
  collectEmptyRioShellKeys,
  CUSTOM_CLIENTE_PREFIX,
  mergeProducaoLayout,
  newCustomClienteKey,
  type PdvPlacementOverride,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";
import {
  PRODUCAO_GROUP_RESTORE_RULES,
  normalizeNomeToken,
  ruleForGroupName,
  type GroupMatchContext,
  type GroupRestoreRule,
} from "@/lib/cadastros/producaoGroupRestoreRules";

export { normalizeNomeToken };

function findCustomGroupKey(
  groupName: string,
  customClientes: Array<{ key: string; nome: string }>,
  clienteNomes: Record<string, string>,
): string | undefined {
  const target = groupName.trim().toUpperCase();
  const fromCustom = customClientes.find((c) => c.nome.trim().toUpperCase() === target)?.key;
  if (fromCustom) return fromCustom;
  return Object.entries(clienteNomes).find(
    ([k, n]) => k.startsWith(CUSTOM_CLIENTE_PREFIX) && n.trim().toUpperCase() === target,
  )?.[0];
}

export type CustomGroupMoveResult = {
  yearMonth: number;
  groupKey: string;
  groupName: string;
  movedCount: number;
  movedNames: string[];
  skippedMultiPdv: string[];
};

export type GroupIntoCustomOptions = {
  /** Padrão: só buckets com 1 PDV (exceto moveWholeBucket). */
  onlySinglePdvBuckets?: boolean;
  moveWholeBucket?: boolean;
  match: (ctx: GroupMatchContext, bucketPdvCount: number) => boolean;
  /** Padrão: não tira PDVs de outras pastas manuais. */
  onlyFromNonCustomBuckets?: boolean;
};

function bucketCtx(bucket: { nome: string }, pdv?: { nome: string }): GroupMatchContext {
  const bucketNome = bucket.nome;
  const pdvNome = pdv?.nome ?? "";
  return { bucketNome, pdvNome, label: `${bucketNome} ${pdvNome}`.trim() };
}

async function loadProducaoMergeContext(yearMonth: number) {
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: { pdvs: { orderBy: [{ sortOrder: "asc" }] } },
      },
    },
  });

  if (!month) throw new Error("month_not_found");

  const linhasForProd: RioLinhaForProducao[] = month.linhas
    .filter((ln) => ln.movimento !== "saida")
    .map((ln) => ({
      id: ln.id,
      caPersonId: ln.caPersonId,
      nomeFantasia: ln.nomeFantasia,
      razaoSocial: ln.razaoSocial,
      documento: ln.documento,
      movimento: ln.movimento,
      pdvs: ln.pdvs.filter((p) => p.movimento !== "saida"),
    }));

  const caByLinhaId = buildCaByLinhaId(linhasForProd);
  const layout = await getProducaoLayout(yearMonth, { repairPlacements: true });
  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(base, layout, { showHidden: true, caByLinhaId });

  return { linhasForProd, caByLinhaId, layout, base, merged };
}

/**
 * Move PDVs que combinam com a regra → pasta manual.
 * Suporta buckets multi-PDV quando `moveWholeBucket` está ativo.
 */
export async function groupIntoCustom(
  yearMonth: number,
  groupName: string,
  options: GroupIntoCustomOptions,
): Promise<CustomGroupMoveResult> {
  const onlySinglePdvBuckets = options.onlySinglePdvBuckets ?? true;
  const onlyFromNonCustomBuckets = options.onlyFromNonCustomBuckets ?? true;

  const { caByLinhaId, layout, base, merged } = await loadProducaoMergeContext(yearMonth);
  let customClientes = [...layout.customClientes];
  const clienteNomes = { ...layout.clienteNomes };

  let groupKey = findCustomGroupKey(groupName, customClientes, clienteNomes);
  if (!groupKey) {
    groupKey = newCustomClienteKey();
    customClientes.push({ key: groupKey, nome: groupName });
    clienteNomes[groupKey] = groupName;
  }

  const toMove: Array<{
    rioPdvId: string;
    nome: string;
    rioLinhaId: string;
    caPersonId?: string;
  }> = [];
  const skippedMultiPdv: string[] = [];

  for (const bucket of merged) {
    if (bucket.key === groupKey) continue;
    if (onlyFromNonCustomBuckets && bucket.isCustom) continue;

    const wholeBucketCtx = bucketCtx(bucket);
    const wholeBucketMatches =
      options.moveWholeBucket &&
      options.match(wholeBucketCtx, bucket.pdvCount);

    if (wholeBucketMatches) {
      for (const pdv of bucket.pdvs) {
        toMove.push({
          rioPdvId: pdv.rioPdvId,
          nome: pdv.nome,
          rioLinhaId: pdv.rioLinhaId,
          caPersonId: caByLinhaId.get(pdv.rioLinhaId),
        });
      }
      continue;
    }

    if (bucket.pdvCount === 1) {
      const pdv = bucket.pdvs[0]!;
      const ctx = bucketCtx(bucket, pdv);
      if (options.match(ctx, 1)) {
        toMove.push({
          rioPdvId: pdv.rioPdvId,
          nome: pdv.nome,
          rioLinhaId: pdv.rioLinhaId,
          caPersonId: caByLinhaId.get(pdv.rioLinhaId),
        });
      }
      continue;
    }

    if (onlySinglePdvBuckets) {
      if (bucket.pdvs.some((p) => options.match(bucketCtx(bucket, p), bucket.pdvCount))) {
        skippedMultiPdv.push(`${bucket.nome} (${bucket.pdvCount} PDVs)`);
      }
      continue;
    }

    for (const pdv of bucket.pdvs) {
      const ctx = bucketCtx(bucket, pdv);
      if (options.match(ctx, bucket.pdvCount)) {
        toMove.push({
          rioPdvId: pdv.rioPdvId,
          nome: pdv.nome,
          rioLinhaId: pdv.rioLinhaId,
          caPersonId: caByLinhaId.get(pdv.rioLinhaId),
        });
      }
    }
  }

  toMove.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const moveIds = new Set(toMove.map((x) => x.rioPdvId));
  const moveLinhaIds = new Set(toMove.map((x) => x.rioLinhaId));
  const moveCas = new Set(toMove.map((x) => x.caPersonId).filter(Boolean));

  const pdvPlacements: PdvPlacementOverride[] = layout.pdvPlacements.filter((p) => {
    if (moveIds.has(p.rioPdvId)) return false;
    if (p.rioLinhaId && moveLinhaIds.has(p.rioLinhaId)) return false;
    if (p.caPersonId && moveCas.has(p.caPersonId)) return false;
    return true;
  });

  for (const item of toMove) {
    pdvPlacements.push({
      rioPdvId: item.rioPdvId,
      targetClienteKey: groupKey,
      rioLinhaId: item.rioLinhaId,
      ...(item.caPersonId ? { caPersonId: item.caPersonId } : {}),
    });
  }

  const mergedAfter = mergeProducaoLayout(
    base,
    { ...layout, pdvPlacements, customClientes, clienteNomes },
    { showHidden: true, caByLinhaId },
  );
  const shellHidden = collectEmptyRioShellKeys(mergedAfter);
  const hiddenClienteKeys = [
    ...new Set([...layout.hiddenClienteKeys.filter((k) => k !== groupKey), ...shellHidden]),
  ];

  await saveProducaoLayout(yearMonth, {
    clienteNomes,
    customClientes,
    pdvPlacements,
    hiddenClienteKeys,
  });

  return {
    yearMonth,
    groupKey,
    groupName,
    movedCount: toMove.length,
    movedNames: toMove.map((x) => x.nome),
    skippedMultiPdv,
  };
}

/**
 * Move buckets com 1 PDV cujo nome combina → grupo manual (ex.: Agilitá, HERINGTODAS).
 * Não mexe em buckets com vários PDVs.
 */
export async function groupSinglePdvIntoCustom(
  yearMonth: number,
  groupName: string,
  matchNome: (nome: string) => boolean,
): Promise<CustomGroupMoveResult> {
  return groupIntoCustom(yearMonth, groupName, {
    match: (ctx) =>
      matchNome(ctx.pdvNome) || matchNome(ctx.bucketNome) || matchNome(ctx.label),
  });
}

export async function applyGroupRestoreRule(
  yearMonth: number,
  rule: GroupRestoreRule,
): Promise<CustomGroupMoveResult> {
  return groupIntoCustom(yearMonth, rule.groupName, {
    moveWholeBucket: rule.moveWholeBucket,
    match: rule.match,
  });
}

export type RestoreConfiguredGroupsResult = {
  yearMonth: number;
  applied: CustomGroupMoveResult[];
  skipped: Array<{ groupName: string; reason: string }>;
};

/** Aplica todas as regras padrão (marcas + Hering franquias). Não inclui HERINGTODAS. */
export async function restoreConfiguredGroups(
  yearMonth: number,
): Promise<RestoreConfiguredGroupsResult> {
  const applied: CustomGroupMoveResult[] = [];
  const skipped: Array<{ groupName: string; reason: string }> = [];

  for (const rule of PRODUCAO_GROUP_RESTORE_RULES) {
    const result = await applyGroupRestoreRule(yearMonth, rule);
    if (result.movedCount > 0) {
      applied.push(result);
    } else {
      skipped.push({ groupName: rule.groupName, reason: "nenhum PDV encontrado" });
    }
  }

  return { yearMonth, applied, skipped };
}

export function matchAgilitaNome(nome: string): boolean {
  const n = normalizeNomeToken(nome);
  return n.includes("agilita");
}

export async function groupAgilitaPdvs(yearMonth: number): Promise<CustomGroupMoveResult> {
  return groupSinglePdvIntoCustom(yearMonth, "Agilitá", matchAgilitaNome);
}

export function matchFromGroupName(groupName: string): (nome: string) => boolean {
  const g = normalizeNomeToken(groupName);
  if (g === "heringtodas" || g === "hering todas") {
    return (nome) => normalizeNomeToken(nome).startsWith("hering");
  }
  return (nome) => normalizeNomeToken(nome).includes(g);
}

export type RestoreEmptyGroupsResult = {
  yearMonth: number;
  restored: CustomGroupMoveResult[];
  skipped: Array<{ groupName: string; reason: string }>;
};

/**
 * Reconstrói pastas manuais que ficaram vazias após perda de arrastes.
 * Pula grupos que já têm PDVs (ex.: HERINGTODAS intacta).
 */
export async function restoreEmptyManualGroups(yearMonth: number): Promise<RestoreEmptyGroupsResult> {
  const layout = await getProducaoLayout(yearMonth, { repairPlacements: true });
  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth },
    include: {
      linhas: {
        orderBy: [{ sortOrder: "asc" }],
        include: { pdvs: { orderBy: [{ sortOrder: "asc" }] } },
      },
    },
  });
  if (!month) throw new Error("month_not_found");

  const linhasForProd: RioLinhaForProducao[] = month.linhas
    .filter((ln) => ln.movimento !== "saida")
    .map((ln) => ({
      id: ln.id,
      caPersonId: ln.caPersonId,
      nomeFantasia: ln.nomeFantasia,
      razaoSocial: ln.razaoSocial,
      documento: ln.documento,
      movimento: ln.movimento,
      pdvs: ln.pdvs.filter((p) => p.movimento !== "saida"),
    }));

  const caByLinhaId = buildCaByLinhaId(linhasForProd);
  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(base, layout, { showHidden: true, caByLinhaId });

  const restored: CustomGroupMoveResult[] = [];
  const skipped: Array<{ groupName: string; reason: string }> = [];

  for (const custom of layout.customClientes) {
    const groupName = (layout.clienteNomes[custom.key] || custom.nome).trim();
    if (!groupName) continue;

    const bucket = merged.find((c) => c.key === custom.key);
    if (bucket && bucket.pdvCount > 0) {
      skipped.push({ groupName, reason: `já tem ${bucket.pdvCount} PDV(s)` });
      continue;
    }

    const rule = ruleForGroupName(groupName);
    const result =
      rule ?
        await applyGroupRestoreRule(yearMonth, rule)
      : await groupSinglePdvIntoCustom(yearMonth, groupName, matchFromGroupName(groupName));
    if (result.movedCount > 0) {
      restored.push(result);
    } else {
      skipped.push({ groupName, reason: "nenhum PDV encontrado para o nome do grupo" });
    }
  }

  return { yearMonth, restored, skipped };
}
