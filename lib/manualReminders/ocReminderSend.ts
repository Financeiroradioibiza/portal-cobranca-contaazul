import type { ManualReminderMonth, ManualReminderRow } from "@prisma/client";
import { sendTextEmailViaSmtp } from "@/lib/email/ocSmtp";
import { formatPriorBrazilMonthBillingLabel } from "@/lib/manualReminders/yearMonth";
import {
  buildOcEmailVars,
  parseOcEmailRecipients,
  renderOcEmailText,
} from "@/lib/manualReminders/ocEmailRender";
import { getOrCreateOcEmailTemplate } from "@/lib/manualReminders/ocEmailTemplateService";

export type OcRowWithMonth = ManualReminderRow & { month: ManualReminderMonth };

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
    mesLabel: formatPriorBrazilMonthBillingLabel(),
    cnpjDocumento: row.cnpjDocumento ?? "—",
  });

  const subject = renderOcEmailText(tpl.subject, vars);
  const text = renderOcEmailText(tpl.bodyText, vars);
  return { destinatarios: to, subject, text };
}

export async function transmitOcReminderSmtp(row: OcRowWithMonth): Promise<string[]> {
  const { destinatarios, subject, text } = await buildOcReminderTransmission(row);
  await sendTextEmailViaSmtp({ to: destinatarios, subject, text });
  return destinatarios;
}
