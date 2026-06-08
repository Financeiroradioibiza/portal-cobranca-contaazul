import { NextResponse } from "next/server";
import { deleteRioCompPdv, patchRioCompPdv } from "@/lib/rio/rioClienteCompService";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ pdvId: string }> };

async function authorizePdv(pdvId: string) {
  return prisma.rioCompPdv.findUnique({
    where: { id: pdvId },
    include: {
      cliente: { select: { id: true, monthId: true } },
    },
  });
}

export async function PATCH(request: Request, context: Ctx) {
  const { pdvId } = await context.params;
  if (!pdvId?.trim()) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const row = await authorizePdv(pdvId);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: Partial<{ nome: string; documento: string | null; notes: string; sortOrder: number }> =
    {};
  if (typeof body.nome === "string") data.nome = body.nome.slice(0, 500);
  if (typeof body.documento === "string") data.documento = body.documento.slice(0, 64);
  else if (body.documento === null || body.documento === "") data.documento = null;
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 2000);
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.floor(body.sortOrder);
  }

  await patchRioCompPdv(pdvId, data);
  const pdv = await prisma.rioCompPdv.findUniqueOrThrow({ where: { id: pdvId } });
  return NextResponse.json({ ok: true, pdv });
}

export async function DELETE(_req: Request, context: Ctx) {
  const { pdvId } = await context.params;
  if (!pdvId?.trim()) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const row = await authorizePdv(pdvId);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await deleteRioCompPdv(pdvId);
  const linhaVals = result?.clienteId ?
    await prisma.rioCompClienteLinha.findUnique({
      where: { id: result.clienteId },
      select: { valorClienteTexto: true, valorPdvUnitarioTexto: true },
    })
  : null;
  return NextResponse.json({
    ok: true,
    clienteId: result?.clienteId ?? row.cliente.id,
    numeroPdvSite: result?.numeroPdvSite ?? 0,
    valorClienteTexto: linhaVals?.valorClienteTexto ?? "",
    valorPdvUnitarioTexto: linhaVals?.valorPdvUnitarioTexto ?? "",
  });
}
