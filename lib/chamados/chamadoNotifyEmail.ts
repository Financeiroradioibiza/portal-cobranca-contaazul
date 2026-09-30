import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { CHAMADO_COLUNAS, CHAMADO_PRIORIDADES, setorMeta } from "@/lib/chamados/chamadoConstants";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { COMPANY_NAME } from "@/lib/brand";
import { isChamadosSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";

/** Cores marca Radio Ibiza (ver app/globals.css — e-mail usa hex fixo). */
const RI_PINK = "#c4146a";
const RI_ORANGE = "#c4511a";
const RI_PAGE = "#fafaf7";
const RI_BORDER = "#e5e2dc";
const RI_TEXT = "#222222";
const RI_MUTED = "#666666";

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
  const badgeBg =
    kind === "closed" ? "#059669"
    : kind === "updated" ? RI_ORANGE
    : RI_PINK;
  const priLabel = prioridadeLabel(chamado.prioridade);
  const priBadge =
    chamado.prioridade === "urgente" ? "#dc2626"
    : chamado.prioridade === "alta" ? RI_ORANGE
    : chamado.prioridade === "media" ? "#2563eb"
    : "#64748b";

  const fechadoHtml =
    kind === "closed" && chamado.fechadoPorNome ?
      `<tr>
  <td style="padding:8px 16px 8px 0;color:${RI_MUTED};font-size:13px;vertical-align:top;width:120px">Concluído por</td>
  <td style="padding:8px 0;font-size:14px;color:${RI_TEXT}">${esc(chamado.fechadoPorNome)}${chamado.fechadoPorEmail ? ` <span style="color:${RI_MUTED}">(${esc(chamado.fechadoPorEmail)})</span>` : ""}</td>
</tr>`
    : "";

  const row = (label: string, value: string, strong = false) =>
    `<tr>
  <td style="padding:8px 16px 8px 0;color:${RI_MUTED};font-size:13px;vertical-align:top;width:120px">${label}</td>
  <td style="padding:8px 0;font-size:14px;color:${RI_TEXT}">${strong ? `<strong>${value}</strong>` : value}</td>
</tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${RI_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:${RI_TEXT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RI_PAGE};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${RI_BORDER};box-shadow:0 4px 24px rgba(196,20,106,0.08)">
        <tr>
          <td style="padding:20px 24px;background:linear-gradient(135deg,${RI_PINK} 0%,${RI_ORANGE} 100%);color:#ffffff">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.92">${esc(COMPANY_NAME)}</td>
                <td align="right">
                  <span style="display:inline-block;background:${badgeBg};color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em">${esc(banner)}</span>
                </td>
              </tr>
              <tr><td colspan="2" style="padding-top:10px;font-size:20px;font-weight:700;line-height:1.25">${esc(chamado.titulo)}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              ${row("Situação", esc(situacao))}
              ${row("Prioridade", `<span style="display:inline-block;background:${priBadge};color:#fff;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px">${esc(priLabel)}</span>`)}
              ${row("Setores", esc(setores))}
              ${row("Responsáveis", esc(responsaveis))}
              ${row("Cliente", esc(cliente))}
              ${row("Aberto por", `${esc(chamado.criadoPorNome)} <span style="color:${RI_MUTED}">(${esc(chamado.criadoPorEmail)})</span>`)}
              ${fechadoHtml}
            </table>
            <div style="margin-top:16px;padding:14px 16px;background:${RI_PAGE};border:1px solid ${RI_BORDER};border-left:4px solid ${RI_PINK};border-radius:8px;font-size:14px;color:${RI_TEXT};white-space:pre-wrap">${esc(chamado.descricao?.trim() || "(sem descrição)")}</div>
            <p style="margin:24px 0 8px;text-align:center">
              <a href="${esc(link)}" style="display:inline-block;background:${RI_PINK};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(196,20,106,0.35)">Abrir chamados no portal</a>
            </p>
            <p style="margin:0;text-align:center;font-size:11px;color:${RI_MUTED}">Portal ${esc(COMPANY_NAME)} · comunicação interna</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
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
