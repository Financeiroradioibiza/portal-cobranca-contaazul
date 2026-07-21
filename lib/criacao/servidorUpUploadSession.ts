import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";

export const SERVIDOR_UP_UPLOAD_SESSION_KEY = "servidorUpUploadSession";
/** Job Deemix mais recente desta sessão (evita reabrir snapshot antigo). */
export const SERVIDOR_UP_ACTIVE_DEEMIX_JOB_KEY = "servidorUpActiveDeemixJobId";
/** Usuário pediu a lista de jobs (Sair) — não reabrir automaticamente pelo job do Download link. */
export const SERVIDOR_UP_MULTI_UPLOAD_MANUAL_PICK_KEY = "servidorUpMultiUploadManualPick";
/** Hierarquia + match no browser — vincula a um job Deemix depois do download. */
export const SERVIDOR_UP_WORKFLOW_DRAFT_KEY = "servidorUpWorkflowDraft";

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

export type ServidorUpWorkflowDraft = {
  rootPath: string;
  titulo: string;
  hierarchyRows: ServidorUpHierarchyRow[];
  drafts: Record<string, ServidorUpUploadDraft>;
  tracks: ServidorUpUploadTrack[];
  matchPicks: Record<string, number>;
  skippedPaths: string[];
  savedAt: number;
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

export function readServidorUpWorkflowDraft(): ServidorUpWorkflowDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SERVIDOR_UP_WORKFLOW_DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ServidorUpWorkflowDraft;
    if (!Array.isArray(data.hierarchyRows) || !Array.isArray(data.tracks)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeServidorUpWorkflowDraft(draft: ServidorUpWorkflowDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SERVIDOR_UP_WORKFLOW_DRAFT_KEY, JSON.stringify(draft));
}

export function setActiveDeemixJobId(jobId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SERVIDOR_UP_ACTIVE_DEEMIX_JOB_KEY, jobId.trim());
}

export function readActiveDeemixJobId(): string | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(SERVIDOR_UP_ACTIVE_DEEMIX_JOB_KEY)?.trim();
  return v || null;
}

export function markServidorUpMultiUploadManualPick(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SERVIDOR_UP_MULTI_UPLOAD_MANUAL_PICK_KEY, "1");
}

export function readServidorUpMultiUploadManualPick(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SERVIDOR_UP_MULTI_UPLOAD_MANUAL_PICK_KEY) === "1";
}

export function clearServidorUpMultiUploadManualPick(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SERVIDOR_UP_MULTI_UPLOAD_MANUAL_PICK_KEY);
}

/** Monta sessão de upload a partir do rascunho + job Deemix concluído. */
export function buildUploadSessionFromDraft(
  downloadJobId: string,
  draft: ServidorUpWorkflowDraft,
): ServidorUpUploadSession {
  return {
    downloadJobId,
    titulo: draft.titulo,
    hierarchyRows: draft.hierarchyRows,
    drafts: draft.drafts,
    tracks: draft.tracks,
    savedAt: Date.now(),
  };
}

export function isUploadSessionStaleForJob(
  session: ServidorUpUploadSession,
  deemixJob: { id: string; itensOk: number; totalItens: number } | undefined,
): boolean {
  if (!deemixJob || deemixJob.id !== session.downloadJobId) return true;
  if (deemixJob.itensOk <= 0) return true;
  const planned = session.tracks?.length ?? 0;
  if (planned > 0 && planned < Math.min(deemixJob.itensOk, deemixJob.totalItens) * 0.6) {
    return true;
  }
  return false;
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
