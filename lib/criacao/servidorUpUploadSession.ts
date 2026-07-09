import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";

export const SERVIDOR_UP_UPLOAD_SESSION_KEY = "servidorUpUploadSession";

export type ServidorUpUploadDraft = {
  uploadTag: string;
  donoUserId: string;
};

export type ServidorUpUploadTrack = {
  relativePath: string;
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  deezerUrl: string;
};

export type ServidorUpUploadSession = {
  downloadJobId: string;
  titulo: string;
  hierarchyRows: ServidorUpHierarchyRow[];
  drafts: Record<string, ServidorUpUploadDraft>;
  tracks: ServidorUpUploadTrack[];
  savedAt: number;
};

export function readServidorUpUploadSession(): ServidorUpUploadSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SERVIDOR_UP_UPLOAD_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ServidorUpUploadSession;
    if (!data.downloadJobId || !Array.isArray(data.tracks) || !Array.isArray(data.hierarchyRows)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeServidorUpUploadSession(session: ServidorUpUploadSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SERVIDOR_UP_UPLOAD_SESSION_KEY, JSON.stringify(session));
}

export function clearServidorUpUploadSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SERVIDOR_UP_UPLOAD_SESSION_KEY);
}
