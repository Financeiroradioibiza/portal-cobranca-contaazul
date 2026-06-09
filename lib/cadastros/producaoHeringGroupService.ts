import { prisma } from "@/lib/prisma";
import {
  buildProducaoClientes,
  collectEmptyRioShellKeys,
  CUSTOM_CLIENTE_PREFIX,
  mergeProducaoLayout,
  newCustomClienteKey,
  type PdvPlacementOverride,
  type RioLinhaForProducao,
} from "@/lib/cadastros/producaoHierarchy";
import { remapPlacementsByCaPerson } from "@/lib/cadastros/producaoMovimento";
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

export const HERING_TODAS_GROUP_NAME = "HERINGTODAS";

function pdvNomeStartsWithHering(nome: string): boolean {
  return nome.trim().toLowerCase().startsWith("hering");
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

export type GroupHeringResult = {
  yearMonth: number;
  heringGroupKey: string;
  movedCount: number;
  movedNames: string[];
  skippedMultiPdv: string[];
  remappedCount: number;
};

/**
 * Na produção: grupos com exatamente 1 PDV cujo nome começa com «HERING»
 * → move para o grupo manual HERINGTODAS.
 */
export async function groupHeringSinglePointPdvs(yearMonth: number): Promise<GroupHeringResult> {
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

  const linhasForProd: RioLinhaForProducao[] = month.linhas.map((ln) => ({
    id: ln.id,
    caPersonId: ln.caPersonId,
    nomeFantasia: ln.nomeFantasia,
    razaoSocial: ln.razaoSocial,
    documento: ln.documento,
    movimento: ln.movimento,
    pdvs: ln.pdvs.map((p) => ({
      id: p.id,
      nome: p.nome,
      documento: p.documento,
      movimento: p.movimento,
    })),
  }));

  const caByLinhaId = new Map(linhasForProd.map((ln) => [ln.id, ln.caPersonId]));

  const layout = await getProducaoLayout(yearMonth);
  let customClientes = [...layout.customClientes];
  const clienteNomes = { ...layout.clienteNomes };

  let heringTodasKey = findCustomGroupKey(HERING_TODAS_GROUP_NAME, customClientes, clienteNomes);

  if (!heringTodasKey) {
    heringTodasKey = newCustomClienteKey();
    customClientes.push({ key: heringTodasKey, nome: HERING_TODAS_GROUP_NAME });
    clienteNomes[heringTodasKey] = HERING_TODAS_GROUP_NAME;
  }

  const remappedBefore = remapPlacementsByCaPerson(linhasForProd, layout.pdvPlacements);
  const remappedCount = remappedBefore.filter(
    (p, i) => p.rioPdvId !== layout.pdvPlacements[i]?.rioPdvId,
  ).length;

  const base = buildProducaoClientes(linhasForProd, new Map());
  const merged = mergeProducaoLayout(
    base,
    { ...layout, pdvPlacements: remappedBefore },
    { showHidden: true },
  );

  const toMove: Array<{ rioPdvId: string; nome: string; caPersonId?: string }> = [];
  const skippedMultiPdv: string[] = [];

  for (const bucket of merged) {
    if (bucket.key === heringTodasKey) continue;

    if (bucket.pdvCount === 1) {
      const pdv = bucket.pdvs[0]!;
      if (pdvNomeStartsWithHering(pdv.nome)) {
        toMove.push({
          rioPdvId: pdv.rioPdvId,
          nome: pdv.nome,
          caPersonId: caByLinhaId.get(pdv.rioLinhaId),
        });
      }
      continue;
    }

    if (bucket.pdvCount > 1 && bucket.pdvs.some((p) => pdvNomeStartsWithHering(p.nome))) {
      skippedMultiPdv.push(`${bucket.nome} (${bucket.pdvCount} PDVs)`);
    }
  }

  toMove.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

  const moveIds = new Set(toMove.map((x) => x.rioPdvId));
  const pdvPlacements: PdvPlacementOverride[] = remappedBefore.filter(
    (p) => !moveIds.has(p.rioPdvId),
  );

  for (const item of toMove) {
    pdvPlacements.push({
      rioPdvId: item.rioPdvId,
      targetClienteKey: heringTodasKey,
      ...(item.caPersonId ? { caPersonId: item.caPersonId } : {}),
    });
  }

  const mergedAfter = mergeProducaoLayout(
    base,
    {
      ...layout,
      pdvPlacements,
      customClientes,
      clienteNomes,
    },
    { showHidden: true },
  );
  const shellHidden = collectEmptyRioShellKeys(mergedAfter);
  const hiddenClienteKeys = [
    ...new Set([
      ...layout.hiddenClienteKeys.filter((k) => k !== heringTodasKey),
      ...shellHidden,
    ]),
  ];

  await saveProducaoLayout(yearMonth, {
    clienteNomes,
    customClientes,
    pdvPlacements,
    hiddenClienteKeys,
  });

  return {
    yearMonth,
    heringGroupKey: heringTodasKey,
    movedCount: toMove.length,
    movedNames: toMove.map((x) => x.nome),
    skippedMultiPdv,
    remappedCount,
  };
}
