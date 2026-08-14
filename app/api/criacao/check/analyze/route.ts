import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  analyzeCheckSession,
  checkEnabled,
  loadPastaTracksForCheck,
} from "@/lib/criacao/checkService";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!checkEnabled()) {
      return NextResponse.json({ ok: false, error: "check_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      pastaId?: string;
    };
    const sessionId = body.sessionId?.trim() ?? "";
    const pastaId = body.pastaId?.trim() ?? "";
    if (!sessionId || !pastaId) {
      return NextResponse.json({ ok: false, error: "parametros_invalidos" }, { status: 400 });
    }

    const pastaTracks = await loadPastaTracksForCheck(pastaId);
    const results = await analyzeCheckSession({ sessionId, pastaTracks });
    return NextResponse.json({ ok: true, results, pastaTrackCount: pastaTracks.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/analyze POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
