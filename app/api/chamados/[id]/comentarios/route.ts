import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  listChamadoComentarios,
  postChamadoComentario,
} from "@/lib/chamados/chamadoComentarioService";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const comentarios = await listChamadoComentarios(id);
    return NextResponse.json({ ok: true, comentarios });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/:id/comentarios GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const userCtx = await getChamadoUserContext(session.email);
    if (!userCtx) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const { id } = await ctx.params;
    let body: { corpo?: string };
    try {
      body = (await req.json()) as { corpo?: string };
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const comentario = await postChamadoComentario(id, body.corpo ?? "", userCtx);
    return NextResponse.json({ ok: true, comentario });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg === "corpo_vazio") return NextResponse.json({ error: "corpo_vazio" }, { status: 400 });
    console.error("[chamados/:id/comentarios POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
