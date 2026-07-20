export type BibliotecaFolderKey =
  | { kind: "all"; label: string }
  | { kind: "tag"; id: string; label: string; cor: string; criativoNome?: string }
  | {
      kind: "custom";
      id: string;
      label: string;
      cor: string;
      icone: string;
      criativoIniciais: string;
      readOnly?: false;
    }
  | { kind: "especial"; id: string; label: string; readOnly: true }
  | {
      kind: "prog";
      id: string;
      label: string;
      programacaoId: string;
      programacaoNome: string;
      clienteNome: string;
      readOnly: true;
    }
  | {
      kind: "off";
      archiveId: string;
      label: string;
      programacaoId: string | null;
      programacaoNome: string;
      clienteNome: string;
      competencia: string;
      readOnly: true;
    };

export function folderKeyToQuery(f: BibliotecaFolderKey): Record<string, string> {
  switch (f.kind) {
    case "tag":
      return { tagId: f.id };
    case "custom":
      return { bibliotecaPastaId: f.id };
    case "especial":
      return { pastaEspecialId: f.id };
    case "prog":
      return { pastaProgramacaoId: f.id };
    case "off":
      return { offArquivoId: f.archiveId };
    default:
      return {};
  }
}

export function folderDropTargetId(f: BibliotecaFolderKey): string | null {
  if (f.kind === "custom") return `bib-pasta-${f.id}`;
  return null;
}

export function parseFolderDropTargetId(id: string): string | null {
  if (id.startsWith("bib-pasta-")) return id.slice("bib-pasta-".length);
  return null;
}

export const BIBLIOTECA_DRAG_MUSICAS = "bib-musicas-drag";
export const BIBLIOTECA_DRAG_MUSICA_PREFIX = "bib-musica-";

export function musicaDragId(musicaId: string): string {
  return `${BIBLIOTECA_DRAG_MUSICA_PREFIX}${musicaId}`;
}

export function parseMusicaDragId(id: string): string | null {
  if (!id.startsWith(BIBLIOTECA_DRAG_MUSICA_PREFIX)) return null;
  const musicaId = id.slice(BIBLIOTECA_DRAG_MUSICA_PREFIX.length);
  return musicaId.trim() ? musicaId : null;
}

export type BibliotecaMusicaDragData = {
  musicaId?: string;
  titulo?: string;
  musicaIds?: string[];
};

/** Spotify-like: arrastar faixa selecionada leva o lote inteiro. */
export function resolveMusicaIdsFromDrag(
  activeId: string | number,
  dragData: BibliotecaMusicaDragData | undefined,
  selectedIds: Set<string>,
): string[] {
  if (Array.isArray(dragData?.musicaIds) && dragData.musicaIds.length > 0) {
    return dragData.musicaIds;
  }
  if (activeId === BIBLIOTECA_DRAG_MUSICAS) {
    return Array.from(selectedIds);
  }
  const one = parseMusicaDragId(String(activeId));
  if (!one) return [];
  if (selectedIds.has(one) && selectedIds.size > 1) {
    return Array.from(selectedIds);
  }
  return [one];
}

export function musicaIdsForDrag(musicaId: string, selectedIds: Set<string> | undefined): string[] {
  if (selectedIds?.has(musicaId) && selectedIds.size > 1) {
    return Array.from(selectedIds);
  }
  return [musicaId];
}
