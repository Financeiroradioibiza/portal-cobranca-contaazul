import { prisma } from "@/lib/prisma";
import { stripDiacritics } from "@/lib/radioPainel/exportClientesCsv";
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

export function normalizeNomeToken(nome: string): string {
  return stripDiacritics(nome).toLowerCase().trim();
}

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

/**
 * Move buckets com 1 PDV cujo nome combina → grupo manual (ex.: Agilitá, HERINGTODAS).
 * Não mexe em buckets com vários PDVs.
 */
export async function groupSinglePdvIntoCustom(
  yearMonth: number,
  groupName: string,
  matchNome: (nome: string) => boolean,
): Promise<CustomGroupMoveResult> {
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
  let customClientes = [...layout.customClientes];
  const clienteNomes = { ...layout.clienteNomes };

  let groupKey = findCustomGroupKey(groupName, customClientes, clienteNomes);
  if (!groupKey) {
    groupKey = newCustomClienteKey();
    customClientes.push({ key: groupKey, nome: groupName });
    clienteNomes[groupKey] = groupName;
  }

  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(base, layout, {
    showHidden: true,
    caByLinhaId,
  });

  const toMove: Array<{
    rioPdvId: string;
    nome: string;
    rioLinhaId: string;
    caPersonId?: string;
  }> = [];
  const skippedMultiPdv: string[] = [];

  for (const bucket of merged) {
    if (bucket.key === groupKey) continue;

    if (bucket.pdvCount === 1) {
      const pdv = bucket.pdvs[0]!;
      const label = `${bucket.nome} ${pdv.nome}`;
      if (matchNome(pdv.nome) || matchNome(bucket.nome) || matchNome(label)) {
        toMove.push({
          rioPdvId: pdv.rioPdvId,
          nome: pdv.nome,
          rioLinhaId: pdv.rioLinhaId,
          caPersonId: caByLinhaId.get(pdv.rioLinhaId),
        });
      }
      continue;
    }

    if (bucket.pdvCount > 1 && bucket.pdvs.some((p) => matchNome(p.nome) || matchNome(bucket.nome))) {
      skippedMultiPdv.push(`${bucket.nome} (${bucket.pdvCount} PDVs)`);
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

export function matchAgilitaNome(nome: string): boolean {
  const n = normalizeNomeToken(nome);
  return n.includes("agilita");
}

export async function groupAgilitaPdvs(yearMonth: number): Promise<CustomGroupMoveResult> {
  return groupSinglePdvIntoCustom(yearMonth, "Agilitá", matchAgilitaNome);
}
