import { NextResponse } from "next/server";
import { getPortalSession, isMasterRole, requirePortalSession } from "@/lib/auth/portalAccess";
import type { AtlCricaExportManifest } from "@/lib/criacao/atlCricaHierarquiaService";
import { previewAtlCricaImport } from "@/lib/criacao/atlCricaImportService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      competencia?: string;
      manifest?: AtlCricaExportManifest | null;
      files?: Array<{ path?: string }>;
    };

    const files = (body.files ?? [])
      .map((f) => ({ path: String(f.path ?? "").trim() }))
      .filter((f) => f.path);

    if (files.length === 0) {
      return NextResponse.json({ error: "files_vazios" }, { status: 400 });
    }

    const preview = await previewAtlCricaImport({
      competencia: body.competencia,
      sessionEmail: session.email,
      isAdmin: isMasterRole(session.roles),
      manifest: body.manifest ?? null,
      files,
    });

    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/atl-crica/import/preview POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
