import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled, cloud2FetchWithTimeout } from "@/lib/criacao/cloud2Client";
import { enrichMusicasLabelsBatch } from "@/lib/criacao/tagEnrichmentService";

/** Lotes pequenos — MusicBrainz exige ~1,1s entre chamadas; Netlify expira ~10–26s. */
export const maxDuration = 26;

const PORTAL_BATCH_MAX = 6;
const CLOUD2_BATCH_MAX = 40;

type Body = {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
};

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as Body;
    const musicaIds = Array.isArray(body.musicaIds) ? body.musicaIds.filter(Boolean) : undefined;
    const onlyMissing = body.onlyMissing !== false;

    if (cloud2Enabled()) {
      const cloudLimit = Math.min(
        CLOUD2_BATCH_MAX,
        Math.max(1, Number(body.limit) || CLOUD2_BATCH_MAX),
      );
      const res = await cloud2FetchWithTimeout(
        "/enriquecer-tags",
        {
          method: "POST",
          body: JSON.stringify({ limit: cloudLimit, musicaIds, onlyMissing }),
        },
        8000,
      );
      if (res) {
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; processed?: number; updated?: number; error?: string }
          | null;
        if (res.ok && data?.ok) {
          const processed = data.processed ?? 0;
          return NextResponse.json({
            processed,
            updated: data.updated ?? 0,
            hasMore: onlyMissing && processed >= cloudLimit,
            via: "cloud2",
          });
        }
        console.warn("[enriquecer-tags] cloud2 falhou, fallback portal:", data?.error ?? res.status);
      } else {
        console.warn("[enriquecer-tags] cloud2 timeout, fallback portal");
      }
    }

    const limit = Math.min(
      PORTAL_BATCH_MAX,
      Math.max(1, Number(body.limit) || PORTAL_BATCH_MAX),
    );
    const result = await enrichMusicasLabelsBatch({ limit, musicaIds, onlyMissing });
    return NextResponse.json({
      ...result,
      hasMore: onlyMissing && result.processed >= limit,
      via: "portal",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/enriquecer-tags POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
