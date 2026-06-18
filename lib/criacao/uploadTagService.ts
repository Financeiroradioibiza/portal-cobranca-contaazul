import { prisma } from "@/lib/prisma";
import { initials } from "@/lib/config/portalUserService";
import { assignTag } from "@/lib/criacao/tagService";

const DEFAULT_COR = "#6366f1";

/** Aplica tags de upload pendentes (itens concluídos com musicaId). Idempotente. */
export async function applyPendingUploadTags(limit = 80): Promise<number> {
  const items = await prisma.processamentoItem.findMany({
    where: {
      status: "concluido",
      musicaId: { not: null },
      job: { uploadTagNome: { not: "" } },
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      job: {
        select: {
          uploadTagNome: true,
          criativoUserId: true,
          criativoNome: true,
        },
      },
    },
  });

  let applied = 0;
  for (const item of items) {
    if (!item.musicaId) continue;
    const ok = await applyUploadTagForMusica({
      musicaId: item.musicaId,
      tagNome: item.job.uploadTagNome,
      criativoUserId: item.job.criativoUserId,
      criativoNome: item.job.criativoNome,
    });
    if (ok) applied += 1;
  }
  return applied;
}

export async function applyUploadTagForMusica(input: {
  musicaId: string;
  tagNome: string;
  criativoUserId: string | null;
  criativoNome: string;
}): Promise<boolean> {
  const nome = (input.tagNome || "").trim().slice(0, 80);
  if (!nome) return false;

  const user =
    input.criativoUserId ?
      await prisma.portalUser.findUnique({
        where: { email: input.criativoUserId },
        select: { tagCor: true, tagIniciais: true, displayName: true },
      })
    : null;

  const cor = user?.tagCor?.trim() || DEFAULT_COR;
  const criativoNome = (user?.displayName || input.criativoNome || input.criativoUserId || "").slice(0, 120);
  const criativoUserId = input.criativoUserId;

  const existing = await prisma.tagCriativo.findFirst({
    where: { nome, criativoUserId: criativoUserId ?? null },
    select: { id: true },
  });

  const tagId =
    existing?.id ??
    (
      await prisma.tagCriativo.create({
        data: {
          nome,
          cor: cor.startsWith("#") ? cor.toLowerCase() : `#${cor.toLowerCase()}`,
          criativoUserId,
          criativoNome,
        },
        select: { id: true },
      })
    ).id;

  if (existing) {
    await prisma.tagCriativo.update({
      where: { id: existing.id },
      data: { cor: cor.startsWith("#") ? cor.toLowerCase() : `#${cor.toLowerCase()}`, criativoNome },
    });
  }

  const already = await prisma.musicaTagManual.findUnique({
    where: { musicaId_tagId: { musicaId: input.musicaId, tagId } },
  });
  if (already) return false;

  await assignTag(input.musicaId, tagId);
  return true;
}

/** Resolve iniciais para exibição [RG] — usa cadastro ou deriva do nome. */
export function resolveCriativoIniciais(
  tagIniciais: string | null | undefined,
  criativoNome: string,
  criativoUserId: string | null | undefined,
): string {
  const fromDb = (tagIniciais ?? "").trim().toUpperCase();
  if (fromDb) return fromDb.slice(0, 8);
  return initials(criativoNome, criativoUserId ?? "").slice(0, 8);
}
