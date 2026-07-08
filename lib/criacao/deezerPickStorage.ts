import type { DeezerTrackCandidate } from "@/lib/criacao/deezerTrackMatch";

export const DEEZER_PICK_PREFIX = "__DEEZER_PICK__";

export function buildPickErroMsg(candidates: DeezerTrackCandidate[]): string {
  return `${DEEZER_PICK_PREFIX}${JSON.stringify(candidates)}`;
}

export function isPickPendingErroMsg(erroMsg: string): boolean {
  return erroMsg.startsWith(DEEZER_PICK_PREFIX);
}

export function parsePickCandidates(erroMsg: string): DeezerTrackCandidate[] | null {
  if (!isPickPendingErroMsg(erroMsg)) return null;
  try {
    const raw = JSON.parse(erroMsg.slice(DEEZER_PICK_PREFIX.length)) as DeezerTrackCandidate[];
    if (!Array.isArray(raw)) return null;
    return raw.filter((c) => c?.url && c.trackId);
  } catch {
    return null;
  }
}
