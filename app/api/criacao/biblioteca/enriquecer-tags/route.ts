import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled, cloud2Fetch } from "@/lib/criacao/cloud2Client";
import { enrichMusicasLabelsBatch } from "@/lib/criacao/tagEnrichmentService";

type Body = {
  limit?: number;
  musicaIds?: string[];
  onlyMissing?: boolean;
};

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as Body;
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));
    const musicaIds = Array.isArray(body.musicaIds) ? body.musicaIds.filter(Boolean) : undefined;
    const onlyMissing = body.onlyMissing !== false;

    if (cloud2Enabled()) {
      const res = await cloud2Fetch("/enriquecer-tags", {
        method: "POST",
        body: JSON.stringify({ limit, musicaIds, onlyMissing }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; processed?: number; updated?: number; error?: string }
        | null;
      if (res.ok && data?.ok) {
        return NextResponse.json({
          processed: data.processed ?? 0,
          updated: data.updated ?? 0,
          via: "cloud2",
        });
      }
      console.warn("[enriquecer-tags] cloud2 falhou, fallback portal:", data?.error ?? res.status);
    }

    const result = await enrichMusicasLabelsBatch({ limit, musicaIds, onlyMissing });
    return NextResponse.json({ ...result, via: "portal" });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/enriquecer-tags POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
