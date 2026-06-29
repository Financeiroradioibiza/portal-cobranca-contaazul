import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { sugerirAcrescimoInteligente } from "@/lib/criacao/atlCricaInteligenteService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      programacaoId?: string;
      excludeMusicaIds?: string[];
    };
    const programacaoId = (body.programacaoId ?? "").trim();
    if (!programacaoId) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const result = await sugerirAcrescimoInteligente({
      programacaoId,
      excludeMusicaIds: Array.isArray(body.excludeMusicaIds) ? body.excludeMusicaIds : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/atl-crica/inteligente/sugerir POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
