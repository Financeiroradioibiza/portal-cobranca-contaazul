import { painelHtml } from "./session";

export type ClienteCandidate = { clienteId: string; textoLinha: string };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Lista candidatos cliente=ID cujo texto na linha contém `nomeBusca`.
 * Ordena pela proximidade (match no início do texto).
 */
export async function resolveClienteNome(
  cookie: string,
  base: string,
  nomeBusca: string,
): Promise<ClienteCandidate[]> {
  const q = nomeBusca.trim();
  if (q.length < 2) {
    throw new Error("Digite pelo menos 2 caracteres para buscar cliente.");
  }

  const tpl =
    process.env.RADIO_PAINEL_CLIENTES_INDEX_SEARCH_PATH?.trim() ||
    "";

  /** Query string inteira já com {q}; senão usar parâmetro buscaCliente padrão. */
  const path =
    tpl.length > 0
      ? tpl.includes("{q}")
        ? tpl.replace(/\{q\}/g, encodeURIComponent(q))
        : `${tpl}${tpl.includes("?") ? "&" : "?"}buscaCliente=${encodeURIComponent(q)}`
      : `/adm/clientes/index?buscaCliente=${encodeURIComponent(q)}`;

  let html = await painelHtml(cookie, base, path);

  /** Fallback: segunda URL comum Cake */
  if (!/\/adm\/clientes\/edit(\?|%3F|\b)/i.test(html) || html.length < 500) {
    const altPath = `/adm/clientes/index?nomeClienteFiltrado=${encodeURIComponent(q)}`;
    try {
      const h2 = await painelHtml(cookie, base, altPath);
      html = h2.length > html.length ? h2 : html;
    } catch {
      /* usa primeiro */
    }
  }

  const want = normalize(q);
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const hits: ClienteCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    const lm = /\/adm\/clientes\/edit\?cliente=(\d+)/i.exec(row);
    if (!lm) continue;
    const texto = row.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalize(texto).includes(want)) continue;

    hits.push({ clienteId: lm[1], textoLinha: texto.slice(0, 380) });
  }

  /** Deduplica por id */
  const seen = new Set<string>();
  const uniq = hits.filter((h) => {
    if (seen.has(h.clienteId)) return false;
    seen.add(h.clienteId);
    return true;
  });

  uniq.sort((a, b) => {
    const na = normalize(a.textoLinha);
    const nb = normalize(b.textoLinha);
    const pa = na.startsWith(want) ? 0 : 1;
    const pb = nb.startsWith(want) ? 0 : 1;
    return pa - pb || a.textoLinha.length - b.textoLinha.length;
  });

  return uniq.slice(0, 25);
}
