import { NextResponse } from "next/server";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";
import { siteClienteRegenerarTokenPdv } from "@/lib/site-cliente/siteClientePdvInstalacaoService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const { rioPdvKey: raw } = await ctx.params;
    const rioPdvKey = decodeURIComponent(raw ?? "").trim();
    const result = await siteClienteRegenerarTokenPdv(session, rioPdvKey);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[site-cliente/regenerar-token POST]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
