import { COMPANY_NAME } from "@/lib/brand";
import {
  COBR_DOCUMENTOS_BTN_SLOT,
  buildDocumentosBoletoButtonsHtml,
  spliceDocumentosFingerprintForHtml,
} from "./documentosButtonsEmail";
import { buildMinimalDocumentosVar } from "./documentosPlaintext";
import { RADIO_IBIZA_EMAIL_LOGO_DATA_URI } from "./radioIbizaEmailLogoBase64";

/** Alinhado ao template `email-boleto-nf-radio-ibiza-final.html`. */
export type CobrancaEmailLayoutHints = {
  nomeCliente?: string;
  competencia?: string;
  vencimento?: string;
  /** Valor já formatado (ex.: `1.234,56` ou `R$ 1.234,56`). */
  valor?: string;
  numeroNf?: string;
  /** Boleto + NF (envio manual) vs várias parcelas (vencidos). */
  variant?: "boleto_nf" | "cobranca_aberta";
};

const BRAND_STRIP = [
  "#E5195E",
  "#0D0D0D",
  "#1B7A3E",
  "#F5D430",
  "#5E2CA5",
  "#FF5722",
] as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripCellLabel(cell: string, colIndex: number, colCount: number): string {
  const t = cell.trim();
  if (colCount < 6 || colIndex === colCount - 1) return t;
  const rules: Partial<Record<number, RegExp>> = {
    1: /^Vencimento:\s*/i,
    2: /^Venda:\s*/i,
    3: /^NFS-e:\s*/i,
    4: /^RPS:\s*/i,
  };
  const re = rules[colIndex];
  return re ? t.replace(re, "").trim() : t;
}

function tableHeadersPortuguese(ncol: number): string[] {
  if (ncol >= 6) return ["Competência", "Vencimento", "Venda", "NFS-e", "RPS", "Valor"];
  if (ncol === 4) return ["Competência", "Vencimento", "Resumo", "Valor"];
  return Array.from({ length: ncol }, (_, i) => `Coluna ${i + 1}`);
}

function cobrancaTableFromLines(linesRaw: string[]): string | null {
  const trimmed = linesRaw.map((l) => l.trim()).filter(Boolean);
  const firstBullet = trimmed.findIndex((l) => /^-\s/.test(l));
  if (firstBullet < 0) return null;
  const preamble = trimmed.slice(0, firstBullet);
  const bullets = trimmed.slice(firstBullet).filter((l) => /^-\s/.test(l));
  if (bullets.length < 1) return null;

  const sample = preamble.join("\n") + bullets.join("");
  if (!/\|/.test(sample) || !/\bVencimento:/i.test(sample)) return null;

  const rowsCells = bullets.map((line) => {
    const body = line.replace(/^-\s+/, "").trim();
    return body.split(/\s*\|\s*/).map((c) => c.trim());
  });

  const ncol = rowsCells[0]?.length ?? 0;
  if (ncol < 4 || !rowsCells.every((r) => r.length === ncol)) return null;

  const hdrs = tableHeadersPortuguese(ncol).slice(0, ncol);
  const TABLE_BORDER = "#E6E3DD";

  const theadHtml = `<thead><tr>${hdrs
    .map((h, j) => {
      const ali = j === ncol - 1 ? "right" : "left";
      return `<th align="${ali}" valign="middle" style="padding:11px 10px;color:#0D0D0D;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;line-height:1.25;background:#F4F2EE;border-bottom:1px solid ${TABLE_BORDER};font-family:'Inter',Arial,Helvetica,sans-serif;">${escapeHtml(h)}</th>`;
    })
    .join("")}</tr></thead>`;

  const bodyRows = rowsCells
    .map((cells, ri) => {
      const zebra = ri % 2 === 1 ? "#FAFAF8" : "#ffffff";
      const tds = cells.map((c, j) => {
        const ali = j === ncol - 1 ? "right" : "left";
        const txt = escapeHtml(stripCellLabel(c, j, ncol));
        return `<td align="${ali}" valign="middle" style="padding:11px 10px;color:#444444;font-size:13px;line-height:1.45;font-family:'Inter',Arial,Helvetica,sans-serif;background:${zebra};border-bottom:1px solid ${TABLE_BORDER};">${txt}</td>`;
      });
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");

  const wrap = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;border-radius:8px;border:1px solid ${TABLE_BORDER};overflow:hidden;background:#ffffff;">
${theadHtml}
<tbody>${bodyRows}</tbody>
</table>`.trim();

  if (preamble.length === 0) return wrap;
  const preambleP = `<p class="body-font" style="margin:0 0 14px;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#444444;">${preamble.map((ln) => escapeHtml(ln)).join("<br/>")}</p>`;
  return `${preambleP}${wrap}`;
}

function paragraphFromBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

  const cobrancaTable = cobrancaTableFromLines(lines);
  if (cobrancaTable) return cobrancaTable;

  const cobrancaListOneColumn =
    lines.length >= 2 &&
    lines.every((l) => /^-\s/.test(l)) &&
    (/\|/.test(trimmed) || /\bVencimento:/i.test(trimmed));

  if (cobrancaListOneColumn) {
    const rows = lines.map((line, idx) => {
      const txt = escapeHtml(line.replace(/^-\s+/, ""));
      const bb = idx < lines.length - 1 ? "border-bottom:1px solid #E6E3DD;" : "";
      return `<tr><td style="padding:11px 16px;color:#444444;font-size:14px;line-height:1.45;${bb}font-family:'Inter',Arial,sans-serif;">${txt}</td></tr>`;
    });

    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#FAFAF8;border-radius:8px;border:1px solid #E6E3DD;overflow:hidden;">${rows.join("")}</table>`;
  }

  return `<p class="body-font" style="margin:0 0 18px;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#444444;">${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
}

function splitOnce(haystack: string, needle: string): [string, string] {
  const i = haystack.indexOf(needle);
  if (i < 0) return [haystack, ""];
  return [haystack.slice(0, i), haystack.slice(i + needle.length)];
}

function sectionsToInnerHtml(segment: string): string {
  const norm = segment.trimEnd();
  if (!norm.trim()) return "";
  const blocks = norm.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map(paragraphFromBlock).join("");
}

function formatValorDisplay(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "—";
  return /^R\$\s/i.test(v) ? v : `R$ ${v}`;
}

function deriveNomeFromBody(bodyPlain: string): string | null {
  const m = bodyPlain.match(/^Olá\s*,?\s*(.+?)\s*[!,]/im);
  return m?.[1]?.trim() ?? null;
}

function buildBodyContentHtml(args: {
  bodyPlain: string;
  innerWithDocs: string;
  hints: CobrancaEmailLayoutHints;
  variant: "boleto_nf" | "cobranca_aberta";
}): string {
  const nome = args.hints.nomeCliente?.trim() || deriveNomeFromBody(args.bodyPlain) || "cliente";
  const competencia = args.hints.competencia?.trim() || "—";
  const innerOnly = args.innerWithDocs.trim();

  if (innerOnly && args.variant === "cobranca_aberta") {
    return `
<p class="body-font" style="margin:0 0 16px 0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#1A1A1A;">
  Olá, <strong>${escapeHtml(nome)}</strong>!
</p>
${innerOnly}`;
  }

  if (innerOnly && args.variant === "boleto_nf" && innerOnly.length > 80) {
    return `
<p class="body-font" style="margin:0 0 16px 0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#1A1A1A;">
  Olá, <strong>${escapeHtml(nome)}</strong>!
</p>
${innerOnly}`;
  }

  return `
<p class="body-font" style="margin:0 0 16px 0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#1A1A1A;">
  Olá, <strong>${escapeHtml(nome)}</strong>!
</p>
<p class="body-font" style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#444444;">
  Segue em anexo o <strong style="color:#1A1A1A;">boleto</strong> e a <strong style="color:#1A1A1A;">nota fiscal</strong>
  referentes ao serviço musical da Radio Ibiza, competência <strong style="color:#1A1A1A;">${escapeHtml(competencia)}</strong>.
</p>`;
}

function buildSummaryCards(hints: CobrancaEmailLayoutHints): string {
  const venc = escapeHtml(hints.vencimento?.trim() || "—");
  const valor = escapeHtml(formatValorDisplay(hints.valor));
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="stack stack-gap" width="50%" valign="top" style="padding-right:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#F5D430;border-radius:8px;padding:18px 20px;">
            <div class="body-font" style="font-family:'Inter',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#0D0D0D;opacity:.7;">Vencimento</div>
            <div class="display" style="margin-top:4px;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-size:34px;line-height:36px;color:#0D0D0D;">${venc}</div>
          </td>
        </tr>
      </table>
    </td>
    <td class="stack" width="50%" valign="top" style="padding-left:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#1B7A3E;border-radius:8px;padding:18px 20px;">
            <div class="body-font" style="font-family:'Inter',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#FFFFFF;opacity:.8;">Valor</div>
            <div class="display" style="margin-top:4px;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-size:34px;line-height:36px;color:#FFFFFF;">${valor}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildAnexosBlock(numeroNf: string): string {
  const nf = escapeHtml(numeroNf.trim() || "—");
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6E3DD;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;border-bottom:1px solid #E6E3DD;">
      <span class="body-font" style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#1A1A1A;">
        <span style="color:#E5195E;font-weight:600;">01</span>&nbsp;&nbsp;Boleto bancário
      </span>
      <span class="body-font" style="float:right;font-family:'Inter',Arial,sans-serif;font-size:12px;color:#888888;">PDF em anexo</span>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 20px;">
      <span class="body-font" style="font-family:'Inter',Arial,sans-serif;font-size:14px;color:#1A1A1A;">
        <span style="color:#5E2CA5;font-weight:600;">02</span>&nbsp;&nbsp;Nota fiscal nº ${nf}
      </span>
      <span class="body-font" style="float:right;font-family:'Inter',Arial,sans-serif;font-size:12px;color:#888888;">PDF em anexo</span>
    </td>
  </tr>
</table>`;
}

function brandStripHtml(): string {
  const cells = BRAND_STRIP.map(
    (bg) =>
      `<td width="16.66%" height="8" style="background:${bg};font-size:0;line-height:0;">&nbsp;</td>`,
  ).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function wrapRadioIbizaShell(args: {
  preheader: string;
  headlineHtml: string;
  competenciaSubtitle: string;
  bodyContentHtml: string;
  summaryCardsHtml: string;
  anexosHtml: string;
  extraAfterAnexosHtml: string;
  showDefaultClosing: boolean;
}): string {
  const logo = RADIO_IBIZA_EMAIL_LOGO_DATA_URI;
  const closing = args.showDefaultClosing
    ? `
<p class="body-font" style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:26px;color:#444444;">
  Qualquer dúvida, é só responder este e-mail. Estamos à disposição.
</p>
<p class="body-font" style="margin:20px 0 0 0;font-family:'Inter',Arial,sans-serif;font-size:16px;line-height:24px;color:#1A1A1A;">
  Um abraço,<br>
  <strong>Equipe Financeira · Radio Ibiza</strong>
</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Boleto e Nota Fiscal – Radio Ibiza</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    body { margin:0; padding:0; background:#F4F2EE; }
    table { border-collapse:collapse; }
    img { border:0; display:block; }
    .display { font-family:'Bebas Neue', Impact, 'Arial Narrow', sans-serif; }
    .body-font { font-family:'Inter', Arial, Helvetica, sans-serif; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .stack { display:block !important; width:100% !important; }
      .stack-gap { padding-bottom:12px !important; }
      .title { font-size:40px !important; line-height:42px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F4F2EE;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4F2EE;font-size:1px;line-height:1px;">
    ${escapeHtml(args.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EE;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
          <tr>
            <td style="border-radius:12px 12px 0 0;overflow:hidden;">
              ${brandStripHtml()}
            </td>
          </tr>
          <tr>
            <td class="px" style="background:#0D0D0D;padding:32px 40px 32px 40px;">
              <img src="${logo}" alt="Radio Ibiza" width="150" style="display:block;width:150px;height:auto;border:0;margin:0 0 28px 0;">
              <span class="body-font" style="display:inline-block;background:#E5195E;color:#FFFFFF;font-family:'Inter',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:5px 10px;border-radius:3px;">
                Departamento Financeiro
              </span>
              <h1 class="display title" style="margin:16px 0 0 0;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;font-size:52px;line-height:52px;font-weight:400;color:#FFFFFF;letter-spacing:0.5px;text-transform:uppercase;">
                ${args.headlineHtml}
              </h1>
              <p class="body-font" style="margin:12px 0 0 0;font-family:'Inter',Arial,sans-serif;font-size:15px;line-height:22px;color:#BDBDBD;">
                ${escapeHtml(args.competenciaSubtitle)}
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="background:#FFFFFF;padding:36px 40px 8px 40px;">
              ${args.bodyContentHtml}
            </td>
          </tr>
          <tr>
            <td class="px" style="background:#FFFFFF;padding:24px 40px 8px 40px;">
              ${args.summaryCardsHtml}
            </td>
          </tr>
          <tr>
            <td class="px" style="background:#FFFFFF;padding:24px 40px 8px 40px;">
              ${args.anexosHtml}
              ${args.extraAfterAnexosHtml}
            </td>
          </tr>
          <tr>
            <td class="px" style="background:#FFFFFF;padding:24px 40px 40px 40px;">
              ${closing}
            </td>
          </tr>
          <tr>
            <td class="px" align="center" style="background:#0D0D0D;border-radius:0 0 12px 12px;padding:24px 40px;">
              <img src="${logo}" alt="Radio Ibiza" width="110" style="display:block;width:110px;height:auto;border:0;margin:0 auto;">
              <div class="body-font" style="margin-top:4px;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:18px;color:#8C8C8C;">
                Toda boa experiência tem uma trilha. Mesmo quando você não percebe.
              </div>
              <div class="body-font" style="margin-top:14px;font-family:'Inter',Arial,sans-serif;font-size:11px;line-height:16px;color:#6E6E6E;">
                Mensagem automática — qualquer dúvida responda a este e-mail.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * HTML de cobrança / envio manual com identidade Radio Ibiza (faixa colorida, Bebas/Inter, cartões vencimento/valor).
 */
export function buildCobrancaAbertaEmailHtml(opts: {
  bodyPlain: string;
  companyName?: string;
  documentosHtmlLinkLines?: string[];
  layoutHints?: CobrancaEmailLayoutHints;
}): string {
  const _company = opts.companyName ?? COMPANY_NAME;
  const linkLines = opts.documentosHtmlLinkLines ?? [];
  const hints = opts.layoutHints ?? {};

  const fingerprint = linkLines.length ? buildMinimalDocumentosVar(linkLines) : "";
  const docBtnsHtml = linkLines.length ? buildDocumentosBoletoButtonsHtml(linkLines) : "";

  let bodyForParsing = opts.bodyPlain;
  if (fingerprint && docBtnsHtml) {
    bodyForParsing = spliceDocumentosFingerprintForHtml(opts.bodyPlain, fingerprint);
  }

  let inner: string;
  if (docBtnsHtml && bodyForParsing.includes(COBR_DOCUMENTOS_BTN_SLOT)) {
    const [pre, post] = splitOnce(bodyForParsing, COBR_DOCUMENTOS_BTN_SLOT);
    inner = `${sectionsToInnerHtml(pre)}${sectionsToInnerHtml(post)}`;
  } else {
    inner = sectionsToInnerHtml(bodyForParsing);
  }

  const variant = hints.variant ?? "boleto_nf";
  const competencia = hints.competencia?.trim() || "—";
  const vencimento = hints.vencimento?.trim() || "—";
  const numeroNf = hints.numeroNf?.trim() || "—";

  const headlineHtml =
    variant === "cobranca_aberta"
      ? "Cobranças em aberto"
      : "Seu boleto e nota fiscal<br>chegaram";

  const competenciaSubtitle =
    variant === "cobranca_aberta"
      ? `${_company} · resumo das parcelas`
      : `Competência ${competencia} · Radio Ibiza`;

  const preheader =
    variant === "cobranca_aberta"
      ? `Cobranças em aberto — ${competencia}.`
      : `Boleto e nota fiscal de ${competencia} em anexo. Vencimento em ${vencimento}.`;

  const bodyContentHtml = buildBodyContentHtml({
    bodyPlain: opts.bodyPlain,
    innerWithDocs: inner,
    hints,
    variant,
  });

  const extraAfterAnexosHtml = docBtnsHtml
    ? `<div style="margin-top:16px;">${docBtnsHtml}</div>`
    : "";

  return wrapRadioIbizaShell({
    preheader,
    headlineHtml,
    competenciaSubtitle,
    bodyContentHtml,
    summaryCardsHtml: buildSummaryCards(hints),
    anexosHtml: buildAnexosBlock(numeroNf),
    extraAfterAnexosHtml,
    showDefaultClosing: variant === "boleto_nf",
  });
}
