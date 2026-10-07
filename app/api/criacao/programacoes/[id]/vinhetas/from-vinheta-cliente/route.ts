import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { criarVinhetaProgramacaoFromMusicaCliente } from "@/lib/criacao/vinhetaFromMusicaClienteService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: programacaoId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaId?: string; nome?: string };
    const musicaId = typeof body.musicaId === "string" ? body.musicaId.trim() : "";
    if (!musicaId) return NextResponse.json({ error: "missing_musica_id" }, { status: 400 });
    const vinheta = await criarVinhetaProgramacaoFromMusicaCliente({
      programacaoId,
      musicaId,
      nome: body.nome,
    });
    await abrirProgramacaoAposMusica(programacaoId, session.displayName ?? session.email);
    return NextResponse.json({ ok: true, vinheta });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    const status =
      msg === "musica_nao_vinheta_cliente" || msg === "musica_indisponivel" ? 400
      : msg === "programacao_nao_encontrada" ? 404
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
