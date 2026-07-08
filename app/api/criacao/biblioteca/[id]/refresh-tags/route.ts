import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled, cloud2FetchWithTimeout } from "@/lib/criacao/cloud2Client";
import { refreshMusicaInternetTags } from "@/lib/criacao/bibliotecaService";

export const maxDuration = 26;

type Ctx = { params: Promise<{ id: string }> };

/** Reconsulta gravadora + DZ/MB explicit só desta faixa. */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;

    if (cloud2Enabled()) {
      const res = await cloud2FetchWithTimeout(
        `/biblioteca/${id}/refresh-tags`,
        { method: "POST" },
        24000,
      );
      if (res?.ok) {
        const data = (await res.json()) as { updated?: boolean; gravadora?: string };
        return NextResponse.json({
          updated: data.updated ?? false,
          gravadora: data.gravadora ?? "",
          via: "cloud2",
        });
      }
      console.warn("[refresh-tags] cloud2 falhou, fallback portal:", res?.status);
    }

    const result = await refreshMusicaInternetTags(id);
    return NextResponse.json({ ...result, via: "portal" });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof Error && e.message === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[criacao/biblioteca/:id/refresh-tags POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
