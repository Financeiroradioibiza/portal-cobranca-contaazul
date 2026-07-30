import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  batchServidorUpDedupeCheck,
  type ServidorUpDedupeTrackInput,
} from "@/lib/criacao/servidorUpDedupeService";

export const maxDuration = 60;

/** Lookup em lote: hash/chromaprint/isrc → já na biblioteca; metadata → só sugestão. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      tracks?: ServidorUpDedupeTrackInput[];
    };
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks_vazias" }, { status: 400 });
    }
    if (tracks.length > 500) {
      return NextResponse.json({ error: "limite_500" }, { status: 400 });
    }

    const result = await batchServidorUpDedupeCheck(tracks);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/dedupe-check POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
