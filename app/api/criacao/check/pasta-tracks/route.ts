import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { checkEnabled, loadPastaTracksForCheck } from "@/lib/criacao/checkService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!checkEnabled()) {
      return NextResponse.json({ ok: false, error: "check_desabilitado" }, { status: 503 });
    }

    const pastaId = new URL(request.url).searchParams.get("pastaId")?.trim() ?? "";
    if (!pastaId) {
      return NextResponse.json({ ok: false, error: "parametros_invalidos" }, { status: 400 });
    }

    const pastaTracks = await loadPastaTracksForCheck(pastaId);
    return NextResponse.json({ ok: true, pastaTracks, pastaTrackCount: pastaTracks.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/pasta-tracks GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
