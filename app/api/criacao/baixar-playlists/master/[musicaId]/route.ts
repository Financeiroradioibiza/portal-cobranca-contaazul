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

    const b2 = await fetchMaster192FromB2(id);
    if (b2.kind === "ok") {
      const headers = new Headers();
      headers.set("Content-Type", b2.response.headers.get("Content-Type") ?? "audio/mpeg");
      const len = b2.response.headers.get("Content-Length");
      if (len) headers.set("Content-Length", len);
      headers.set("Cache-Control", "private, max-age=300");
      return new NextResponse(b2.response.body, { status: 200, headers });
    }

    if (b2.kind === "not_configured") {
      const cloudUrl = buildMaster192DownloadUrl(id);
      if (cloudUrl) {
        try {
          const upstream = await fetch(cloudUrl);
          if (upstream.ok) {
            const headers = new Headers();
            headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "audio/mpeg");
            const len = upstream.headers.get("Content-Length");
            if (len) headers.set("Content-Length", len);
            headers.set("Cache-Control", "private, max-age=300");
            return new NextResponse(upstream.body, { status: 200, headers });
          }
        } catch {
          /* cloud2 indisponível */
        }
      }
      return NextResponse.json(
        {
          error: "b2_nao_configurado",
          hint: "Configure B2_* no Netlify (mesmas variáveis do cloud2) ou faça deploy da rota /criacao/master no cloud2.",
        },
        { status: 503 },
      );
    }

    if (b2.kind === "upstream_error") {
      return NextResponse.json(
        { error: "b2_erro", status: b2.status, keysTried: b2.keysTried },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "master_ausente", keysTried: b2.keysTried },
      { status: 404 },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/baixar-playlists/master GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
