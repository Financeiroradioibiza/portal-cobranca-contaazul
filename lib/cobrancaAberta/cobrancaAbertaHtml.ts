import { COMPANY_NAME } from "@/lib/brand";

/** Alinhado à identidade de e-mails internos («Radio Ibiza» + Departamento Financeiro — verde). */
const HEADER_GREEN = "#1b5e37";
const HEADER_GREEN_SOFT = "#1f6b3f";
const HEADER_TABLE_BG = "#e8f0eb";
const TABLE_BORDER = "#d4ddd6";

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

/**
 * Lista de cobrança com `-` + `|` (ex.: placeholder {{TABELA_PARCELAS}}) ou título + bullets.
 */
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

  const theadHtml = `<thead><tr>${hdrs
    .map((h, j) => {
      const ali = j === ncol - 1 ? "right" : "left";
      return `<th align="${ali}" valign="middle" style="padding:11px 10px;color:${HEADER_GREEN};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;line-height:1.25;background:${HEADER_TABLE_BG};border-bottom:2px solid ${HEADER_GREEN};font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(h)}</th>`;
    })
    .join("")}</tr></thead>`;

  const bodyRows = rowsCells
    .map((cells, ri) => {
      const zebra = ri % 2 === 1 ? "#f6f9f7" : "#ffffff";
      const tds = cells.map((c, j) => {
        const ali = j === ncol - 1 ? "right" : "left";
        const txt = escapeHtml(stripCellLabel(c, j, ncol));
        return `<td align="${ali}" valign="middle" style="padding:11px 10px;color:#374151;font-size:13px;line-height:1.45;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${zebra};border-bottom:1px solid ${TABLE_BORDER};">${txt}</td>`;
      });
      return `<tr>${tds.join("")}</tr>`;
    })
    .join("");

  const wrap = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;border-radius:10px;border:1px solid ${TABLE_BORDER};overflow:hidden;background:#ffffff;">
${theadHtml}
<tbody>${bodyRows}</tbody>
</table>`.trim();

  if (preamble.length === 0) return wrap;
  const preambleP = `<p style="margin:0 0 14px;line-height:1.55;color:#374151;font-size:15px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${preamble.map((ln) => escapeHtml(ln)).join("<br/>")}</p>`;
  return `${preambleP}${wrap}`;
}

function paragraphFromBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

  const cobrancaTable = cobrancaTableFromLines(lines);
  if (cobrancaTable) return cobrancaTable;

  /** Fallback: bloco inteiro só com traços tipo lista (sem título antes). */
  const cobrancaListOneColumn =
    lines.length >= 2 &&
    lines.every((l) => /^-\s/.test(l)) &&
    (/\|/.test(trimmed) || /\bVencimento:/i.test(trimmed));

  if (cobrancaListOneColumn) {
    const rows = lines.map((line, idx) => {
      const txt = escapeHtml(line.replace(/^-\s+/, ""));
      const bb = idx < lines.length - 1 ? "border-bottom:1px solid #e8e8e8;" : "";
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
