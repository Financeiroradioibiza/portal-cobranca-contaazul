import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { addMusicasToPasta, removeMusicasFromPasta, reorderPastaMusicas } from "@/lib/criacao/programacaoService";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;

    const links = await prisma.pastaMusica.findMany({
      where: { pastaId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        musica: {
          select: {
            id: true,
            titulo: true,
            artista: true,
            durationMs: true,
            mixSegundosFinais: true,
            versoes: { select: { formato: true } },
            tagsManuais: {
              include: {
                tag: {
                  select: { id: true, nome: true, cor: true, criativoNome: true },
                },
              },
            },
          },
        },
      },
    });

    const musicas = links.map((l) => {
      const m = l.musica;
      const formatoUso = pickLowestPreviewFormato(m.versoes);
      const previewUrl = formatoUso ? buildPreviewUrl(m.id, formatoUso) : null;
      return {
        id: m.id,
        titulo: m.titulo,
        artista: m.artista,
        durationMs: m.durationMs,
        mixSegundosFinais: m.mixSegundosFinais,
        previewUrl,
        addedAt: l.addedAt?.toISOString() ?? null,
        tagsManuais: m.tagsManuais.map((t) => ({
          id: t.tag.id,
          nome: t.tag.nome,
          cor: t.tag.cor,
          criativoNome: t.tag.criativoNome,
        })),
      };
    });

    return NextResponse.json({ musicas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/pastas/:id/musicas GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

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
