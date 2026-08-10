import { NextResponse } from "next/server";
import { getSiteClienteMoodboardForUser } from "@/lib/site-cliente/siteClienteDashboardService";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioLinhaId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const { rioLinhaId } = await ctx.params;
    const moodboard = await getSiteClienteMoodboardForUser(
      session,
      decodeURIComponent(rioLinhaId),
    );
    if (!moodboard) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, moodboard });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[site-cliente/moodboard GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
