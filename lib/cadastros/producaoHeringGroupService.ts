import { prisma } from "@/lib/prisma";
import {
  CUSTOM_CLIENTE_PREFIX,
  linhaAsPdvKey,
  newCustomClienteKey,
} from "@/lib/cadastros/producaoHierarchy";
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

  const singlePoint: Array<{ proxyKey: string; nome: string }> = [];
  const keptWithPdvs: string[] = [];

  for (const ln of month.linhas) {
    if (ln.movimento === "saida") continue;
    if (!isHeringNome(ln.nomeFantasia, ln.razaoSocial)) continue;
    const activePdvs = ln.pdvs.filter((p) => p.movimento !== "saida");
    const nome = ln.nomeFantasia.trim() || ln.razaoSocial.trim() || ln.id;
    if (activePdvs.length === 0) {
      singlePoint.push({ proxyKey: linhaAsPdvKey(ln.id), nome });
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

  const proxyKeys = new Set(singlePoint.map((x) => x.proxyKey));
  const pdvPlacements = [
    ...layout.pdvPlacements.filter((p) => !proxyKeys.has(p.rioPdvId)),
    ...singlePoint.map((x) => ({ rioPdvId: x.proxyKey, targetClienteKey: heringKey })),
  ];

  await saveProducaoLayout(yearMonth, {
    clienteNomes,
    customClientes,
    pdvPlacements,
  });

  return {
    yearMonth,
    heringGroupKey: heringKey,
    movedCount: singlePoint.length,
    movedNames: singlePoint.map((x) => x.nome),
    keptWithPdvs,
  };
}
