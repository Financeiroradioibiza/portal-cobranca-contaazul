import { NextResponse } from "next/server";
import { createRioCompPdvsBulk } from "@/lib/rio/rioClienteCompService";
import { parsePdvNamesFromMultilineText } from "@/lib/rio/pdvNames";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

/**
 * POST body: `{ "names": string[] }` ou `{ "text": "PDV1\\nPDV2" }` — adiciona vários PDVs de uma vez.
 */
export async function POST(request: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (!ym || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let body: { names?: unknown; text?: unknown };
  try {
    body = (await request.json()) as { names?: unknown; text?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let names: string[] = [];
  if (Array.isArray(body.names)) {
    names = body.names.filter((x): x is string => typeof x === "string");
  } else if (typeof body.text === "string") {
    names = parsePdvNamesFromMultilineText(body.text);
  }

  if (!names.length) {
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

  const { created, skipped } = await createRioCompPdvsBulk(linha.id, names);
  const pdvs = await prisma.rioCompPdv.findMany({
    where: { clienteId: linha.id },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped,
    pdvs,
  });
}
