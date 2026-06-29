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
    return NextResponse.json({ error: "server_error", configured: false, voices: [] }, { status: 500 });
  }
}
