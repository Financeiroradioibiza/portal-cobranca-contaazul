import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getElevenLabsVoicesForUser } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const payload = await getElevenLabsVoicesForUser(session.email);
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg.startsWith("elevenlabs_")) {
      return NextResponse.json({ error: msg, configured: false, voices: [] }, { status: 502 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
