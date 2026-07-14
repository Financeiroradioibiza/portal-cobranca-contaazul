import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  addMusicasToBibliotecaPasta,
  removeMusicasFromBibliotecaPasta,
} from "@/lib/criacao/bibliotecaPastaService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const ids = Array.isArray(body.musicaIds) ? body.musicaIds : [];
    const result = await addMusicasToBibliotecaPasta(id, ids);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "pasta_nao_encontrada") return NextResponse.json({ error: msg }, { status: 404 });
    console.error("[criacao/biblioteca/pastas musicas POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const ids = Array.isArray(body.musicaIds) ? body.musicaIds : [];
    const removed = await removeMusicasFromBibliotecaPasta(id, ids);
    return NextResponse.json({ removed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/pastas musicas DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
