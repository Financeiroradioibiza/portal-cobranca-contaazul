import { NextResponse } from "next/server";
import { SITE_CLIENTE_SESSION_COOKIE } from "@/lib/site-cliente/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_CLIENTE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
