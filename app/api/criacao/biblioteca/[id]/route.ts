import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { deleteMusicaBiblioteca, getMusicaBibliotecaRow, getMusicaDeleteInfo, updateMusicaBibliotecaMeta } from "@/lib/criacao/bibliotecaService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const url = new URL(request.url);
    if (url.searchParams.get("row") === "1") {
      const musica = await getMusicaBibliotecaRow(id);
      return NextResponse.json({ musica });
    }
    const info = await getMusicaDeleteInfo(id);
    return NextResponse.json(info);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[criacao/biblioteca/:id GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    await deleteMusicaBiblioteca(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[criacao/biblioteca/:id DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { titulo?: string; artista?: string };
    if (!("titulo" in body) && !("artista" in body)) {
      return NextResponse.json({ error: "titulo_ou_artista_obrigatorio" }, { status: 400 });
    }
    const musica = await updateMusicaBibliotecaMeta(id, body);
    return NextResponse.json({ ok: true, musica });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "titulo_obrigatorio") {
      return NextResponse.json({ error: "titulo_obrigatorio" }, { status: 400 });
    }
    console.error("[criacao/biblioteca/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
