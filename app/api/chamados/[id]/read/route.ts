import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { markChamadoRead } from "@/lib/chamados/chamadoInboxService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    await markChamadoRead(session.email, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/:id/read POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
