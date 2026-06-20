import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  fetchRelatorio,
  relatorioLimitFromQuery,
  type RelatorioTipo,
} from "@/lib/criacao/relatoriosService";

const VALID_TIPOS = new Set<RelatorioTipo>(["gravadoras", "artistas", "musicas", "tags"]);

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());

    const url = new URL(request.url);
    const tipoRaw = url.searchParams.get("tipo") ?? "musicas";
    const tipo = VALID_TIPOS.has(tipoRaw as RelatorioTipo) ? (tipoRaw as RelatorioTipo) : "musicas";
    const limit = relatorioLimitFromQuery(url.searchParams.get("limit"));

    const rows = await fetchRelatorio(tipo, limit);
    return NextResponse.json({ ok: true, tipo, limit, rows });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/relatorios GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
