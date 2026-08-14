import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { checkEnabled, createCheckSession, deleteCheckSession } from "@/lib/criacao/checkService";

export const runtime = "nodejs";

export async function POST() {
  try {
    requirePortalSession(await getPortalSession());
    if (!checkEnabled()) {
      return NextResponse.json({ ok: false, error: "check_desabilitado" }, { status: 503 });
    }
    const sessionId = await createCheckSession();
    return NextResponse.json({ ok: true, sessionId });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/session POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "session_id_obrigatorio" }, { status: 400 });
    }
    if (!checkEnabled()) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    await deleteCheckSession(sessionId).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/check/session DELETE]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
