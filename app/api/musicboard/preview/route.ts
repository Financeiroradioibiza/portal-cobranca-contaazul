import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getMusicboardConfig } from "@/lib/musicboard/musicboardConfigService";
import type { MusicboardPeriodo } from "@/lib/musicboard/musicboardConfigService";
import { buildMusicboardRewindData } from "@/lib/musicboard/musicboardDataService";
import { renderRewindHtml } from "@/lib/musicboard/rewindTemplate";

export const runtime = "nodejs";

function parseId(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parsePeriodo(raw: string | null): MusicboardPeriodo | undefined {
  if (raw === "3m" || raw === "6m") return raw;
  return undefined;
}

/** GET /api/musicboard/preview?portalClienteId=&period= — HTML + dados do REWIND. */
export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const portalClienteId = parseId(url.searchParams.get("portalClienteId"));
    if (portalClienteId == null) {
      return NextResponse.json({ ok: false, error: "cliente_invalido" }, { status: 400 });
    }

    const periodoOverride = parsePeriodo(url.searchParams.get("period"));
    const config = await getMusicboardConfig(portalClienteId);
    const data = await buildMusicboardRewindData({
      portalClienteId,
      config,
      periodoOverride,
    });
    const html = renderRewindHtml(data);

    return NextResponse.json({ ok: true, data, html });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "cliente_nao_encontrado") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    console.error("[musicboard/preview GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
