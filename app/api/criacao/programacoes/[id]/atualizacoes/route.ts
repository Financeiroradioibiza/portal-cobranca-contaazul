import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listAtualizacoesLog } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const atualizacoes = await listAtualizacoesLog(id);
    return NextResponse.json({ atualizacoes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/programacoes/:id/atualizacoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
