import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  createFinanceiroDiarioEntry,
  listFinanceiroDiarioEntries,
  listFinanceiroDiarioUsuarios,
  type FinanceiroDiarioSortField,
} from "@/lib/financeiro/financeiroDiarioService";

export const runtime = "nodejs";

const SORT_FIELDS = new Set<FinanceiroDiarioSortField>([
  "createdAt",
  "clienteNome",
  "pdvNome",
  "criadoPorNome",
  "texto",
]);

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const sortRaw = url.searchParams.get("sort") ?? "createdAt";
    const sort = SORT_FIELDS.has(sortRaw as FinanceiroDiarioSortField)
      ? (sortRaw as FinanceiroDiarioSortField)
      : "createdAt";

    if (url.searchParams.get("usuarios") === "1") {
      const usuarios = await listFinanceiroDiarioUsuarios();
      return NextResponse.json({ ok: true, usuarios });
    }

    const result = await listFinanceiroDiarioEntries({
      dataDe: url.searchParams.get("dataDe") ?? undefined,
      dataAte: url.searchParams.get("dataAte") ?? undefined,
      cliente: url.searchParams.get("cliente") ?? undefined,
      pdv: url.searchParams.get("pdv") ?? undefined,
      texto: url.searchParams.get("texto") ?? undefined,
      usuario: url.searchParams.get("usuario") ?? undefined,
      sort,
      order: url.searchParams.get("order") === "asc" ? "asc" : "desc",
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[financeiro/diario GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      escopo?: string;
      portalClienteId?: number;
      portalPdvId?: number | null;
      clienteNome?: string;
      pdvNome?: string;
      codigoDisplay?: string;
      texto?: string;
    };

    const row = await createFinanceiroDiarioEntry({
      escopo: body.escopo === "cliente" ? "cliente" : "pdv",
      portalClienteId: Number(body.portalClienteId),
      portalPdvId: body.portalPdvId != null ? Number(body.portalPdvId) : null,
      clienteNome: typeof body.clienteNome === "string" ? body.clienteNome : "",
      pdvNome: typeof body.pdvNome === "string" ? body.pdvNome : "",
      codigoDisplay: typeof body.codigoDisplay === "string" ? body.codigoDisplay : "",
      texto: typeof body.texto === "string" ? body.texto : "",
      criadoPorEmail: session.email,
      criadoPorNome: session.displayName?.trim() || session.email,
    });

    return NextResponse.json({ ok: true, row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "texto_vazio" || msg === "cliente_invalido" || msg === "pdv_invalido") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[financeiro/diario POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
