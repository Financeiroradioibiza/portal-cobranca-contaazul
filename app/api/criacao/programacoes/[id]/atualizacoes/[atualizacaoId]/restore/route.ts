import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { restoreProgramacaoFromSnapshot } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; atualizacaoId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId, atualizacaoId } = await ctx.params;
    const restoredBy = session.displayName ?? session.email;
    const result = await restoreProgramacaoFromSnapshot(programacaoId, atualizacaoId, restoredBy);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "atualizacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "snapshot_vazio") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "migration_pendente") {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[criacao/programacoes/:id/atualizacoes/:atualizacaoId/restore POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
