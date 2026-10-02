import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { deleteAgendaCompromisso } from "@/lib/chamados/agendaCompromissoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    const { id } = await ctx.params;
    await deleteAgendaCompromisso(id, userCtx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[agenda/compromissos DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
