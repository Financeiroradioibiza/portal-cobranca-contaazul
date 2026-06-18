import { prisma } from "@/lib/prisma";

export type RejeicaoRow = {
  id: string;
  clienteRef: string;
  clienteNome: string;
  motivo: string;
  createdAt: string;
};

export async function listRejeicoesMusica(musicaId: string): Promise<RejeicaoRow[]> {
  const rows = await prisma.musicaRejeicao.findMany({
    where: { musicaId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    clienteRef: r.clienteRef,
    clienteNome: r.clienteRef,
    motivo: r.motivo,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addRejeicao(input: {
  musicaId: string;
  clienteRef: string;
  motivo?: string;
}): Promise<void> {
  const clienteRef = (input.clienteRef || "").trim();
  if (!clienteRef) throw new Error("cliente_obrigatorio");
  await prisma.musicaRejeicao.upsert({
    where: { musicaId_clienteRef: { musicaId: input.musicaId, clienteRef: clienteRef.slice(0, 120) } },
    create: {
      musicaId: input.musicaId,
      clienteRef: clienteRef.slice(0, 120),
      motivo: (input.motivo ?? "").slice(0, 2000),
    },
    update: { motivo: (input.motivo ?? "").slice(0, 2000) },
  });
}

export async function removeRejeicao(musicaId: string, clienteRef: string): Promise<void> {
  await prisma.musicaRejeicao.deleteMany({
    where: { musicaId, clienteRef: clienteRef.slice(0, 120) },
  });
}

/** Contagem de rejeições por música (para badges na biblioteca). */
export async function countRejeicoesPorMusica(musicaIds: string[]): Promise<Map<string, number>> {
  if (musicaIds.length === 0) return new Map();
  const rows = await prisma.musicaRejeicao.groupBy({
    by: ["musicaId"],
    where: { musicaId: { in: musicaIds } },
    _count: { musicaId: true },
  });
  return new Map(rows.map((r) => [r.musicaId, r._count.musicaId]));
}
