import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { deleteConversaMensagem, updateConversaMensagemCorpo } from "@/lib/chamados/conversaService";
import { patchConversaMensagemEstado } from "@/lib/chamados/conversaMessageService";

type Ctx = { params: Promise<{ mensagemId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { mensagemId } = await ctx.params;
    await deleteConversaMensagem(mensagemId, userCtx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    console.error("[chamados/conversas/mensagens DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { mensagemId } = await ctx.params;
    const body = (await req.json()) as {
      corpo?: string;
      favorito?: boolean;
      forcarNaoLida?: boolean;
      marcarLida?: boolean;
    };

    if (typeof body.corpo === "string") {
      const mensagem = await updateConversaMensagemCorpo(mensagemId, body.corpo, userCtx);
      return NextResponse.json({ ok: true, mensagem });
    }

    await patchConversaMensagemEstado(mensagemId, userCtx.email, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (msg === "corpo_vazio") return NextResponse.json({ error: "corpo_vazio" }, { status: 400 });
    console.error("[chamados/conversas/mensagens PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
