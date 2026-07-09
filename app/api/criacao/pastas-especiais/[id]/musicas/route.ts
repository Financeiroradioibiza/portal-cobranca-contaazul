import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  addMusicasToPastaEspecial,
  getPastaEspecial,
  removeMusicasFromPastaEspecial,
} from "@/lib/criacao/pastaEspecialService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const pasta = await getPastaEspecial(id);
    if (!pasta) return NextResponse.json({ error: "nao_encontrada" }, { status: 404 });
    return NextResponse.json({ musicas: pasta.musicas ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas-especiais/:id/musicas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const added = await addMusicasToPastaEspecial(
      id,
      Array.isArray(body.musicaIds) ? body.musicaIds : [],
    );
    return NextResponse.json({ added });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas-especiais/:id/musicas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const removed = await removeMusicasFromPastaEspecial(
      id,
      Array.isArray(body.musicaIds) ? body.musicaIds : [],
    );
    return NextResponse.json({ removed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas-especiais/:id/musicas DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
