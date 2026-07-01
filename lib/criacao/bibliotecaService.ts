import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { countRejeicoesPorMusica } from "@/lib/criacao/rejeicaoService";
import { applyPendingUploadTags, resolveCriativoIniciais } from "@/lib/criacao/uploadTagService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";
import {
  extractExplicitApiStatus,
  isGeminiExplicitTagged,
  type ExplicitApiStatus,
} from "@/lib/criacao/explicitContentCore";

/** Fontes de tags automáticas e seus rótulos curtos (prefixo no chip). */
export const TAG_SOURCE_LABEL: Record<string, string> = {
  lastfm: "LF",
  deezer: "DZ",
  musicbrainz: "MB",
  discogs: "DG",
  local: "AI",
  moderacao: "EXP",
};

export type AutoTag = { fonte: string; chave?: string; valor: string };

export type MusicaTagManualView = {
  id: string;
  nome: string;
  cor: string;
  criativoIniciais: string;
  criativoNome: string;
};

export type MusicaBibliotecaRow = {
  id: string;
  titulo: string;
  artista: string;
  ano: number | null;
  durationMs: number | null;
  isrc: string | null;
  bpm: number | null;
  tom: string | null;
  energia: number | null;
  gravadora: string;
  status: string;
  mixSegundosFinais: number | null;
  tagsManuais: MusicaTagManualView[];
  tagsAuto: AutoTag[];
  /** EXP vermelho — só Gemini (3ª camada). */
  explicit: boolean;
  explicitDeezer: ExplicitApiStatus;
  explicitMusicbrainz: ExplicitApiStatus;
  explicitGemini: ExplicitApiStatus;
  /** URL assinada para tocar a versão de uso direto do cloud2 (null se indisponível). */
  previewUrl: string | null;
  /** Quantos clientes marcaram esta faixa como rejeitada (Wizard IA evita). */
  rejeicoesCount: number;
  /** Em quantas programações (clientes) a faixa aparece em pastas. */
  programacoesCount: number;
};

export function parseAutoTagsFromJson(raw: Prisma.JsonValue | null): AutoTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (t && typeof t === "object" && !Array.isArray(t)) {
        const o = t as Record<string, unknown>;
        const valor = o.valor != null ? String(o.valor) : "";
        if (!valor) return null;
        return {
          fonte: o.fonte != null ? String(o.fonte) : "local",
          chave: o.chave != null ? String(o.chave) : undefined,
          valor,
        } as AutoTag;
      }
      return null;
    })
    .filter((t): t is AutoTag => t !== null);
}

export function filterAutoTags(auto: AutoTag[]): AutoTag[] {
  return auto.filter((t) => {
    if (t.fonte === "moderacao" && (t.chave === "explicit" || t.chave === "explicit_texto")) {
      return false;
    }
    if (
      (t.fonte === "deezer" || t.fonte === "musicbrainz" || t.fonte === "gemini") &&
      t.chave === "explicit"
    ) {
      return false;
    }
    if (t.fonte === "deezer") {
      if (t.chave === "album") return false;
      // Oculta títulos de álbum longos (mantém ano, BPM numérico, ISRC curto)
      if (!t.chave && !/^\d{1,4}$/.test(t.valor) && t.valor.length > 12) return false;
    }
    if (t.fonte === "local" && (t.chave === "energia" || t.valor.toLowerCase().startsWith("energia"))) {
      return false;
    }
    return true;
  });
}

/** Mood/estilo derivados de BPM e energia (análise local). */
export function deriveLocalStyleTags(bpm: number | null, energia: number | null): AutoTag[] {
  const out: AutoTag[] = [];
  if (energia != null) {
    const e = energia;
    const mood =
      e < 0.35 ? "Calmo"
      : e < 0.55 ? "Moderado"
      : e < 0.75 ? "Animado"
      : "Alta energia";
    out.push({ fonte: "local", chave: "mood", valor: mood });
  }
  if (bpm != null) {
    const estilo =
      bpm < 90 ? "Lento"
      : bpm < 120 ? "Mid-tempo"
      : bpm < 140 ? "Upbeat"
      : "Dance";
    out.push({ fonte: "local", chave: "estilo", valor: estilo });
  }
  return out;
}

/** Extrai a gravadora das tags automáticas (MusicBrainz/Discogs) quando houver. */
function extractGravadora(auto: AutoTag[]): string {
  const hit = auto.find(
    (t) =>
      (t.chave ?? "").toLowerCase().includes("label") ||
      (t.chave ?? "").toLowerCase().includes("gravadora"),
  );
  return hit?.valor ?? "";
}

type MusicaDbRow = {
  id: string;
  titulo: string;
  artista: string;
  ano: number | null;
  durationMs: number | null;
  isrc: string | null;
  bpm: number | null;
  tom: string | null;
  energia: number | null;
  status: string;
  mixSegundosFinais: number | null;
  tagsAuto: Prisma.JsonValue;
  tagsManuais: Array<{
    tag: {
      id: string;
      nome: string;
      cor: string;
      criativoUserId: string | null;
      criativoNome: string;
    };
  }>;
  versoes: Array<{ formato: string }>;
};

async function countProgramacoesPorMusica(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRaw<{ musica_id: string; n: bigint }[]>`
    SELECT pm.musica_id, COUNT(DISTINCT p.programacao_id)::bigint AS n
      FROM pasta_musica pm
      JOIN pasta p ON p.id = pm.pasta_id
     WHERE pm.musica_id IN (${Prisma.join(ids)})
     GROUP BY pm.musica_id`;
  for (const r of rows) map.set(r.musica_id, Number(r.n));
  return map;
}

function appendDerivedStyleSearch(
  or: NonNullable<Prisma.MusicaBibliotecaWhereInput["OR"]>,
  q: string,
): void {
  const l = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const rules: Array<{ keys: string[]; where: Prisma.MusicaBibliotecaWhereInput }> = [
    { keys: ["calmo"], where: { energia: { lt: 0.35 } } },
    {
      keys: ["moderado"],
      where: { AND: [{ energia: { gte: 0.35 } }, { energia: { lt: 0.55 } }] },
    },
    {
      keys: ["animado"],
      where: { AND: [{ energia: { gte: 0.55 } }, { energia: { lt: 0.75 } }] },
    },
    { keys: ["alta energia", "altaenergia"], where: { energia: { gte: 0.75 } } },
    { keys: ["lento"], where: { bpm: { lt: 90 } } },
    {
      keys: ["mid-tempo", "midtempo", "mid tempo"],
      where: { AND: [{ bpm: { gte: 90 } }, { bpm: { lt: 120 } }] },
    },
    {
      keys: ["upbeat"],
      where: { AND: [{ bpm: { gte: 120 } }, { bpm: { lt: 140 } }] },
    },
    { keys: ["dance"], where: { bpm: { gte: 140 } } },
  ];
  for (const rule of rules) {
    if (rule.keys.some((k) => l.includes(k.replace(/\s/g, "")) || l.includes(k))) {
      or.push(rule.where);
    }
  }
}

/** OR clauses compartilhadas: título, artista, tags, mood/BPM, pasta/programação. */
export function buildBibliotecaSearchOr(q: string): NonNullable<Prisma.MusicaBibliotecaWhereInput["OR"]> {
  const or: NonNullable<Prisma.MusicaBibliotecaWhereInput["OR"]> = [
    { titulo: { contains: q, mode: "insensitive" } },
    { artista: { contains: q, mode: "insensitive" } },
    { isrc: { contains: q, mode: "insensitive" } },
    { tom: { contains: q, mode: "insensitive" } },
    { tagsAuto: { string_contains: q } },
    {
      tagsManuais: {
        some: {
          tag: {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { criativoNome: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    },
    {
      pastas: {
        some: {
          pasta: {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              {
                programacao: {
                  OR: [
                    { nome: { contains: q, mode: "insensitive" } },
                    { clienteNome: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  ];
  const bpm = Number.parseInt(q, 10);
  if (Number.isFinite(bpm) && String(bpm) === q.replace(/\s/g, "")) {
    or.push({ bpm });
  }
  appendDerivedStyleSearch(or, q);
  return or;
}

function buildSearchWhere(q: string): Prisma.MusicaBibliotecaWhereInput["OR"] {
  return buildBibliotecaSearchOr(q);
}

function mapMusicaToRow(
  m: MusicaDbRow,
  criativoUserMap: Map<string, { tagIniciais: string | null; displayName: string | null }>,
  rejMap: Map<string, number>,
  progMap: Map<string, number>,
): MusicaBibliotecaRow {
  const tagsAutoRaw = parseAutoTagsFromJson(m.tagsAuto);
  const tagsAuto = [...filterAutoTags(tagsAutoRaw), ...deriveLocalStyleTags(m.bpm, m.energia)];
  const formatoUso = pickLowestPreviewFormato(m.versoes);
  return {
    id: m.id,
    titulo: m.titulo,
    artista: m.artista,
    ano: m.ano,
    durationMs: m.durationMs,
    isrc: m.isrc,
    bpm: m.bpm,
    tom: m.tom,
    energia: m.energia,
    gravadora: extractGravadora(tagsAutoRaw),
    status: m.status,
    mixSegundosFinais: m.mixSegundosFinais,
    tagsManuais: m.tagsManuais.map((tm) => {
      const u = tm.tag.criativoUserId ? criativoUserMap.get(tm.tag.criativoUserId) : undefined;
      const criativoNome = tm.tag.criativoNome || u?.displayName || "";
      return {
        id: tm.tag.id,
        nome: tm.tag.nome,
        cor: tm.tag.cor,
        criativoIniciais: resolveCriativoIniciais(u?.tagIniciais, criativoNome, tm.tag.criativoUserId),
        criativoNome,
      };
    }),
    tagsAuto,
    explicit: isGeminiExplicitTagged(tagsAutoRaw),
    explicitDeezer: extractExplicitApiStatus(tagsAutoRaw, "deezer"),
    explicitMusicbrainz: extractExplicitApiStatus(tagsAutoRaw, "musicbrainz"),
    explicitGemini: extractExplicitApiStatus(tagsAutoRaw, "gemini"),
    previewUrl: formatoUso ? buildPreviewUrl(m.id, formatoUso) : null,
    rejeicoesCount: rejMap.get(m.id) ?? 0,
    programacoesCount: progMap.get(m.id) ?? 0,
  };
}

async function loadCriativoUserMap(
  items: MusicaDbRow[],
): Promise<Map<string, { tagIniciais: string | null; displayName: string | null }>> {
  const criativoEmails = [
    ...new Set(
      items.flatMap((m) =>
        m.tagsManuais.map((tm) => tm.tag.criativoUserId).filter((e): e is string => Boolean(e)),
      ),
    ),
  ];
  if (criativoEmails.length === 0) return new Map();
  const criativoUsers = await prisma.portalUser.findMany({
    where: { email: { in: criativoEmails } },
    select: { email: true, tagIniciais: true, displayName: true },
  });
  return new Map(criativoUsers.map((u) => [u.email, u]));
}

const musicaInclude = {
  tagsManuais: { include: { tag: true } },
  versoes: { select: { formato: true } },
} as const;

export type BibliotecaListFilter = import("@/lib/criacao/bibliotecaSearchService").BibliotecaListFilter;

export async function listMusicasBiblioteca(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  tagId?: string;
  gravadora?: string;
  listFilter?: BibliotecaListFilter;
  /** Só use true após upload — evita travar a listagem. */
  syncPending?: boolean;
}): Promise<{ rows: MusicaBibliotecaRow[]; total: number }> {
  if (opts.syncPending) {
    await applyPendingUploadTags().catch(() => {});
    await applyPendingPastaUploads().catch(() => {});
  }

  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;
  const listFilter = opts.listFilter ?? "all";

  const where: Prisma.MusicaBibliotecaWhereInput = {};
  if (opts.status && opts.status !== "all") {
    where.status = opts.status as Prisma.MusicaBibliotecaWhereInput["status"];
  }
  const q = opts.search?.trim();
  if (q) {
    where.OR = buildSearchWhere(q);
  }
  if (opts.tagId) {
    where.tagsManuais = { some: { tagId: opts.tagId } };
  }
  const grav = opts.gravadora?.trim();
  if (grav) {
    where.tagsAuto = { string_contains: grav };
  }

  let items: MusicaDbRow[];
  let total: number;

  if (listFilter === "unused" || listFilter === "leastUsed") {
    const { listMusicaIdsByUsageFilter } = await import("@/lib/criacao/bibliotecaSearchService");
    const usage = await listMusicaIdsByUsageFilter({
      page,
      pageSize,
      search: opts.search,
      status: opts.status,
      tagId: opts.tagId,
      gravadora: opts.gravadora,
      listFilter,
    });
    total = usage.total;
    if (usage.ids.length === 0) {
      items = [];
    } else {
      const fetched = await prisma.musicaBiblioteca.findMany({
        where: { id: { in: usage.ids } },
        include: musicaInclude,
      });
      const byId = new Map(fetched.map((m) => [m.id, m]));
      items = usage.ids
        .map((id) => byId.get(id))
        .filter((m): m is NonNullable<typeof m> => m != null) as MusicaDbRow[];
    }
  } else {
    [items, total] = await Promise.all([
      prisma.musicaBiblioteca.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        include: musicaInclude,
      }),
      prisma.musicaBiblioteca.count({ where }),
    ]);
  }

  const ids = items.map((m) => m.id);
  const [rejMap, progMap, criativoUserMap] = await Promise.all([
    countRejeicoesPorMusica(ids),
    countProgramacoesPorMusica(ids),
    loadCriativoUserMap(items),
  ]);

  const rows = items.map((m) => mapMusicaToRow(m, criativoUserMap, rejMap, progMap));

  return { rows, total };
}

export async function getMusicaBibliotecaRow(musicaId: string): Promise<MusicaBibliotecaRow> {
  const m = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    include: musicaInclude,
  });
  if (!m) throw new Error("not_found");

  const [rejMap, progMap, criativoUserMap] = await Promise.all([
    countRejeicoesPorMusica([m.id]),
    countProgramacoesPorMusica([m.id]),
    loadCriativoUserMap([m]),
  ]);

  return mapMusicaToRow(m, criativoUserMap, rejMap, progMap);
}

export type MusicaDeleteInfo = {
  id: string;
  titulo: string;
  artista: string;
  pastasCount: number;
  programacoesCount: number;
};

export async function getMusicaDeleteInfo(musicaId: string): Promise<MusicaDeleteInfo> {
  const musica = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true, titulo: true, artista: true },
  });
  if (!musica) throw new Error("not_found");

  const pastas = await prisma.pastaMusica.findMany({
    where: { musicaId },
    select: { pasta: { select: { programacaoId: true } } },
  });
  const programacoesCount = new Set(pastas.map((p) => p.pasta.programacaoId)).size;

  return {
    id: musica.id,
    titulo: musica.titulo,
    artista: musica.artista,
    pastasCount: pastas.length,
    programacoesCount,
  };
}

export async function deleteMusicaBiblioteca(musicaId: string): Promise<void> {
  const exists = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true },
  });
  if (!exists) throw new Error("not_found");

  const { cloud2Enabled, cloud2FetchWithTimeout } = await import("@/lib/criacao/cloud2Client");
  if (cloud2Enabled()) {
    const res = await cloud2FetchWithTimeout(`/biblioteca/${musicaId}`, { method: "DELETE" }, 15000);
    if (res && !res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      console.warn("[deleteMusicaBiblioteca] cloud2:", data?.error ?? res.status);
    }
  }

  await prisma.musicaBiblioteca.delete({ where: { id: musicaId } });
}

export async function refreshMusicaInternetTags(
  musicaId: string,
): Promise<{ updated: boolean; gravadora: string }> {
  const m = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true, titulo: true, artista: true, isrc: true, tagsAuto: true },
  });
  if (!m) throw new Error("not_found");

  const {
    extractGravadoraFromTags,
    fetchDeezerExplicit,
    fetchLabelTags,
    fetchMusicBrainzExplicit,
    mergeExternalTags,
    parseTagsFromJson,
  } = await import("@/lib/criacao/tagEnrichmentCore");
  const { mergeApiExplicitCheck } = await import("@/lib/criacao/explicitContentCore");

  const beforeSig = JSON.stringify(parseTagsFromJson(m.tagsAuto));
  let merged = parseTagsFromJson(m.tagsAuto);

  const labels = await fetchLabelTags({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  if (labels.length > 0) merged = mergeExternalTags(merged, labels);

  const deezer = await fetchDeezerExplicit({ titulo: m.titulo, artista: m.artista });
  const musicbrainz = await fetchMusicBrainzExplicit({
    titulo: m.titulo,
    artista: m.artista,
    isrc: m.isrc,
  });
  merged = mergeApiExplicitCheck(merged, { deezer, musicbrainz });

  const afterSig = JSON.stringify(merged);
  if (beforeSig === afterSig) {
    return { updated: false, gravadora: extractGravadoraFromTags(merged) };
  }

  await prisma.musicaBiblioteca.update({
    where: { id: m.id },
    data: { tagsAuto: merged as import("@prisma/client").Prisma.InputJsonValue },
  });

  return { updated: true, gravadora: extractGravadoraFromTags(merged) };
}
