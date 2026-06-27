import { prisma } from "@/lib/prisma";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { buildPreviewUrl, buildUploadPreviewUrl, streamEnabled } from "@/lib/criacao/streamUrl";

export type DuplicataCompareData = {
  itemId: string;
  arquivoNome: string;
  uploadPreviewUrl: string | null;
  existente: {
    id: string;
    titulo: string;
    artista: string;
    durationMs: number | null;
    previewUrl: string | null;
  } | null;
};

export async function getDuplicataCompare(itemId: string): Promise<DuplicataCompareData | null> {
  const item = await prisma.processamentoItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      arquivoNome: true,
      status: true,
      rawStorageKey: true,
      duplicataDeId: true,
    },
  });
  if (!item || item.status !== "duplicata") return null;

  const uploadPreviewUrl = streamEnabled() ? buildUploadPreviewUrl(item.id) : null;

  let existente: DuplicataCompareData["existente"] = null;
  const existenteId = item.duplicataDeId;
  if (existenteId) {
    const musica = await prisma.musicaBiblioteca.findUnique({
      where: { id: existenteId },
      select: {
        id: true,
        titulo: true,
        artista: true,
        durationMs: true,
        versoes: { select: { formato: true } },
      },
    });
    if (musica) {
      const formatoUso = pickLowestPreviewFormato(musica.versoes);
      existente = {
        id: musica.id,
        titulo: musica.titulo,
        artista: musica.artista,
        durationMs: musica.durationMs,
        previewUrl: formatoUso && streamEnabled() ? buildPreviewUrl(musica.id, formatoUso) : null,
      };
    }
  }

  return {
    itemId: item.id,
    arquivoNome: item.arquivoNome,
    uploadPreviewUrl,
    existente,
  };
}
