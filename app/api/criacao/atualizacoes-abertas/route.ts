import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listAtualizacoesAbertas } from "@/lib/criacao/atualizacaoService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const atualizacoes = await listAtualizacoesAbertas();
    return NextResponse.json({ atualizacoes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/atualizacoes-abertas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
