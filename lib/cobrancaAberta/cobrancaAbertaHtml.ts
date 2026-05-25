import { COMPANY_NAME } from "@/lib/brand";

const ACCENT = "#0066cc";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML simples e compatível com clientes de e-mail (estilos inline).
 * O corpo já vem em texto do utilizador (pré-visualização).
 */
export function buildCobrancaAbertaEmailHtml(opts: { bodyPlain: string; companyName?: string }): string {
  const company = opts.companyName ?? COMPANY_NAME;
  const inner = escapeHtml(opts.bodyPlain.trimEnd())
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;line-height:1.55;color:#1e293b;font-size:15px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">${block.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f8fafc;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;" cellspacing="0" cellpadding="0">
<tr><td style="padding:24px 28px 8px 28px;border-bottom:3px solid ${ACCENT};">
<div style="font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;font-weight:600;">Cobrança</div>
<div style="margin-top:6px;font-size:24px;font-weight:800;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<span style="color:${ACCENT};">${escapeHtml(company)}</span>
</div>
</td></tr>
<tr><td style="padding:22px 28px 28px 28px;">
${inner}
</td></tr>
<tr><td style="padding:12px 28px 20px 28px;background:#f1f5f9;font-size:12px;color:#64748b;line-height:1.45;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
Mensagem automática do portal de cobrança — em caso de dúvida, responda a este e-mail.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
