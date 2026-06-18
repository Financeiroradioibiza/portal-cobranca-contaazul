import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { countRejeicoesPorMusica } from "@/lib/criacao/rejeicaoService";
import { applyPendingUploadTags, resolveCriativoIniciais } from "@/lib/criacao/uploadTagService";
import { applyPendingPastaUploads } from "@/lib/criacao/pastaUploadService";

/** Fontes de tags automáticas e seus rótulos curtos (prefixo no chip). */
export const TAG_SOURCE_LABEL: Record<string, string> = {
  lastfm: "LF",
  deezer: "DZ",
  musicbrainz: "MB",
  discogs: "DG",
  local: "AI",
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
  /** URL assinada para tocar a versão de uso direto do cloud2 (null se indisponível). */
  previewUrl: string | null;
  /** Quantos clientes marcaram esta faixa como rejeitada (Wizard IA evita). */
  rejeicoesCount: number;
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

export async function listMusicasBiblioteca(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}): Promise<{ rows: MusicaBibliotecaRow[]; total: number }> {
  await applyPendingUploadTags().catch(() => {});
  await applyPendingPastaUploads().catch(() => {});

  const page = Math.max(1, opts.page);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;

  const where: Prisma.MusicaBibliotecaWhereInput = {};
  if (opts.status && opts.status !== "all") {
    where.status = opts.status as Prisma.MusicaBibliotecaWhereInput["status"];
  }
  const q = opts.search?.trim();
  if (q) {
    where.OR = [
      { titulo: { contains: q, mode: "insensitive" } },
      { artista: { contains: q, mode: "insensitive" } },
      { isrc: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.musicaBiblioteca.findMany({
      where,
      orderBy: [{ artista: "asc" }, { titulo: "asc" }],
      skip,
      take: pageSize,
      include: {
        tagsManuais: { include: { tag: true } },
        versoes: { select: { formato: true } },
      },
    }),
    prisma.musicaBiblioteca.count({ where }),
  ]);

  const rejMap = await countRejeicoesPorMusica(items.map((m) => m.id));

  const criativoEmails = [
    ...new Set(
      items.flatMap((m) =>
        m.tagsManuais.map((tm) => tm.tag.criativoUserId).filter((e): e is string => Boolean(e)),
      ),
    ),
  ];
  const criativoUsers =
    criativoEmails.length > 0 ?
      await prisma.portalUser.findMany({
        where: { email: { in: criativoEmails } },
        select: { email: true, tagIniciais: true, displayName: true },
      })
    : [];
  const criativoUserMap = new Map(criativoUsers.map((u) => [u.email, u]));

  const rows: MusicaBibliotecaRow[] = items.map((m) => {
    const tagsAutoRaw = parseAutoTagsFromJson(m.tagsAuto);
    const tagsAuto = [
      ...filterAutoTags(tagsAutoRaw),
      ...deriveLocalStyleTags(m.bpm, m.energia),
    ];
    const formatoUso = m.versoes.find((v) => v.formato === "mp3_128_mono")?.formato ?? m.versoes[0]?.formato;
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
      previewUrl: formatoUso ? buildPreviewUrl(m.id, formatoUso) : null,
      rejeicoesCount: rejMap.get(m.id) ?? 0,
    };
  });

  return { rows, total };
}
