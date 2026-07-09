import { prisma } from "@/lib/prisma";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

export async function saveServidorUpUploadSnapshot(
  downloadJobId: string,
  payload: ServidorUpUploadSession,
): Promise<void> {
  const id = downloadJobId.trim();
  if (!id) return;
  await prisma.servidorUpUploadSnapshot.upsert({
    where: { downloadJobId: id },
    create: { downloadJobId: id, payload: payload as object },
    update: { payload: payload as object },
  });
}

export async function getServidorUpUploadSnapshot(
  downloadJobId: string,
): Promise<ServidorUpUploadSession | null> {
  const id = downloadJobId.trim();
  if (!id) return null;
  const row = await prisma.servidorUpUploadSnapshot.findUnique({
    where: { downloadJobId: id },
  });
  if (!row?.payload || typeof row.payload !== "object") return null;
  const p = row.payload as ServidorUpUploadSession;
  if (!p.downloadJobId || !Array.isArray(p.tracks) || !Array.isArray(p.hierarchyRows)) {
    return null;
  }
  return p;
}

export async function listServidorUpUploadSnapshots(limit = 20): Promise<
  Array<{ downloadJobId: string; titulo: string; trackCount: number; savedAt: number }>
> {
  const rows = await prisma.servidorUpUploadSnapshot.findMany({
    orderBy: { updatedAt: "desc" },
    take: Math.min(50, Math.max(1, limit)),
  });
  return rows.map((r) => {
    const p = r.payload as ServidorUpUploadSession;
    return {
      downloadJobId: r.downloadJobId,
      titulo: p.titulo ?? "Servidor UP",
      trackCount: p.tracks?.length ?? 0,
      savedAt: p.savedAt ?? r.updatedAt.getTime(),
    };
  });
}
