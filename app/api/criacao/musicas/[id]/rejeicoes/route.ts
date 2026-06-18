import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { addRejeicao, listRejeicoesMusica, removeRejeicao } from "@/lib/criacao/rejeicaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const rejeicoes = await listRejeicoesMusica(id);
    return NextResponse.json({ rejeicoes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id/rejeicoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { clienteRef?: string; motivo?: string };
    await addRejeicao({ musicaId: id, clienteRef: body.clienteRef ?? "", motivo: body.motivo });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "cliente_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/musicas/:id/rejeicoes POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const clienteRef = url.searchParams.get("clienteRef") ?? "";
    if (!clienteRef.trim()) return NextResponse.json({ error: "cliente_obrigatorio" }, { status: 400 });
    await removeRejeicao(id, clienteRef);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id/rejeicoes DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
