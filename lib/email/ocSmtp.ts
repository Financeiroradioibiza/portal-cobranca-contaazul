import nodemailer from "nodemailer";

/** Endereços adicionados em BCC onde o cliente de e-mail preserva cópia oculta ao destinatário principal. */
const INTERNAL_COBRANCA_BCC_DEFAULT = "cobranca@radioibiza.com.br";

/** Cc visível nos envios (financeiro sempre em cópia, pedido operacional). */
const INTERNAL_COBRANCA_CC_DEFAULT = "cobranca@radioibiza.com.br";

const SUPORTE_FROM_DEFAULT = "suporte@radioibiza.com.br";
const SUPORTE_FROM_NAME_DEFAULT = "Radio Ibiza — Suporte";

export type OcSmtpMailProfile = "default" | "suporte";

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

/**
 * Endereços em Cc (visíveis no cliente de e-mail).
 * Principal: env `OC_EMAIL_CC_COBRANCA` ou cobranca@radioibiza.com.br; extras opcionais em `OC_EMAIL_CC_EXTRA`.
 */
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

/**
 * Lista BCC adicional, sem repetir Para nem Cc já cobertos.
 */
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

/**
 * Locaweb / SMTP genérico para `cobranca@radioibiza.com.br`.
 * Preencha host/porta conforme o painel da Locaweb (ex.: relay com TLS 587).
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
}): Promise<void> {
  await sendEmailViaSmtp({ ...opts });
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

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
  /** default = cobrança (OC); suporte = instalação Player e afins */
  mailProfile?: OcSmtpMailProfile;
}): Promise<void> {
  if (!opts.to.length) throw new Error("Nenhum destinatário válido");

  const host = envStr("OC_EMAIL_SMTP_HOST");
  const user = envStr("OC_EMAIL_SMTP_USER");
  const pass = envStr("OC_EMAIL_SMTP_PASS");
  const defaultFrom = envStr("OC_EMAIL_FROM");
  if (!host || !user || !pass || !defaultFrom) {
    throw new Error("SMTP não configurado: defina OC_EMAIL_SMTP_* e OC_EMAIL_FROM no ambiente");
  }

  const profile = opts.mailProfile ?? "default";
  const fromAddr =
    profile === "suporte"
      ? envStr("OC_EMAIL_FROM_SUPORTE") ?? SUPORTE_FROM_DEFAULT
      : defaultFrom;
  const fromName =
    profile === "suporte"
      ? envStr("OC_EMAIL_FROM_NAME_SUPORTE") ?? SUPORTE_FROM_NAME_DEFAULT
      : envStr("OC_EMAIL_FROM_NAME") ?? "Radio Ibiza — Cobrança";
  const replyTo =
    opts.replyTo ??
    (profile === "suporte"
      ? envStr("OC_EMAIL_REPLY_TO_SUPORTE") ?? fromAddr
      : envStr("OC_EMAIL_REPLY_TO"));

  const port = Math.max(1, Number(envStr("OC_EMAIL_SMTP_PORT") ?? "587") || 587);
  /** 465 costuma usar SSL direto; 587 STARTTLS */
  const secure =
    envStr("OC_EMAIL_SMTP_SECURE") === "1" ||
    envStr("OC_EMAIL_SMTP_SECURE") === "true" ||
    port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const toLower = new Set(opts.to.map((a) => a.toLowerCase()));
  const alwaysCc =
    profile === "suporte" ? internalSuporteCc(toLower) : internalAlwaysCc(toLower);
  const ccLower = new Set(alwaysCc.map((a) => a.toLowerCase()));
  const denyBcc = new Set<string>([...toLower, ...ccLower]);
  const alwaysBcc = profile === "suporte" ? [] : internalAlwaysBcc(denyBcc);

  await transporter.sendMail({
    from: `"${fromName.replace(/"/g, "\\\"")}" <${fromAddr}>`,
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
          })),
        }
      : {}),
  });
}
