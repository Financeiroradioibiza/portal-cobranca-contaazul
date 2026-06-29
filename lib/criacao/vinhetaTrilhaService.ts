import { prisma } from "@/lib/prisma";
import { buildVinhetaTrilhaPreviewUrl, signVinhetaTrilhaUpload, vinhetaTrilhaIngestUrl } from "@/lib/criacao/vinhetaSign";

export type VinhetaTrilhaRow = {
  id: string;
  nome: string;
  temAudio: boolean;
  previewUrl: string | null;
  durationMs: number | null;
  uploadedByNome: string;
  createdAt: string;
};

function mapRow(t: {
  id: string;
  nome: string;
  storageKey: string | null;
  durationMs: number | null;
  uploadedByNome: string;
  createdAt: Date;
}): VinhetaTrilhaRow {
  return {
    id: t.id,
    nome: t.nome,
    temAudio: Boolean(t.storageKey),
    previewUrl: t.storageKey ? buildVinhetaTrilhaPreviewUrl(t.id) : null,
    durationMs: t.durationMs,
    uploadedByNome: t.uploadedByNome,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function listVinhetaTrilhas(): Promise<VinhetaTrilhaRow[]> {
  const rows = await prisma.vinhetaTrilha.findMany({
    orderBy: [{ nome: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapRow);
}

export async function createVinhetaTrilha(input: {
  nome: string;
  uploadedBy: string;
  uploadedByNome: string;
}): Promise<{ trilha: VinhetaTrilhaRow; ingestUrl: string; token: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const row = await prisma.vinhetaTrilha.create({
    data: {
      nome: nome.slice(0, 160),
      uploadedBy: input.uploadedBy,
      uploadedByNome: input.uploadedByNome.slice(0, 120),
    },
  });
  const { token } = signVinhetaTrilhaUpload(row.id);
  return {
    trilha: mapRow(row),
    ingestUrl: vinhetaTrilhaIngestUrl(),
    token,
  };
}

export async function deleteVinhetaTrilha(id: string): Promise<void> {
  const inUse = await prisma.vinheta.count({ where: { trilhaVinhetaId: id } });
  if (inUse > 0) throw new Error("trilha_em_uso");
  await prisma.vinhetaTrilha.delete({ where: { id } });
}

export async function getVinhetaTrilhaById(id: string): Promise<VinhetaTrilhaRow | null> {
  const row = await prisma.vinhetaTrilha.findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}
