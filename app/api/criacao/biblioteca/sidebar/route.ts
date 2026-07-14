import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { loadBibliotecaSidebarTree } from "@/lib/criacao/bibliotecaSidebarService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const tree = await loadBibliotecaSidebarTree();
    return NextResponse.json(tree);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/sidebar GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
