import "server-only";

import { after } from "next/server";
import { normalizePortalEmail } from "@/lib/auth/users";
import { conversaDisplayTitulo } from "@/lib/chamados/chamadoMentions";
import { chamadosMobilePushUrl } from "@/lib/push/chamadosPushUrls";
import { sendPushToEmails } from "@/lib/push/sendPush";

/** Conversas: só push no app — e-mail fica reservado ao kanban de chamados. */

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
    const label = conversaDisplayTitulo(opts.assuntoSlug, opts.assuntoTitulo);
    const preview = opts.corpo.trim().slice(0, 400);
    const subject = `Menção em ${label} — IbiZap Chat`;

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
    const label = conversaDisplayTitulo(opts.assuntoSlug, opts.assuntoTitulo);
    const preview = opts.corpoPreview?.trim() ?? "";
    const subject = `Nova atividade em ${label} — IbiZap Chat`;

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
