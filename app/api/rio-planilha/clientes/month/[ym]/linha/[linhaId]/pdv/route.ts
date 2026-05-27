import { NextResponse } from "next/server";
import { createRioCompPdv } from "@/lib/rio/rioClienteCompService";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (!ym || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let body: { nome?: string };
  try {
    body = (await request.json()) as { nome?: string };
  } catch {
    body = {};
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

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const { pdv, numeroPdvSite } = await createRioCompPdv(linha.id, nome);
  const linhaVals = await prisma.rioCompClienteLinha.findUnique({
    where: { id: linha.id },
    select: { valorClienteTexto: true, valorPdvUnitarioTexto: true },
  });
  return NextResponse.json(
    {
      ok: true,
      pdv,
      numeroPdvSite,
      valorClienteTexto: linhaVals?.valorClienteTexto ?? "",
      valorPdvUnitarioTexto: linhaVals?.valorPdvUnitarioTexto ?? "",
    },
    { status: 201 },
  );
}
