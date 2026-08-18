import { NextResponse } from "next/server";
import { buildSiteClienteCobrancaDashboard } from "@/lib/site-cliente/siteClienteCobrancaDashboardService";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const payload = await buildSiteClienteCobrancaDashboard(session);
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[site-cliente/cobranca/dashboard GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
