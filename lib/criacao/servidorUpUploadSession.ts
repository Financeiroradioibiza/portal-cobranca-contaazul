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

/** Grava no navegador e no servidor (sobrevive refresh / outra aba). */
export async function persistServidorUpUploadSession(session: ServidorUpUploadSession): Promise<void> {
  writeServidorUpUploadSession(session);
  try {
    await fetch(`/api/criacao/servidor-up/upload-session/${encodeURIComponent(session.downloadJobId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
  } catch {
    /* offline — sessionStorage ainda vale */
  }
}

export async function fetchServidorUpUploadSession(
  downloadJobId: string,
): Promise<ServidorUpUploadSession | null> {
  try {
    const res = await fetch(
      `/api/criacao/servidor-up/upload-session/${encodeURIComponent(downloadJobId)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: ServidorUpUploadSession };
    return data.session ?? null;
  } catch {
    return null;
  }
}
