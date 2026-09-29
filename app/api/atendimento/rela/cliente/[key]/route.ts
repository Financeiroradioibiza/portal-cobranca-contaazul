import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getRelaProducaoClienteDetail } from "@/lib/atendimento/relaClienteDetailService";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    requirePortalSession(await getPortalSession());
    const { key } = await ctx.params;
    const detail = await getRelaProducaoClienteDetail(decodeURIComponent(key));
    if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    console.error("[atendimento/rela/cliente GET]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
