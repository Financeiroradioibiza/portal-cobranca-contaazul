import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildPreviewUrl } from "@/lib/criacao/streamUrl";

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
      versoes: { select: { formato: true } },
    },
  });

  return items.map((m) => {
    const formatoUso = m.versoes.find((v) => v.formato === "mp3_128_mono")?.formato ?? m.versoes[0]?.formato;
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
