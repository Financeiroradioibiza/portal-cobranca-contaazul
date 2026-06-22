import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { addMusicasToPasta, removeMusicasFromPasta, reorderPastaMusicas } from "@/lib/criacao/programacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const added = await addMusicasToPasta(id, Array.isArray(body.musicaIds) ? body.musicaIds : []);
    return NextResponse.json({ added });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id/musicas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    await reorderPastaMusicas(id, Array.isArray(body.musicaIds) ? body.musicaIds : []);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id/musicas PUT]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const removed = await removeMusicasFromPasta(
      id,
      Array.isArray(body.musicaIds) ? body.musicaIds : [],
    );
    return NextResponse.json({ removed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id/musicas DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
