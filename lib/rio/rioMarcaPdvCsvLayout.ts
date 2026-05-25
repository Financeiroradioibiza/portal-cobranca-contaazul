import * as XLSX from "xlsx";

/** Cliente emitido pela planilha interna MARCA + PDVs (col. A,C,G,H — B para numeração). */
export type MarcaPdvLayoutClienteRow = {
  marca: string;
  /** Para cruzar com `nome_fantasia` das linhas já importadas/sync */
  nomeMatch: string;
  categoriaSite: string;
  numeroPdvSite: number;
  pdvs: Array<{ nome: string; sortOrder: number }>;
};

export type ParseMarcaPdvLayoutResult = {
  rows: MarcaPdvLayoutClienteRow[];
  warnings: string[];
};

function sniffDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/)[0] ?? "";
  const semi = (first.match(/;/g) ?? []).length;
  const coma = (first.match(/,/g) ?? []).length;
  return semi >= coma ? ";" : ",";
}

/** Remove BOM como em `normMarcaNome` do service. */
function stripUtf8BomCell(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

function looksLikeMarcaHeaderRow(firstRow: unknown[] | undefined): boolean {
  if (!firstRow || !firstRow.length) return false;
  const a = stripUtf8BomCell(String(firstRow[0] ?? ""));
  return /^marca$/i.test(a);
}

export function isPositiveIntegerCell(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

/** Coluna G: inteiro opcional para contagem/hint de PDVs. */
export function parsePdvCountHint(raw: string): number {
  const t = stripUtf8BomCell(raw).replace(/\s+/g, "");
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Extrai todas as linhas da primeira folha (array de arrays).
 */
function sheetRowsFromBuffer(buffer: Buffer, fileNameLower: string): unknown[][] {
  const isProbablyCsv = fileNameLower.endsWith(".csv") || fileNameLower.endsWith(".txt");
  let aoa: unknown[][];
  if (isProbablyCsv) {
    const text = buffer.toString("utf8");
    const fs = sniffDelimiter(text);
    const wb = XLSX.read(text, { type: "string", FS: fs, raw: true, codepage: 65001 });
    const sn = wb.SheetNames[0];
    if (!sn) return [];
    const ws = wb.Sheets[sn];
    aoa =
      XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
        header: 1,
        defval: "",
        raw: false,
      }) ?? [];
    return aoa as unknown[][];
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const sn = wb.SheetNames[0];
  if (!sn) return [];
  const ws = wb.Sheets[sn];
  return (
    (XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][]) ?? []
  );
}

type RawCsvRow = {
  marca: string;
  b: string;
  c: string;
  g: string;
  h: string;
  excelLineNo: number;
};

/** Agrupa linhas consecutivas com mesma marca (col. A); se A vier vazio, mantém última marca. */
function sliceBlocksByMarca(all: RawCsvRow[]): RawCsvRow[][] {
  const blocks: RawCsvRow[][] = [];
  let cur: RawCsvRow[] = [];
  let curKey: string | null = null;
  let lastMarca = "";

  for (const row of all) {
    const m = stripUtf8BomCell(row.marca) || lastMarca;
    lastMarca = m;
    const r = { ...row, marca: m };

    if (curKey === null || m !== curKey) {
      if (cur.length) blocks.push(cur);
      cur = [r];
      curKey = m;
    } else {
      cur.push(r);
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

function emitClientsFromMarcaBlock(
  blockRows: RawCsvRow[],
  warnings: string[],
): MarcaPdvLayoutClienteRow[] {
  const out: MarcaPdvLayoutClienteRow[] = [];
  const marca = stripUtf8BomCell(blockRows[0]?.marca ?? "");

  const hasNumberedPdvRows = blockRows.some((r) => isPositiveIntegerCell(r.b));

  /** Sem col. B numerada nesta marca: cada linha (col. C) é um cliente/PDV independente — ex.: Reserva Franquias */
  if (!hasNumberedPdvRows) {
    for (const r of blockRows) {
      const nome = stripUtf8BomCell(r.c);
      if (!nome) continue;
      const hint = parsePdvCountHint(r.g);
      const nPdv = hint > 0 ? hint : 1;
      out.push({
        marca,
        nomeMatch: nome,
        categoriaSite: r.h.slice(0, 120),
        numeroPdvSite: Math.max(nPdv, 1),
        pdvs: [{ nome, sortOrder: 0 }],
      });
    }
    return out;
  }

  /** Com numeração: cabeçalho com B vazio + linhas seguintes B=1,2,... */
  let i = 0;
  while (i < blockRows.length) {
    const r = blockRows[i]!;

    if (isPositiveIntegerCell(r.b)) {
      warnings.push(
        `Linha ${r.excelLineNo} (MARCA «${marca || "?"}»): col. B só com número «${r.b.trim()}» sem cabeçalho com B vazio acima neste bloco. Ignorada.`,
      );
      i += 1;
      continue;
    }

    const next = blockRows[i + 1];

    /** Cliente multi-PDV: linha atual B vazio; próxima com B inteiro positivo */
    if (next && isPositiveIntegerCell(next.b)) {
      const clienteNome = stripUtf8BomCell(r.c);
      if (!clienteNome) {
        warnings.push(`Linha ${r.excelLineNo}: bloco PDV esperado mas col. C (cliente CA) vazio.`);
        i += 1;
        continue;
      }
      const cat = stripUtf8BomCell(r.h).slice(0, 120);
      const hintG = parsePdvCountHint(r.g);
      const pdvs: Array<{ nome: string; sortOrder: number }> = [];
      i += 1;
      while (i < blockRows.length && isPositiveIntegerCell(blockRows[i]!.b)) {
        const pr = blockRows[i]!;
        let pNome = stripUtf8BomCell(pr.c);
        if (!pNome) pNome = `PDV ${stripUtf8BomCell(pr.b)}`;
        pdvs.push({ nome: pNome.slice(0, 800), sortOrder: pdvs.length });
        i += 1;
      }

      if (!pdvs.length) {
        warnings.push(`Cliente «${clienteNome}»: esperavam-se linhas PDV numeradas em B mas não foram encontradas.`);
        continue;
      }

      if (hintG > 0 && hintG !== pdvs.length) {
        warnings.push(
          `Cliente «${clienteNome}»: col. G (${hintG}) diferente da contagem de PDVs (${pdvs.length}); usado máximo entre ambos.`,
        );
      }
      const numeroPdvSite = Math.max(hintG > 0 ? hintG : pdvs.length, pdvs.length, 1);

      out.push({
        marca,
        nomeMatch: clienteNome,
        categoriaSite: cat,
        numeroPdvSite,
        pdvs,
      });
      continue;
    }

    /** Cliente único na mesma marca que tem também grupos numerados */
    const soloNome = stripUtf8BomCell(r.c);
    if (!soloNome) {
      i += 1;
      continue;
    }
    const hint = parsePdvCountHint(r.g);
    out.push({
      marca,
      nomeMatch: soloNome,
      categoriaSite: stripUtf8BomCell(r.h).slice(0, 120),
      numeroPdvSite: Math.max(hint > 0 ? hint : 1, 1),
      pdvs: [{ nome: soloNome, sortOrder: 0 }],
    });
    i += 1;
  }

  return out;
}

/**
 * Parser da exportação MARCA — colunas fixas Excel (A..H salvo D–F ignorados neste modo):
 * A MARCA, B nº PDV listagem CA, C nome cliente / nome PDV, G contagem PDVs (hint), H categoria site.
 *
 * Ignora-se CNPJ, col. E e qualquer campo de valor.
 */
export function parseMarcaPdvLayoutFromBuffer(buffer: Buffer, fileName: string): ParseMarcaPdvLayoutResult {
  const warnings: string[] = [];
  const lower = (fileName || "").toLowerCase();
  const aoa = sheetRowsFromBuffer(buffer, lower);
  if (!aoa.length) {
    warnings.push("Planilha vazia.");
    return { rows: [], warnings };
  }

  let startIdx = 0;
  if (looksLikeMarcaHeaderRow(aoa[0] as unknown[])) {
    startIdx = 1;
  }

  const rawAll: RawCsvRow[] = [];
  let lastMarca = "";

  for (let rx = startIdx; rx < aoa.length; rx++) {
    const line = (aoa[rx] ?? []) as unknown[];
    const cell = (idx: number) => stripUtf8BomCell(String(line[idx] ?? ""));

    const marcaCell = cell(0);
    const marca = marcaCell || lastMarca;
    if (marcaCell) lastMarca = marcaCell;

    const nomeC = cell(2);
    if (!marca && !nomeC) continue;

    rawAll.push({
      marca,
      b: cell(1),
      c: nomeC,
      g: cell(6),
      h: cell(7),
      excelLineNo: rx + 1 /** 1-based linha física */,
    });
  }

  /** Ordem preservada dentro de cada marca: processar blocos consecutivos com mesma marca (re-slice após herdarmos marca vazia). */
  const blocks = sliceBlocksByMarca(rawAll);
  const rows: MarcaPdvLayoutClienteRow[] = [];
  for (const b of blocks) {
    rows.push(...emitClientsFromMarcaBlock(b, warnings));
  }

  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.marca.trim().toLowerCase()}¤${r.nomeMatch.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [k, count] of seen) {
    if (count > 1) {
      const nome = k.split("¤")[1] ?? k;
      warnings.push(
        `Nome «${nome}» repetido ${count}x na mesma MARCA no ficheiro; cada ocorrência tenta atualizar outra linha do portal por ordem.`,
      );
    }
  }

  if (!rows.length) {
    warnings.push("Nenhum cliente válido encontrado nas colunas A/C.");
  }

  return { rows, warnings };
}
