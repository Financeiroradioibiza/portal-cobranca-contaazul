import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getSiteClienteCatalog } from "@/lib/site-cliente/siteClienteAdminService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const catalog = await getSiteClienteCatalog();
    return NextResponse.json({ ok: true, ...catalog });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/catalog GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
