import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  batchPostMatchBibliotecaCheck,
  type PostMatchTrackInput,
} from "@/lib/criacao/servidorUpPostMatchDedupeService";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as { tracks?: PostMatchTrackInput[] };
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    if (tracks.length === 0) {
      return NextResponse.json({ ok: true, hits: [], total: 0 });
    }

    const hits = await batchPostMatchBibliotecaCheck(tracks);
    return NextResponse.json({ ok: true, hits, total: hits.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/post-match-dedupe POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
