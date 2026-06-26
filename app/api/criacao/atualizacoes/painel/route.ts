import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { competenciaFromDate } from "@/lib/criacao/competencia";
import { listPainelCompetencia } from "@/lib/criacao/atualizacaoPainelService";
import { hasAtualizacaoPainelTable } from "@/lib/criacao/atualizacaoPainelSchemaCompat";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    // Por enquanto só o mês corrente (vira Julho, Ago… automaticamente no fuso BR).
    const competencia = competenciaFromDate();
    const migrationPendente = !(await hasAtualizacaoPainelTable());
    const rows = await listPainelCompetencia(competencia);
    return NextResponse.json({
      competencia,
      rows,
      migrationPendente,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/atualizacoes/painel GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      programacaoId?: string;
      competencia?: string;
      criativoEntregue?: boolean;
    };
    const programacaoId = (body.programacaoId ?? "").trim();
    const competencia = competenciaFromDate();
    if (!programacaoId) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const { toggleCriativoEntregue } = await import("@/lib/criacao/atualizacaoPainelService");
    const row = await toggleCriativoEntregue(
      programacaoId,
      competencia,
      session.displayName ?? session.email,
      Boolean(body.criativoEntregue),
    );
    return NextResponse.json({ row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "migration_pendente") {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[criacao/atualizacoes/painel PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
