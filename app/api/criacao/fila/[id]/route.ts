import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cancelJob, getJobDetail } from "@/lib/criacao/filaService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const job = await getJobDetail(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    let body: { action?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    if (body.action === "cancel") {
      const ok = await cancelJob(id);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
