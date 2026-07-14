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
