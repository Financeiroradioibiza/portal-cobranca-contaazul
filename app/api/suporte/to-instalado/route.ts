import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listToInstaladoRows } from "@/lib/suporte/toInstaladoService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const { rows, synced } = await listToInstaladoRows();
    return NextResponse.json({ ok: true, rows, synced });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/to-instalado GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
