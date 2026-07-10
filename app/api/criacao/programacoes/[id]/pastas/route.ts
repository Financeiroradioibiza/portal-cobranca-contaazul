import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { createPasta } from "@/lib/criacao/programacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      velocidade?: string;
      selecionavel?: boolean;
      prioritaria?: boolean;
    };
    const created = await createPasta(id, {
      nome: body.nome ?? "",
      velocidade: body.velocidade,
      selecionavel: body.selecionavel,
      prioritaria: body.prioritaria,
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    console.error("[criacao/programacoes/:id/pastas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
