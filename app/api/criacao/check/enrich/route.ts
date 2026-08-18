import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  checkEnabled,
  enrichCheckResults,
  type Cloud2CheckResult,
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
      results?: Cloud2CheckResult[];
    };
    const sessionId = body.sessionId?.trim() ?? "";
    if (!sessionId || !Array.isArray(body.results)) {
      return NextResponse.json({ ok: false, error: "parametros_invalidos" }, { status: 400 });
    }

    const results = await enrichCheckResults(body.results, sessionId);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/enrich POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
