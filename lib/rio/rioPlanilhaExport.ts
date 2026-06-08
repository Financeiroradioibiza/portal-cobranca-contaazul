import { COMPANY_NAME } from "@/lib/brand";
import { displayBrazilianTaxId } from "@/lib/format";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";
import { categoriaSiteLabel } from "@/lib/rio/categoriaSiteStyles";
import {
  formatRioValorTotal,
  sumRioLinhasTotals,
  type RioLinhaTotalsInput,
} from "@/lib/rio/rioPlanilhaTotals";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import {
  compareRioLinhasByNomeFantasia,
  sortRioCompGruposForDisplay,
} from "@/lib/rio/sortRioCompLinhas";
import { formatMoneyBr, valorClienteTextoFromPdvUnit } from "@/lib/rio/valorClienteCalc";

export type RioExportGrupo = {
  id: string;
  nome: string;
  sortOrder: number;
  systemTag?: string | null;
};

export type RioExportPdv = {
  id: string;
  nome: string;
  documento?: string | null;
  movimento?: "estavel" | "entrada" | "saida";
};

export type RioExportLinha = RioLinhaTotalsInput & {
  id: string;
  rioGrupoId: string | null;
  grupoSite: string;
  nomeFantasia: string;
  documento: string | null;
  emailCobranca: string | null;
  razaoSocial: string;
  contratosAtivosTexto: string;
  categoriaSite: string;
  valorPdvUnitarioTexto: string;
  pdvs: RioExportPdv[];
};

const MONTH_COLS = 11;

const FILL = {
  title: "FF0F172A",
  emeraldHeader: "FF065F46",
  emeraldSub: "FF047857",
  emeraldRow: "FFECFDF5",
  emeraldRowPdv: "FFD1FAE5",
  slateHeader: "FF334155",
  slateTotals: "FFE2E8F0",
  skyHeader: "FF075985",
  orangeHeader: "FF9A3412",
  white: "FFFFFFFF",
  amberTitle: "FF78350F",
} as const;

const CATEGORIA_FILL: Record<string, string> = {
  moda: "FFFCE7F3",
  shopping: "FFE0F2FE",
  hotelaria: "FFEDE9FE",
  hotel: "FFCCFBF1",
  clinicas: "FFCFFAFE",
  gastronomia: "FFFEF3C7",
  outro: "FFE2E8F0",
};

function sanitizeFilePart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function solidFill(argb: string): import("exceljs").Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleCell(
  cell: import("exceljs").Cell,
  opts: {
    fill?: string;
    fontColor?: string;
    bold?: boolean;
    size?: number;
    align?: Partial<import("exceljs").Alignment>;
  },
) {
  if (opts.fill) cell.fill = solidFill(opts.fill);
  cell.font = {
    name: "Calibri",
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    color: opts.fontColor ? { argb: opts.fontColor } : undefined,
  };
  if (opts.align) cell.alignment = opts.align;
}

function rioLinhaValorDisplay(l: RioExportLinha): string {
  const t = l.valorClienteTexto?.trim();
  if (t) return t;
  return valorClienteTextoFromPdvUnit(l.valorPdvUnitarioTexto, l.numeroPdvSite) || "—";
}

function pdvsAtivos(l: RioExportLinha): RioExportPdv[] {
  return sortRioPdvsByNome(l.pdvs.filter((p) => (p.movimento ?? "estavel") !== "saida"));
}

function pdvListLabel(p: RioExportPdv): string {
  const doc = displayBrazilianTaxId(p.documento);
  return doc === "—" ? p.nome : `${p.nome} [${doc}]`;
}

function marcaBannerFill(systemTag: string | null | undefined): string {
  if (systemTag === "ca_entrada") return FILL.skyHeader;
  if (systemTag === "ca_saida") return FILL.orangeHeader;
  return FILL.emeraldHeader;
}

function bucketizeForExport(grupos: RioExportGrupo[], linhas: RioExportLinha[]) {
  const ord = sortRioCompGruposForDisplay(grupos);
  const map = new Map<string, RioExportLinha[]>();
  for (const g of ord) map.set(g.id, []);
  const orphans: RioExportLinha[] = [];
  for (const ln of linhas) {
    const gid = ln.rioGrupoId;
    if (gid && map.has(gid)) map.get(gid)!.push(ln);
    else orphans.push(ln);
  }
  map.forEach((arr) => arr.sort(compareRioLinhasByNomeFantasia));
  orphans.sort(compareRioLinhasByNomeFantasia);
  return { ord, map, orphans };
}

const MONTH_HEADERS = [
  "Marca bloco",
  "Cliente",
  "CNPJ",
  "Mov.",
  "Contrato",
  "Valor",
  "Nº PDV",
  "Categoria",
  "E-mail cobrança",
  "Razão social",
  "PDVs (lista)",
];

/** Exporta competência inteira com cores próximas da planilha na tela. */
export async function downloadRioMonthStyledExcel(opts: {
  yearMonth: number;
  grupos: RioExportGrupo[];
  linhas: RioExportLinha[];
  companyName?: string;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const company = opts.companyName ?? COMPANY_NAME;
  const ymLabel = formatYearMonthLabel(opts.yearMonth);
  const { ord, map, orphans } = bucketizeForExport(opts.grupos, opts.linhas);
  const monthTotals = sumRioLinhasTotals(opts.linhas);

  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  const ws = wb.addWorksheet(`Rio ${ymLabel}`, {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.columns = [
    { width: 14 },
    { width: 28 },
    { width: 16 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 12 },
    { width: 26 },
    { width: 24 },
    { width: 36 },
  ];

  let rowN = 1;
  ws.mergeCells(rowN, 1, rowN, MONTH_COLS);
  const titleCell = ws.getCell(rowN, 1);
  titleCell.value = `${company} — Planilha Rio — ${ymLabel}`;
  styleCell(titleCell, {
    fill: FILL.title,
    fontColor: "FFFFFFFF",
    bold: true,
    size: 13,
    align: { vertical: "middle", horizontal: "center" },
  });
  ws.getRow(rowN).height = 26;
  rowN += 1;

  ws.mergeCells(rowN, 1, rowN, MONTH_COLS);
  const totalsCell = ws.getCell(rowN, 1);
  totalsCell.value =
    `Totais do mês: ${formatRioValorTotal(monthTotals.valorHasAny, monthTotals.valorTotal)} · ` +
    `${monthTotals.pdvTotal} PDV(s) · ${monthTotals.clientesAtivos} cliente(s) ativo(s)`;
  styleCell(totalsCell, {
    fill: FILL.slateTotals,
    bold: true,
    align: { vertical: "middle", horizontal: "center" },
  });
  ws.getRow(rowN).height = 20;
  rowN += 1;

  const writeColHeader = () => {
    const hr = ws.getRow(rowN);
    MONTH_HEADERS.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      styleCell(c, {
        fill: FILL.slateHeader,
        fontColor: "FFFFFFFF",
        bold: true,
        size: 9,
        align: { vertical: "middle", horizontal: "center", wrapText: true },
      });
    });
    hr.height = 22;
    rowN += 1;
  };

  const writeMarcaBlock = (
    marcaNome: string,
    systemTag: string | null | undefined,
    blockLinhas: RioExportLinha[],
  ) => {
    if (blockLinhas.length === 0 && systemTag !== "ca_entrada" && systemTag !== "ca_saida") return;

    ws.mergeCells(rowN, 1, rowN, MONTH_COLS);
    const gt = sumRioLinhasTotals(blockLinhas);
    const banner = ws.getCell(rowN, 1);
    banner.value =
      `MARCA — ${marcaNome}` +
      (blockLinhas.length > 0 ?
        ` · Subtotal: ${formatRioValorTotal(gt.valorHasAny, gt.valorTotal)} · ${gt.pdvTotal} PDV(s)`
      : "");
    styleCell(banner, {
      fill: marcaBannerFill(systemTag),
      fontColor: "FFFFFFFF",
      bold: true,
      align: { vertical: "middle", horizontal: "left" },
    });
    ws.getRow(rowN).height = 20;
    rowN += 1;

    writeColHeader();

    for (const r of blockLinhas) {
      const pdvList = pdvsAtivos(r)
        .map((p) => pdvListLabel(p))
        .join(" | ");
      const doc =
        displayBrazilianTaxId(r.documento) === "—" ? "" : displayBrazilianTaxId(r.documento);
      const catKey = r.categoriaSite.trim().toLowerCase();
      const row = ws.getRow(rowN);
      const vals = [
        marcaNome,
        r.nomeFantasia,
        doc,
        r.movimento,
        r.contratosAtivosTexto,
        rioLinhaValorDisplay(r),
        r.numeroPdvSite,
        categoriaSiteLabel(r.categoriaSite),
        r.emailCobranca ?? "",
        r.razaoSocial,
        pdvList,
      ];
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        const baseFill =
          r.pdvs.length > 0 ? FILL.emeraldRowPdv
          : systemTag === "ca_entrada" || systemTag === "ca_saida" ? FILL.white
          : FILL.emeraldRow;
        styleCell(c, {
          fill: i === 7 && catKey ? (CATEGORIA_FILL[catKey] ?? FILL.white) : baseFill,
          align: { vertical: "middle", wrapText: i === 10 },
        });
        if (i === 5 || i === 6) c.alignment = { ...c.alignment, horizontal: "right" };
      });
      row.height = 18;
      rowN += 1;
    }
    rowN += 1;
  };

  for (const g of ord) {
    writeMarcaBlock(g.nome, g.systemTag, map.get(g.id) ?? []);
  }
  if (orphans.length) writeMarcaBlock("Sem MARCA", null, orphans);

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `planilha-rio-${opts.yearMonth}-formatado.xlsx`,
  );
}

/** Excel resumido: cabeçalho Radio Ibiza, cliente, PDVs do mês e total. */
export async function downloadRioClientePdvsExcel(opts: {
  yearMonth: number;
  linha: RioExportLinha;
  companyName?: string;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const company = opts.companyName ?? COMPANY_NAME;
  const ymLabel = formatYearMonthLabel(opts.yearMonth);
  const pdvs = pdvsAtivos(opts.linha);
  const valor = rioLinhaValorDisplay(opts.linha);

  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  const ws = wb.addWorksheet("PDVs");

  ws.columns = [{ width: 6 }, { width: 42 }, { width: 18 }];

  let rowN = 1;
  ws.mergeCells(rowN, 1, rowN, 3);
  styleCell(ws.getCell(rowN, 1), {
    fill: FILL.emeraldHeader,
    fontColor: "FFFFFFFF",
    bold: true,
    size: 14,
    align: { horizontal: "center", vertical: "middle" },
  });
  ws.getCell(rowN, 1).value = company;
  ws.getRow(rowN).height = 28;
  rowN += 1;

  ws.mergeCells(rowN, 1, rowN, 3);
  styleCell(ws.getCell(rowN, 1), {
    fill: FILL.emeraldRow,
    bold: true,
    size: 12,
    align: { horizontal: "center" },
  });
  ws.getCell(rowN, 1).value = `Cliente: ${opts.linha.nomeFantasia}`;
  rowN += 1;

  ws.mergeCells(rowN, 1, rowN, 3);
  styleCell(ws.getCell(rowN, 1), {
    fill: FILL.amberTitle,
    fontColor: "FFFFFFFF",
    bold: true,
    align: { horizontal: "center" },
  });
  ws.getCell(rowN, 1).value = `PDVs do cliente — ${ymLabel}`;
  rowN += 1;

  const hdr = ws.getRow(rowN);
  styleCell(hdr.getCell(1), { fill: FILL.slateHeader, fontColor: "FFFFFFFF", bold: true, align: { horizontal: "center" } });
  styleCell(hdr.getCell(2), { fill: FILL.slateHeader, fontColor: "FFFFFFFF", bold: true });
  styleCell(hdr.getCell(3), { fill: FILL.slateHeader, fontColor: "FFFFFFFF", bold: true });
  hdr.getCell(1).value = "#";
  hdr.getCell(2).value = "PDV";
  hdr.getCell(3).value = "CNPJ";
  rowN += 1;

  pdvs.forEach((p, i) => {
    const row = ws.getRow(rowN);
    const doc = displayBrazilianTaxId(p.documento);
    styleCell(row.getCell(1), { fill: FILL.emeraldRow, align: { horizontal: "center" } });
    styleCell(row.getCell(2), { fill: i % 2 === 0 ? FILL.white : FILL.emeraldRow });
    styleCell(row.getCell(3), { fill: i % 2 === 0 ? FILL.white : FILL.emeraldRow });
    row.getCell(1).value = i + 1;
    row.getCell(2).value = p.nome;
    row.getCell(3).value = doc === "—" ? "" : doc;
    rowN += 1;
  });

  if (pdvs.length === 0) {
    ws.mergeCells(rowN, 1, rowN, 3);
    styleCell(ws.getCell(rowN, 1), { fill: FILL.emeraldRow, align: { horizontal: "center" } });
    ws.getCell(rowN, 1).value = "Nenhum PDV cadastrado neste mês.";
    rowN += 1;
  }

  ws.mergeCells(rowN, 1, rowN, 3);
  const totalCell = ws.getCell(rowN, 1);
  totalCell.value = `Valor total: R$ ${valor === "—" ? "—" : valor}`;
  styleCell(totalCell, {
    fill: FILL.slateTotals,
    bold: true,
    size: 11,
    align: { horizontal: "right", vertical: "middle" },
  });
  ws.getRow(rowN).height = 22;

  const buf = await wb.xlsx.writeBuffer();
  const slug = sanitizeFilePart(opts.linha.nomeFantasia) || "cliente";
  downloadBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${sanitizeFilePart(company).toLowerCase()}-pdvs-${slug}-${opts.yearMonth}.xlsx`,
  );
}

/** Abre diálogo de impressão / PDF com layout do relatório de PDVs do cliente. */
export function printRioClientePdvsPdf(opts: {
  yearMonth: number;
  linha: RioExportLinha;
  companyName?: string;
}) {
  const company = opts.companyName ?? COMPANY_NAME;
  const ymLabel = formatYearMonthLabel(opts.yearMonth);
  const pdvs = pdvsAtivos(opts.linha);
  const valor = rioLinhaValorDisplay(opts.linha);
  const valorFmt = valor === "—" ? "—" : `R$ ${valor}`;

  const rowsHtml =
    pdvs.length > 0 ?
      pdvs
        .map((p, i) => {
          const doc = displayBrazilianTaxId(p.documento);
          return `<tr><td class="num">${i + 1}</td><td>${escapeHtml(p.nome)}</td><td class="doc">${doc === "—" ? "" : escapeHtml(doc)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="empty">Nenhum PDV cadastrado neste mês.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(company)} — ${escapeHtml(opts.linha.nomeFantasia)} — ${ymLabel}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
  .brand { background: #065f46; color: #fff; text-align: center; padding: 14px; border-radius: 8px 8px 0 0; font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
  .cliente { background: #ecfdf5; padding: 12px 16px; font-size: 16px; font-weight: 600; border-left: 1px solid #065f46; border-right: 1px solid #065f46; }
  .titulo { background: #78350f; color: #fff; padding: 10px 16px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-left: 1px solid #78350f; border-right: 1px solid #78350f; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-top: none; }
  th { background: #334155; color: #fff; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; }
  td { padding: 8px 12px; border-top: 1px solid #e2e8f0; font-size: 13px; }
  tr:nth-child(even) td { background: #f8fafc; }
  td.num { width: 48px; text-align: center; font-weight: 600; color: #065f46; }
  td.doc { width: 160px; font-family: ui-monospace, monospace; font-size: 12px; }
  td.empty { text-align: center; font-style: italic; color: #64748b; }
  .total { margin-top: 16px; padding: 12px 16px; background: #e2e8f0; border-radius: 8px; text-align: right; font-size: 15px; font-weight: 700; }
  .total span { color: #065f46; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="brand">${escapeHtml(company)}</div>
  <div class="cliente">Cliente: ${escapeHtml(opts.linha.nomeFantasia)}</div>
  <div class="titulo">PDVs do cliente — ${escapeHtml(ymLabel)}</div>
  <table>
    <thead><tr><th>#</th><th>PDV</th><th>CNPJ</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="total">Valor total: <span>${escapeHtml(valorFmt)}</span></div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    window.alert("Permita pop-ups neste site para exportar em PDF (imprimir → Salvar como PDF).");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
