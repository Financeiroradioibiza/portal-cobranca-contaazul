import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { probeWebserviceLogin, runPlayerPilotCheck } from "@/lib/player/pilotCheckService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await runPlayerPilotCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[player/pilot GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** POST body opcional: { email, password } — testa login no webservice público. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const check = await runPlayerPilotCheck();

    let webserviceLogin: { ok: boolean; clienteId?: string; error?: string } | null = null;
    if (body.email && body.password) {
      webserviceLogin = await probeWebserviceLogin(body.email.trim(), body.password);
    }

    return NextResponse.json({ ok: true, ...check, webserviceLogin });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[player/pilot POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
