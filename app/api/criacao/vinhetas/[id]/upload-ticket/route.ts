import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { signVinhetaUpload, vinhetaEnabled, vinhetaIngestUrl } from "@/lib/criacao/vinhetaSign";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    if (!vinhetaEnabled()) {
      return NextResponse.json({ error: "ingest_desabilitado" }, { status: 503 });
    }
    const { token } = signVinhetaUpload(id);
    return NextResponse.json({ ingestUrl: vinhetaIngestUrl(), token });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/vinhetas/:id/upload-ticket POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
