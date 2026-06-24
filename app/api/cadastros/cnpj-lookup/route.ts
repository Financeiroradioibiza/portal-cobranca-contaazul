import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { lookupCnpjReceita } from "@/lib/cadastros/cnpjLookup";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const { searchParams } = new URL(request.url);
    const cnpj = searchParams.get("cnpj") ?? "";
    const result = await lookupCnpjReceita(cnpj);
    if (!result.ok) {
      const status =
        result.error === "cnpj_invalido" ? 400
        : result.error === "cnpj_nao_encontrado" ? 404
        : result.error === "cnpj_rate_limit" ? 429
        : 502;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, data: result.data });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cnpj-lookup GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
