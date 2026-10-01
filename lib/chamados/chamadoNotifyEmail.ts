import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { CHAMADO_COLUNAS, CHAMADO_PRIORIDADES, setorMeta } from "@/lib/chamados/chamadoConstants";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import {
  IBIZAP_CHAMADOS_FROM_NAME,
  RI_BLUE,
  RI_BLUE_MID,
  RI_BORDER,
  RI_MUTED,
  RI_ORANGE,
  RI_PAGE,
  RI_TEXT,
  escChamadosEmailHtml,
  ibizapChamadosEmailAttachments,
  wrapIbizapChamadosEmailHtml,
} from "@/lib/chamados/chamadosEmailLayout";
import { portalProfileMatchesChamadoSetor } from "@/lib/chamados/chamadoSetorMatch";
import { isChamadosSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { chamadosMobilePushUrl } from "@/lib/push/chamadosPushUrls";
import { sendPushToEmails } from "@/lib/push/sendPush";

type ChamadoEmailHighlight = {
  label: string;
  autorNome?: string;
  corpo: string;
};

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
      where: { active: true },
      select: { email: true, profile: { select: { slug: true, rolesJson: true } } },
    });
    for (const u of users) {
      if (!u.email.includes("@")) continue;
      if (setores.some((s) => portalProfileMatchesChamadoSetor(u.profile, s))) {
        out.add(u.email);
      }
    }
    for (const s of setores) {
      const envKey = `CHAMADO_${s.toUpperCase()}_EMAILS`;
      const raw = process.env[envKey]?.trim();
      if (!raw) continue;
      for (const part of raw.split(/[,;\s]+/)) {
        const email = normalizePortalEmail(part);
        if (email.includes("@")) out.add(email);
      }
    }
  }

  return [...out];
}

function statusLabel(status: ChamadoView["status"]): string {
  return CHAMADO_COLUNAS.find((c) => c.id === status)?.label ?? status;
}

async function fetchLatestChamadoComentario(
  chamadoId: string,
): Promise<{ autorNome: string; corpo: string } | null> {
  const row = await prisma.chamadoComentario.findFirst({
    where: { chamadoId },
    orderBy: { createdAt: "desc" },
    select: { autorNome: true, corpo: true },
  });
  if (!row?.corpo?.trim()) return null;
  return { autorNome: row.autorNome, corpo: row.corpo.trim() };
}

function buildChamadoEmail(
  chamado: ChamadoView,
  kind: ChamadoNotifyKind,
  opts?: { highlight?: ChamadoEmailHighlight },
): { subject: string; text: string; html: string } {
  const link = `${portalOrigin()}/chamados?chamado=${encodeURIComponent(chamado.id)}`;
  const setores = setoresLabel(chamado.setores);
  const responsaveis =
    chamado.responsaveis.length > 0 ? chamado.responsaveis.join(", ") : "—";
  const cliente =
    chamado.clienteNome?.trim() ||
    (chamado.rioLinhaId ? `Linha ${chamado.rioLinhaId}` : "") ||
    "—";
  const situacao = statusLabel(chamado.status);

  const headline =
    kind === "closed" ? "Chamado concluído — IbiZap"
    : kind === "updated" ? "Chamado atualizado — IbiZap"
    : "Novo chamado — IbiZap";
  const subjectPrefix =
    kind === "closed" ? "[Chamado concluído]"
    : kind === "updated" ? "[Chamado atualizado]"
    : "[Chamado]";
  const sequenciaTag =
    chamado.sequenciaPasso && chamado.sequenciaTotal ?
      ` (${chamado.sequenciaPasso}/${chamado.sequenciaTotal}${chamado.sequenciaRotulo ? ` · ${chamado.sequenciaRotulo}` : ""})`
    : "";
  const subject = `${subjectPrefix} ${chamado.titulo}${sequenciaTag}`.slice(0, 180);
  const fechadoLines =
    kind === "closed" && chamado.fechadoPorNome ?
      [
        "",
        `Concluído por: ${chamado.fechadoPorNome}${chamado.fechadoPorEmail ? ` (${chamado.fechadoPorEmail})` : ""}`,
        chamado.fechadoEm ? `Em: ${chamado.fechadoEm}` : "",
      ].filter(Boolean)
    : [];

  const highlight = opts?.highlight;
  const descricaoInicial = chamado.descricao?.trim() || "(sem descrição)";
  const mainText = highlight ?
    [
      highlight.label,
      highlight.autorNome ? `Por: ${highlight.autorNome}` : "",
      "",
      highlight.corpo,
    ].filter(Boolean).join("\n")
  : descricaoInicial;

  const text = [
    headline,
    "",
    `Título: ${chamado.titulo}`,
    sequenciaTag ? `Sequência:${sequenciaTag.trim()}` : "",
    chamado.prazoEntrega ?
      `Prazo desta etapa: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(chamado.prazoEntrega))}`
    : "",
    `Situação: ${situacao}`,
    `Prioridade: ${prioridadeLabel(chamado.prioridade)}`,
    `Setores: ${setores}`,
    `Responsáveis: ${responsaveis}`,
    `Cliente: ${cliente}`,
    "",
    `Aberto por: ${chamado.criadoPorNome} (${chamado.criadoPorEmail})`,
    ...fechadoLines,
    "",
    mainText,
    highlight ?
      ["", "— Pedido inicial —", descricaoInicial].join("\n")
    : "",
    "",
    `Abrir chamados: ${link}`,
  ].join("\n");

  const esc = escChamadosEmailHtml;

  const banner =
    highlight ? "Nova resposta"
    : kind === "closed" ? "Chamado concluído"
    : kind === "updated" ? "Chamado atualizado"
    : "Novo chamado";
  const badgeBg =
    highlight ? RI_BLUE_MID
    : kind === "closed" ? "#059669"
    : kind === "updated" ? RI_BLUE
    : RI_BLUE_MID;
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

  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              ${row("Situação", esc(situacao))}
              ${row("Prioridade", `<span style="display:inline-block;background:${priBadge};color:#fff;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px">${esc(priLabel)}</span>`)}
              ${row("Setores", esc(setores))}
              ${row("Responsáveis", esc(responsaveis))}
              ${row("Cliente", esc(cliente))}
              ${row("Aberto por", `${esc(chamado.criadoPorNome)} <span style="color:${RI_MUTED}">(${esc(chamado.criadoPorEmail)})</span>`)}
              ${fechadoHtml}
            </table>
            ${
              highlight ?
                `<p style="margin:16px 0 6px;font-size:12px;font-weight:700;color:${RI_BLUE};text-transform:uppercase;letter-spacing:0.06em">${esc(highlight.label)}${highlight.autorNome ? ` · ${esc(highlight.autorNome)}` : ""}</p>
            <div style="margin-top:0;padding:14px 16px;background:#ffffff;border:1px solid ${RI_BORDER};border-left:4px solid ${RI_BLUE_MID};border-radius:8px;font-size:15px;font-weight:500;color:${RI_TEXT};white-space:pre-wrap;line-height:1.55">${esc(highlight.corpo)}</div>
            <p style="margin:14px 0 6px;font-size:11px;font-weight:600;color:${RI_MUTED};text-transform:uppercase;letter-spacing:0.05em">Pedido inicial</p>
            <div style="padding:12px 14px;background:${RI_PAGE};border:1px solid ${RI_BORDER};border-radius:8px;font-size:13px;color:${RI_MUTED};white-space:pre-wrap">${esc(descricaoInicial)}</div>`
              : `<div style="margin-top:16px;padding:14px 16px;background:${RI_PAGE};border:1px solid ${RI_BORDER};border-left:4px solid ${RI_BLUE};border-radius:8px;font-size:14px;color:${RI_TEXT};white-space:pre-wrap">${esc(descricaoInicial)}</div>`
            }`;

  const html = wrapIbizapChamadosEmailHtml({
    product: "chamados",
    banner,
    bannerBg: badgeBg,
    headline: chamado.titulo,
    bodyHtml,
    ctaHref: link,
    ctaLabel: "Abrir chamados no portal",
  });

  return { subject, text, html };
}

function chamadoEmailAttachments() {
  return ibizapChamadosEmailAttachments();
}

/** Envia e-mail para setores/responsáveis do chamado (não lança — log em falha). */
export async function notifyChamadoEmail(
  chamado: ChamadoView,
  kind: ChamadoNotifyKind = "created",
): Promise<void> {
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

  let highlight: ChamadoEmailHighlight | undefined;
  if (kind === "updated" || kind === "closed") {
    const latest = await fetchLatestChamadoComentario(chamado.id);
    if (latest) {
      highlight = {
        label: kind === "closed" ? "Última resposta antes do fechamento" : "Última resposta",
        autorNome: latest.autorNome,
        corpo: latest.corpo,
      };
    }
  }

  const { subject, text, html } = buildChamadoEmail(chamado, kind, { highlight });

  if (isChamadosSmtpConfigured()) {
    await sendEmailViaSmtp({
      to: recipients,
      subject,
      text,
      html,
      attachments: chamadoEmailAttachments(),
      replyTo: chamado.criadoPorEmail,
      mailProfile: "chamados",
      fromName: IBIZAP_CHAMADOS_FROM_NAME,
    });

    console.info("[chamadoNotify] e-mail enviado", {
      chamadoId: chamado.id,
      kind,
      to: recipients,
    });
  } else {
    console.warn("[chamadoNotify] SMTP chamados não configurado — só push (se houver)", chamado.id);
  }

  try {
    await sendPushToEmails(recipients, {
      title: subject.slice(0, 120),
      body: `${statusLabel(chamado.status)} · ${chamado.titulo}`.slice(0, 240),
      url: chamadosMobilePushUrl({ chamadoId: chamado.id }),
    });
  } catch (e) {
    console.error("[chamadoNotify] falha push", chamado.id, e);
  }
}

/** Nova resposta na thread do chamado — notifica envolvidos (exceto autor). */
export async function notifyChamadoCommentEmail(
  chamado: ChamadoView,
  opts: { autorNome: string; corpo: string; excludeEmail?: string },
): Promise<void> {
  const exclude = normalizePortalEmail(opts.excludeEmail ?? "");
  const recipients = (
    await resolveChamadoNotifyRecipients({
      setores: chamado.setores,
      responsaveis: chamado.responsaveis,
      extraEmails: [chamado.criadoPorEmail],
    })
  ).filter((e) => normalizePortalEmail(e) !== exclude);

  if (recipients.length === 0) {
    console.warn("[chamadoNotify] resposta sem destinatários", chamado.id);
    return;
  }

  const corpo = opts.corpo.trim().slice(0, 8000);
  const subject = `[Chamado] Nova resposta — ${chamado.titulo}`.slice(0, 180);
  const { text, html } = buildChamadoEmail(chamado, "updated", {
    highlight: {
      label: "Nova resposta",
      autorNome: opts.autorNome,
      corpo,
    },
  });

  if (isChamadosSmtpConfigured()) {
    await sendEmailViaSmtp({
      to: recipients,
      subject,
      text,
      html,
      attachments: chamadoEmailAttachments(),
      replyTo: chamado.criadoPorEmail,
      mailProfile: "chamados",
      fromName: IBIZAP_CHAMADOS_FROM_NAME,
    });
  }

  try {
    await sendPushToEmails(recipients, {
      title: subject.slice(0, 120),
      body: `${opts.autorNome}: ${corpo.slice(0, 160)}`,
      url: chamadosMobilePushUrl({ chamadoId: chamado.id }),
    });
  } catch (e) {
    console.error("[chamadoNotify] falha push resposta", chamado.id, e);
  }
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
