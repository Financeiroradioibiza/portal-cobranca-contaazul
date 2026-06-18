import { prisma } from "@/lib/prisma";

export type TagCriativoRow = {
  id: string;
  nome: string;
  cor: string;
  criativoNome: string;
  usoCount: number;
};

const HEX = /^#?[0-9a-fA-F]{6}$/;

function normalizeCor(cor: string | undefined): string {
  const c = (cor ?? "").trim();
  if (!HEX.test(c)) return "#64748b";
  return c.startsWith("#") ? c.toLowerCase() : `#${c.toLowerCase()}`;
}

export async function listTags(): Promise<TagCriativoRow[]> {
  const tags = await prisma.tagCriativo.findMany({
    orderBy: [{ criativoNome: "asc" }, { nome: "asc" }],
    include: { _count: { select: { musicas: true } } },
  });
  return tags.map((t) => ({
    id: t.id,
    nome: t.nome,
    cor: t.cor,
    criativoNome: t.criativoNome,
    usoCount: t._count.musicas,
  }));
}

export async function createTag(input: {
  nome: string;
  cor?: string;
  criativoUserId?: string;
  criativoNome?: string;
}) {
  const nome = (input.nome || "").trim();
  if (!nome) throw new Error("nome_obrigatorio");
  return prisma.tagCriativo.create({
    data: {
      nome: nome.slice(0, 80),
      cor: normalizeCor(input.cor),
      criativoUserId: input.criativoUserId ?? null,
      criativoNome: (input.criativoNome ?? "").slice(0, 120),
    },
    select: { id: true },
  });
}

export async function updateTag(id: string, patch: { nome?: string; cor?: string }): Promise<boolean> {
  const data: { nome?: string; cor?: string } = {};
  if (typeof patch.nome === "string" && patch.nome.trim()) data.nome = patch.nome.trim().slice(0, 80);
  if (typeof patch.cor === "string") data.cor = normalizeCor(patch.cor);
  if (Object.keys(data).length === 0) return false;
  await prisma.tagCriativo.update({ where: { id }, data });
  return true;
}

export async function deleteTag(id: string): Promise<void> {
  await prisma.tagCriativo.delete({ where: { id } });
}

export async function assignTag(musicaId: string, tagId: string): Promise<void> {
  await prisma.musicaTagManual.upsert({
    where: { musicaId_tagId: { musicaId, tagId } },
    create: { musicaId, tagId },
    update: {},
  });
}

export async function unassignTag(musicaId: string, tagId: string): Promise<void> {
  await prisma.musicaTagManual.deleteMany({ where: { musicaId, tagId } });
}
