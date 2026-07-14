import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { abrirProgramacaoAposMusica } from "@/lib/criacao/abrirProgramacaoMusica";
import { addMusicasFromBibliotecaPastaToProgramacaoPasta } from "@/lib/criacao/bibliotecaPastaService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id: pastaId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { bibliotecaPastaId?: string };
    const bibliotecaPastaId = (body.bibliotecaPastaId ?? "").trim();
    if (!bibliotecaPastaId) {
      return NextResponse.json({ error: "biblioteca_pasta_id_obrigatorio" }, { status: 400 });
    }

    const result = await addMusicasFromBibliotecaPastaToProgramacaoPasta(pastaId, bibliotecaPastaId);
    if (result.added > 0) {
      const pasta = await prisma.pasta.findUnique({
        where: { id: pastaId },
        select: { programacaoId: true },
      });
      await abrirProgramacaoAposMusica(
        pasta?.programacaoId,
        session.displayName ?? session.email,
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pasta_nao_encontrada" || msg === "pasta_programacao_nao_encontrada") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[criacao/pastas/:id/musicas-from-custom POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
