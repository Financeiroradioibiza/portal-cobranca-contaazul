import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deleteAgendamento, updateAgendamento } from "@/lib/criacao/agendamentoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = await updateAgendamento(id, body as never);
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
    await deleteAgendamento(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/agendamentos/:id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
