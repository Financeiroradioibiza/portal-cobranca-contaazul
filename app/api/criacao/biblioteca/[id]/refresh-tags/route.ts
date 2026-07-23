import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { refreshMusicaInternetTags } from "@/lib/criacao/bibliotecaService";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Reconsulta gravadora + ISRC + DZ/MB explicit só desta faixa (lógica canônica no portal). */
export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;

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
