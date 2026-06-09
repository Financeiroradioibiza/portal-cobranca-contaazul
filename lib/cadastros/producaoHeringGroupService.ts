import { prisma } from "@/lib/prisma";
import {
  CUSTOM_CLIENTE_PREFIX,
  linhaAsPdvKey,
  newCustomClienteKey,
  type PdvPlacementOverride,
} from "@/lib/cadastros/producaoHierarchy";
import { remapPlacementsByCaPerson } from "@/lib/cadastros/producaoMovimento";
import { getProducaoLayout, saveProducaoLayout } from "@/lib/cadastros/producaoLayoutService";

function isHeringNome(nomeFantasia: string, razaoSocial: string): boolean {
  const blob = `${nomeFantasia} ${razaoSocial}`.toLowerCase();
  return blob.includes("hering");
}

export type GroupHeringResult = {
  yearMonth: number;
  heringGroupKey: string;
  movedCount: number;
  movedNames: string[];
  keptWithPdvs: string[];
  remappedCount: number;
};

/** Move clientes Hering sem PDVs Rio para o grupo manual HERING na produção. */
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

  const linhasForProd = month.linhas.map((ln) => ({
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

  const singlePoint: Array<{ proxyKey: string; nome: string; caPersonId: string }> = [];
  const keptWithPdvs: string[] = [];

  for (const ln of month.linhas) {
    if (ln.movimento === "saida") continue;
    if (!isHeringNome(ln.nomeFantasia, ln.razaoSocial)) continue;
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");
    const nome = ln.nomeFantasia.trim() || ln.razaoSocial.trim() || ln.id;
    if (activePdvs.length === 0) {
      singlePoint.push({
        proxyKey: linhaAsPdvKey(ln.id),
        nome,
        caPersonId: ln.caPersonId,
      });
    } else {
      keptWithPdvs.push(`${nome} (${activePdvs.length} PDV)`);
    }
  }

  singlePoint.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const layout = await getProducaoLayout(yearMonth);
  let customClientes = [...layout.customClientes];
  const clienteNomes = { ...layout.clienteNomes };

  let heringKey =
    customClientes.find((c) => c.nome.trim().toUpperCase() === "HERING")?.key ??
    Object.entries(clienteNomes).find(
      ([k, n]) => k.startsWith(CUSTOM_CLIENTE_PREFIX) && n.trim().toUpperCase() === "HERING",
    )?.[0];

  if (!heringKey) {
    heringKey = newCustomClienteKey();
    customClientes.push({ key: heringKey, nome: "HERING" });
    clienteNomes[heringKey] = "HERING";
  }

  const remappedBefore = remapPlacementsByCaPerson(linhasForProd, layout.pdvPlacements);
  const remappedCount = remappedBefore.filter(
    (p, i) => p.rioPdvId !== layout.pdvPlacements[i]?.rioPdvId,
  ).length;

  const singleCa = new Set(singlePoint.map((x) => x.caPersonId));
  const pdvPlacements = remappedBefore.filter(
    (p) => !(p.caPersonId && singleCa.has(p.caPersonId)),
  );

  for (const item of singlePoint) {
    pdvPlacements.push({
      rioPdvId: item.proxyKey,
      targetClienteKey: heringKey,
      caPersonId: item.caPersonId,
    });
  }
  const hiddenClienteKeys = layout.hiddenClienteKeys.filter((k) => k !== heringKey);

  await saveProducaoLayout(yearMonth, {
    clienteNomes,
    customClientes,
    pdvPlacements,
    hiddenClienteKeys,
  });

  return {
    yearMonth,
    heringGroupKey: heringKey,
    movedCount: singlePoint.length,
    movedNames: singlePoint.map((x) => x.nome),
    keptWithPdvs,
    remappedCount,
  };
}
