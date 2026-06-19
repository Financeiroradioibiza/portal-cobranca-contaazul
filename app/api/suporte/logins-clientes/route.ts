import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listClientePlayerLogins } from "@/lib/player/clientePlayerLoginService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const payload = await listClientePlayerLogins();
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "rio_month_not_found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[suporte/logins-clientes GET]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
