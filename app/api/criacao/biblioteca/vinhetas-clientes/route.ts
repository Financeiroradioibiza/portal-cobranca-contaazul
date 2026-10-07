import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const links = await prisma.bibliotecaVinhetaCliente.findMany({
      orderBy: { addedAt: "desc" },
      take: 500,
      include: {
        musica: {
          select: {
            id: true,
            titulo: true,
            artista: true,
            status: true,
            versoes: { select: { formato: true } },
          },
        },
      },
    });
    const items = links
      .filter((l) => l.musica.status === "pronta")
      .map((l) => {
        const fmt = pickLowestPreviewFormato(l.musica.versoes);
        return {
          musicaId: l.musica.id,
          titulo: l.musica.titulo,
          artista: l.musica.artista,
          previewUrl: fmt ? buildPreviewUrl(l.musica.id, fmt) : null,
        };
      });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
