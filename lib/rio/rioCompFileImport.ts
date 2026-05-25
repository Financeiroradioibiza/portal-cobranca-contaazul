import type { RioClienteCompMovimento } from "@prisma/client";
import * as XLSX from "xlsx";

export type ParsedRioFileRow = {
  caPersonId: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string | null;
  emailCobranca: string | null;
  valorClienteTexto: string;
  numeroPdvSite: number;
  categoriaSite: string;
  grupoSite: string;
  contratosAtivosTexto: string;
  movimento: RioClienteCompMovimento;
  observacoesLinha: string;
};

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function findColIndex(headers: string[], candidates: string[]): number {
  const norms = headers.map(normalizeHeader);
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    const exact = norms.indexOf(nc);
    if (exact !== -1) return exact;
  }
  for (const c of candidates) {
    const nc = normalizeHeader(c);
    const idx = norms.findIndex((n) => n === nc || n.endsWith(`_${nc}`) || n.startsWith(`${nc}_`));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseMovimento(raw: string): RioClienteCompMovimento {
  const t = raw.trim().toLowerCase();
  if (t === "entrada" || t === "e") return "entrada";
  if (t === "saida" || t === "saída" || t === "s") return "saida";
  return "estavel";
}

/** Gera um id estável quando o export da CA não trouxe UUID de pessoa. */
export function fallbackCaPersonIdFromDocument(documento: string | null, rowIndex1: number): string {
  const d = documento?.trim();
  const digits = d ? onlyDigits(d) : "";
  if (digits.length >= 11) return `import:${digits.slice(0, 32)}`;
  return `import:row:${rowIndex1}`;
}

/** Detecta separador típico (Excel PT-BR usa `;`). */
function sniffDelimiter(sample: string): string {
  const first = sample.split(/\r?\n/)[0] ?? "";
  const semi = (first.match(/;/g) ?? []).length;
  const coma = (first.match(/,/g) ?? []).length;
  return semi >= coma ? ";" : ",";
}

/**
 * Aceita primeira folha `.xlsx` / `.xls`, ou texto `.csv`/`.txt` UTF-8.
 * Cabeçalhos reconhecidos (flexíveis — ver README Planilha Rio).
 */
export function parseRioClienteImportTable(
  fileName: string,
  buffer: Buffer,
): { rows: ParsedRioFileRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const lower = fileName.toLowerCase();
  const isProbablyCsv =
    lower.endsWith(".csv") || lower.endsWith(".txt");

  let headerRow: unknown[];
  let dataRows: unknown[][];

  if (isProbablyCsv) {
    const text = buffer.toString("utf8");
    const fs = sniffDelimiter(text);
    const wb = XLSX.read(text, {
      type: "string",
      FS: fs,
      raw: true,
      codepage: 65001,
    });
    const sn = wb.SheetNames[0];
    const ws = wb.Sheets[sn];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!aoa.length) {
      warnings.push("Ficheiro CSV vazio.");
      return { rows: [], warnings };
    }
    headerRow = aoa[0] ?? [];
    dataRows = aoa.slice(1) as unknown[][];
  } else {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
    const sn = wb.SheetNames[0];
    if (!sn) {
      warnings.push("Sem folhas na planilha.");
      return { rows: [], warnings };
    }
    const ws = wb.Sheets[sn];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!aoa.length) {
      warnings.push("Planilha vazia.");
      return { rows: [], warnings };
    }
    headerRow = aoa[0] ?? [];
    dataRows = aoa.slice(1) as unknown[][];
  }

  const headers = headerRow.map((c) => String(c ?? ""));
  const iId = findColIndex(headers, ["ca_person_id", "capersonid", "id_conta_azul", "id_pessoa_ca", "uuid"]);
  const iNome = findColIndex(headers, ["cliente", "nome", "nome_fantasia", "fantasia"]);
  const iRazao = findColIndex(headers, ["razao_social", "razao", "nome_empresarial"]);
  /** Export Conta Azul «Cliente.csv»: colunas CNPJ e CPF à parte. */
  const iCnpj = findColIndex(headers, ["cnpj"]);
  const iCpf = findColIndex(headers, ["cpf"]);
  const iDoc = findColIndex(headers, ["documento", "cpfcnpj"]);
  const iEmailPri = findColIndex(headers, [
    "email_principal",
    "emailprincipal",
    "e_mail_principal",
    "mail_principal",
  ]);
  const iEmailCont = findColIndex(headers, [
    "e_mail_contato",
    "email_contato",
    "mail_contato",
    "contato_email",
  ]);
  const iEmailGeneric = findColIndex(headers, ["email_cobranca", "email", "e_mail", "mail"]);
  const iContratos = findColIndex(headers, ["contratos", "contrato", "contratos_ativos", "nr_contratos"]);
  const iGrupo = findColIndex(headers, ["grupo_site", "grupo"]);
  const iCat = findColIndex(headers, ["categoria_site", "categoria"]);
  const iPdv = findColIndex(headers, ["numero_pdv_site", "n_pdv", "pdvs_site", "qtd_pdvs"]);
  const iValor = findColIndex(headers, ["valor_cliente", "valor", "valor_mensal"]);
  const iObs = findColIndex(headers, ["observacoes", "observacoes_linha", "obs"]);
  const iMov = findColIndex(headers, ["movimento", "mov"]);

  if (iNome === -1) {
    warnings.push(
      'Coluna obrigatória não encontrada: algo como «Nome», «cliente», «nome» ou «nome_fantasia».',
    );
    return { rows: [], warnings };
  }

  const outById = new Map<string, ParsedRioFileRow>();

  for (let rx = 0; rx < dataRows.length; rx++) {
    const line = dataRows[rx];
    const cell = (i: number) => {
      if (i < 0) return "";
      const v = line[i];
      if (v == null) return "";
      return String(v).trim();
    };

    let nomeFantasia = cell(iNome);
    const pieceCnpj = iCnpj >= 0 ? cell(iCnpj) : "";
    const pieceCpf = iCpf >= 0 ? cell(iCpf) : "";
    const pieceDoc = iDoc >= 0 ? cell(iDoc) : "";
    const documentoMerged = [pieceCnpj, pieceCpf, pieceDoc].map((x) => x.trim()).find(Boolean);
    const documento = documentoMerged ? documentoMerged.slice(0, 64) : null;

    if (!nomeFantasia && !documento) continue;

    if (!nomeFantasia) nomeFantasia = documento ?? `Linha ${rx + 2}`;

    const idCell = cell(iId);
    const caPersonId = idCell || fallbackCaPersonIdFromDocument(documento, rx + 2);

    const razaoSocial = cell(iRazao) || nomeFantasia;

    let emailMerged = "";
    if (iEmailCont >= 0) emailMerged = cell(iEmailCont);
    if (!emailMerged && iEmailPri >= 0) emailMerged = cell(iEmailPri);
    if (!emailMerged && iEmailGeneric >= 0) emailMerged = cell(iEmailGeneric);
    const parts = emailMerged
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const mailbox = parts.find((x) => x.includes("@")) ?? (emailMerged.includes("@") ? emailMerged.trim() : "");
    const emailCobranca = mailbox || null;

    const observLinha = cell(iObs);

    let numeroPdvSite = 0;
    const pdvTxt = cell(iPdv);
    if (pdvTxt) {
      const n = Number(String(pdvTxt).replace(",", "."));
      numeroPdvSite = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }

    const prev = outById.get(caPersonId);
    if (prev) warnings.push(`Linha ${rx + 2}: mesmo identificador (${caPersonId}); mantém-se a última ocorrência.`);

    outById.set(caPersonId, {
      caPersonId,
      nomeFantasia,
      razaoSocial,
      documento,
      emailCobranca,
      valorClienteTexto: cell(iValor).slice(0, 200),
      numeroPdvSite,
      categoriaSite: cell(iCat).slice(0, 120),
      grupoSite: cell(iGrupo),
      contratosAtivosTexto: cell(iContratos).slice(0, 400),
      movimento: parseMovimento(cell(iMov)),
      observacoesLinha: observLinha,
    });
  }

  return { rows: [...outById.values()], warnings };
}
