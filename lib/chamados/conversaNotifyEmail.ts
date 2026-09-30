import "server-only";

import { after } from "next/server";
import { normalizePortalEmail } from "@/lib/auth/users";
import { conversaDisplayTitulo } from "@/lib/chamados/chamadoMentions";
import { isChamadosSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";

function portalOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://portal.radioibiza.app.br";
  return raw.replace(/\/$/, "");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    const link = `${portalOrigin()}/chamados?conversa=${encodeURIComponent(opts.assuntoSlug)}`;
    const preview = opts.corpo.trim().slice(0, 400);
    const subject = `Menção em ${label} — Portal Chamados`;
    const text = [
      `${opts.autorNome} mencionou você em ${label}.`,
      "",
      preview,
      "",
      `Abrir conversa: ${link}`,
    ].join("\n");
    const html = `<p><strong>${esc(opts.autorNome)}</strong> mencionou você em <strong>${esc(label)}</strong>.</p>
<p style="white-space:pre-wrap">${esc(preview)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Abrir conversa no portal</a></p>`;

    for (const to of recipients) {
      try {
        await sendEmailViaSmtp({
          to: [to],
          subject,
          text,
          html,
          mailProfile: "chamados",
        });
      } catch (e) {
        console.error("[conversaNotify] falha envio menção", to, e);
      }
    }
  });
}

export function scheduleConversaActivityEmail(opts: {
  assuntoSlug: string;
  assuntoTitulo: string;
  autorNome: string;
  toEmail: string;
}): void {
  const to = normalizePortalEmail(opts.toEmail);
  if (!to.includes("@")) return;

  after(async () => {
    if (!isChamadosSmtpConfigured()) return;
    const label = conversaDisplayTitulo(opts.assuntoSlug, opts.assuntoTitulo);
    const link = `${portalOrigin()}/chamados?conversa=${encodeURIComponent(opts.assuntoSlug)}`;
    const subject = `Nova atividade em ${label} — Portal Chamados`;
    const text = `Você recebeu uma notificação em ${label}.\n\nAbrir: ${link}`;
    const html = `<p>Você recebeu uma notificação em <strong>${esc(label)}</strong>.</p>
<p><a href="${esc(link)}">Abrir conversa no portal</a></p>`;
    try {
      await sendEmailViaSmtp({ to: [to], subject, text, html, mailProfile: "chamados" });
    } catch (e) {
      console.error("[conversaNotify] falha activity", to, e);
    }
  });
}
