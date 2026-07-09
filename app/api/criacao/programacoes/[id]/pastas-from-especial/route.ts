import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { createPastaFromEspecial } from "@/lib/criacao/pastaEspecialService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { pastaEspecialId?: string };
    const pastaEspecialId = (body.pastaEspecialId ?? "").trim();
    if (!pastaEspecialId) {
      return NextResponse.json({ error: "pasta_especial_id_obrigatorio" }, { status: 400 });
    }
    const result = await createPastaFromEspecial(programacaoId, pastaEspecialId);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pasta_especial_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/programacoes/:id/pastas-from-especial POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
