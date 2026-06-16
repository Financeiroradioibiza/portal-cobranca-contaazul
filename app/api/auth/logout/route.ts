import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";
import { portalSessionCookieOptions } from "@/lib/auth/sessionToken";

export async function POST() {
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, "", { ...portalSessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true });
}
