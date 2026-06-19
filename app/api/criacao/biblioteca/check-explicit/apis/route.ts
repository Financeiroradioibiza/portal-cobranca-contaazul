import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { checkMusicasExplicitApisBatch } from "@/lib/criacao/explicitContentService";

export const maxDuration = 26;

const BATCH_MAX = 10;

type Body = {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
};

/** Camadas 1+2: Deezer explicit_lyrics + MusicBrainz tag explicit. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as Body;
    const limit = Math.min(BATCH_MAX, Math.max(1, Number(body.limit) || BATCH_MAX));
    const musicaIds = Array.isArray(body.musicaIds) ? body.musicaIds.filter(Boolean) : undefined;
    const onlyMissing = body.onlyMissing !== false;

    const result = await checkMusicasExplicitApisBatch({ limit, musicaIds, onlyMissing });

    return NextResponse.json({
      ...result,
      hasMore: onlyMissing && result.processed >= limit,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/check-explicit/apis POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
