import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parseTrackListText } from "@/lib/criacao/trackListParse";
import { resolveSpotifyUrl, spotifyConfigured } from "@/lib/criacao/spotifyClient";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json()) as {
      mode?: "spotify" | "txt";
      spotifyUrl?: string;
      text?: string;
    };

    if (body.mode === "txt") {
      const tracks = parseTrackListText(body.text ?? "");
      if (tracks.length === 0) {
        return NextResponse.json({ error: "lista_vazia" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, tracks, spotifyConfigured: spotifyConfigured() });
    }

    if (body.mode === "spotify") {
      if (!spotifyConfigured()) {
        return NextResponse.json({ error: "spotify_not_configured" }, { status: 503 });
      }
      const url = (body.spotifyUrl ?? "").trim();
      if (!url) return NextResponse.json({ error: "url_obrigatoria" }, { status: 400 });
      const tracks = await resolveSpotifyUrl(url);
      if (tracks.length === 0) {
        return NextResponse.json({ error: "playlist_vazia" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, tracks, spotifyConfigured: true });
    }

    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    if (msg === "invalid_spotify_url") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[criacao/download/resolve POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
