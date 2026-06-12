import fs from "fs";
import path from "path";
import { onlyDigits } from "@/lib/format";
import {
  compactAlphaNum,
  fuzzyContainsAllHaystack,
  normalizeSearch,
  stripDiacritics,
  tokenize,
} from "@/lib/textNormalize";

export {
  compactAlphaNum,
  fuzzyContainsAllHaystack,
  normalizeSearch,
  stripDiacritics,
  tokenize,
} from "@/lib/textNormalize";

export type CsvClienteCand = { clienteId: string; textoLinha: string };
export type CsvPdvCand = {
  pdvId: string;
  clienteId: string;
  textoLinha: string;
};

type ClienteAgg = {
  clienteId: string;
  nome: string;
  razao: string;
  blob: string;
};

type PdvAgg = {
  pdvId: string;
  clienteId: string;
  nomeCliente: string;
  pdvNome: string;
  cnpjDigits: string;
  blob: string;
};

let cache: { clientes: ClienteAgg[]; pdvs: PdvAgg[] } | null = null;

function exportCsvPath(): string {
  const env = process.env.RADIO_PAINEL_EXPORT_CSV_PATH?.trim();
  if (env) return path.resolve(env);
  return path.join(process.cwd(), "data", "export-clientes.csv");
}

export function invalidateExportClientesCsvCache(): void {
  cache = null;
}

function parseHeader(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = h.replace(/^\ufeff/, "").trim().toLowerCase();
    map[k] = i;
  });
  return map;
}

function reqCol(ix: Record<string, number>, ...names: string[]): number | null {
  for (const n of names) {
    if (typeof ix[n] === "number") return ix[n];
  }
  return null;
}

function splitLine(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

function loadCsv(): { clientes: ClienteAgg[]; pdvs: PdvAgg[] } {
  if (cache) return cache;

  const file = exportCsvPath();
  let raw: Buffer;
  try {
    raw = fs.readFileSync(file);
  } catch {
    throw new Error(
      `CSV de clientes/PDVs nao encontrado: ${file}. Copie export de /adm/exports para data/export-clientes.csv ou defina RADIO_PAINEL_EXPORT_CSV_PATH.`,
    );
  }

  const text = raw.toString("latin1");
  const lines = text.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (lines.length < 2) {
    cache = { clientes: [], pdvs: [] };
    return cache;
  }

  const ix = parseHeader(splitLine(lines[0]));
  const ci = reqCol(ix, "id");
  const ni = reqCol(ix, "nome");
  const ri = reqCol(ix, "razaosocial", "razao social");
  const pidi = reqCol(ix, "pdvid", "pdv id");
  const pnomi = reqCol(ix, "pdvnome", "pdv nome");
  const pcnpji = reqCol(ix, "pdvcnpj", "pdv cnpj", "cnpj");

  if (
    ci == null ||
    ni == null ||
    ri == null ||
    pidi == null ||
    pnomi == null
  ) {
    throw new Error(
      "CSV sem colunas esperadas Id, Nome, RazaoSocial, PdvId, PdvNome.",
    );
  }

  const maxIx = Math.max(ci, ni, ri, pidi, pnomi);

  /** Metadados cliente (prefer linha mais preenchida) */
  const meta = new Map<string, { nome: string; rz: string }>();

  /** Texto PDV dedup compacto por cliente */
  const pdvTokensCliente = new Map<string, Set<string>>();
  const pdvs: PdvAgg[] = [];

  for (let L = 1; L < lines.length; L++) {
    const cols = splitLine(lines[L]);
    if (cols.length < maxIx + 1) continue;

    const cid = cols[ci]?.trim() ?? "";
    if (!/^\d+$/.test(cid)) continue;

    const nome = cols[ni] ?? "";
    const rz = cols[ri] ?? "";
    const cur = meta.get(cid);
    if (!cur || (!cur.nome && nome)) meta.set(cid, { nome: nome || cur?.nome || "", rz: rz || cur?.rz || "" });

    const pdvid = cols[pidi]?.trim() ?? "";
    const pnom = cols[pnomi]?.trim() ?? "";
    const m = meta.get(cid)!;

    if (/^\d+$/.test(pdvid) && pnom.trim()) {
      const cnpjRaw = pcnpji != null ? cols[pcnpji] ?? "" : "";
      const cnpjDigits = onlyDigits(cnpjRaw);
      const blobPdv = compactAlphaNum(
        `${m.nome} ${m.rz} ${pnom} ${cnpjDigits} ${cid} ${pdvid}`,
      );
      pdvs.push({
        pdvId: pdvid,
        clienteId: cid,
        nomeCliente: m.nome || nome || "",
        pdvNome: pnom.trim(),
        cnpjDigits,
        blob: blobPdv,
      });
      let s = pdvTokensCliente.get(cid);
      if (!s) {
        s = new Set<string>();
        pdvTokensCliente.set(cid, s);
      }
      s.add(compactAlphaNum(pnom));
    }
  }

  const clientesArr: ClienteAgg[] = [];
  for (const [cid, m] of meta) {
    let blob = compactAlphaNum(`${m.nome} ${m.rz} ${cid}`);
    const pts = [...(pdvTokensCliente.get(cid) ?? [])].join("");
    if (pts) blob = `${blob}${pts}`;
    clientesArr.push({
      clienteId: cid,
      nome: (m.nome || "").trim(),
      razao: (m.rz || "").trim(),
      blob,
    });
  }

  clientesArr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  pdvs.sort((a, b) => a.pdvNome.localeCompare(b.pdvNome, "pt-BR"));

  cache = { clientes: clientesArr, pdvs };
  return cache;
}

export function csvMatchClientesPorTexto(term: string): CsvClienteCand[] {
  const { clientes } = loadCsv();
  const toks = tokenize(term);

  /** Se usuario digitou apenas 1 token curto, exige texto completo no blob */
  let hits = clientes;
  const blobNeedle =
    term.trim().length < 2
      ? null
      : compactAlphaNum(term);

  if (!toks.length) {
    if (!blobNeedle || blobNeedle.length < 2) return [];
    hits = clientes.filter((c) => c.blob.includes(blobNeedle));
  } else {
    hits = clientes.filter((c) => fuzzyContainsAllHaystack(c.blob, toks));
  }

  return hits.slice(0, 35).map((c) => ({
    clienteId: c.clienteId,
    textoLinha: `${c.nome}${c.razao ? " · " + c.razao.slice(0, 88) + (c.razao.length > 88 ? "…" : "") : ""} · ID ${c.clienteId}`,
  }));
}

/** Busca pontos PDV por nome PDV (+ nome cliente/id no blob) */
export function csvMatchPdvsPorTexto(term: string): CsvPdvCand[] {
  const { pdvs } = loadCsv();
  const toks = tokenize(term);
  let hits: typeof pdvs;

  const blobNeedle = term.trim().length < 2 ? null : compactAlphaNum(term);

  if (!toks.length) {
    if (!blobNeedle || blobNeedle.length < 2) return [];
    hits = pdvs.filter((p) => p.blob.includes(blobNeedle));
  } else {
    hits = pdvs.filter((p) => fuzzyContainsAllHaystack(p.blob, toks));
  }

  const seen = new Set<string>();
  const uniq: typeof pdvs = [];
  for (const p of hits) {
    if (seen.has(p.pdvId)) continue;
    seen.add(p.pdvId);
    uniq.push(p);
  }

  return uniq.slice(0, 40).map((p) => ({
    clienteId: p.clienteId,
    pdvId: p.pdvId,
    textoLinha: `${p.pdvNome} · PDV #${p.pdvId} · cliente ${p.nomeCliente || "–"} (${p.clienteId})`,
  }));
}

export type CsvPdvRecord = {
  pdvId: string;
  clienteId: string;
  pdvNome: string;
  nomeCliente: string;
  cnpjDigits: string;
};

function pdvToRecord(p: PdvAgg): CsvPdvRecord {
  return {
    pdvId: p.pdvId,
    clienteId: p.clienteId,
    pdvNome: p.pdvNome,
    nomeCliente: p.nomeCliente,
    cnpjDigits: p.cnpjDigits,
  };
}

/** PDV do export pelo ID numérico do painel legado. */
export function csvGetPdvByPainelId(pdvId: string): CsvPdvRecord | null {
  const id = pdvId.trim();
  if (!/^\d+$/.test(id)) return null;
  const { pdvs } = loadCsv();
  const hit = pdvs.find((p) => p.pdvId === id);
  return hit ? pdvToRecord(hit) : null;
}

/** Todos os PDVs do export (cache em memória). */
export function csvListAllPdvs(): CsvPdvRecord[] {
  return loadCsv().pdvs.map(pdvToRecord);
}

/** PDVs cujo blob contém ao menos um token significativo (OR, não AND). */
export function csvFindPdvsByAnyToken(tokens: string[]): CsvPdvRecord[] {
  const { pdvs } = loadCsv();
  const sig = [
    ...new Set(
      tokens
        .map((t) => compactAlphaNum(t))
        .filter((t) => t.length >= 3),
    ),
  ];
  if (!sig.length) return [];
  const seen = new Set<string>();
  const out: CsvPdvRecord[] = [];
  for (const p of pdvs) {
    if (seen.has(p.pdvId)) continue;
    if (!sig.some((t) => p.blob.includes(t))) continue;
    seen.add(p.pdvId);
    out.push(pdvToRecord(p));
  }
  return out;
}

/** Match exato por CNPJ/CPF (só dígitos, 11 ou 14). */
export function csvFindPdvByCnpjDigits(digits: string): CsvPdvRecord | null {
  const d = onlyDigits(digits);
  if (d.length !== 11 && d.length !== 14) return null;
  const { pdvs } = loadCsv();
  const hit = pdvs.find((p) => p.cnpjDigits === d);
  return hit ? pdvToRecord(hit) : null;
}

/** Todos PDVs do export com o mesmo CNPJ (raro, mas possível). */
export function csvFindPdvsByCnpjDigits(digits: string): CsvPdvRecord[] {
  const d = onlyDigits(digits);
  if (d.length < 11) return [];
  const { pdvs } = loadCsv();
  return pdvs.filter((p) => p.cnpjDigits === d).map(pdvToRecord);
}

export type CsvPdvCadastroDetail = {
  pdvId: string;
  clienteId: string;
  pdvNome: string;
  nomeCliente: string;
  razaoSocial: string;
  cnpj: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  programacaoMusical: string;
  versaoPlayer: string;
  placaCarro: boolean;
  controlarPlayer: boolean;
  controlarPlaylist: boolean;
  statusPlayer: "Ativo" | "Inativo";
};

function csvPainelSimNao(val: string): boolean {
  const v = val.trim().toUpperCase();
  return v === "S" || v === "SIM" || v === "1" || v === "YES" || v === "TRUE";
}

function csvPainelStatusPlayer(val: string): "Ativo" | "Inativo" {
  const v = val.trim().toUpperCase();
  if (v === "I" || v === "INATIVO" || v === "INACTIVE" || v === "N" || v === "NAO" || v === "NÃO") {
    return "Inativo";
  }
  return "Ativo";
}

function csvCol(ix: Record<string, number>, cols: string[], ...names: string[]): string {
  const i = reqCol(ix, ...names);
  if (i == null) return "";
  return (cols[i] ?? "").trim();
}

/** Cadastro completo do PDV no export CSV (endereço, player, etc.). */
export function csvGetPdvCadastroDetail(
  pdvId: string,
  clienteId?: string | number,
): CsvPdvCadastroDetail | null {
  const id = pdvId.trim();
  if (!/^\d+$/.test(id)) return null;

  const file = exportCsvPath();
  let raw: Buffer;
  try {
    raw = fs.readFileSync(file);
  } catch {
    return null;
  }

  const text = raw.toString("latin1");
  const lines = text.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (lines.length < 2) return null;

  const ix = parseHeader(splitLine(lines[0]));
  const ci = reqCol(ix, "id");
  const ni = reqCol(ix, "nome");
  const pidi = reqCol(ix, "pdvid", "pdv id");
  const pnomi = reqCol(ix, "pdvnome", "pdv nome");
  if (ci == null || ni == null || pidi == null || pnomi == null) return null;

  const wantCliente =
    clienteId != null && /^\d+$/.test(String(clienteId).trim())
      ? String(clienteId).trim()
      : null;

  for (let L = 1; L < lines.length; L++) {
    const cols = splitLine(lines[L]);
    const rowPdvId = cols[pidi]?.trim() ?? "";
    if (rowPdvId !== id) continue;

    const rowClienteId = cols[ci]?.trim() ?? "";
    if (wantCliente && rowClienteId !== wantCliente) continue;

    const pdvNome = cols[pnomi]?.trim() ?? "";
    if (!pdvNome) continue;

    const versaoPlayer = csvCol(ix, cols, "pdvversaoplayer", "pdv versao player");
    const programacao = csvCol(
      ix,
      cols,
      "pdvprogramacaomusical",
      "pdv programacao musical",
      "pdvprog",
      "pdv prog",
    );
    return {
      pdvId: rowPdvId,
      clienteId: rowClienteId,
      pdvNome,
      nomeCliente: csvCol(ix, cols, "nome"),
      razaoSocial: csvCol(ix, cols, "pdvrazaosocial", "pdv razao social"),
      cnpj: csvCol(ix, cols, "pdvcnpj", "pdv cnpj", "cnpj"),
      cep: csvCol(ix, cols, "pdvcep", "pdv cep"),
      endereco: csvCol(ix, cols, "pdvendereco", "pdv endereco"),
      numero: csvCol(ix, cols, "pdvnumero", "pdv numero"),
      complemento: csvCol(ix, cols, "pdvcomplemento", "pdv complemento"),
      bairro: csvCol(ix, cols, "pdvbairro", "pdv bairro"),
      cidade: csvCol(ix, cols, "pdvcidade", "pdv cidade"),
      estado: csvCol(ix, cols, "pdvuf", "pdv uf"),
      programacaoMusical: programacao || "Padrão",
      versaoPlayer,
      placaCarro: csvPainelSimNao(csvCol(ix, cols, "pdvdctrlplacacarro", "pdv ctrl placa carro")),
      controlarPlayer: csvPainelSimNao(csvCol(ix, cols, "pdvctrlplayer", "pdv ctrl player")),
      controlarPlaylist: csvPainelSimNao(csvCol(ix, cols, "pdvctrlplaylists", "pdv ctrl playlists")),
      statusPlayer: csvPainelStatusPlayer(csvCol(ix, cols, "pdvstatus", "pdv status")),
    };
  }

  return null;
}
