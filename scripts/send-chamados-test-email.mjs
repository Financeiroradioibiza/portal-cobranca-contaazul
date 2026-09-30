#!/usr/bin/env node
/**
 * Teste pontual do perfil SMTP chamados@ — não commitar credenciais.
 * Uso: bash scripts/run-chamados-test-email.sh
 */
import nodemailer from "nodemailer";

const to = process.argv[2]?.trim() || "rafael@radioibiza.com.br";

function env(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

const host = env("OC_EMAIL_SMTP_HOST");
const port = Number(env("OC_EMAIL_SMTP_PORT") || "587");
const secure =
  env("OC_EMAIL_SMTP_SECURE") === "1" ||
  env("OC_EMAIL_SMTP_SECURE") === "true" ||
  port === 465;

const user = env("OC_EMAIL_SMTP_USER_CHAMADOS") || env("OC_EMAIL_SMTP_USER");
const pass = env("OC_EMAIL_SMTP_PASS_CHAMADOS") || env("OC_EMAIL_SMTP_PASS");
const from = env("OC_EMAIL_FROM_CHAMADOS") || "chamados@radioibiza.com.br";
const fromName = env("OC_EMAIL_FROM_NAME_CHAMADOS") || "IbiZap — Chamados";

if (!host || !user || !pass) {
  console.error("Faltam OC_EMAIL_SMTP_HOST / USER_CHAMADOS / PASS_CHAMADOS (ou fallback default).");
  process.exit(1);
}

const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

const now = new Date().toISOString();
const subject = `[Teste Chamados] SMTP chamados@ — ${now}`;
const text = [
  "E-mail de teste do perfil chamados@ (portal Radio Ibiza).",
  "",
  `Horário UTC: ${now}`,
  `SMTP host: ${host}:${port}`,
  `Envelope user: ${user}`,
  `From header: ${from}`,
  `Para: ${to}`,
  "",
  "Se você recebeu isto, o SMTP chamados@ está OK.",
].join("\n");

const info = await transporter.sendMail({
  from: `"${fromName.replace(/"/g, '\\"')}" <${from}>`,
  envelope: { from: user, to: [to] },
  to,
  subject,
  text,
  html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
});

console.log(JSON.stringify({
  ok: true,
  to,
  from,
  envelopeUser: user,
  messageId: info.messageId,
  accepted: info.accepted,
  rejected: info.rejected,
  response: info.response,
}, null, 2));
