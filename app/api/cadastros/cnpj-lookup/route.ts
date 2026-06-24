import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { lookupCnpjReceita } from "@/lib/cadastros/cnpjLookup";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const { searchParams } = new URL(request.url);
    const cnpj = searchParams.get("cnpj") ?? "";
    const result = await lookupCnpjReceita(cnpj);
    if (!result) {
      return NextResponse.json({ ok: false, error: "cnpj_nao_encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cnpj-lookup GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
