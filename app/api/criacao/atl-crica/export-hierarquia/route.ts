import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { buildAtlCricaExportManifest } from "@/lib/criacao/atlCricaHierarquiaService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const competencia = new URL(request.url).searchParams.get("competencia");
    const manifest = await buildAtlCricaExportManifest({
      competencia,
      sessionEmail: session.email,
    });
    return NextResponse.json(manifest);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/atl-crica/export-hierarquia GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
