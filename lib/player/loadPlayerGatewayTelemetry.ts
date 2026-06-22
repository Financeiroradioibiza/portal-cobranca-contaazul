import { cloud2Enabled, cloud2FetchWithTimeout } from "@/lib/criacao/cloud2Client";
import type { DashboardPdvTelemetry } from "@/lib/cadastros/producaoDashboardService";

export type GatewayPdvTelemetry = {
  firstPingAt: string | null;
  lastPingAt: string | null;
  playerVersion: string | null;
  downloadPercent: number | null;
};

export type LoadPlayerGatewayTelemetryResult = {
  ok: boolean;
  byPdvId: Map<number, GatewayPdvTelemetry>;
  pingsToday: number | null;
};

type TelemetryApiRow = {
  pdvId?: number;
  firstPingAt?: string | null;
  lastPingAt?: string | null;
  playerVersion?: string | null;
  downloadPercent?: number | null;
};

const CHUNK_SIZE = 250;

function parseTelemetryRow(raw: TelemetryApiRow): GatewayPdvTelemetry | null {
  const pdvId = Number(raw.pdvId);
  if (!Number.isFinite(pdvId) || pdvId <= 0) return null;
  const downloadPercent =
    raw.downloadPercent == null ? null : Math.min(100, Math.max(0, Math.round(raw.downloadPercent)));
  return {
    firstPingAt: raw.firstPingAt ?? null,
    lastPingAt: raw.lastPingAt ?? null,
    playerVersion: raw.playerVersion?.trim() || null,
    downloadPercent,
  };
}

/** Telemetria do Player 5 via cloud2 (`ping_log` + `atualizadas`). */
export async function loadPlayerGatewayTelemetry(
  portalPdvIds: number[],
): Promise<LoadPlayerGatewayTelemetryResult> {
  const unique = [...new Set(portalPdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0 || !cloud2Enabled()) {
    return { ok: false, byPdvId: new Map(), pingsToday: null };
  }

  const byPdvId = new Map<number, GatewayPdvTelemetry>();
  let pingsToday: number | null = null;
  let anyOk = false;

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const res = await cloud2FetchWithTimeout(
      "/player/telemetry",
      {
        method: "POST",
        body: JSON.stringify({ pdvIds: chunk }),
      },
      12000,
    );
    if (!res?.ok) continue;
    anyOk = true;

    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      pdvs?: TelemetryApiRow[];
      pingsToday?: number | null;
    } | null;
    if (!json?.ok || !Array.isArray(json.pdvs)) continue;

    if (json.pingsToday != null && Number.isFinite(json.pingsToday)) {
      pingsToday = (pingsToday ?? 0) + Math.trunc(json.pingsToday);
    }

    for (const row of json.pdvs) {
      const parsed = parseTelemetryRow(row);
      if (parsed && row.pdvId != null) byPdvId.set(row.pdvId, parsed);
    }
  }

  return { ok: anyOk, byPdvId, pingsToday };
}

export function mergeGatewayTelemetry(
  portalPdvId: number | null,
  gateway: Map<number, GatewayPdvTelemetry>,
  fallbackVersion: string | null,
): DashboardPdvTelemetry {
  const gw = portalPdvId != null ? gateway.get(portalPdvId) : undefined;
  const lastPingAt = gw?.lastPingAt ?? null;
  const isOnline =
    lastPingAt != null ? Date.now() - new Date(lastPingAt).getTime() <= 90 * 60 * 1000 : null;

  return {
    firstPingAt: gw?.firstPingAt ?? null,
    lastPingAt,
    playerVersion: gw?.playerVersion ?? fallbackVersion,
    downloadPercent: gw?.downloadPercent ?? null,
    isOnline,
  };
}
