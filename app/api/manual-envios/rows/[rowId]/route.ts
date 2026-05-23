import { NextResponse } from "next/server";
import { ManualReminderRowStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_NOTE = 20_000;
const ALLOWED_STATUS = new Set<string>(Object.values(ManualReminderRowStatus));

function validRowId(id: string): boolean {
  if (!id || id.length > 140) return false;
  return /^c[a-z0-9]+$|^[a-z0-9]{20,}$/.test(id);
}

function parseStatus(s: unknown): ManualReminderRowStatus | null {
  if (typeof s !== "string" || !ALLOWED_STATUS.has(s)) return null;
  return s as ManualReminderRowStatus;
}

/**
 * PATCH: atualiza uma linha (edição cliente, OC, vínculo, status).
 */
export async function PATCH(request: Request, context: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await context.params;
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const patch: Parameters<typeof prisma.manualReminderRow.update>[0]["data"] = {};

  if (typeof body.emissionDay === "number") {
    const d = Math.floor(body.emissionDay);
    if (d < 1 || d > 31) {
      return NextResponse.json({ error: "bad_emission_day" }, { status: 400 });
    }
    patch.emissionDay = d;
  }

  if (typeof body.clienteNome === "string") {
    const n = body.clienteNome.trim().slice(0, 260);
    if (!n.length) return NextResponse.json({ error: "empty_client_name" }, { status: 400 });
    patch.clienteNome = n;
  }

  if ("cnpjDocumento" in body) {
    if (body.cnpjDocumento === null || body.cnpjDocumento === "") {
      patch.cnpjDocumento = null;
    } else if (typeof body.cnpjDocumento === "string") {
      patch.cnpjDocumento = body.cnpjDocumento.trim().slice(0, 36) || null;
    }
  }

  if (typeof body.solicitarPedirOc === "boolean") {
    patch.solicitarPedirOc = body.solicitarPedirOc;
  }

  if ("contaAzulPersonId" in body) {
    if (body.contaAzulPersonId === null || body.contaAzulPersonId === "") {
      patch.contaAzulPersonId = null;
    } else if (typeof body.contaAzulPersonId === "string") {
      patch.contaAzulPersonId = body.contaAzulPersonId.trim().slice(0, 140) || null;
    }
  }

  if ("status" in body) {
    const st = parseStatus(body.status);
    if (st === null) return NextResponse.json({ error: "bad_status" }, { status: 400 });
    patch.status = st;
  }

  if ("emailCobranca" in body) {
    if (body.emailCobranca === null || body.emailCobranca === "") {
      patch.emailCobranca = null;
    } else if (typeof body.emailCobranca === "string") {
      patch.emailCobranca = body.emailCobranca.trim().slice(0, 500) || null;
    }
  }

  if ("spreadsheetHint" in body) {
    if (body.spreadsheetHint === null || body.spreadsheetHint === "") {
      patch.spreadsheetHint = null;
    } else if (typeof body.spreadsheetHint === "string") {
      patch.spreadsheetHint = body.spreadsheetHint.trim().slice(0, 500) || null;
    }
  }

  if (typeof body.notes === "string") {
    patch.notes = body.notes.slice(0, MAX_NOTE);
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  try {
    const updated = await prisma.manualReminderRow.update({
      where: { id: rowId },
      data: patch,
    });
    return NextResponse.json({ row: updated });
  } catch {
    return NextResponse.json({ error: "not_found_or_conflict" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await context.params;
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }
  try {
    await prisma.manualReminderRow.delete({ where: { id: rowId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
