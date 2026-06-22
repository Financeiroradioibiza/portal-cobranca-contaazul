import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { searchPlayerAvisoPdvTargets } from "@/lib/suporte/playerAvisoPdvSearch";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const targets = await searchPlayerAvisoPdvTargets(q, 30);
    return NextResponse.json({ ok: true, targets });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/player-avisos/pdv-search GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
