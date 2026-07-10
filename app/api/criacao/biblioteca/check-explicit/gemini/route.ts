import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { checkMusicasExplicitGeminiBatch } from "@/lib/criacao/explicitContentService";

export const maxDuration = 26;

const BATCH_MAX = 5;
const BATCH_DEFAULT = 1;

type Body = {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
};

/** Camada 3: Gemini (letras) → marca EXP vermelho. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as Body;
    const limit = Math.min(BATCH_MAX, Math.max(1, Number(body.limit) || BATCH_DEFAULT));
    const musicaIds = Array.isArray(body.musicaIds) ? body.musicaIds.filter(Boolean) : undefined;
    const onlyMissing = body.onlyMissing !== false;

    const result = await checkMusicasExplicitGeminiBatch({ limit, musicaIds, onlyMissing });

    if (!result.geminiEnabled) {
      return NextResponse.json({ error: "gemini_desabilitado" }, { status: 503 });
    }

    return NextResponse.json({
      ...result,
      hasMore: onlyMissing && result.processed >= limit,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/check-explicit/gemini POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
