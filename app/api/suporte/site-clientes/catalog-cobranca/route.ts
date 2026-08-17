import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { searchSiteClienteCobrancaCatalog } from "@/lib/site-cliente/siteClienteCobrancaCatalog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ ok: true, clientes: [], competenciaYm: null });
    }
    const catalog = await searchSiteClienteCobrancaCatalog(q);
    return NextResponse.json({ ok: true, ...catalog });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/catalog-cobranca GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
