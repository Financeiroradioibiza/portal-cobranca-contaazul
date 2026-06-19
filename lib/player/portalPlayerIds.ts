/** Primeiro ID de cliente no Player (100, 101, …). */
export const PORTAL_CLIENTE_ID_START = 100;

/** Multiplicador: PDV 100.001 → armazenado como 100001. */
export const PORTAL_PDV_SEQ_MULTIPLIER = 1000;

export type PortalPlayerIdBrief = {
  portalClienteId: number;
  portalPdvId: number;
};

export function buildPortalPdvId(portalClienteId: number, seq: number): number {
  return portalClienteId * PORTAL_PDV_SEQ_MULTIPLIER + seq;
}

export function portalClienteIdFromPdvId(portalPdvId: number): number {
  return Math.floor(portalPdvId / PORTAL_PDV_SEQ_MULTIPLIER);
}

export function portalPdvSeqFromPdvId(portalPdvId: number): number {
  return portalPdvId % PORTAL_PDV_SEQ_MULTIPLIER;
}

/** Ex.: 100001 → "100.001" */
export function formatPortalPdvIdDisplay(portalPdvId: number): string {
  const clienteId = portalClienteIdFromPdvId(portalPdvId);
  const seq = portalPdvSeqFromPdvId(portalPdvId);
  return `${clienteId}.${String(seq).padStart(3, "0")}`;
}

/** Ex.: "100.001" → 100001 */
export function parsePortalPdvDisplay(display: string): number | null {
  const m = /^(\d+)\.(\d{1,3})$/.exec(display.trim());
  if (!m) return null;
  const clienteId = Number(m[1]);
  const seq = Number(m[2]);
  if (!Number.isFinite(clienteId) || !Number.isFinite(seq) || seq <= 0 || seq >= PORTAL_PDV_SEQ_MULTIPLIER) {
    return null;
  }
  return buildPortalPdvId(clienteId, seq);
}

/** PDV virtual quando o cliente Rio ainda não tem filhos PDV. */
export function proxyPortalPdvId(portalClienteId: number): number {
  return buildPortalPdvId(portalClienteId, 1);
}
