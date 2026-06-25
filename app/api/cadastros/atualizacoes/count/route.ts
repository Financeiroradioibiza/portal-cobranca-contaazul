import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { countPendingPlayerIngestCadastro } from "@/lib/player/playerIngestService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const count = await countPendingPlayerIngestCadastro();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cadastros/atualizacoes/count GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
