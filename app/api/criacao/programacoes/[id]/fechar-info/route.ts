import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getFecharAtualizacaoInfo } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const clienteRef = new URL(request.url).searchParams.get("clienteRef") ?? undefined;
    const info = await getFecharAtualizacaoInfo(id, { clienteRef });
    return NextResponse.json(info);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/programacoes/:id/fechar-info GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
