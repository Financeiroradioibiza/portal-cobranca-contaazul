import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BibliotecaListFilter = "all" | "unused" | "leastUsed";

export type BibliotecaFacetTag = {
  id: string;
  nome: string;
  cor: string;
  criativoNome: string;
  usoCount: number;
};

/** Top 5 tags manuais mais usadas em programações (pastas de clientes). */
export async function getBibliotecaFacets(): Promise<{ topTags: BibliotecaFacetTag[] }> {
  const rows = await prisma.$queryRaw<
    { id: string; nome: string; cor: string; criativo_nome: string; uso_count: number }[]
  >`
    SELECT t.id, t.nome, t.cor, t.criativo_nome, COUNT(DISTINCT p.programacao_id)::int AS uso_count
      FROM tag_criativo t
      JOIN musica_tag_manual mt ON mt.tag_id = t.id
      JOIN pasta_musica pm ON pm.musica_id = mt.musica_id
      JOIN pasta p ON p.id = pm.pasta_id
     GROUP BY t.id, t.nome, t.cor, t.criativo_nome
     ORDER BY uso_count DESC, t.nome ASC
     LIMIT 5`;

  return {
    topTags: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      cor: r.cor,
      criativoNome: r.criativo_nome,
      usoCount: r.uso_count,
    })),
  };
}

type UsageListOpts = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  tagId?: string;
  gravadora?: string;
  listFilter: "unused" | "leastUsed";
};

/** Lista com filtro de uso em programações (não usadas / menos usadas). */
export async function listMusicaIdsByUsageFilter(
  opts: UsageListOpts,
): Promise<{ ids: string[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;

  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (opts.status && opts.status !== "all") {
    conditions.push(Prisma.sql`m.status = ${opts.status}::"MusicaProcessStatus"`);
  }

  const q = opts.search?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(Prisma.sql`(
      m.titulo ILIKE ${like}
      OR m.artista ILIKE ${like}
      OR COALESCE(m.isrc, '') ILIKE ${like}
      OR COALESCE(m.tom, '') ILIKE ${like}
      OR m.tags_auto::text ILIKE ${like}
    )`);
  }

  if (opts.tagId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM musica_tag_manual mt WHERE mt.musica_id = m.id AND mt.tag_id = ${opts.tagId}
    )`);
  }

  const grav = opts.gravadora?.trim();
  if (grav) {
    const like = `%${grav}%`;
    conditions.push(Prisma.sql`m.tags_auto::text ILIKE ${like}`);
  }

  if (opts.listFilter === "unused") {
    conditions.push(Prisma.sql`COALESCE(u.n, 0) = 0`);
  }

  const whereSql = Prisma.join(conditions, " AND ");
  const orderSql =
    opts.listFilter === "leastUsed" ?
      Prisma.sql`COALESCE(u.n, 0) ASC, m.artista ASC, m.titulo ASC`
    : Prisma.sql`m.artista ASC, m.titulo ASC`;

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id
        FROM musica_biblioteca m
        LEFT JOIN (
          SELECT pm.musica_id, COUNT(DISTINCT p.programacao_id)::int AS n
            FROM pasta_musica pm
            JOIN pasta p ON p.id = pm.pasta_id
           GROUP BY pm.musica_id
        ) u ON u.musica_id = m.id
       WHERE ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ${pageSize} OFFSET ${skip}`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM musica_biblioteca m
        LEFT JOIN (
          SELECT pm.musica_id, COUNT(DISTINCT p.programacao_id)::int AS n
            FROM pasta_musica pm
            JOIN pasta p ON p.id = pm.pasta_id
           GROUP BY pm.musica_id
        ) u ON u.musica_id = m.id
       WHERE ${whereSql}`,
  ]);

  return {
    ids: idRows.map((r) => r.id),
    total: Number(countRows[0]?.total ?? 0),
  };
}
