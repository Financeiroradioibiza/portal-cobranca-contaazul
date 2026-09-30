import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { markConversaRead } from "@/lib/chamados/conversaService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    await markConversaRead(id, userCtx.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas/:id/read POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
