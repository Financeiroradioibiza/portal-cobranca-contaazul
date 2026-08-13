import { portalPublicOrigin } from "@/lib/brand";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import {
  cadastroSecaoLabel,
  financeiroPayloadEntries,
  lojaPayloadEntries,
  resolveCadastroSecao,
  type PlayerIngestView,
} from "@/lib/player/playerIngestService";

const NOTIFY_TO_DEFAULT = "cadastro@radioibiza.com.br";

function notifyTo(): string[] {
  const raw = process.env.PLAYER_CADASTRO_NOTIFY_EMAIL?.trim() || NOTIFY_TO_DEFAULT;
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

function formatCodigoDisplay(clienteId: number | null, pdvId: number | null): string | null {
  if (clienteId == null || pdvId == null || clienteId <= 0 || pdvId <= 0) return null;
  const seq = pdvId % 1000;
  return `${clienteId}.${String(seq).padStart(3, "0")}`;
}

function buildPlayerCadastroNotifyContent(row: PlayerIngestView): {
  subject: string;
  text: string;
  html: string;
} {
  const secao = resolveCadastroSecao(row.payload);
  const entries =
    secao === "financeiro" ?
      financeiroPayloadEntries(row.payload)
    : lojaPayloadEntries(row.payload);

  const codigo =
    formatCodigoDisplay(row.clienteGatewayId, row.pdvGatewayId) ??
    (row.portalPdvId != null && row.clienteGatewayId != null ?
      formatCodigoDisplay(row.clienteGatewayId, row.portalPdvId)
    : null);

  const linhasCampos =
    entries.length > 0 ?
      entries.map((e) => `${e.label}: ${e.value}`)
    : ["(nenhum campo estruturado — ver payload abaixo)"];

  const payloadExtra = JSON.stringify(row.payload, null, 2).slice(0, 4000);
  const portalLink = `${portalPublicOrigin()}/cadastros/atualizacoes`;

  const subject = `Cadastro Player — ${row.clienteNome || "Cliente"} / ${row.pdvNome || "PDV"}`.slice(
    0,
    180,
  );

  const text = [
    "Formulário de cadastro enviado pelo Player 5 durante a instalação.",
    "",
    `Cliente: ${row.clienteNome || "—"}${row.clienteGatewayId != null ? ` (id ${row.clienteGatewayId})` : ""}`,
    `PDV: ${row.pdvNome || "—"}${row.pdvGatewayId != null ? ` (id ${row.pdvGatewayId})` : ""}`,
    ...(codigo ? [`Código PDV: ${codigo}`] : []),
    ...(row.portalPdvId != null ? [`Portal PDV id: ${row.portalPdvId}`] : []),
    ...(row.rioPdvKey ? [`Rio PDV key: ${row.rioPdvKey}`] : []),
    `Seção: ${cadastroSecaoLabel(secao)}`,
    "",
    "Dados informados:",
    ...linhasCampos.map((l) => `  ${l}`),
    "",
    `Ingest id: ${row.id}`,
    `Recebido em: ${row.createdAt}`,
    "",
    `Conciliar no portal: ${portalLink}`,
    "",
    "--- payload completo ---",
    payloadExtra,
  ].join("\n");

  const htmlFields = entries
    .map(
      (e) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(e.label)}</td><td style="padding:6px 0"><strong>${escapeHtml(e.value)}</strong></td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5;max-width:640px">
<p style="margin:0 0 16px">Formulário de cadastro enviado pelo <strong>Player 5</strong> durante a instalação.</p>
<table style="border-collapse:collapse;margin:0 0 16px">
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Cliente</td><td><strong>${escapeHtml(row.clienteNome || "—")}</strong>${row.clienteGatewayId != null ? ` <span style="color:#64748b">(id ${row.clienteGatewayId})</span>` : ""}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#64748b">PDV</td><td><strong>${escapeHtml(row.pdvNome || "—")}</strong>${row.pdvGatewayId != null ? ` <span style="color:#64748b">(id ${row.pdvGatewayId})</span>` : ""}</td></tr>
${codigo ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Código</td><td><strong>${escapeHtml(codigo)}</strong></td></tr>` : ""}
<tr><td style="padding:4px 12px 4px 0;color:#64748b">Seção</td><td><strong>${escapeHtml(cadastroSecaoLabel(secao))}</strong></td></tr>
</table>
${entries.length ? `<table style="border-collapse:collapse;margin:0 0 16px">${htmlFields}</table>` : ""}
<p style="margin:0 0 8px"><a href="${escapeHtml(portalLink)}" style="color:#2563eb">Abrir Atualizações de cadastro no portal</a></p>
<p style="margin:0;font-size:12px;color:#64748b">Ingest ${escapeHtml(row.id)} · ${escapeHtml(row.createdAt)}</p>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Envia e-mail para cadastro@ (ou PLAYER_CADASTRO_NOTIFY_EMAIL). Não lança se SMTP ausente. */
export async function sendPlayerCadastroNotifyEmail(row: PlayerIngestView): Promise<boolean> {
  const to = notifyTo();
  if (!to.length) {
    console.warn("[playerCadastroNotify] nenhum destinatário configurado");
    return false;
  }
  if (!isOcSmtpConfigured()) {
    console.warn("[playerCadastroNotify] SMTP não configurado — e-mail não enviado");
    return false;
  }

  const content = buildPlayerCadastroNotifyContent(row);
  await sendEmailViaSmtp({
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    mailProfile: "suporte",
  });
  return true;
}

/** Fire-and-forget — não bloqueia o ingest do player. */
export function queuePlayerCadastroNotifyEmail(row: PlayerIngestView): void {
  void sendPlayerCadastroNotifyEmail(row).catch((e) => {
    console.error("[playerCadastroNotify]", e instanceof Error ? e.message : e);
  });
}
