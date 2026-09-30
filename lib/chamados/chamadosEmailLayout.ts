import fs from "fs";
import path from "path";

import type { EmailAttachment } from "@/lib/email/ocSmtp";

export const IBIZAP_CHAMADOS_FROM_NAME = "IbiZap — Chamados";
export const IBIZAP_CHAT_FROM_NAME = "IbiZap — Chat";

export const IBIZAP_EMAIL_LOGO_CID = "ibizap-chamados-logo";

const RI_BLUE = "#1565c0";
const RI_BLUE_MID = "#2563eb";
const RI_PINK = "#c4146a";
const RI_GRADIENT = `linear-gradient(135deg,${RI_BLUE} 0%,${RI_BLUE_MID} 45%,${RI_PINK} 100%)`;
const RI_PAGE = "#fafaf7";
const RI_BORDER = "#e5e2dc";
const RI_TEXT = "#222222";
const RI_MUTED = "#666666";
const RI_ORANGE = "#c4511a";

export function escChamadosEmailHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let logoAttachmentCache: EmailAttachment | null | undefined;

/** Logo IbiZap inline (CID) — falha silenciosa se arquivo ausente no deploy. */
export function ibizapChamadosEmailLogoAttachment(): EmailAttachment | null {
  if (logoAttachmentCache !== undefined) return logoAttachmentCache;
  try {
    const logoPath = path.join(process.cwd(), "public/email/ibizap-chamados-logo.png");
    const content = fs.readFileSync(logoPath);
    logoAttachmentCache = {
      filename: "ibizap-logo.png",
      content,
      contentType: "image/png",
      cid: IBIZAP_EMAIL_LOGO_CID,
    };
    return logoAttachmentCache;
  } catch {
    logoAttachmentCache = null;
    return null;
  }
}

export function ibizapChamadosEmailAttachments(): EmailAttachment[] {
  const logo = ibizapChamadosEmailLogoAttachment();
  return logo ? [logo] : [];
}

export type IbizapEmailProduct = "chamados" | "chat";

export function wrapIbizapChamadosEmailHtml(opts: {
  product: IbizapEmailProduct;
  /** Badge no canto (ex.: Novo chamado, Nova resposta). */
  banner?: string;
  bannerBg?: string;
  /** Título principal no header (ex.: título do chamado ou canal). */
  headline: string;
  bodyHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
}): string {
  const esc = escChamadosEmailHtml;
  const productLabel = opts.product === "chat" ? "Chat" : "Chamados";
  const logo = ibizapChamadosEmailLogoAttachment();
  const logoHtml = logo
    ? `<img src="cid:${IBIZAP_EMAIL_LOGO_CID}" alt="IbiZap" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;border:0" />`
    : `<span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:-0.02em">IbiZap</span>`;

  const banner =
    opts.banner ?
      `<td align="right" valign="middle">
                  <span style="display:inline-block;background:${opts.bannerBg ?? RI_BLUE_MID};color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.04em">${esc(opts.banner)}</span>
                </td>`
    : `<td></td>`;

  const cta =
    opts.ctaHref && opts.ctaLabel ?
      `<p style="margin:24px 0 8px;text-align:center">
              <a href="${esc(opts.ctaHref)}" style="display:inline-block;background:${RI_GRADIENT};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(21,101,192,0.35)">${esc(opts.ctaLabel)}</a>
            </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:${RI_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:${RI_TEXT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RI_PAGE};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${RI_BORDER};box-shadow:0 4px 24px rgba(21,101,192,0.12)">
        <tr>
          <td style="padding:18px 22px;background:${RI_GRADIENT};color:#ffffff">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="64" valign="middle" style="padding-right:12px">${logoHtml}</td>
                <td valign="middle">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;opacity:0.92">IbiZap · ${esc(productLabel)}</div>
                  <div style="padding-top:6px;font-size:19px;font-weight:700;line-height:1.25">${esc(opts.headline)}</div>
                </td>
                ${banner}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px">
            ${opts.bodyHtml}
            ${cta}
            <p style="margin:16px 0 0;text-align:center;font-size:11px;color:${RI_MUTED}">IbiZap · comunicação interna</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export { RI_BLUE, RI_BLUE_MID, RI_BORDER, RI_MUTED, RI_ORANGE, RI_PAGE, RI_TEXT };
