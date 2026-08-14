import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  buildCheckUploadTicket,
  checkEnabled,
  checkIngestUrl,
} from "@/lib/criacao/checkService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!checkEnabled()) {
      return NextResponse.json({ ok: false, error: "check_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      fileId?: string;
    };
    const sessionId = body.sessionId?.trim() ?? "";
    const fileId = body.fileId?.trim() ?? "";
    if (!sessionId || !fileId) {
      return NextResponse.json({ ok: false, error: "parametros_invalidos" }, { status: 400 });
    }

    const { token, exp } = buildCheckUploadTicket(sessionId, fileId);
    return NextResponse.json({
      ok: true,
      token,
      exp,
      ingestUrl: checkIngestUrl(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/ticket POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
