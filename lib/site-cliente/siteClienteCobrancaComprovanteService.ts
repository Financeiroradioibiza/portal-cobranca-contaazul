import { prisma } from "@/lib/prisma";
import { formatBRL } from "@/lib/format";
import { chamadoToView, serializeStringArray } from "@/lib/chamados/chamadoUtils";
import { notifyChamadoCreatedEmail } from "@/lib/chamados/chamadoNotifyEmail";
import { validateSiteClienteCobrancaParcela } from "@/lib/site-cliente/siteClienteCobrancaParcelaEscopo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type SiteClienteCobrancaComprovanteMeta = {
  id: string;
  fileName: string;
};

function fmtDateBr(ymd: string): string {
  if (!ymd || ymd === "—") return "—";
  const p = ymd.split("-");
  if (p.length !== 3) return ymd;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export async function submitSiteClienteCobrancaComprovante(
  session: SiteClienteSessionPayload,
  input: {
    parcelaId: string;
    caPersonId: string;
    clienteNome: string;
    cnpj: string;
    parcelaDue: string;
    parcelaSummary: string;
    parcelaValue: number;
    fileName: string;
    mimeType: string;
    fileBuffer: Buffer;
  },
): Promise<{ ok: true; chamadoId: string }> {
  if (!session.permissoes.verCobrancas) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const { caPersonId, escopo } = await validateSiteClienteCobrancaParcela(
    session,
    input.parcelaId,
    input.caPersonId,
  );

  const meta = escopo.byCaPersonId.get(caPersonId);
  const clienteNome =
    input.clienteNome.trim() ||
    meta?.nomeFantasia.trim() ||
    meta?.razaoSocial.trim() ||
    "Cliente";
  const cnpj = input.cnpj.trim() || meta?.documento?.trim() || "—";
  const due = input.parcelaDue.trim();
  const summary = input.parcelaSummary.trim() || "—";
  const value = Number.isFinite(input.parcelaValue) ? input.parcelaValue : 0;

  const mime = input.mimeType.trim().toLowerCase().split(";")[0] ?? "";
  if (!ALLOWED_MIME.has(mime)) {
    throw new Response(JSON.stringify({ error: "tipo_arquivo_invalido" }), { status: 400 });
  }
  if (input.fileBuffer.length < 100 || input.fileBuffer.length > MAX_BYTES) {
    throw new Response(JSON.stringify({ error: "arquivo_invalido" }), { status: 400 });
  }

  const fileName = input.fileName.trim().slice(0, 255) || "comprovante";
  const valorTxt = formatBRL(value);
  const titulo = `Comprovante — ${clienteNome} — venc. ${fmtDateBr(due)}`.slice(0, 200);
  const descricao = [
    "Comprovante enviado pelo site cliente (grupo cobrança).",
    "",
    `Grupo: ${session.grupoNome}`,
    `Cliente: ${clienteNome}`,
    `CNPJ: ${cnpj}`,
    `Parcela: ${summary}`,
    `Vencimento: ${fmtDateBr(due)}`,
    `Valor: ${valorTxt}`,
    `ID parcela CA: ${input.parcelaId.trim()}`,
    "",
    `Enviado por: ${session.nome} (${session.loginEmail})`,
    "",
    "Anexo: use o botão «Baixar comprovante» neste chamado.",
  ].join("\n");

  const fileBase64 = input.fileBuffer.toString("base64");

  const chamado = await prisma.$transaction(async (tx) => {
    const row = await tx.chamado.create({
      data: {
        titulo,
        descricao: descricao.slice(0, 8000),
        prioridade: "media",
        setoresJson: serializeStringArray(["financeiro"]),
        responsaveisJson: serializeStringArray([]),
        criadoPorEmail: session.loginEmail.slice(0, 200),
        criadoPorNome: session.nome.slice(0, 120) || session.loginEmail.slice(0, 120),
        clienteNome: clienteNome.slice(0, 200),
      },
    });

    await tx.siteClienteCobrancaComprovante.create({
      data: {
        chamadoId: row.id,
        grupoId: session.grupoId,
        parcelaId: input.parcelaId.trim(),
        caPersonId,
        clienteNome: clienteNome.slice(0, 200),
        cnpj: cnpj.slice(0, 64),
        parcelaDue: due.slice(0, 20),
        parcelaSummary: summary.slice(0, 4000),
        parcelaValue: value,
        fileName,
        mimeType: mime,
        fileBase64,
        enviadoPorNome: session.nome.slice(0, 200),
        enviadoPorEmail: session.loginEmail.slice(0, 200),
      },
    });

    return row;
  });

  try {
    await notifyChamadoCreatedEmail(chamadoToView(chamado));
  } catch (e) {
    console.error("[comprovante] e-mail chamado", e);
  }

  return { ok: true, chamadoId: chamado.id };
}

export async function getComprovanteFileById(
  comprovanteId: string,
): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  const row = await prisma.siteClienteCobrancaComprovante.findUnique({
    where: { id: comprovanteId },
    select: { fileName: true, mimeType: true, fileBase64: true },
  });
  if (!row?.fileBase64) return null;
  try {
    const data = Buffer.from(row.fileBase64, "base64");
    if (data.length < 100) return null;
    return {
      fileName: row.fileName || "comprovante",
      mimeType: row.mimeType || "application/octet-stream",
      data,
    };
  } catch {
    return null;
  }
}

export async function getComprovanteMetaByChamadoId(
  chamadoId: string,
): Promise<SiteClienteCobrancaComprovanteMeta | null> {
  const row = await prisma.siteClienteCobrancaComprovante.findUnique({
    where: { chamadoId },
    select: { id: true, fileName: true },
  });
  if (!row) return null;
  return { id: row.id, fileName: row.fileName || "comprovante" };
}

export async function mapComprovantesByChamadoIds(
  chamadoIds: string[],
): Promise<Map<string, SiteClienteCobrancaComprovanteMeta>> {
  const unique = [...new Set(chamadoIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.siteClienteCobrancaComprovante.findMany({
    where: { chamadoId: { in: unique } },
    select: { id: true, chamadoId: true, fileName: true },
  });
  return new Map(
    rows.map((r) => [r.chamadoId, { id: r.id, fileName: r.fileName || "comprovante" }]),
  );
}
