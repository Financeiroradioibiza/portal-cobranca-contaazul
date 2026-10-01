import "server-only";

import { after } from "next/server";
import { normalizePortalEmail } from "@/lib/auth/users";
import { conversaDisplayTitulo } from "@/lib/chamados/chamadoMentions";
import {
  IBIZAP_CHAT_FROM_NAME,
  RI_BLUE_MID,
  RI_BORDER,
  RI_MUTED,
  RI_PAGE,
  RI_TEXT,
  escChamadosEmailHtml,
  ibizapChamadosEmailAttachments,
  wrapIbizapChamadosEmailHtml,
} from "@/lib/chamados/chamadosEmailLayout";
import { isChamadosSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { chamadosMobilePushUrl } from "@/lib/push/chamadosPushUrls";
import { sendPushToEmails } from "@/lib/push/sendPush";

function portalOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://portal.radioibiza.app.br";
  return raw.replace(/\/$/, "");
}

function sendChatEmail(opts: {
  to: string[];
  subject: string;
  text: string;
  headline: string;
  banner: string;
  bodyHtml: string;
  link: string;
}): Promise<void> {
  const esc = escChamadosEmailHtml;
  const html = wrapIbizapChamadosEmailHtml({
    product: "chat",
    banner: opts.banner,
    bannerBg: RI_BLUE_MID,
    headline: opts.headline,
    bodyHtml: opts.bodyHtml,
    ctaHref: opts.link,
    ctaLabel: "Abrir conversa no portal",
  });
  return sendEmailViaSmtp({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html,
    attachments: ibizapChamadosEmailAttachments(),
    mailProfile: "chamados",
    fromName: IBIZAP_CHAT_FROM_NAME,
  }).then(() => undefined);
}

export function scheduleConversaMentionEmails(opts: {
  assuntoSlug: string;
  assuntoTitulo: string;
  autorNome: string;
  corpo: string;
  mencoes: string[];
  excludeEmail?: string;
}): void {
  const recipients = [...new Set(opts.mencoes.map((e) => normalizePortalEmail(e)).filter((e) => e.includes("@")))]
    .filter((e) => e !== normalizePortalEmail(opts.excludeEmail ?? ""));

  if (recipients.length === 0) return;

  after(async () => {
    if (!isChamadosSmtpConfigured()) {
      console.warn("[conversaNotify] SMTP chamados não configurado — menção não enviada");
      return;
    }
    const label = conversaDisplayTitulo(opts.assuntoSlug, opts.assuntoTitulo);
    const link = `${portalOrigin()}/chamados/conversas?conversa=${encodeURIComponent(opts.assuntoSlug)}`;
    const preview = opts.corpo.trim().slice(0, 400);
    const subject = `Menção em ${label} — IbiZap Chat`;
    const esc = escChamadosEmailHtml;
    const text = [
      `${opts.autorNome} mencionou você em ${label}.`,
      "",
      preview,
      "",
      `Abrir conversa: ${link}`,
    ].join("\n");
    const bodyHtml = `<p style="margin:0 0 12px;font-size:15px;color:${RI_TEXT}"><strong>${esc(opts.autorNome)}</strong> mencionou você em <strong>${esc(label)}</strong>.</p>
<div style="padding:14px 16px;background:${RI_PAGE};border:1px solid ${RI_BORDER};border-left:4px solid ${RI_BLUE_MID};border-radius:8px;font-size:15px;color:${RI_TEXT};white-space:pre-wrap;line-height:1.55">${esc(preview)}</div>`;

    for (const to of recipients) {
      try {
        await sendChatEmail({
          to: [to],
          subject,
          text,
          headline: label,
          banner: "Menção",
          bodyHtml,
          link,
        });
      } catch (e) {
        console.error("[conversaNotify] falha envio menção", to, e);
      }
    }

    try {
      await sendPushToEmails(recipients, {
        title: subject.slice(0, 120),
        body: `${opts.autorNome}: ${preview.slice(0, 180)}`,
        url: chamadosMobilePushUrl({ conversa: opts.assuntoSlug }),
      });
    } catch (e) {
      console.error("[conversaNotify] falha push menção", e);
    }
  });
}

/** Notifica membros fixos do grupo (exceto autor e quem já foi @). */
export function scheduleConversaGrupoActivityEmails(opts: {
  assuntoSlug: string;
  assuntoTitulo: string;
  autorNome: string;
  corpo: string;
  grupoEmails: string[];
  mencoes: string[];
  excludeEmail?: string;
}): void {
  const exclude = normalizePortalEmail(opts.excludeEmail ?? "");
  const mentionSet = new Set(opts.mencoes.map((e) => normalizePortalEmail(e)));
  const recipients = [...new Set(opts.grupoEmails.map((e) => normalizePortalEmail(e)).filter((e) => e.includes("@")))]
    .filter((e) => e !== exclude && !mentionSet.has(e));

  for (const toEmail of recipients) {
    scheduleConversaActivityEmail({
      assuntoSlug: opts.assuntoSlug,
      assuntoTitulo: opts.assuntoTitulo,
      autorNome: opts.autorNome,
      toEmail,
      corpoPreview: opts.corpo.trim().slice(0, 400),
    });
  }
}

export function scheduleConversaActivityEmail(opts: {
  assuntoSlug: string;
  assuntoTitulo: string;
  autorNome: string;
  toEmail: string;
  corpoPreview?: string;
}): void {
  const to = normalizePortalEmail(opts.toEmail);
  if (!to.includes("@")) return;

  after(async () => {
    if (!isChamadosSmtpConfigured()) return;
    const label = conversaDisplayTitulo(opts.assuntoSlug, opts.assuntoTitulo);
    const link = `${portalOrigin()}/chamados/conversas?conversa=${encodeURIComponent(opts.assuntoSlug)}`;
    const subject = `Nova atividade em ${label} — IbiZap Chat`;
    const esc = escChamadosEmailHtml;
    const preview = opts.corpoPreview?.trim() ?? "";
    const text = [
      `${opts.autorNome} enviou uma mensagem em ${label}.`,
      preview ? "" : undefined,
      preview || undefined,
      "",
      `Abrir: ${link}`,
    ]
      .filter((x) => x !== undefined)
      .join("\n");
    const bodyHtml =
      preview ?
        `<p style="margin:0 0 12px;font-size:15px;color:${RI_TEXT}"><strong>${esc(opts.autorNome)}</strong> enviou uma mensagem em <strong>${esc(label)}</strong>.</p>
<div style="padding:14px 16px;background:${RI_PAGE};border:1px solid ${RI_BORDER};border-left:4px solid ${RI_BLUE_MID};border-radius:8px;font-size:15px;color:${RI_TEXT};white-space:pre-wrap;line-height:1.55">${esc(preview)}</div>`
      : `<p style="margin:0 0 8px;font-size:15px;color:${RI_TEXT}"><strong>${esc(opts.autorNome)}</strong> enviou uma mensagem em <strong>${esc(label)}</strong>.</p>
<p style="margin:0;font-size:13px;color:${RI_MUTED}">Abra o chat para ler e responder.</p>`;
    try {
      await sendChatEmail({
        to: [to],
        subject,
        text,
        headline: label,
        banner: "Nova mensagem",
        bodyHtml,
        link,
      });
    } catch (e) {
      console.error("[conversaNotify] falha activity", to, e);
    }

    try {
      await sendPushToEmails([to], {
        title: subject.slice(0, 120),
        body: (preview ? `${opts.autorNome}: ${preview}` : `${opts.autorNome} em ${label}`).slice(0, 200),
        url: chamadosMobilePushUrl({ conversa: opts.assuntoSlug }),
      });
    } catch (e) {
      console.error("[conversaNotify] falha push activity", e);
    }
  });
}
