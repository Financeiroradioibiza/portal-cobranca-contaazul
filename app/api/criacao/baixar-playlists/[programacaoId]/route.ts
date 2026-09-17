import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { loadPlaylistDownloadManifest } from "@/lib/criacao/playlistDownloadService";
import { masterDownloadEnabled } from "@/lib/criacao/masterDownloadUrl";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ programacaoId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { programacaoId } = await ctx.params;
    const manifest = await loadPlaylistDownloadManifest(programacaoId);
    if (!manifest) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      manifest,
      masterDownloadEnabled: masterDownloadEnabled(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/baixar-playlists GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
