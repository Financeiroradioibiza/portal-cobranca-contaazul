import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { filaOrdemInsertBetween } from "@/lib/criacao/filaOrdemService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Ajuste manual da ordem na fila (drag-and-drop futuro). */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const jobId = id.trim();
    if (!jobId) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      filaOrdem?: number;
      /** Job imediatamente acima (número maior). */
      aboveJobId?: string;
      /** Job imediatamente abaixo (número menor). */
      belowJobId?: string;
    };

    let filaOrdem = body.filaOrdem;
    if (filaOrdem == null && body.aboveJobId && body.belowJobId) {
      const pair = await prisma.processamentoJob.findMany({
        where: { id: { in: [body.aboveJobId.trim(), body.belowJobId.trim()] } },
        select: { id: true, filaOrdem: true },
      });
      const above = pair.find((j) => j.id === body.aboveJobId?.trim());
      const below = pair.find((j) => j.id === body.belowJobId?.trim());
      if (
        above?.filaOrdem != null &&
        below?.filaOrdem != null &&
        above.filaOrdem > below.filaOrdem
      ) {
        filaOrdem = filaOrdemInsertBetween(above.filaOrdem, below.filaOrdem) ?? undefined;
      }
      if (filaOrdem == null) {
        return NextResponse.json({ error: "gap_insuficiente_rebalance" }, { status: 409 });
      }
    }

    if (filaOrdem == null || !Number.isFinite(filaOrdem)) {
      return NextResponse.json({ error: "fila_ordem_invalida" }, { status: 400 });
    }

    const updated = await prisma.processamentoJob.update({
      where: { id: jobId },
      data: { filaOrdem: Math.round(filaOrdem) },
      select: { id: true, filaOrdem: true, titulo: true, status: true },
    });

    return NextResponse.json({ ok: true, job: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/[id]/ordem PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
