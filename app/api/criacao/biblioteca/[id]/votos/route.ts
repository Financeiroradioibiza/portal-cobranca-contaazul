import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  listVotosMusica,
  portalPdvIdsForProgramacao,
} from "@/lib/criacao/musicaVotoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/criacao/biblioteca/[id]/votos — log de likes/dislikes (opcional: só PDVs da programação). */
export async function GET(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const programacaoId = url.searchParams.get("programacaoId")?.trim() || "";

    let portalPdvIds: number[] | undefined;
    if (programacaoId) {
      portalPdvIds = await portalPdvIdsForProgramacao(programacaoId);
    }

    const votos = await listVotosMusica(id, portalPdvIds);
    return NextResponse.json({ votos, programacaoId: programacaoId || null });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/:id/votos GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
