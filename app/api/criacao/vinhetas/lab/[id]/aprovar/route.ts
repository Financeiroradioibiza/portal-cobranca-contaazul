import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { aprovarVinhetaLab } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await aprovarVinhetaLab(id);
    return NextResponse.json({ ok: true, vinheta: row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "vinheta_nao_encontrada") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "audio_ausente") return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
