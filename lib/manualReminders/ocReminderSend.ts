import type { ManualReminderMonth, ManualReminderRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { formatPriorMonthBillingLabelFromYearMonth } from "@/lib/manualReminders/yearMonth";
import {
  buildOcEmailVars,
  parseOcEmailRecipients,
  renderOcEmailText,
} from "@/lib/manualReminders/ocEmailRender";
import { getOrCreateOcEmailTemplate } from "@/lib/manualReminders/ocEmailTemplateService";
import { safeOcListagemFilename } from "@/lib/manualReminders/ocListagemAttachmentRules";

export type OcRowWithMonth = ManualReminderRow & { month: ManualReminderMonth };

async function resolveRowForTransmission(row: OcRowWithMonth): Promise<OcRowWithMonth> {
  if (!row.anexarListagemClientesOc) return row;

  /** Linhas vindas de queries com omit do BYTEA não têm payload — recarrega antes do SMTP. */
  const noBytes = !row.listagemClienteArquivo?.byteLength;
  if (!noBytes) return row;

  return prisma.manualReminderRow.findUniqueOrThrow({
    where: { id: row.id },
    include: { month: true },
  });
}

export async function buildOcReminderTransmission(row: OcRowWithMonth): Promise<{
  destinatarios: string[];
  subject: string;
  text: string;
}> {
  const to = parseOcEmailRecipients(row.emailCobranca);
  if (!to.length) {
    throw new Error("Linha sem e-mail de cobrança válido");
  }
  const tpl = await getOrCreateOcEmailTemplate();
  const vars = buildOcEmailVars({
    clienteNome: row.clienteNome,
    mesLabel: formatPriorMonthBillingLabelFromYearMonth(row.month.yearMonth),
    cnpjDocumento: row.cnpjDocumento ?? "—",
  });

  const subject = renderOcEmailText(tpl.subject, vars);
  const text = renderOcEmailText(tpl.bodyText, vars);
  return { destinatarios: to, subject, text };
}

export async function transmitOcReminderSmtp(row: OcRowWithMonth): Promise<string[]> {
  const full = await resolveRowForTransmission(row);

  let attachments: EmailAttachment[] | undefined;
  if (full.anexarListagemClientesOc) {
    if (!full.listagemClienteArquivo?.length || !full.listagemClienteArquivoNome?.trim()) {
      throw new Error(
        "Listagem obrigatória não carregada — envie planilha ou imagem na coluna «Arquivo» deste mês.",
      );
    }
    attachments = [
      {
        filename: safeOcListagemFilename(full.listagemClienteArquivoNome),
        content: Buffer.from(full.listagemClienteArquivo),
        contentType: full.listagemClienteArquivoMime ?? "application/octet-stream",
      },
    ];
  }

  const { destinatarios, subject, text } = await buildOcReminderTransmission(full);
  await sendEmailViaSmtp({ to: destinatarios, subject, text, attachments });
  return destinatarios;
}
