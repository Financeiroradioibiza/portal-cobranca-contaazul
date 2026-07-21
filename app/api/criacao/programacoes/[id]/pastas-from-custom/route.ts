import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { createPastaFromBibliotecaCustom } from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      bibliotecaPastaId?: string;
      nome?: string;
    };
    const bibliotecaPastaId = (body.bibliotecaPastaId ?? "").trim();
    if (!bibliotecaPastaId) {
      return NextResponse.json({ error: "biblioteca_pasta_id_obrigatorio" }, { status: 400 });
    }

    const result = await createPastaFromBibliotecaCustom(programacaoId, bibliotecaPastaId, {
      nome: body.nome,
    });
    await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pasta_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/programacoes/:id/pastas-from-custom POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
