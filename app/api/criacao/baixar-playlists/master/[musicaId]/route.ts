import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { fetchMaster192FromB2 } from "@/lib/criacao/b2MasterFetch";
import { buildMaster192DownloadUrl } from "@/lib/criacao/masterDownloadUrl";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ musicaId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { musicaId } = await ctx.params;
    const id = musicaId.trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    let upstream: Response | null = await fetchMaster192FromB2(id);

    if (!upstream?.ok) {
      const cloudUrl = buildMaster192DownloadUrl(id);
      if (cloudUrl) {
        try {
          upstream = await fetch(cloudUrl);
        } catch {
          upstream = null;
        }
      }
    }

    if (!upstream?.ok) {
      const status = upstream?.status === 401 ? 401 : 404;
      return NextResponse.json({ error: "master_ausente" }, { status });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "audio/mpeg");
    const len = upstream.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);
    headers.set("Cache-Control", "private, max-age=300");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/baixar-playlists/master GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
