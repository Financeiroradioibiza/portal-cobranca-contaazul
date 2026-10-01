import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { avancarSequenciaChamado } from "@/lib/chamados/chamadoSequenciaService";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    const { id } = await ctx.params;
    const result = await avancarSequenciaChamado(id, userCtx);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_sequencia") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[chamados/sequencia/proximo POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
