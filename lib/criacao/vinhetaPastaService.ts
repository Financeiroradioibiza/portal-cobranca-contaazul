import { prisma } from "@/lib/prisma";

export type VinhetaPastaView = {
  id: string;
  nome: string;
  sortOrder: number;
  vinhetas: { id: string; nome: string; sortOrder: number; temAudio: boolean }[];
};

export async function listVinhetaPastas(programacaoId: string): Promise<VinhetaPastaView[]> {
  const rows = await prisma.vinhetaPasta.findMany({
    where: { programacaoId },
    orderBy: [{ sortOrder: "asc" }, { nome: "asc" }],
    include: {
      itens: {
        orderBy: { sortOrder: "asc" },
        include: { vinheta: { select: { id: true, nome: true, storageKey: true } } },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    nome: p.nome,
    sortOrder: p.sortOrder,
    vinhetas: p.itens.map((i) => ({
      id: i.vinheta.id,
      nome: i.vinheta.nome,
      sortOrder: i.sortOrder,
      temAudio: Boolean(i.vinheta.storageKey?.trim()),
    })),
  }));
}

export async function createVinhetaPasta(programacaoId: string, nome: string): Promise<{ id: string }> {
  const n = nome.trim().slice(0, 120);
  if (!n) throw new Error("nome_obrigatorio");
  const max = await prisma.vinhetaPasta.aggregate({
    where: { programacaoId },
    _max: { sortOrder: true },
  });
  const row = await prisma.vinhetaPasta.create({
    data: { programacaoId, nome: n, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true },
  });
  return row;
}

export async function addVinhetaToPasta(vinhetaPastaId: string, vinhetaId: string): Promise<void> {
  const pasta = await prisma.vinhetaPasta.findUnique({
    where: { id: vinhetaPastaId },
    select: { id: true, programacaoId: true },
  });
  if (!pasta) throw new Error("pasta_nao_encontrada");
  const vin = await prisma.vinheta.findFirst({
    where: { id: vinhetaId, programacaoId: pasta.programacaoId },
    select: { id: true },
  });
  if (!vin) throw new Error("vinheta_fora_da_programacao");
  const max = await prisma.vinhetaPastaItem.aggregate({
    where: { vinhetaPastaId },
    _max: { sortOrder: true },
  });
  await prisma.vinhetaPastaItem.upsert({
    where: { vinhetaPastaId_vinhetaId: { vinhetaPastaId, vinhetaId } },
    create: { vinhetaPastaId, vinhetaId, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    update: {},
  });
}

export async function deleteVinhetaPasta(id: string): Promise<void> {
  await prisma.vinhetaPasta.delete({ where: { id } });
}
