import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { toggleConversaReacao } from "@/lib/chamados/conversaMessageService";

type Ctx = { params: Promise<{ mensagemId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { mensagemId } = await ctx.params;
    const body = (await req.json()) as { tipo?: string };
    const reacoes = await toggleConversaReacao(mensagemId, userCtx.email, body.tipo);
    return NextResponse.json({ ok: true, reacoes });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "reacao_invalida") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[chamados/conversas/mensagens/reacao POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
