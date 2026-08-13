import { NextResponse } from "next/server";
import {
  SITE_CLIENTE_SESSION_COOKIE,
  siteClienteSessionCookieOptions,
  siteClienteCookieHostFromRequest,
} from "@/lib/site-cliente/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  const opts = siteClienteSessionCookieOptions({ requestHost: siteClienteCookieHostFromRequest(req) });
  res.cookies.set(SITE_CLIENTE_SESSION_COOKIE, "", { ...opts, maxAge: 0 });
  return res;
}
