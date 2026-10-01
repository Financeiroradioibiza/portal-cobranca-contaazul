import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getChamadoUserContext } from "@/lib/chamados/chamadoService";
import { getConversaInbox } from "@/lib/chamados/conversaInboxService";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const ctx = await getChamadoUserContext(session.email);
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const inbox = await getConversaInbox(ctx.email);
    return NextResponse.json({ ok: true, inbox });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[chamados/conversas/inbox GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
