import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

function isMissingSnapshotTable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2021" || err.code === "P2022")
  );
}

export async function saveServidorUpUploadSnapshot(
  downloadJobId: string,
  payload: ServidorUpUploadSession,
): Promise<void> {
  const id = downloadJobId.trim();
  if (!id) return;
  try {
    await prisma.servidorUpUploadSnapshot.upsert({
      where: { downloadJobId: id },
      create: { downloadJobId: id, payload: payload as object },
      update: { payload: payload as object },
    });
  } catch (err) {
    if (isMissingSnapshotTable(err)) {
      console.warn("[servidorUpUploadSnapshot] tabela ausente — rode prisma migrate deploy");
      return;
    }
    throw err;
  }
}

export async function deleteServidorUpUploadSnapshot(downloadJobId: string): Promise<boolean> {
  const id = downloadJobId.trim();
  if (!id) return false;
  try {
    await prisma.servidorUpUploadSnapshot.deleteMany({ where: { downloadJobId: id } });
    return true;
  } catch (err) {
    if (isMissingSnapshotTable(err)) return false;
    throw err;
  }
}

export async function getServidorUpUploadSnapshot(
  downloadJobId: string,
): Promise<ServidorUpUploadSession | null> {
  const id = downloadJobId.trim();
  if (!id) return null;
  try {
    const row = await prisma.servidorUpUploadSnapshot.findUnique({
      where: { downloadJobId: id },
    });
    if (!row?.payload || typeof row.payload !== "object") return null;
    const p = row.payload as ServidorUpUploadSession;
    if (!p.downloadJobId || !Array.isArray(p.tracks) || !Array.isArray(p.hierarchyRows)) {
      return null;
    }
    return p;
  } catch (err) {
    if (isMissingSnapshotTable(err)) return null;
    throw err;
  }
}

export async function listServidorUpUploadSnapshots(limit = 20): Promise<
  Array<{ downloadJobId: string; titulo: string; trackCount: number; savedAt: number }>
> {
  try {
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
  } catch (err) {
    if (isMissingSnapshotTable(err)) return [];
    throw err;
  }
}
