import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listMusicboardClientes } from "@/lib/musicboard/musicboardDataService";

export const runtime = "nodejs";

/** GET /api/musicboard/clientes — lista clientes com config MusicBoard. */
export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const clientes = await listMusicboardClientes();
    return NextResponse.json({ ok: true, clientes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[musicboard/clientes GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
