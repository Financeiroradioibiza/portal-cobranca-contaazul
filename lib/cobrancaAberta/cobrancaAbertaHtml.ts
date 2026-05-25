import { COMPANY_NAME } from "@/lib/brand";

/** Alinhado à identidade de e-mails internos («Radio Ibiza» + Departamento Financeiro — verde). */
const HEADER_GREEN = "#1b5e37";
const HEADER_GREEN_SOFT = "#1f6b3f";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphFromBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  const cobrancaList =
    lines.length >= 2 &&
    lines.every((l) => /^-\s/.test(l)) &&
    (/\|/.test(trimmed) || /Vencimento:/i.test(trimmed) || /Total em aberto/i.test(trimmed));
  if (cobrancaList) {
    const rows = lines.map((line, idx) => {
      const txt = escapeHtml(line.replace(/^-\s+/, ""));
      const bb =
        idx < lines.length - 1 ? "border-bottom:1px solid #e8e8e8;" : "";
      return `<tr><td style="padding:11px 16px;color:#374151;font-size:14px;line-height:1.45;${bb}font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${txt}</td></tr>`;
    });

    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f5f5f5;border-radius:8px;border:1px solid #e0e0e0;overflow:hidden;">${rows.join("")}</table>`;
  }
  return `<p style="margin:0 0 18px;line-height:1.65;color:#333333;font-size:15px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
}

/**
 * HTML com identidade próxima da cobrança interna Radio Ibiza (cabeçalho verde, resumo listado à cinza quando aplicável).
 */
export function buildCobrancaAbertaEmailHtml(opts: { bodyPlain: string; companyName?: string }): string {
  const company = opts.companyName ?? COMPANY_NAME;
  const blocks = opts.bodyPlain.trimEnd().replace(/\r\n/g, "\n").split(/\n{2,}/);
  const inner = blocks.map(paragraphFromBlock).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/></head>
<body style="margin:0;padding:0;background:#eaeaea;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaeaea;padding:24px 10px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);" cellspacing="0" cellpadding="0">
<tr>
<td style="background:linear-gradient(180deg,${HEADER_GREEN} 0%,${HEADER_GREEN_SOFT} 100%);padding:28px 32px 26px;text-align:center;">
<h1 style="margin:0;font-size:26px;line-height:1.15;color:#ffffff;font-family:Georgia,'Times New Roman',Times,serif;font-weight:700;letter-spacing:0.02em;">${escapeHtml(company)}</h1>
<p style="margin:10px 0 0;color:rgba(255,255,255,0.95);font-size:15px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:400;">
Departamento Financeiro
</p>
</td>
</tr>
<tr>
<td style="padding:26px 32px 8px;background:#ffffff;">
${inner}
</td>
</tr>
<tr>
<td style="padding:18px 32px 24px;text-align:center;font-size:12px;line-height:1.55;color:#6b7280;background:#fafafa;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-top:1px solid #ececec;">
Mensagem automática — qualquer dúvida responda a este e-mail.
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
