import fs from "fs";
import path from "path";

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

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeSearch(s: string): string {
  return stripDiacritics(s.trim().toLowerCase()).replace(/\s+/g, " ");
}

/** Remove pontuacao forte para fuzzy match */
export function compactAlphaNum(s: string): string {
  return normalizeSearch(s).replace(/[^\p{L}\p{N}]+/gu, "");
}

export function tokenize(term: string): string[] {
  const n = normalizeSearch(term);
  return n.split(/\s+/).filter((t) => {
    const c = compactAlphaNum(t);
    return c.length >= 2;
  });
}

/** Todos tokens (>=2 caracteres cada) devem aparecer no texto compactado */
export function fuzzyContainsAllHaystack(blobC: string, tokens: string[]): boolean {
  if (tokens.length === 0) return blobC.length >= 2;
  return tokens.every((t) => blobC.includes(compactAlphaNum(t)));
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
      const blobPdv = compactAlphaNum(`${m.nome} ${m.rz} ${pnom} ${cid} ${pdvid}`);
      pdvs.push({
        pdvId: pdvid,
        clienteId: cid,
        nomeCliente: m.nome || nome || "",
        pdvNome: pnom.trim(),
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
