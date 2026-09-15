import ExcelJS from "exceljs";
import type { PlanilhaProdSistema } from "@/lib/criacao/planilhaProdTypes";

export type PlanilhaProdImportRow = {
  clienteLabel: string;
  criativo: string;
  entregaAtl: string;
  convertidoGain: string;
  arrastado: string;
  sincronizado: string;
  statusPlayerNovo: string;
  obsCriacao: string;
  obsProducao: string;
  sistema: PlanilhaProdSistema;
  sortOrder: number;
};

export type PlanilhaProdImportMonth = {
  slug: string;
  label: string;
  sortKey: number;
  rows: PlanilhaProdImportRow[];
};

const MESES: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

/** Só abas deste ano entram no portal (evita dezenas de meses históricos). */
export const PLANILHA_PROD_IMPORT_YEAR = 2026;

const RED_ARGBS = new Set([
  "FFFF0000",
  "FFEA9999",
  "FFA61C00",
  "FFE6B8AF",
  "FFFF9900",
]);

function normalizeMonthLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

export function parsePlanilhaProdMonthMeta(labelRaw: string): { slug: string; label: string; sortKey: number } | null {
  const label = normalizeMonthLabel(labelRaw);
  const m = label.match(/^([A-ZÇ]+)\s+(\d{4})$/);
  if (!m) return null;
  const mesNome = m[1]!;
  const year = Number(m[2]);
  const month = MESES[mesNome];
  if (!month || !Number.isFinite(year)) return null;
  const slug = `${year}-${String(month).padStart(2, "0")}`;
  const sortKey = year * 100 + month;
  return { slug, label, sortKey };
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "richText" in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((p) => p.text).join("");
  }
  if (value instanceof Date) {
    return value.toLocaleDateString("pt-BR");
  }
  return String(value).trim();
}

function isRedFill(fill: ExcelJS.Fill | undefined): boolean {
  if (!fill || fill.type !== "pattern") return false;
  const fg = fill.fgColor?.argb?.toUpperCase();
  if (!fg) return false;
  return RED_ARGBS.has(fg);
}

function rowIsCancelled(row: ExcelJS.Row): boolean {
  for (let col = 1; col <= 9; col++) {
    const fill = row.getCell(col).fill;
    if (isRedFill(fill)) return true;
  }
  return false;
}

function normalizeCriativo(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

export async function parsePlanilhaProdWorkbook(buffer: Buffer): Promise<PlanilhaProdImportMonth[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings exigem Node Buffer legado
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const months: PlanilhaProdImportMonth[] = [];

  for (const sheet of workbook.worksheets) {
    const meta = parsePlanilhaProdMonthMeta(sheet.name);
    if (!meta || Math.floor(meta.sortKey / 100) !== PLANILHA_PROD_IMPORT_YEAR) continue;

    const rows: PlanilhaProdImportRow[] = [];
    let sortOrder = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;
      const clienteLabel = cellText(row.getCell(1).value);
      if (!clienteLabel) return;

      const criativo = normalizeCriativo(cellText(row.getCell(2).value));
      const cancelled = rowIsCancelled(row);

      rows.push({
        clienteLabel,
        criativo,
        entregaAtl: cellText(row.getCell(3).value),
        convertidoGain: cellText(row.getCell(4).value),
        arrastado: cellText(row.getCell(5).value),
        sincronizado: cellText(row.getCell(6).value),
        statusPlayerNovo: cellText(row.getCell(7).value),
        obsCriacao: cellText(row.getCell(8).value),
        obsProducao: cellText(row.getCell(9).value),
        sistema: cancelled ? "cancelado" : "painel",
        sortOrder: sortOrder++,
      });
    });

    months.push({ ...meta, rows });
  }

  months.sort((a, b) => b.sortKey - a.sortKey);
  return months;
}
