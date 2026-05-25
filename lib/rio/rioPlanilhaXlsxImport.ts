import type { RioChargeMode, RioPlanilhaBand, RioPlanilhaRow, RioPlanilhaRowKind } from "@prisma/client";

export type RioXlsxParseWarnings = string[];

/** Saída mínima que o PlanilhaRioPanel monta como `Vm` (`editorKey` = `id`). */
export type RioXlsxLinhaParsed = {
  id: string;
  monthId: string;
  band: RioPlanilhaBand;
  kind: RioPlanilhaRowKind;
  tituloSecao: string | null;
  marca: string;
  numOrdem: number | null;
  pdvNome: string;
  cnpjDocumento: string | null;
  status: string;
  valorTexto: string | null;
  qtdeTexto: string | null;
  categoria: string;
  email: string | null;
  dataInstall: string | null;
  grupoCobranca: string;
  razao: string;
  dataCancel: string | null;
  notes: string;
  /** Pai apenas para agrupamentos “MATRIZ” no Excel (`GRUPO …`). */
  parentClientKey: string | null;
  contaAzulPersonId: string | null;
  chargeMode: RioChargeMode;
  sortOrder: number;
};

export type RioXlsxParseResult = {
  rows: RioXlsxLinhaParsed[];
  skippedRows: number;
  warnings: RioXlsxParseWarnings;
};

const T_SEC_CANCEL = "LOJAS CANCELANDO OU CANCELADAS";
const T_SEC_NOVOS = "PDVS NOVOS DO MÊS";
const T_SEC_ATIVOS = "CLIENTES ATIVOS";

function normalizeHeaderJoined(row: string[]): string {
  return row
    .join("|")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ");
}

/** Lê texto de célula; numéricos de CNPJ disparam um aviso (perda possível no Excel como número). */
function stringifyCell(
  cell: import("xlsx").CellObject | undefined,
  colIdx: number,
  warnSet: Set<string>,
): string {
  if (!cell || cell.v === null || cell.v === "") return "";
  switch (cell.t) {
    case "s":
      return String(cell.v).trim();
    case "b":
      return cell.v ? "Sim" : "Não";
    case "d": {
      if (cell.v instanceof Date) {
        try {
          return cell.v.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "America/Sao_Paulo",
          });
        } catch {
          return cell.v.toISOString().slice(0, 10);
        }
      }
      return String(cell.w ?? cell.v).trim();
    }
    case "n": {
      const n = Number(cell.v);
      if (!Number.isFinite(n)) return "";
      if (colIdx === 3) {
        const w = String(cell.w ?? "");
        const looksScientific = /e[+]/i.test(w) || /e-/i.test(w);
        const looksMasked = /\d[\d.\-/]/.test(w) && w.replace(/\D/g, "").length >= 12;
        if (looksMasked) return w.trim();
        if (looksScientific || (Math.abs(n) >= 1e11 && Math.abs(n) <= 1e15)) {
          warnSet.add(
            "Ao menos um CNPJ aparece só como número no Excel — vale formatar essa coluna como texto antes de exportar.",
          );
        }
      }
      if (Math.abs(Math.round(n) - n) < 1e-9 && Math.abs(n) <= 9_999_999_999_999)
        return String(Math.round(n));
      return String(n).replace(/\./g, ",");
    }
    default:
      return String(cell.w ?? cell.v).trim();
  }
}

function readRowCells(
  utils: Pick<typeof import("xlsx").utils, "encode_cell">,
  sheet: import("xlsx").WorkSheet,
  rowIdx: number,
  colCount: number,
  warnSet: Set<string>,
): string[] {
  const out: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const addr = utils.encode_cell({ r: rowIdx, c });
    const cell = sheet[addr] as import("xlsx").CellObject | undefined;
    out.push(stringifyCell(cell, c, warnSet));
  }
  return out;
}

function blankishRow(vals: string[]): boolean {
  return vals.every((v) => !v.trim());
}

function findHeaderRow(matrix: string[][], scanMax = 30): number {
  for (let i = 0; i < Math.min(matrix.length, scanMax); i++) {
    const row = matrix[i];
    if (!row?.length) continue;
    const joined = normalizeHeaderJoined(row.slice(0, 8));
    if (joined.includes("marca") && joined.includes("pdv")) return i;
  }
  return -1;
}

const RE_SEC_CANCEL = /^lojas\s+cancel/i;
const RE_SEC_NOVOS = /^pdvs?\s+novos/i;
const RE_SEC_ATIVOS = /^clientes?\s+ativos/i;

/** Linha “GRUPO …” dentro de clientes ativos (sem PDV nem CNPJ). */
function isGrupoTituloRow(r: string[]): boolean {
  const marca = r[0].trim();
  const pdv = r[2].trim();
  const cnpj = r[3].trim();
  if (!/^grupo\b/i.test(marca)) return false;
  if (!pdv && !cnpj && marca.length > 8) return true;
  return false;
}

function isNoteBannerRow(r: string[]): boolean {
  const c0 = r[0].trim();
  return /^acima\b/i.test(c0) || /\binseriu\b/i.test(c0);
}

/** Importa primeira aba `.xlsx` tipo planilha Rio — não comunica dados ao Conta Azul. */
export function rioLinhasParsedFromWorkbook(
  xlsx: Pick<typeof import("xlsx"), "utils">,
  book: import("xlsx").WorkBook,
  monthId: string,
): RioXlsxParseResult {
  const warnSet = new Set<string>();
  const name = book.SheetNames[0];
  if (!name) {
    return { rows: [], skippedRows: 0, warnings: ["Arquivo Excel sem abas."] };
  }
  const sheet = book.Sheets[name];
  if (!sheet["!ref"]) {
    return { rows: [], skippedRows: 0, warnings: ["Planilha vazia."] };
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const colCount = Math.min(13, range.e.c + 1);
  const matrix: string[][] = [];
  for (let r = 0; r <= range.e.r; r++) {
    matrix.push(readRowCells(xlsx.utils, sheet, r, colCount, warnSet));
  }

  const hRow = findHeaderRow(matrix);
  if (hRow < 0) {
    return {
      rows: [],
      skippedRows: 0,
      warnings: [
        ...warnSet,
        "Cabeçalho não encontrado — esperado algo como «Marca | # | Pdv | CNPJ | ….",
      ],
    };
  }

  const headerJoined = normalizeHeaderJoined(matrix[hRow]?.slice(0, 13) ?? []);
  if (!headerJoined.includes("cnpj") || !headerJoined.includes("pdv")) {
    warnSet.add("Cabeçalho incompleto em relação à planilha Rio (confira nome das colunas).");
  }

  let bucket: RioPlanilhaBand | null = null;
  /** `id` UUID da linha `grupo` ativa dentro de «ativos». */
  let grupoParentId: string | null = null;
  let seenNovosBanner = false;
  let injectedAtivosSecao = false;

  let sortOrder = 0;
  const out: RioXlsxLinhaParsed[] = [];
  let skipped = 0;

  const bumpSort = (): number => {
    sortOrder += 1;
    return sortOrder;
  };

  const pushSecao = (band: RioPlanilhaBand, titulo: string) => {
    grupoParentId = null;
    out.push({
      id: crypto.randomUUID(),
      monthId,
      band,
      kind: "secao",
      tituloSecao: titulo,
      marca: "",
      numOrdem: null,
      pdvNome: "",
      cnpjDocumento: null,
      status: "",
      valorTexto: null,
      qtdeTexto: null,
      categoria: "",
      email: null,
      dataInstall: null,
      grupoCobranca: "",
      razao: "",
      dataCancel: null,
      notes: "",
      parentClientKey: null,
      contaAzulPersonId: null,
      chargeMode: "cliente_ca_proprio",
      sortOrder: bumpSort(),
    });
  };

  const ensureNovosBanner = () => {
    pushSecao("novos", T_SEC_NOVOS);
    seenNovosBanner = true;
  };

  for (let r = hRow + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (blankishRow(row)) {
      skipped += 1;
      continue;
    }

    const c0 = row[0].trim();
    const c2 = row[2].trim();
    const status = row[4].trim();

    if (RE_SEC_CANCEL.test(c0) && !c2) {
      bucket = "canceladas";
      grupoParentId = null;
      const hasBanner = out.some((x) => x.kind === "secao" && x.band === "canceladas");
      if (!hasBanner) pushSecao("canceladas", T_SEC_CANCEL);
      continue;
    }
    if (RE_SEC_NOVOS.test(c0) && !c2) {
      bucket = "novos";
      grupoParentId = null;
      if (!seenNovosBanner) ensureNovosBanner();
      continue;
    }
    if (RE_SEC_ATIVOS.test(c0) && !c2) {
      bucket = "ativos";
      grupoParentId = null;
      if (!injectedAtivosSecao) {
        pushSecao("ativos", T_SEC_ATIVOS);
        injectedAtivosSecao = true;
      }
      continue;
    }

    if (!bucket) {
      skipped += 1;
      continue;
    }

    if (isNoteBannerRow(row)) {
      skipped += 1;
      continue;
    }

    if (bucket === "novos" && status && !/^novo$/i.test(status) && (c2 || row[3].trim())) {
      bucket = "ativos";
      grupoParentId = null;
      if (!injectedAtivosSecao) {
        pushSecao("ativos", T_SEC_ATIVOS);
        injectedAtivosSecao = true;
      }
    }

    /** Grupo de cobrança (matriz) — só nos ativos após entrada na faixa. */
    if (bucket === "ativos" && isGrupoTituloRow(row)) {
      grupoParentId = crypto.randomUUID();
      bumpSort();
      out.push({
        id: grupoParentId,
        monthId,
        band: "ativos",
        kind: "grupo",
        tituloSecao: null,
        marca: c0,
        numOrdem: row[1].trim() ? Math.floor(Number(row[1].replace(",", "."))) : null,
        pdvNome: c0,
        cnpjDocumento: row[3].trim() || null,
        status: "",
        valorTexto: row[5].trim() || null,
        qtdeTexto: row[6].trim() || null,
        categoria: row[7].trim(),
        email: row[8].trim() || null,
        dataInstall: row[9].trim() || null,
        grupoCobranca: row[10].trim(),
        razao: row[11].trim(),
        dataCancel: row[12].trim() || null,
        notes: `Importação Excel (${name}).`,
        parentClientKey: null,
        contaAzulPersonId: null,
        chargeMode: "herda_grupo",
        sortOrder,
      });
      continue;
    }

    const numRaw = row[1].trim();
    const numOrd =
      numRaw && !Number.isNaN(Number(numRaw.replace(",", ".")))
        ? Math.floor(Number(numRaw.replace(",", ".")))
        : null;

    const rk = crypto.randomUUID();
    const chargeMode: RioChargeMode =
      grupoParentId && bucket === "ativos" ? "herda_grupo" : "cliente_ca_proprio";

    bumpSort();
    out.push({
      id: rk,
      monthId,
      band: bucket,
      kind: "pdv",
      tituloSecao: null,
      marca: row[0].trim(),
      numOrdem: numOrd,
      pdvNome: row[2].trim() || "(sem nome PDV)",
      cnpjDocumento: row[3].trim() || null,
      status,
      valorTexto: row[5].trim() || null,
      qtdeTexto: row[6].trim() || null,
      categoria: row[7].trim(),
      email: row[8].trim() || null,
      dataInstall: row[9].trim() || null,
      grupoCobranca: row[10].trim(),
      razao: row[11].trim(),
      dataCancel: row[12].trim() || null,
      notes: `Importação Excel (${name}). Vínculo Conta Azul opcional (apenas neste portal).`,
      parentClientKey: grupoParentId && bucket === "ativos" ? grupoParentId : null,
      contaAzulPersonId: null,
      chargeMode,
      sortOrder,
    });
  }

  const warnList = [...warnSet];
  if (out.filter((x) => x.kind === "pdv").length === 0 && !warnList.some((w) => w.includes("Cabeçalho"))) {
    warnList.push("Nenhuma linha de PDV reconhecida — confira formato e colunas da planilha.");
  }

  return { rows: out, skippedRows: skipped, warnings: warnList };
}

/** Igual ao `Vm` da Planilha Rio (`editorKey` / `parentEditorKey`). */
export type RioPlanilhaImportDraftVm = RioPlanilhaRow & {
  editorKey: string;
  parentEditorKey: string | null;
};

export function rioParsedToDraftVm(parsed: RioXlsxLinhaParsed[]): RioPlanilhaImportDraftVm[] {
  const now = new Date();
  return parsed.map((L) => ({
    id: L.id,
    monthId: L.monthId,
    band: L.band,
    kind: L.kind,
    tituloSecao: L.kind === "secao" ? L.tituloSecao : null,
    marca: L.marca,
    numOrdem: L.numOrdem,
    pdvNome: L.pdvNome,
    cnpjDocumento: L.cnpjDocumento,
    status: L.status,
    valorTexto: L.valorTexto,
    qtdeTexto: L.qtdeTexto,
    categoria: L.categoria,
    email: L.email,
    dataInstall: L.dataInstall,
    grupoCobranca: L.grupoCobranca,
    razao: L.razao,
    dataCancel: L.dataCancel,
    notes: L.notes,
    parentId: L.parentClientKey,
    contaAzulPersonId: L.contaAzulPersonId,
    chargeMode: L.chargeMode,
    sortOrder: L.sortOrder,
    createdAt: now,
    updatedAt: now,
    editorKey: L.id,
    parentEditorKey: L.parentClientKey,
  }));
}

/** No browser/server; faz code-split da dependência `xlsx`. */
export async function rioLinhasParsedFromXlsxArrayBuffer(
  buf: ArrayBuffer,
  monthId: string,
): Promise<RioXlsxParseResult> {
  const mod = await import("xlsx");
  /** Compatibilidade CJS ↔ ESM. */
  const xlsxLib = (
    typeof mod.default === "object" && mod.default !== null ? (mod.default as typeof mod) : mod
  ) as typeof import("xlsx");
  const book = xlsxLib.read(buf, { type: "array", cellDates: true, dense: false });
  return rioLinhasParsedFromWorkbook(xlsxLib, book, monthId);
}
