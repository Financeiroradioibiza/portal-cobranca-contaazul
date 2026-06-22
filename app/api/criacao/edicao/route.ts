import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listFaixasEdicao } from "@/lib/criacao/edicaoService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const tagId = url.searchParams.get("tagId") ?? undefined;
    const pastaId = url.searchParams.get("pastaId") ?? undefined;
    const faixas = await listFaixasEdicao({ search, tagId, pastaId });
    return NextResponse.json({ faixas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/edicao GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
