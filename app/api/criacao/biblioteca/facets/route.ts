import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getBibliotecaFacets } from "@/lib/criacao/bibliotecaSearchService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const facets = await getBibliotecaFacets();
    return NextResponse.json({ ok: true, ...facets });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/facets GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
