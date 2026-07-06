import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LEGACY_MUSICA_SQL } from "@/lib/criacao/legacyMusicaSql";

export type BibliotecaListFilter = "all" | "unused" | "leastUsed" | "legacy";

export type BibliotecaFacetTag = {
  id: string;
  nome: string;
  cor: string;
  criativoNome: string;
  usoCount: number;
};

export async function countLegacyMusicas(): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total
      FROM musica_biblioteca m
     WHERE ${LEGACY_MUSICA_SQL}`;
  return Number(rows[0]?.total ?? 0);
}

/** Top 5 tags manuais mais usadas em programações (pastas de clientes). */
export async function getBibliotecaFacets(): Promise<{
  topTags: BibliotecaFacetTag[];
  legacyCount: number;
}> {
  const [rows, legacyCount] = await Promise.all([
    prisma.$queryRaw<
      { id: string; nome: string; cor: string; criativo_nome: string; uso_count: number }[]
    >`
      SELECT t.id, t.nome, t.cor, t.criativo_nome, COUNT(DISTINCT p.programacao_id)::int AS uso_count
        FROM tag_criativo t
        JOIN musica_tag_manual mt ON mt.tag_id = t.id
        JOIN pasta_musica pm ON pm.musica_id = mt.musica_id
        JOIN pasta p ON p.id = pm.pasta_id
       GROUP BY t.id, t.nome, t.cor, t.criativo_nome
       ORDER BY uso_count DESC, t.nome ASC
       LIMIT 5`,
    countLegacyMusicas(),
  ]);

  return {
    topTags: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      cor: r.cor,
      criativoNome: r.criativo_nome,
      usoCount: r.uso_count,
    })),
    legacyCount,
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
      Prisma.sql`COALESCE(u.n, 0) ASC, m.created_at DESC`
    : Prisma.sql`m.created_at DESC`;

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

type LegacyListOpts = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  tagId?: string;
  gravadora?: string;
};

function buildLegacyListConditions(opts: LegacyListOpts): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [LEGACY_MUSICA_SQL];

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

  return conditions;
}

/** Lista faixas legadas (pipeline antigo, sem 128 mono / LUFS / master). */
export async function listMusicaIdsByLegacyFilter(
  opts: LegacyListOpts,
): Promise<{ ids: string[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;
  const whereSql = Prisma.join(buildLegacyListConditions(opts), " AND ");

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id
        FROM musica_biblioteca m
       WHERE ${whereSql}
       ORDER BY m.created_at ASC
       LIMIT ${pageSize} OFFSET ${skip}`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
        FROM musica_biblioteca m
       WHERE ${whereSql}`,
  ]);

  return {
    ids: idRows.map((r) => r.id),
    total: Number(countRows[0]?.total ?? 0),
  };
}

/** Todos os IDs legados (para limpeza em lote). */
export async function listAllLegacyMusicaIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m.id
      FROM musica_biblioteca m
     WHERE ${LEGACY_MUSICA_SQL}
     ORDER BY m.created_at ASC`;
  return rows.map((r) => r.id);
}

export type LegacyDeleteStats = {
  total: number;
  emProgramacoes: number;
  emPastas: number;
};

export async function getLegacyDeleteStats(): Promise<LegacyDeleteStats> {
  const rows = await prisma.$queryRaw<
    { total: bigint; em_programacoes: bigint; em_pastas: bigint }[]
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(DISTINCT p.programacao_id)::bigint AS em_programacoes,
      COUNT(pm.pasta_id)::bigint AS em_pastas
      FROM musica_biblioteca m
      LEFT JOIN pasta_musica pm ON pm.musica_id = m.id
      LEFT JOIN pasta p ON p.id = pm.pasta_id
     WHERE ${LEGACY_MUSICA_SQL}`;

  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    emProgramacoes: Number(row?.em_programacoes ?? 0),
    emPastas: Number(row?.em_pastas ?? 0),
  };
}
