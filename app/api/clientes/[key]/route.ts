import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getClienteRelacionamentoDetail } from "@/lib/clientes/clientesRelacionamentoService";

type RouteCtx = { params: Promise<{ key: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    requirePortalSession(await getPortalSession());
    const { key } = await ctx.params;
    const detail = await getClienteRelacionamentoDetail(decodeURIComponent(key));
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[clientes/[key] GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
