import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { ATL_CRICA_ORIGEM_PREFIX } from "@/lib/criacao/atlCricaConstants";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { programacaoId?: string };
    const programacaoId = (body.programacaoId ?? "").trim();
    if (!programacaoId) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const por = `${ATL_CRICA_ORIGEM_PREFIX}${session.displayName ?? session.email}`;
    const prog = await abrirAtualizacao(programacaoId, por);
    return NextResponse.json({ ok: true, programacao: prog });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/atl-crica/abrir POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
