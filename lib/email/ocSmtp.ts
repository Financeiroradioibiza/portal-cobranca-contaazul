import nodemailer from "nodemailer";

/** Cópia interna (BCC) por defeito em todos os SMTP de pedidos de OC. */
const INTERNAL_COBRANCA_BCC_DEFAULT = "cobranca@radioibiza.com.br";

function envStr(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length ? v.trim() : undefined;
}

function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Lista BCC sempre adicionada (não aparece para o cliente nos campos Para/Cc habituais do webmail deste lado).
 * - Principal: env `OC_EMAIL_BCC_COBRANCA` ou `cobranca@radioibiza.com.br`
 * - Extra opcional: `OC_EMAIL_BCC_EXTRA` separado por vírgulas
 */
function internalAlwaysBcc(toLowerSet: ReadonlySet<string>): string[] {
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
    if (toLowerSet.has(k)) continue;
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
  if (!opts.to.length) throw new Error("Nenhum destinatário válido");

  const host = envStr("OC_EMAIL_SMTP_HOST");
  const user = envStr("OC_EMAIL_SMTP_USER");
  const pass = envStr("OC_EMAIL_SMTP_PASS");
  const fromAddr = envStr("OC_EMAIL_FROM");
  if (!host || !user || !pass || !fromAddr) {
    throw new Error("SMTP não configurado: defina OC_EMAIL_SMTP_* e OC_EMAIL_FROM no ambiente");
  }

  const port = Math.max(1, Number(envStr("OC_EMAIL_SMTP_PORT") ?? "587") || 587);
  /** 465 costuma usar SSL direto; 587 STARTTLS */
  const secure =
    envStr("OC_EMAIL_SMTP_SECURE") === "1" ||
    envStr("OC_EMAIL_SMTP_SECURE") === "true" ||
    port === 465;

  const fromName = envStr("OC_EMAIL_FROM_NAME") ?? "Radio Ibiza — Cobrança";
  const replyTo = opts.replyTo ?? envStr("OC_EMAIL_REPLY_TO");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const toLower = new Set(opts.to.map((a) => a.toLowerCase()));
  const alwaysBcc = internalAlwaysBcc(toLower);

  await transporter.sendMail({
    from: `"${fromName.replace(/"/g, "\\\"")}" <${fromAddr}>`,
    to: opts.to.join(", "),
    ...(alwaysBcc.length ? { bcc: alwaysBcc.join(", ") } : {}),
    subject: opts.subject,
    text: opts.text,
    replyTo: replyTo || undefined,
  });
}
