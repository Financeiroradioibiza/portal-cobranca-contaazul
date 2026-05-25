import { textoIntroDocumentosCliente, textoRodapeDocumentosCliente } from "./documentosPlaintext";

/** Marca onde o gerador substitui o bloco texto «Links dos boletos…» antes de montar HTML. */
export const COBR_DOCUMENTOS_BTN_SLOT = "\n¤COBR_DOC_BTN¤\n";

const HEADER_BTN = "#1b5e37";

/** Linha típica: `- Competência … · Label: https://…`. */
export function parseDocBulletLinha(line: string): { contexto: string; url: string } | null {
  const m = line.trim().match(/^-\s*(.+?):\s+(https?:\/\/\S+)/i);
  if (!m) return null;
  let url = m[2].trim();
  url = url.replace(/[),\].;]+$/, "").trim();
  return { contexto: m[1].trim(), url };
}

function linhaEhBotaoDoc(ctxLower: string): boolean {
  if (/\bnota fiscal\b|\bdanfe\b/.test(ctxLower)) {
    if (!/\bboleto\b|pix|fatura digital/i.test(ctxLower)) return false;
  }
  return /\bboleto\b|pix|fatura\s+digital|registradora|billet|cobran|charges\/|faturas\.contaazul/i.test(
    ctxLower,
  );
}

/** Texto já expandido: troca fingerprint do bloco documentos pela marca antes de aplicar paragraphs. */
export function spliceDocumentosFingerprintForHtml(
  bodyFullyExpanded: string,
  docPlainFingerprint: string,
): string {
  if (!docPlainFingerprint.trim()) return bodyFullyExpanded;
  const B = bodyFullyExpanded.replace(/\r\n/g, "\n");
  const F = docPlainFingerprint.replace(/\r\n/g, "\n").trim();
  const idx = B.indexOf(F);
  if (idx < 0) return B;
  return B.slice(0, idx) + COBR_DOCUMENTOS_BTN_SLOT + B.slice(idx + F.length);
}

/** Monta quadro HTML com CTAs tipo botão para cada URL de cobrança. */
export function buildDocumentosBoletoButtonsHtml(linhas: string[]): string {
  const hasBoleto = linhas.some((l) => /boleto/i.test(l));
  const rows = linhas
    .map(parseDocBulletLinha)
    .filter(
      (x): x is { contexto: string; url: string } =>
        x !== null && linhaEhBotaoDoc(x.contexto.toLowerCase()),
    );
  if (!rows.length) return "";

  const heading = `<p style="margin:0 0 14px;line-height:1.45;color:#1f2937;font-size:15px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;">${escapeHtml(textoIntroDocumentosCliente(hasBoleto))}</p>`;

  const footer = textoRodapeDocumentosCliente();

  const botaoTd = (url: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;"><tr><td align="left" bgcolor="${HEADER_BTN}" style="border-radius:10px;background:${HEADER_BTN};"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.35;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;mso-hide:all;">Download do boleto / Pix</a></td></tr></table>`;

  const cards = rows
    .map(
      ({ contexto, url }) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e8e7;border-radius:12px;background:#f7faf8;overflow:hidden;">
<tr><td style="padding:14px 16px 12px;">
<p style="margin:0 0 12px;line-height:1.5;color:#374151;font-size:14px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(contexto)}</p>
${botaoTd(url)}
</td></tr></table>`.trim(),
    )
    .join("\n");

  const footP = `<p style="margin:16px 0 0;line-height:1.5;color:#6b7280;font-size:12px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(footer)}</p>`;

  return `<div style="margin:14px 0 22px;">${heading}${cards}${footP}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
