/**
 * Extrai pares name→value de inputs/textarea do HTML legado CakePHP 2 (name="data[Model][campo]").
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** name completo ex. data[Cliente][foneCliente] → value */
export function scrapeCakeDataFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};

  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    if (/type=["']hidden["']/i.test(tag) && /_method/i.test(tag)) continue;
    const nm = /name=["']([^"']+)["']/i.exec(tag);
    if (!nm || !nm[1].startsWith("data[")) continue;
    if (/type=["']submit["']/i.test(tag) || /type=["']button["']/i.test(tag)) continue;
    if (/type=["']checkbox["']/i.test(tag) && !/\bchecked\b/i.test(tag)) continue;

    const valM = /value=["']([^"']*)["']/i.exec(tag);
    const value = valM ? valM[1] : "";
    out[nm[1]] = decodeEntities(value);
  }

  const taRe = /<textarea\b[^>]*name=["'](data[^"']+)["'][^>]*>([\s\S]*?)<\/textarea>/gi;
  while ((m = taRe.exec(html)) !== null) {
    out[m[1]] = decodeEntities(m[2].trim());
  }

  return out;
}

type IndexedRow = Record<string, string>;

/** Agrupa chaves data[Model][idx][campo] em linhas. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function groupIndexedRows(
  flat: Record<string, string>,
  modelSubstr: string,
): IndexedRow[] {
  const re = new RegExp(
    `^data\\[([^\\]]*${escapeRegex(modelSubstr)}[^\\]]*)\\]\\[(\\d+)\\]\\[([^\\]]+)\\]$`,
    "i",
  );
  const byIndex = new Map<number, IndexedRow>();
  for (const [k, v] of Object.entries(flat)) {
    const mm = re.exec(k);
    if (!mm) continue;
    const idx = Number(mm[2]);
    const field = mm[3];
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    byIndex.get(idx)![field] = v;
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
    .filter((row) => Object.keys(row).length > 0);
}

/** Mesmo modelo exato Cake: data[Pdv][0][campo] */
export function groupIndexedRowsExactModel(
  flat: Record<string, string>,
  model: string,
): IndexedRow[] {
  const re = new RegExp(
    `^data\\[${escapeRegex(model)}\\]\\[(\\d+)\\]\\[([^\\]]+)\\]$`,
    "i",
  );
  const byIndex = new Map<number, IndexedRow>();
  for (const [k, v] of Object.entries(flat)) {
    const mm = re.exec(k);
    if (!mm) continue;
    const idx = Number(mm[1]);
    const field = mm[2];
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    byIndex.get(idx)![field] = v;
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
    .filter((row) => Object.keys(row).length > 0);
}

export function pickFirst(
  flat: Record<string, string>,
  model: string,
  fields: string[],
): string {
  for (const f of fields) {
    const key = `data[${model}][${f}]`;
    const v = flat[key]?.trim();
    if (v) return v;
  }
  return "";
}

/** Varre qualquer data[...][campo] sem índice para o model exato. */
export function pickFromModel(
  flat: Record<string, string>,
  model: string,
  fields: string[],
): string {
  const direct = pickFirst(flat, model, fields);
  if (direct) return direct;
  const prefix = `data[${model}][`;
  for (const [k, v] of Object.entries(flat)) {
    if (!k.startsWith(prefix)) continue;
    const inner = k.slice(prefix.length);
    const field = inner.replace(/\]$/, "");
    if (!fields.includes(field)) continue;
    if (v?.trim()) return v.trim();
  }
  return "";
}
