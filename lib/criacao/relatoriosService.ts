import { prisma } from "@/lib/prisma";

export type RelatorioLimit = 10 | 50 | 100;

export type RelatorioRow = {
  label: string;
  count: number;
  meta?: string;
};

function parseLimit(raw: string | null): RelatorioLimit {
  const n = Number(raw);
  if (n === 50 || n === 100) return n;
  return 10;
}

export function relatorioLimitFromQuery(raw: string | null): RelatorioLimit {
  return parseLimit(raw);
}

export async function topGravadoras(limit: RelatorioLimit): Promise<RelatorioRow[]> {
  const rows = await prisma.$queryRaw<{ label: string; count: number }[]>`
    SELECT COALESCE(NULLIF(TRIM(elem->>'valor'), ''), '(sem gravadora)') AS label,
           COUNT(DISTINCT p.programacao_id)::int AS count
      FROM musica_biblioteca m
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.tags_auto, '[]'::jsonb)) elem
      JOIN pasta_musica pm ON pm.musica_id = m.id
      JOIN pasta p ON p.id = pm.pasta_id
     WHERE elem->>'chave' ILIKE '%label%'
        OR elem->>'chave' ILIKE '%gravadora%'
     GROUP BY label
     HAVING COUNT(DISTINCT p.programacao_id) > 0
     ORDER BY count DESC, label ASC
     LIMIT ${limit}`;

  return rows.map((r) => ({ label: r.label, count: r.count }));
}

export async function topArtistas(limit: RelatorioLimit): Promise<RelatorioRow[]> {
  const rows = await prisma.$queryRaw<{ label: string; count: number }[]>`
    SELECT COALESCE(NULLIF(TRIM(m.artista), ''), '(sem artista)') AS label,
           COUNT(DISTINCT p.programacao_id)::int AS count
      FROM musica_biblioteca m
      JOIN pasta_musica pm ON pm.musica_id = m.id
      JOIN pasta p ON p.id = pm.pasta_id
     GROUP BY label
     ORDER BY count DESC, label ASC
     LIMIT ${limit}`;

  return rows.map((r) => ({ label: r.label, count: r.count }));
}

export async function topMusicas(limit: RelatorioLimit): Promise<RelatorioRow[]> {
  const rows = await prisma.$queryRaw<{ titulo: string; artista: string; count: number }[]>`
    SELECT m.titulo, m.artista, COUNT(DISTINCT p.programacao_id)::int AS count
      FROM musica_biblioteca m
      JOIN pasta_musica pm ON pm.musica_id = m.id
      JOIN pasta p ON p.id = pm.pasta_id
     GROUP BY m.id, m.titulo, m.artista
     ORDER BY count DESC, m.artista ASC, m.titulo ASC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    label: r.titulo.trim() || "(sem título)",
    meta: r.artista.trim() || "—",
    count: r.count,
  }));
}

export async function topTagsCriativo(limit: RelatorioLimit): Promise<RelatorioRow[]> {
  const rows = await prisma.$queryRaw<{ nome: string; criativo_nome: string; cor: string; count: number }[]>`
    SELECT t.nome, t.criativo_nome, t.cor, COUNT(DISTINCT p.programacao_id)::int AS count
      FROM tag_criativo t
      JOIN musica_tag mt ON mt.tag_id = t.id
      JOIN pasta_musica pm ON pm.musica_id = mt.musica_id
      JOIN pasta p ON p.id = pm.pasta_id
     GROUP BY t.id, t.nome, t.criativo_nome, t.cor
     ORDER BY count DESC, t.criativo_nome ASC, t.nome ASC
     LIMIT ${limit}`;

  return rows.map((r) => ({
    label: r.criativo_nome.trim() ? `[${r.criativo_nome.trim()}] ${r.nome}` : r.nome,
    meta: r.cor,
    count: r.count,
  }));
}

export type RelatorioTipo = "gravadoras" | "artistas" | "musicas" | "tags";

export async function fetchRelatorio(
  tipo: RelatorioTipo,
  limit: RelatorioLimit,
): Promise<RelatorioRow[]> {
  switch (tipo) {
    case "gravadoras":
      return topGravadoras(limit);
    case "artistas":
      return topArtistas(limit);
    case "musicas":
      return topMusicas(limit);
    case "tags":
      return topTagsCriativo(limit);
  }
}
