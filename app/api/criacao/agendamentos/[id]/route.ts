import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deleteAgendamento, updateAgendamento } from "@/lib/criacao/agendamentoService";
import { syncPastaFlagsProgramacao } from "@/lib/criacao/publicarService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function syncGatewayAposAgendamento(agendamentoId: string): Promise<void> {
  const row = await prisma.agendamento.findUnique({
    where: { id: agendamentoId },
    select: { programacaoId: true },
  });
  if (!row?.programacaoId) return;
  await syncPastaFlagsProgramacao(row.programacaoId);
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = await updateAgendamento(id, body as never);
    if (ok) {
      await syncGatewayAposAgendamento(id).catch((e) => {
        console.error("[criacao/agendamentos/:id PATCH] sync gateway", e);
      });
    }
    return NextResponse.json({ ok });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/agendamentos/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await prisma.agendamento.findUnique({
      where: { id },
      select: { programacaoId: true },
    });
    await deleteAgendamento(id);
    if (row?.programacaoId) {
      await syncPastaFlagsProgramacao(row.programacaoId).catch((e) => {
        console.error("[criacao/agendamentos/:id DELETE] sync gateway", e);
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/agendamentos/:id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
