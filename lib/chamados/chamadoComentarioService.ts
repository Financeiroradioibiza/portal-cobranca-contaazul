import { prisma } from "@/lib/prisma";
import type { ChamadoComentarioView } from "@/lib/chamados/chamadoTypes";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import { bumpChamadoInbox } from "@/lib/chamados/chamadoInboxService";
import { notifyChamadoCommentEmail } from "@/lib/chamados/chamadoNotifyEmail";
import { addChamadoAnexo } from "@/lib/chamados/chamadoAnexoService";
import { loadReacoesForComentarios } from "@/lib/chamados/chamadoComentarioReacaoService";

function toView(
  row: {
    id: string;
    chamadoId: string;
    corpo: string;
    autorEmail: string;
    autorNome: string;
    createdAt: Date;
  },
  extras: Pick<ChamadoComentarioView, "anexos" | "reacoes">,
): ChamadoComentarioView {
  return {
    id: row.id,
    chamadoId: row.chamadoId,
    corpo: row.corpo,
    autorEmail: row.autorEmail,
    autorNome: row.autorNome,
    createdAt: row.createdAt.toISOString(),
    anexos: extras.anexos,
    reacoes: extras.reacoes,
  };
}

async function enrichComentarios(
  rows: {
    id: string;
    chamadoId: string;
    corpo: string;
    autorEmail: string;
    autorNome: string;
    createdAt: Date;
  }[],
  viewerEmail: string,
): Promise<ChamadoComentarioView[]> {
  const ids = rows.map((r) => r.id);
  const [anexoRows, reacoesMap] = await Promise.all([
    ids.length ?
      prisma.chamadoAnexo.findMany({
        where: { comentarioId: { in: ids } },
        orderBy: { createdAt: "asc" },
      })
    : [],
    loadReacoesForComentarios(ids, viewerEmail),
  ]);
  const anexosByComment = new Map<string, ChamadoComentarioView["anexos"]>();
  for (const a of anexoRows) {
    if (!a.comentarioId) continue;
    const list = anexosByComment.get(a.comentarioId) ?? [];
    list.push({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    });
    anexosByComment.set(a.comentarioId, list);
  }
  return rows.map((r) =>
    toView(r, {
      anexos: anexosByComment.get(r.id) ?? [],
      reacoes: reacoesMap.get(r.id) ?? [],
    }),
  );
}

export async function listChamadoComentarios(
  chamadoId: string,
  viewerEmail: string,
): Promise<ChamadoComentarioView[]> {
  const rows = await prisma.chamadoComentario.findMany({
    where: { chamadoId },
    orderBy: { createdAt: "asc" },
  });
  return enrichComentarios(rows, viewerEmail);
}

export async function postChamadoComentario(
  chamadoId: string,
  corpoRaw: string,
  ctx: ChamadoUserContext,
  files: { name: string; mimeType: string; bytes: Buffer }[] = [],
): Promise<ChamadoComentarioView> {
  const corpo = corpoRaw.trim().slice(0, 8000);
  if (!corpo && files.length === 0) throw new Error("corpo_vazio");

  const chamado = await prisma.chamado.findUnique({ where: { id: chamadoId } });
  if (!chamado) throw new Error("not_found");

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.chamadoComentario.create({
      data: {
        chamadoId,
        corpo: corpo || "(anexo)",
        autorEmail: ctx.email,
        autorNome: ctx.displayName,
      },
    });
    await tx.chamado.update({
      where: { id: chamadoId },
      data: { updatedAt: new Date() },
    });
    return created;
  });

  for (const file of files) {
    await addChamadoAnexo(chamadoId, file, ctx, { comentarioId: row.id });
  }

  const view = chamadoToView(chamado);
  try {
    await notifyChamadoCommentEmail(view, {
      autorNome: ctx.displayName,
      corpo: corpo || "(anexo)",
      excludeEmail: ctx.email,
    });
  } catch (e) {
    console.error("[chamadoComentario] falha e-mail resposta", chamadoId, e);
  }

  try {
    await bumpChamadoInbox(view, { kind: "comment", actorEmail: ctx.email });
  } catch (e) {
    console.error("[chamadoComentario] inbox resposta", chamadoId, e);
  }

  const [enriched] = await enrichComentarios([row], ctx.email);
  return enriched!;
}
