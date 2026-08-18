import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getComprovanteFileById } from "@/lib/site-cliente/siteClienteCobrancaComprovanteService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const file = await getComprovanteFileById(id);
    if (!file) {
      return new NextResponse("Comprovante não encontrado.", { status: 404 });
    }

    const safeName = file.fileName.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType);
    headers.set("Content-Disposition", `inline; filename="${safeName}"`);
    headers.set("Cache-Control", "no-store");
    return new NextResponse(new Uint8Array(file.data), { status: 200, headers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/comprovante/file GET]", e);
    return new NextResponse("Erro ao obter comprovante.", { status: 500 });
  }
}
