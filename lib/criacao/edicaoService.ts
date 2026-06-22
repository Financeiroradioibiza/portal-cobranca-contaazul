import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import {
  deriveLocalStyleTags,
  filterAutoTags,
  parseAutoTagsFromJson,
  type AutoTag,
  type MusicaTagManualView,
} from "@/lib/criacao/bibliotecaService";
import { resolveCriativoIniciais } from "@/lib/criacao/uploadTagService";

export type FaixaEdicaoRow = {
  id: string;
  titulo: string;
  artista: string;
  durationMs: number | null;
  loudnessLufs: number | null;
  mixSegundosFinais: number | null;
  mixAuto: boolean;
  trimInicioMs: number;
  trimFimMs: number;
  previewUrl: string | null;
  tagsManuais: MusicaTagManualView[];
  tagsAuto: AutoTag[];
};

export async function listFaixasEdicao(opts: {
  search?: string;
  limit?: number;
}): Promise<FaixaEdicaoRow[]> {
  const where: Prisma.MusicaBibliotecaWhereInput = { status: "pronta" };
  const q = opts.search?.trim();
  if (q) {
    where.OR = [
      { titulo: { contains: q, mode: "insensitive" } },
      { artista: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.musicaBiblioteca.findMany({
    where,
    orderBy: [{ artista: "asc" }, { titulo: "asc" }],
    take: Math.min(300, Math.max(1, opts.limit ?? 200)),
    select: {
      id: true,
      titulo: true,
      artista: true,
      durationMs: true,
      loudnessLufs: true,
      mixSegundosFinais: true,
      mixAuto: true,
      trimInicioMs: true,
      trimFimMs: true,
      tagsAuto: true,
      bpm: true,
      energia: true,
      versoes: { select: { formato: true } },
      tagsManuais: { include: { tag: true } },
    },
  });

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

  return items.map((m) => {
    const formatoUso = pickLowestPreviewFormato(m.versoes);
    const tagsAutoRaw = parseAutoTagsFromJson(m.tagsAuto);
    const tagsAuto = [...filterAutoTags(tagsAutoRaw), ...deriveLocalStyleTags(m.bpm, m.energia)];
    return {
      id: m.id,
      titulo: m.titulo,
      artista: m.artista,
      durationMs: m.durationMs,
      loudnessLufs: m.loudnessLufs,
      mixSegundosFinais: m.mixSegundosFinais,
      mixAuto: m.mixAuto,
      trimInicioMs: m.trimInicioMs ?? 0,
      trimFimMs: m.trimFimMs ?? 0,
      previewUrl: formatoUso ? buildPreviewUrl(m.id, formatoUso) : null,
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
    };
  });
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Atualiza ponto de mix e trim da faixa canônica. Ajustar o mix marca mixAuto=false
 * (o criativo deu o "tapa"). Trim em ms cortado do início/fim — aplicado na entrega.
 */
export async function updateFaixaEdicao(
  id: string,
  patch: { mixSegundosFinais?: number | null; trimInicioMs?: number | null; trimFimMs?: number | null },
): Promise<boolean> {
  const data: Prisma.MusicaBibliotecaUpdateInput = {};

  if ("mixSegundosFinais" in patch) {
    const mix = clampInt(patch.mixSegundosFinais, 0, 30);
    data.mixSegundosFinais = mix;
    data.mixAuto = false;
  }
  if ("trimInicioMs" in patch) {
    data.trimInicioMs = clampInt(patch.trimInicioMs, 0, 600_000);
  }
  if ("trimFimMs" in patch) {
    data.trimFimMs = clampInt(patch.trimFimMs, 0, 600_000);
  }

  if (Object.keys(data).length === 0) return false;
  await prisma.musicaBiblioteca.update({ where: { id }, data });
  return true;
}
