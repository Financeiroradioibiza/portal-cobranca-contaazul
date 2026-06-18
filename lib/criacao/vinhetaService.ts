import { prisma } from "@/lib/prisma";
import { buildVinhetaPreviewUrl } from "@/lib/criacao/vinhetaSign";

export type VinhetaTipo = "tts" | "audio";

export type VinhetaRow = {
  id: string;
  nome: string;
  tipo: string;
  texto: string;
  voz: string;
  temAudio: boolean;
  previewUrl: string | null;
};

function mapRow(v: {
  id: string;
  nome: string;
  tipo: string;
  texto: string;
  voz: string;
  storageKey: string | null;
}): VinhetaRow {
  return {
    id: v.id,
    nome: v.nome,
    tipo: v.tipo,
    texto: v.texto,
    voz: v.voz,
    temAudio: Boolean(v.storageKey),
    previewUrl: v.storageKey ? buildVinhetaPreviewUrl(v.id) : null,
  };
}

export async function listVinhetas(programacaoId: string): Promise<VinhetaRow[]> {
  const vs = await prisma.vinheta.findMany({
    where: { programacaoId },
    orderBy: { createdAt: "asc" },
  });
  return vs.map(mapRow);
}

export async function createVinheta(
  programacaoId: string,
  input: { nome: string; tipo?: string; texto?: string; voz?: string },
) {
  const nome = (input.nome || "").trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const tipo = input.tipo === "audio" ? "audio" : "tts";
  return prisma.vinheta.create({
    data: {
      programacaoId,
      nome: nome.slice(0, 160),
      tipo,
      texto: (input.texto ?? "").slice(0, 4000),
      voz: (input.voz ?? "").slice(0, 80),
    },
    select: { id: true },
  });
}

export async function updateVinheta(
  id: string,
  patch: { nome?: string; texto?: string; voz?: string },
): Promise<boolean> {
  const data: { nome?: string; texto?: string; voz?: string } = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 160);
  if (typeof patch.texto === "string") data.texto = patch.texto.slice(0, 4000);
  if (typeof patch.voz === "string") data.voz = patch.voz.slice(0, 80);
  if (Object.keys(data).length === 0) return false;
  await prisma.vinheta.update({ where: { id }, data });
  return true;
}

export async function deleteVinheta(id: string): Promise<void> {
  await prisma.vinheta.delete({ where: { id } });
}
