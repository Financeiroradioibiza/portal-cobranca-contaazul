import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { CHAMADO_COLUNAS, CHAMADO_PRIORIDADES, setorMeta } from "@/lib/chamados/chamadoConstants";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { isChamadosSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";

function portalOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://portal.radioibiza.app.br";
  return raw.replace(/\/$/, "");
}

function prioridadeLabel(id: string): string {
  return CHAMADO_PRIORIDADES.find((p) => p.id === id)?.label ?? id;
}

function setoresLabel(slugs: string[]): string {
  if (slugs.length === 0) return "—";
  return slugs.map((s) => setorMeta(s).label).join(", ");
}

/** Destinatários: responsáveis explícitos + usuários ativos dos setores (perfil portal). */
export type ChamadoNotifyKind = "created" | "updated" | "closed";

export async function resolveChamadoNotifyRecipients(opts: {
  setores: string[];
  responsaveis: string[];
  /** Quem abriu o chamado (e-mail em atualizações/conclusão). */
  extraEmails?: string[];
}): Promise<string[]> {
  const out = new Set<string>();

  for (const raw of opts.extraEmails ?? []) {
    const email = normalizePortalEmail(raw);
    if (email.includes("@")) out.add(email);
  }

  for (const raw of opts.responsaveis) {
    const email = normalizePortalEmail(raw);
    if (email.includes("@")) out.add(email);
  }

  const setores = [...new Set(opts.setores.map((s) => s.trim()).filter(Boolean))];
  if (setores.length > 0) {
    const users = await prisma.portalUser.findMany({
      where: {
        active: true,
        profile: { slug: { in: setores } },
      },
      select: { email: true },
    });
    for (const u of users) {
      if (u.email.includes("@")) out.add(u.email);
    }
  }

  return [...out];
}

function statusLabel(status: ChamadoView["status"]): string {
  return CHAMADO_COLUNAS.find((c) => c.id === status)?.label ?? status;
}

function buildChamadoEmail(
  chamado: ChamadoView,
  kind: ChamadoNotifyKind,
): { subject: string; text: string; html: string } {
  const link = `${portalOrigin()}/chamados`;
  const setores = setoresLabel(chamado.setores);
  const responsaveis =
    chamado.responsaveis.length > 0 ? chamado.responsaveis.join(", ") : "—";
  const cliente =
    chamado.clienteNome?.trim() ||
    (chamado.rioLinhaId ? `Linha ${chamado.rioLinhaId}` : "") ||
    "—";
  const situacao = statusLabel(chamado.status);

  const headline =
    kind === "closed" ? "Chamado concluído no portal Radio Ibiza"
    : kind === "updated" ? "Chamado atualizado no portal Radio Ibiza"
    : "Novo chamado no portal Radio Ibiza";
  const subjectPrefix =
    kind === "closed" ? "[Chamado concluído]"
    : kind === "updated" ? "[Chamado atualizado]"
    : "[Chamado]";
  const subject = `${subjectPrefix} ${chamado.titulo}`.slice(0, 180);
  const fechadoLines =
    kind === "closed" && chamado.fechadoPorNome ?
      [
        "",
        `Concluído por: ${chamado.fechadoPorNome}${chamado.fechadoPorEmail ? ` (${chamado.fechadoPorEmail})` : ""}`,
        chamado.fechadoEm ? `Em: ${chamado.fechadoEm}` : "",
      ].filter(Boolean)
    : [];

  const text = [
    headline,
    "",
    `Título: ${chamado.titulo}`,
    `Situação: ${situacao}`,
    `Prioridade: ${prioridadeLabel(chamado.prioridade)}`,
    `Setores: ${setores}`,
    `Responsáveis: ${responsaveis}`,
    `Cliente: ${cliente}`,
    "",
    `Aberto por: ${chamado.criadoPorNome} (${chamado.criadoPorEmail})`,
    ...fechadoLines,
    "",
    chamado.descricao?.trim() || "(sem descrição)",
    "",
    `Abrir chamados: ${link}`,
  ].join("\n");

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const banner =
    kind === "closed" ? "Chamado concluído"
    : kind === "updated" ? "Chamado atualizado"
    : "Novo chamado";
  const fechadoHtml =
    kind === "closed" && chamado.fechadoPorNome ?
      `<tr><td style="padding:4px 12px 4px 0;color:#555">Concluído por</td><td>${esc(chamado.fechadoPorNome)}${chamado.fechadoPorEmail ? ` (${esc(chamado.fechadoPorEmail)})` : ""}</td></tr>`
    : "";

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p><strong>${banner}</strong> no portal Radio Ibiza</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:4px 12px 4px 0;color:#555">Título</td><td><strong>${esc(chamado.titulo)}</strong></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Situação</td><td>${esc(situacao)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Prioridade</td><td>${esc(prioridadeLabel(chamado.prioridade))}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Setores</td><td>${esc(setores)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Responsáveis</td><td>${esc(responsaveis)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Cliente</td><td>${esc(cliente)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Aberto por</td><td>${esc(chamado.criadoPorNome)} (${esc(chamado.criadoPorEmail)})</td></tr>
${fechadoHtml}
</table>
<p style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">${esc(chamado.descricao?.trim() || "(sem descrição)")}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Abrir chamados no portal</a></p>
</body></html>`;

  return { subject, text, html };
}

/** Envia e-mail para setores/responsáveis do chamado (não lança — log em falha). */
export async function notifyChamadoEmail(
  chamado: ChamadoView,
  kind: ChamadoNotifyKind = "created",
): Promise<void> {
  if (!isChamadosSmtpConfigured()) {
    console.warn("[chamadoNotify] SMTP chamados não configurado — e-mail não enviado", chamado.id);
    return;
  }

  const extraEmails =
    kind === "created" ? [] : [chamado.criadoPorEmail].filter(Boolean);

  const recipients = await resolveChamadoNotifyRecipients({
    setores: chamado.setores,
    responsaveis: chamado.responsaveis,
    extraEmails,
  });

  console.info("[chamadoNotify] destinatários", {
    chamadoId: chamado.id,
    kind,
    setores: chamado.setores,
    responsaveis: chamado.responsaveis,
    recipients,
  });

  if (recipients.length === 0) {
    console.warn("[chamadoNotify] nenhum destinatário para chamado", chamado.id, chamado.setores);
    return;
  }

  const { subject, text, html } = buildChamadoEmail(chamado, kind);

  await sendEmailViaSmtp({
    to: recipients,
    subject,
    text,
    html,
    replyTo: chamado.criadoPorEmail,
    mailProfile: "chamados",
  });

  console.info("[chamadoNotify] e-mail enviado", {
    chamadoId: chamado.id,
    kind,
    to: recipients,
  });
}

/** Compat — criação de chamado. */
export async function notifyChamadoCreatedEmail(chamado: ChamadoView): Promise<void> {
  return notifyChamadoEmail(chamado, "created");
}

/** Após responder HTTP: evita timeout Netlify enquanto o SMTP termina. */
export function scheduleChamadoNotifyEmail(
  chamado: ChamadoView,
  kind: ChamadoNotifyKind = "created",
): void {
  after(async () => {
    try {
      await notifyChamadoEmail(chamado, kind);
    } catch (e) {
      console.error(
        "[chamadoNotify] falha ao enviar e-mail",
        chamado.id,
        kind,
        e instanceof Error ? e.message : e,
      );
    }
  });
}
