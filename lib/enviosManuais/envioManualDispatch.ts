import {
  appendEnvioManualLog,
  markAgendamentoSent,
} from "@/lib/enviosManuais/agendamentoStore";
import { sendEnvioManualGrupo, sendEnvioManualIndividual } from "@/lib/enviosManuais/envioManualSendService";
import type { EnvioManualDelivery } from "@/lib/enviosManuais/safeRecipients";
import type { EnvioManualAgendamentoDto } from "@/lib/enviosManuais/types";

export type DispatchEnvioManualOptions = {
  refAutomatico?: string;
  delivery?: EnvioManualDelivery;
  /** Teste no portal não marca «Enviado» no agendamento. */
  markSent?: boolean;
};

export type EnvioManualDispatchResult = {
  ok: true;
  sandbox: boolean;
  recipients: string[];
  originalRecipients: string[];
  pdfAttachments: number;
  danfseAttached: boolean;
  attachmentFilenames: string[];
  danfseSkipReason?: string;
};

export async function dispatchEnvioManualAgendamento(
  token: string,
  row: EnvioManualAgendamentoDto,
  refAutomaticoOrOpts: string | DispatchEnvioManualOptions = "",
): Promise<EnvioManualDispatchResult> {
  const opts: DispatchEnvioManualOptions =
    typeof refAutomaticoOrOpts === "string" ?
      { refAutomatico: refAutomaticoOrOpts }
    : refAutomaticoOrOpts;
  const refAutomatico = opts.refAutomatico ?? "";
  const delivery = opts.delivery ?? "cron";
  const markSent = opts.markSent ?? delivery !== "test";

  if (!row.emails.length) throw new Error("missing_emails");

  if (row.tipo === "grupo") {
    if (!row.grupoClientes?.length) throw new Error("grupo_sem_clientes");
    const result = await sendEnvioManualGrupo({
      token,
      nomeGrupo: row.client,
      grupoClientes: row.grupoClientes,
      emails: row.emails,
      mensagemTemplate: row.msg,
      delivery,
    });
    await appendEnvioManualLog({
      client: `${row.client} [GRUPO]`,
      emails: row.emails.join(", "),
      ref: refAutomatico || `${result.clientesOk}/${result.clientesTotal} clientes · ${result.pdfAttachments} PDF(s)`,
      ok: result.clientesOk > 0,
      aviso: result.hadAttachmentGaps ? "Alguns documentos só por link" : null,
      sandbox: result.sandbox,
    });
    if (markSent) await markAgendamentoSent(row.id);
    return {
      ok: true,
      sandbox: result.sandbox,
      recipients: result.recipients,
      originalRecipients: result.originalRecipients,
      pdfAttachments: result.pdfAttachments,
      danfseAttached: result.danfseAttached,
      attachmentFilenames: result.attachmentFilenames,
      danfseSkipReason: result.danfseSkipReason,
    };
  }

  if (!row.clienteId) throw new Error("missing_ca_cliente_id");
  const result = await sendEnvioManualIndividual({
    token,
    caClienteId: row.clienteId,
    clientLabel: row.client,
    emails: row.emails,
    mensagemTemplate: row.msg,
    delivery,
  });
  const semAnexo = result.pdfAttachments === 0;
  await appendEnvioManualLog({
    client: row.client,
    emails: row.emails.join(", "),
    ref: refAutomatico || `Venda ${result.vendaNumero ?? "—"} · ${result.pdfAttachments} PDF(s)`,
    ok: !semAnexo,
    aviso: semAnexo ? "Enviado sem anexos PDF" : result.hadAttachmentGaps ? "Parte só por link" : null,
    sandbox: result.sandbox,
  });
  if (markSent) await markAgendamentoSent(row.id);
  return {
    ok: true,
    sandbox: result.sandbox,
    recipients: result.recipients,
    originalRecipients: result.originalRecipients,
    pdfAttachments: result.pdfAttachments,
    danfseAttached: result.danfseAttached,
    attachmentFilenames: result.attachmentFilenames,
    danfseSkipReason: result.danfseSkipReason,
  };
}
