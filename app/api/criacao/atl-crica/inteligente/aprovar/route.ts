import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parseCompetencia } from "@/lib/criacao/competencia";
import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { toggleCriativoEntregue } from "@/lib/criacao/atualizacaoPainelService";
import { ATL_CRICA_ORIGEM_PREFIX } from "@/lib/criacao/atlCricaConstants";
import { aprovarSugestoesInteligente } from "@/lib/criacao/atlCricaInteligenteService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      programacaoId?: string;
      competencia?: string;
      aprovacoes?: Array<{ pastaId?: string; musicaIds?: string[] }>;
    };
    const programacaoId = (body.programacaoId ?? "").trim();
    if (!programacaoId) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const competencia = parseCompetencia(body.competencia);
    if (!competencia) {
      return NextResponse.json({ error: "competencia_invalida" }, { status: 400 });
    }
    const aprovacoes = Array.isArray(body.aprovacoes)
      ? body.aprovacoes
          .map((a) => ({
            pastaId: (a.pastaId ?? "").trim(),
            musicaIds: Array.isArray(a.musicaIds)
              ? a.musicaIds.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
              : [],
          }))
          .filter((a) => a.pastaId && a.musicaIds.length > 0)
      : [];
    if (aprovacoes.length === 0) {
      return NextResponse.json({ error: "nenhuma_faixa" }, { status: 400 });
    }

    const por = `${ATL_CRICA_ORIGEM_PREFIX}${session.displayName ?? session.email}`;
    await abrirAtualizacao(programacaoId, por);
    const { added } = await aprovarSugestoesInteligente({ programacaoId, aprovacoes });
    const row = await toggleCriativoEntregue(
      programacaoId,
      competencia,
      session.displayName ?? session.email,
      true,
    );

    return NextResponse.json({ ok: true, added, row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada" || msg === "migration_pendente") {
      return NextResponse.json({ error: msg }, { status: msg === "migration_pendente" ? 503 : 404 });
    }
    console.error("[criacao/atl-crica/inteligente/aprovar POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
