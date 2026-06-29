import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  clearElevenLabsApiKey,
  elevenLabsEnabledGlobally,
  resolveElevenLabsApiKey,
  saveElevenLabsApiKey,
} from "@/lib/criacao/elevenLabsService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const key = await resolveElevenLabsApiKey(session.email);
    return NextResponse.json({
      configured: Boolean(key),
      globalFallback: elevenLabsEnabledGlobally(),
      hasUserKey: Boolean(key && !elevenLabsEnabledGlobally()),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { apiKey?: string; clear?: boolean };
    if (body.clear) {
      await clearElevenLabsApiKey(session.email, session.email);
      return NextResponse.json({ ok: true, configured: elevenLabsEnabledGlobally() });
    }
    const apiKey = (body.apiKey ?? "").trim();
    if (apiKey.length < 16) {
      return NextResponse.json({ error: "api_key_invalida" }, { status: 400 });
    }
    await saveElevenLabsApiKey(session.email, apiKey, session.email);
    return NextResponse.json({ ok: true, configured: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
