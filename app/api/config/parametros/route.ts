import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import {
  CONFIG_KEYS,
  clampPontoMix,
  getPontoMixPadraoSeg,
  setConfig,
} from "@/lib/config/portalConfigService";

export async function GET() {
  try {
    await requireMasterSession();
    const pontoMixPadraoSeg = await getPontoMixPadraoSeg();
    return NextResponse.json({ pontoMixPadraoSeg });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/parametros GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireMasterSession();
    let body: { pontoMixPadraoSeg?: number };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (typeof body.pontoMixPadraoSeg === "number") {
      const v = clampPontoMix(body.pontoMixPadraoSeg);
      await setConfig(CONFIG_KEYS.pontoMixPadraoSeg, String(v), session.email);
    }

    const pontoMixPadraoSeg = await getPontoMixPadraoSeg();
    return NextResponse.json({ ok: true, pontoMixPadraoSeg });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/parametros PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
