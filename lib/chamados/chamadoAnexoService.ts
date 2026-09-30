import { prisma } from "@/lib/prisma";
import {
  CHAMADO_ANEXO_MAX_BYTES,
  isAllowedChamadoAnexoMime,
} from "@/lib/chamados/chamadoAnexoLimits";
import { bumpChamadoInbox } from "@/lib/chamados/chamadoInboxService";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";

export type ChamadoAnexoView = {
  id: string;
  chamadoId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmail: string;
  uploadedByNome: string;
  createdAt: string;
};

export type ConversaAnexoView = {
  id: string;
  mensagemId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function anexoToView(row: {
  id: string;
  chamadoId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmail: string;
  uploadedByNome: string;
  createdAt: Date;
}): ChamadoAnexoView {
  return {
    id: row.id,
    chamadoId: row.chamadoId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedByEmail: row.uploadedByEmail,
    uploadedByNome: row.uploadedByNome,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listChamadoAnexos(chamadoId: string): Promise<ChamadoAnexoView[]> {
  const rows = await prisma.chamadoAnexo.findMany({
    where: { chamadoId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(anexoToView);
}

export async function addChamadoAnexo(
  chamadoId: string,
  file: { name: string; mimeType: string; bytes: Buffer },
  ctx: ChamadoUserContext,
): Promise<ChamadoAnexoView> {
  const existing = await prisma.chamado.findUnique({ where: { id: chamadoId } });
  if (!existing) throw new Error("not_found");
  if (file.bytes.length > CHAMADO_ANEXO_MAX_BYTES) throw new Error("file_too_large");
  const mimeType = file.mimeType.trim().slice(0, 120) || "application/octet-stream";
  if (!isAllowedChamadoAnexoMime(mimeType)) throw new Error("mime_not_allowed");
  const fileName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 255) || "anexo";
  const row = await prisma.chamadoAnexo.create({
    data: {
      chamadoId,
      fileName,
      mimeType,
      sizeBytes: file.bytes.length,
      fileBase64: file.bytes.toString("base64"),
      uploadedByEmail: ctx.email,
      uploadedByNome: ctx.displayName,
    },
  });
  try {
    await bumpChamadoInbox(chamadoToView(existing), { kind: "updated", actorEmail: ctx.email });
  } catch (e) {
    console.error("[chamadoAnexo] inbox", chamadoId, e);
  }
  return anexoToView(row);
}

export async function getChamadoAnexoFile(id: string): Promise<{
  fileName: string;
  mimeType: string;
  data: Buffer;
} | null> {
  const row = await prisma.chamadoAnexo.findUnique({ where: { id } });
  if (!row?.fileBase64) return null;
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    data: Buffer.from(row.fileBase64, "base64"),
  };
}

export async function getConversaAnexoFile(id: string): Promise<{
  fileName: string;
  mimeType: string;
  data: Buffer;
} | null> {
  const row = await prisma.chamadoConversaAnexo.findUnique({ where: { id } });
  if (!row?.fileBase64) return null;
  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    data: Buffer.from(row.fileBase64, "base64"),
  };
}

export function conversaAnexoToView(row: {
  id: string;
  mensagemId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): ConversaAnexoView {
  return {
    id: row.id,
    mensagemId: row.mensagemId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createConversaAnexosForMensagem(
  mensagemId: string,
  files: { name: string; mimeType: string; bytes: Buffer }[],
): Promise<ConversaAnexoView[]> {
  const out: ConversaAnexoView[] = [];
  for (const file of files) {
    if (file.bytes.length > CHAMADO_ANEXO_MAX_BYTES) throw new Error("file_too_large");
    const mimeType = file.mimeType.trim().slice(0, 120) || "application/octet-stream";
    if (!isAllowedChamadoAnexoMime(mimeType)) throw new Error("mime_not_allowed");
    const fileName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 255) || "anexo";
    const row = await prisma.chamadoConversaAnexo.create({
      data: {
        mensagemId,
        fileName,
        mimeType,
        sizeBytes: file.bytes.length,
        fileBase64: file.bytes.toString("base64"),
      },
    });
    out.push(conversaAnexoToView(row));
  }
  return out;
}
