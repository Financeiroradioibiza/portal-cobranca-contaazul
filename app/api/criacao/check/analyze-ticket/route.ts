import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { buildCheckAnalyzeTicket, checkEnabled } from "@/lib/criacao/checkService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!checkEnabled()) {
      return NextResponse.json({ ok: false, error: "check_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
    const sessionId = body.sessionId?.trim() ?? "";
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "parametros_invalidos" }, { status: 400 });
    }

    const ticket = buildCheckAnalyzeTicket(sessionId);
    return NextResponse.json({ ok: true, ...ticket });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/analyze-ticket POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
