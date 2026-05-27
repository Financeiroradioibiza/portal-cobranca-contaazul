import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manualReminderLinhaApiSelect } from "@/lib/manualReminders/manualLinhaApiSelect";
import { stripManualReminderRowBlob } from "@/lib/manualReminders/manualRowPayload";
import {
  isOcListagemAttachmentMimeAccepted,
  OC_LISTAGEM_MAX_BYTES,
  safeOcListagemFilename,
} from "@/lib/manualReminders/ocListagemAttachmentRules";

function validRowId(id: string): boolean {
  if (!id || id.length > 140) return false;
  return /^c[a-z0-9]+$|^[a-z0-9]{20,}$/.test(id);
}

/**
 * POST multipart: campo `file` — planilha ou imagem (listagem clientes competência anterior).
 * DELETE remove o anexo (mantém só o checkbox mensal na linha, se marcado).
 */
export async function POST(req: Request, context: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await context.params;
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart_formdata" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "missing_file_field" }, { status: 400 });
  }

  const buf = Buffer.from(await fileEntry.arrayBuffer());
  if (buf.byteLength <= 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (buf.byteLength > OC_LISTAGEM_MAX_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", maxBytes: OC_LISTAGEM_MAX_BYTES },
      { status: 413 },
    );
  }

  const mime = (fileEntry.type || "application/octet-stream").trim();
  if (!isOcListagemAttachmentMimeAccepted(mime)) {
    return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
  }

  const nome = safeOcListagemFilename(fileEntry.name || "anexo-oc");

  try {
    const row = await prisma.manualReminderRow.update({
      where: { id: rowId },
      data: {
        listagemClienteArquivo: buf,
        listagemClienteArquivoNome: nome,
        listagemClienteArquivoMime: mime.slice(0, 160),
      },
      select: manualReminderLinhaApiSelect,
    });
    return NextResponse.json({ row: stripManualReminderRowBlob(row) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await context.params;
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  try {
    const row = await prisma.manualReminderRow.update({
      where: { id: rowId },
      data: {
        listagemClienteArquivo: null,
        listagemClienteArquivoNome: null,
        listagemClienteArquivoMime: null,
      },
      select: manualReminderLinhaApiSelect,
    });
    return NextResponse.json({ row: stripManualReminderRowBlob(row) });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
