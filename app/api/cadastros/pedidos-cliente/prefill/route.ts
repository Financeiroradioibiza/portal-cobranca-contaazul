import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getPedidoPrefillForRioPdv } from "@/lib/cadastros/pedidoPdvLookupService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const { searchParams } = new URL(request.url);
    const rioLinhaId = searchParams.get("rioLinhaId")?.trim() ?? "";
    const rioPdvId = searchParams.get("rioPdvId")?.trim() ?? "";
    if (!rioLinhaId || !rioPdvId) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const prefill = await getPedidoPrefillForRioPdv(rioLinhaId, rioPdvId);
    if (!prefill) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, prefill });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[pedidos-cliente prefill GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
