import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const resultado = await abrirAtualizacao(id, session.displayName ?? session.email);
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "migration_pendente") {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[criacao/programacoes/:id/abrir-atualizacao POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
