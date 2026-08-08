import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/** Endereços adicionados em BCC onde o cliente de e-mail preserva cópia oculta ao destinatário principal. */
const INTERNAL_COBRANCA_BCC_DEFAULT = "cobranca@radioibiza.com.br";

/** Cc visível nos envios (financeiro sempre em cópia, pedido operacional). */
const INTERNAL_COBRANCA_CC_DEFAULT = "cobranca@radioibiza.com.br";

const SUPORTE_FROM_DEFAULT = "suporte@radioibiza.com.br";
const SUPORTE_FROM_NAME_DEFAULT = "Radio Ibiza — Suporte";

export type OcSmtpMailProfile = "default" | "suporte";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** inline CID — use src="cid:..." no HTML */
  cid?: string;
};

export type SendEmailViaSmtpResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  envelopeFrom: string;
  headerFrom: string;
};

function envStr(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length ? v.trim() : undefined;
}

function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseEmailList(raw: string | undefined, excludeLowerSet: ReadonlySet<string>): string[] {
  if (!raw?.trim()) return [];
  const parts: string[] = [];
  for (const fragment of raw.split(/[,;]/)) {
    const t = fragment.trim();
    if (!t.length) continue;
    if (!emailLooksValid(t)) continue;
    parts.push(t);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of parts) {
    const k = addr.toLowerCase();
    if (excludeLowerSet.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(addr);
  }
  return out;
}

function internalAlwaysCc(excludeLowerSet: ReadonlySet<string>): string[] {
  const primaryRaw = envStr("OC_EMAIL_CC_COBRANCA") ?? INTERNAL_COBRANCA_CC_DEFAULT;
  const extraRaw = envStr("OC_EMAIL_CC_EXTRA");
  const parts: string[] = [];
  for (const fragment of [...primaryRaw.split(/[,;]/), ...(extraRaw ? extraRaw.split(/[,;]/) : [])]) {
    const t = fragment.trim();
    if (!t.length) continue;
    if (!emailLooksValid(t)) continue;
    parts.push(t);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of parts) {
    const k = addr.toLowerCase();
    if (excludeLowerSet.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(addr);
  }
  return out;
}

function internalSuporteCc(excludeLowerSet: ReadonlySet<string>): string[] {
  return parseEmailList(envStr("OC_EMAIL_CC_SUPORTE") ?? SUPORTE_FROM_DEFAULT, excludeLowerSet);
}

function internalSuporteBcc(excludeLowerSet: ReadonlySet<string>): string[] {
  const primaryRaw = envStr("OC_EMAIL_BCC_SUPORTE") ?? "rafael@radioibiza.com.br";
  const extraRaw = envStr("OC_EMAIL_BCC_EXTRA");
  const parts: string[] = [];
  for (const fragment of [...primaryRaw.split(/[,;]/), ...(extraRaw ? extraRaw.split(/[,;]/) : [])]) {
    const t = fragment.trim();
    if (!t.length) continue;
    if (!emailLooksValid(t)) continue;
    parts.push(t);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of parts) {
    const k = addr.toLowerCase();
    if (excludeLowerSet.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(addr);
  }
  return out;
}

function internalAlwaysBcc(excludeLowerSet: ReadonlySet<string>): string[] {
  const primaryRaw = envStr("OC_EMAIL_BCC_COBRANCA") ?? INTERNAL_COBRANCA_BCC_DEFAULT;
  const extraRaw = envStr("OC_EMAIL_BCC_EXTRA");
  const parts: string[] = [];
  for (const fragment of [...primaryRaw.split(/[,;]/), ...(extraRaw ? extraRaw.split(/[,;]/) : [])]) {
    const t = fragment.trim();
    if (!t.length) continue;
    if (!emailLooksValid(t)) continue;
    parts.push(t);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of parts) {
    const k = addr.toLowerCase();
    if (excludeLowerSet.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(addr);
  }
  return out;
}

function resolveSmtpAuth(profile: OcSmtpMailProfile): { user: string; pass: string } {
  const defaultUser = envStr("OC_EMAIL_SMTP_USER");
  const defaultPass = envStr("OC_EMAIL_SMTP_PASS");
  if (!defaultUser || !defaultPass) {
    throw new Error("SMTP não configurado: defina OC_EMAIL_SMTP_* e OC_EMAIL_FROM no ambiente");
  }
  if (profile === "suporte") {
    const suporteUser = envStr("OC_EMAIL_SMTP_USER_SUPORTE");
    const suportePass = envStr("OC_EMAIL_SMTP_PASS_SUPORTE");
    if (suporteUser && suportePass) {
      return { user: suporteUser, pass: suportePass };
    }
  }
  return { user: defaultUser, pass: defaultPass };
}

/**
 * Locaweb / SMTP genérico para `cobranca@radioibiza.com.br`.
 * Perfil suporte: prefira OC_EMAIL_SMTP_USER_SUPORTE (caixa suporte@) para entrega externa (Gmail).
 */
export function isOcSmtpConfigured(): boolean {
  return Boolean(
    envStr("OC_EMAIL_SMTP_HOST") &&
      envStr("OC_EMAIL_SMTP_USER") &&
      envStr("OC_EMAIL_SMTP_PASS") &&
      envStr("OC_EMAIL_FROM"),
  );
}

export async function sendTextEmailViaSmtp(opts: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<SendEmailViaSmtpResult> {
  return sendEmailViaSmtp({ ...opts });
}

/**
 * Envio genérico (texto + opcional HTML + anexos). Cc padrão ao financeiro (+ env); BCC sem duplicar Cc/Para.
 */
export async function sendEmailViaSmtp(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  mailProfile?: OcSmtpMailProfile;
}): Promise<SendEmailViaSmtpResult> {
  if (!opts.to.length) throw new Error("Nenhum destinatário válido");

  const host = envStr("OC_EMAIL_SMTP_HOST");
  const defaultFrom = envStr("OC_EMAIL_FROM");
  if (!host || !defaultFrom) {
    throw new Error("SMTP não configurado: defina OC_EMAIL_SMTP_* e OC_EMAIL_FROM no ambiente");
  }

  const profile = opts.mailProfile ?? "default";
  const auth = resolveSmtpAuth(profile);

  const displayFrom =
    profile === "suporte"
      ? envStr("OC_EMAIL_FROM_SUPORTE") ?? SUPORTE_FROM_DEFAULT
      : defaultFrom;
  const fromName =
    profile === "suporte"
      ? envStr("OC_EMAIL_FROM_NAME_SUPORTE") ?? SUPORTE_FROM_NAME_DEFAULT
      : envStr("OC_EMAIL_FROM_NAME") ?? "Radio Ibiza — Cobrança";

  /** Envelope MAIL FROM = usuário autenticado (Locaweb exige para Gmail/externos). */
  const envelopeFrom = auth.user;
  /** Suporte: From visível sempre suporte@ + nome «Radio Ibiza — Suporte» (cadastro ou e-mail personalizado). */
  const headerFrom =
    profile === "suporte"
      ? displayFrom
      : envelopeFrom.toLowerCase() === displayFrom.toLowerCase()
        ? displayFrom
        : envelopeFrom;

  if (
    profile === "suporte" &&
    envelopeFrom.toLowerCase() !== displayFrom.toLowerCase()
  ) {
    console.warn(
      "[ocSmtp] perfil suporte sem OC_EMAIL_SMTP_USER_SUPORTE — envelope",
      envelopeFrom,
      "≠ From",
      displayFrom,
      "(configure suporte@ no SMTP para alinhar SPF/DMARC no Gmail)",
    );
  }

  const replyTo =
    opts.replyTo ??
    (profile === "suporte"
      ? envStr("OC_EMAIL_REPLY_TO_SUPORTE") ?? displayFrom
      : envStr("OC_EMAIL_REPLY_TO"));

  const port = Math.max(1, Number(envStr("OC_EMAIL_SMTP_PORT") ?? "587") || 587);
  const secure =
    envStr("OC_EMAIL_SMTP_SECURE") === "1" ||
    envStr("OC_EMAIL_SMTP_SECURE") === "true" ||
    port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  });

  const toLower = new Set(opts.to.map((a) => a.toLowerCase()));
  const alwaysCc =
    profile === "suporte" ? internalSuporteCc(toLower) : internalAlwaysCc(toLower);
  const ccLower = new Set(alwaysCc.map((a) => a.toLowerCase()));
  const denyBcc = new Set<string>([...toLower, ...ccLower]);
  const alwaysBcc =
    profile === "suporte" ? internalSuporteBcc(denyBcc) : internalAlwaysBcc(denyBcc);

  const envelopeTo = [...opts.to, ...alwaysCc, ...alwaysBcc];

  /** Locaweb/Exchange interno exibe o header Sender; omitir se ≠ From (evita cobranca@ no rafael@). */
  const smtpSender =
    envelopeFrom.toLowerCase() === headerFrom.toLowerCase() ? envelopeFrom : undefined;

  const info = (await transporter.sendMail({
    from: `"${fromName.replace(/"/g, '\\"')}" <${headerFrom}>`,
    ...(smtpSender ? { sender: smtpSender } : {}),
    envelope: {
      from: envelopeFrom,
      to: envelopeTo,
    },
    to: opts.to.join(", "),
    ...(alwaysCc.length ? { cc: alwaysCc.join(", ") } : {}),
    ...(alwaysBcc.length ? { bcc: alwaysBcc.join(", ") } : {}),
    subject: opts.subject,
    text: opts.text,
    html: opts.html || undefined,
    replyTo: replyTo || undefined,
    ...(opts.attachments?.length
      ? {
          attachments: opts.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
            ...(a.cid ? { cid: a.cid } : {}),
          })),
        }
      : {}),
  })) as SMTPTransport.SentMessageInfo;

  const rejected = Array.isArray(info.rejected) ? info.rejected.map(String) : [];
  const accepted = Array.isArray(info.accepted) ? info.accepted.map(String) : [];

  if (rejected.length > 0) {
    throw new Error(`SMTP rejeitou destinatário(s): ${rejected.join(", ")}`);
  }

  console.info("[ocSmtp] sent", {
    profile,
    envelopeFrom,
    headerFrom,
    to: opts.to,
    cc: alwaysCc,
    bcc: alwaysBcc,
    messageId: info.messageId,
    accepted,
    rejected,
  });

  return {
    messageId: String(info.messageId ?? ""),
    accepted,
    rejected,
    envelopeFrom,
    headerFrom,
  };
}
