import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parseCompetencia } from "@/lib/criacao/competencia";
import { toggleCriativoEntregue } from "@/lib/criacao/atualizacaoPainelService";

export const runtime = "nodejs";

/** Marca criativo entregue no painel ATL (check CRICA + produção). */
export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      programacaoIds?: string[];
      competencia?: string;
    };
    const ids = Array.isArray(body.programacaoIds)
      ? [...new Set(body.programacaoIds.filter((x): x is string => typeof x === "string" && Boolean(x.trim())))]
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const competencia = parseCompetencia(body.competencia);
    if (!competencia) {
      return NextResponse.json({ error: "competencia_invalida" }, { status: 400 });
    }
    const por = session.displayName ?? session.email;
    const rows = [];
    for (const programacaoId of ids) {
      rows.push(await toggleCriativoEntregue(programacaoId, competencia, por, true));
    }
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "migration_pendente") {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[criacao/atl-crica/marcar-subido POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
