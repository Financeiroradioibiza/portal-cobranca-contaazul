import { prisma } from "@/lib/prisma";

export const VINHETAS_CLIENTES_FOLDER_LABEL = "Vinhetas clientes";

export async function countVinhetasClientesBiblioteca(): Promise<number> {
  return prisma.bibliotecaVinhetaCliente.count();
}

export async function addMusicaToVinhetasClientes(musicaId: string): Promise<void> {
  const id = musicaId.trim();
  if (!id) return;
  await prisma.bibliotecaVinhetaCliente.upsert({
    where: { musicaId: id },
    create: { musicaId: id },
    update: {},
  });
}

export async function listVinhetaClienteMusicaIds(limit = 5000): Promise<string[]> {
  const rows = await prisma.bibliotecaVinhetaCliente.findMany({
    orderBy: { addedAt: "desc" },
    take: limit,
    select: { musicaId: true },
  });
  return rows.map((r) => r.musicaId);
}

export async function removeMusicaFromVinhetasClientes(musicaId: string): Promise<void> {
  await prisma.bibliotecaVinhetaCliente.deleteMany({ where: { musicaId: musicaId.trim() } });
}
