import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cancelDownloadJob, getDownloadJobDetail } from "@/lib/criacao/downloadService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const job = await getDownloadJobDetail(id);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id GET]", e);
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
      const ok = await cancelDownloadJob(id);
      return NextResponse.json({ ok });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/download/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
