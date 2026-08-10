import { NextResponse } from "next/server";
import { buildSiteClienteDashboard } from "@/lib/site-cliente/siteClienteDashboardService";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const payload = await buildSiteClienteDashboard(session);
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[site-cliente/dashboard GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
