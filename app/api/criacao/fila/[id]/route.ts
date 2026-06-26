import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { approveJob, cancelJob, getJobDetail, resolveDuplicatasBulk } from "@/lib/criacao/filaService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import { applyPendingUploadTags } from "@/lib/criacao/uploadTagService";

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
    let body: { action?: string; decision?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    if (body.action === "cancel") {
      const ok = await cancelJob(id);
      return NextResponse.json({ ok });
    }
    if (body.action === "resolve_duplicatas") {
      if (body.decision !== "nova" && body.decision !== "existente") {
        return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
      }
      const count = await resolveDuplicatasBulk(id, body.decision);
      return NextResponse.json({ ok: true, count });
    }
    if (body.action === "approve") {
      const result = await approveJob(id);
      if (!result.ok) {
        return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
      }
      try {
        await applyPendingUploadTags(200);
        await applyPendingPastaUploads(200);
      } catch (e) {
        console.error("[criacao/fila/:id approve sync]", e);
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/fila/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
