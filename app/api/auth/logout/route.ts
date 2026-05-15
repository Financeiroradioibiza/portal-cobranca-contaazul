import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/constants";

export async function POST() {
  const jar = await cookies();
  jar.delete(PORTAL_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
