import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { removeMusicaFromPasta } from "@/lib/criacao/programacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; musicaId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id, musicaId } = await ctx.params;
    await removeMusicaFromPasta(id, musicaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id/musicas/:musicaId DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
