import { prisma } from "@/lib/prisma";
import type { ChamadoComentarioView } from "@/lib/chamados/chamadoTypes";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import { notifyChamadoCommentEmail } from "@/lib/chamados/chamadoNotifyEmail";

function toView(row: {
  id: string;
  chamadoId: string;
  corpo: string;
  autorEmail: string;
  autorNome: string;
  createdAt: Date;
}): ChamadoComentarioView {
  return {
    id: row.id,
    chamadoId: row.chamadoId,
    corpo: row.corpo,
    autorEmail: row.autorEmail,
    autorNome: row.autorNome,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listChamadoComentarios(chamadoId: string): Promise<ChamadoComentarioView[]> {
  const rows = await prisma.chamadoComentario.findMany({
    where: { chamadoId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toView);
}

export async function postChamadoComentario(
  chamadoId: string,
  corpoRaw: string,
  ctx: ChamadoUserContext,
): Promise<ChamadoComentarioView> {
  const corpo = corpoRaw.trim().slice(0, 8000);
  if (!corpo) throw new Error("corpo_vazio");

  const chamado = await prisma.chamado.findUnique({ where: { id: chamadoId } });
  if (!chamado) throw new Error("not_found");

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.chamadoComentario.create({
      data: {
        chamadoId,
        corpo,
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

  const view = chamadoToView(chamado);
  try {
    await notifyChamadoCommentEmail(view, {
      autorNome: ctx.displayName,
      corpo,
      excludeEmail: ctx.email,
    });
  } catch (e) {
    console.error("[chamadoComentario] falha e-mail resposta", chamadoId, e);
  }

  return toView(row);
}
