import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { CHAMADO_PRIORIDADES, CHAMADO_SETORES, setorMeta } from "@/lib/chamados/chamadoConstants";
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
export async function resolveChamadoNotifyRecipients(opts: {
  setores: string[];
  responsaveis: string[];
}): Promise<string[]> {
  const out = new Set<string>();

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

function buildChamadoEmail(chamado: ChamadoView): { subject: string; text: string; html: string } {
  const link = `${portalOrigin()}/chamados`;
  const setores = setoresLabel(chamado.setores);
  const responsaveis =
    chamado.responsaveis.length > 0 ? chamado.responsaveis.join(", ") : "—";
  const cliente =
    chamado.clienteNome?.trim() ||
    (chamado.rioLinhaId ? `Linha ${chamado.rioLinhaId}` : "") ||
    "—";

  const subject = `[Chamado] ${chamado.titulo}`.slice(0, 180);
  const text = [
    "Novo chamado no portal Radio Ibiza",
    "",
    `Título: ${chamado.titulo}`,
    `Prioridade: ${prioridadeLabel(chamado.prioridade)}`,
    `Setores: ${setores}`,
    `Responsáveis: ${responsaveis}`,
    `Cliente: ${cliente}`,
    "",
    `Aberto por: ${chamado.criadoPorNome} (${chamado.criadoPorEmail})`,
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

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p><strong>Novo chamado</strong> no portal Radio Ibiza</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:4px 12px 4px 0;color:#555">Título</td><td><strong>${esc(chamado.titulo)}</strong></td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Prioridade</td><td>${esc(prioridadeLabel(chamado.prioridade))}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Setores</td><td>${esc(setores)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Responsáveis</td><td>${esc(responsaveis)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Cliente</td><td>${esc(cliente)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">Aberto por</td><td>${esc(chamado.criadoPorNome)} (${esc(chamado.criadoPorEmail)})</td></tr>
</table>
<p style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0">${esc(chamado.descricao?.trim() || "(sem descrição)")}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Abrir chamados no portal</a></p>
</body></html>`;

  return { subject, text, html };
}

/** Envia e-mail para setores/responsáveis do chamado (não lança — log em falha). */
export async function notifyChamadoCreatedEmail(chamado: ChamadoView): Promise<void> {
  if (!isChamadosSmtpConfigured()) {
    console.warn("[chamadoNotify] SMTP chamados não configurado — e-mail não enviado", chamado.id);
    return;
  }

  const recipients = await resolveChamadoNotifyRecipients({
    setores: chamado.setores,
    responsaveis: chamado.responsaveis,
  });

  console.info("[chamadoNotify] destinatários", {
    chamadoId: chamado.id,
    setores: chamado.setores,
    responsaveis: chamado.responsaveis,
    recipients,
  });

  if (recipients.length === 0) {
    console.warn("[chamadoNotify] nenhum destinatário para chamado", chamado.id, chamado.setores);
    return;
  }

  const { subject, text, html } = buildChamadoEmail(chamado);

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
    to: recipients,
  });
}
