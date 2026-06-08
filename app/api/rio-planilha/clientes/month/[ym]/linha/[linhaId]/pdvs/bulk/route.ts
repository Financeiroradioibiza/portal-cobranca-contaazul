import { NextResponse } from "next/server";
import { createRioCompPdvsBulk } from "@/lib/rio/rioClienteCompService";
import { parsePdvRowsFromMultilineText } from "@/lib/rio/pdvNames";
import type { RioPdvBulkRow } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

/**
 * POST body:
 * - `{ "pdvs": [{ nome, documento? }] }`
 * - `{ "text": "PDV1\\tCNPJ\\nPDV2\\tCNPJ" }` (Excel / tab)
 * - `{ "names": string[] }` (legado, só nome)
 */
export async function POST(request: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (!ym || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let body: { names?: unknown; text?: unknown; pdvs?: unknown };
  try {
    body = (await request.json()) as { names?: unknown; text?: unknown; pdvs?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let rows: RioPdvBulkRow[] = [];
  if (Array.isArray(body.pdvs)) {
    rows = body.pdvs
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({
        nome: typeof x.nome === "string" ? x.nome : "",
        documento:
          typeof x.documento === "string" ? x.documento
          : x.documento === null ? null
          : undefined,
      }))
      .filter((x) => x.nome.trim().length > 0);
  } else if (typeof body.text === "string") {
    rows = parsePdvRowsFromMultilineText(body.text);
  } else if (Array.isArray(body.names)) {
    rows = body.names
      .filter((x): x is string => typeof x === "string")
      .map((nome) => ({ nome, documento: null }));
  }

  if (!rows.length) {
    return NextResponse.json({ error: "no_pdv_names" }, { status: 400 });
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) return NextResponse.json({ error: "month_not_found" }, { status: 404 });

  const linha = await prisma.rioCompClienteLinha.findFirst({
    where: { id: linhaId, monthId: month.id },
    select: { id: true },
  });
  if (!linha) return NextResponse.json({ error: "line_not_found" }, { status: 404 });

  const { created, skipped, numeroPdvSite } = await createRioCompPdvsBulk(linha.id, rows);
  const pdvs = await prisma.rioCompPdv.findMany({
    where: { clienteId: linha.id },
    orderBy: [{ nome: "asc" }, { id: "asc" }],
  });

  const linhaVals = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linha.id },
    select: { valorClienteTexto: true, valorPdvUnitarioTexto: true },
  });

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped,
    numeroPdvSite,
    valorClienteTexto: linhaVals?.valorClienteTexto ?? "",
    valorPdvUnitarioTexto: linhaVals?.valorPdvUnitarioTexto ?? "",
    pdvs,
  });
}
