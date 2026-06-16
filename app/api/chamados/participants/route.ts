import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listChamadoParticipants } from "@/lib/chamados/chamadoService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const participants = await listChamadoParticipants();
    return NextResponse.json({ ok: true, participants });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/participants GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
