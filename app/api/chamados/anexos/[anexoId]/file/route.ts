import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoAnexoFile, getConversaAnexoFile } from "@/lib/chamados/chamadoAnexoService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ anexoId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { anexoId } = await ctx.params;
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? "chamado";

    let file: { fileName: string; mimeType: string; data: Buffer } | null = null;
    if (kind === "conversa") {
      file = await getConversaAnexoFile(anexoId);
    } else {
      file = await getChamadoAnexoFile(anexoId);
    }
    if (!file) {
      const alt =
        kind === "conversa" ? await getChamadoAnexoFile(anexoId) : await getConversaAnexoFile(anexoId);
      file = alt;
    }
    if (!file) {
      const existsCh = await prisma.chamadoAnexo.findUnique({ where: { id: anexoId }, select: { id: true } });
      if (!existsCh) return new NextResponse("Anexo não encontrado.", { status: 404 });
      return new NextResponse("Anexo não encontrado.", { status: 404 });
    }

    const safeName = file.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
    const forceDownload = url.searchParams.get("download") === "1";
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType);
    headers.set(
      "Content-Disposition",
      `${forceDownload ? "attachment" : "inline"}; filename="${safeName}"`,
    );
    headers.set("Cache-Control", "private, max-age=3600");
    return new NextResponse(new Uint8Array(file.data), { status: 200, headers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/anexos/file GET]", e);
    return new NextResponse("Erro ao obter anexo.", { status: 500 });
  }
}
