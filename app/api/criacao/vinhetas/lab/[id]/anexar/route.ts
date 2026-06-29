import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { anexarVinhetaLabEmProgramacao } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { programacaoId?: string };
    const programacaoId = (body.programacaoId ?? "").trim();
    if (!programacaoId) {
      return NextResponse.json({ error: "programacao_obrigatoria" }, { status: 400 });
    }
    const vinheta = await anexarVinhetaLabEmProgramacao(id, programacaoId);
    return NextResponse.json({ ok: true, vinheta });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "programacao_nao_encontrada" || msg === "vinheta_indisponivel") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "clone_falhou") return NextResponse.json({ error: msg }, { status: 502 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
