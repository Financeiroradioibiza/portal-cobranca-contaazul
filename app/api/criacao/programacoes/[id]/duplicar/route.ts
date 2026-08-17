import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { duplicateProgramacao } from "@/lib/criacao/duplicateProgramacao";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { nome?: string };
    const result = await duplicateProgramacao(id, { nome: body.nome });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "not_found") return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[criacao/programacoes/:id/duplicar POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
