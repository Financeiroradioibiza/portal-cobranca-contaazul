import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  getMusicboardConfig,
  listMusicboardConfigs,
  upsertMusicboardConfig,
  type MusicboardPeriodo,
} from "@/lib/musicboard/musicboardConfigService";

export const runtime = "nodejs";

function parseId(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parsePeriodo(raw: unknown): MusicboardPeriodo | null {
  return raw === "3m" || raw === "6m" ? raw : null;
}

function parseEmails(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw.filter((x): x is string => typeof x === "string");
}

function actorFrom(session: { email: string; displayName?: string }): string {
  return (session.displayName?.trim() || session.email || "").slice(0, 120);
}

/** GET /api/musicboard/config — lista ou um cliente (?portalClienteId=). */
export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const id = parseId(new URL(request.url).searchParams.get("portalClienteId"));
    if (id != null) {
      const config = await getMusicboardConfig(id);
      return NextResponse.json({ ok: true, config });
    }
    const configs = await listMusicboardConfigs();
    return NextResponse.json({ ok: true, configs });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[musicboard/config GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

/** PUT /api/musicboard/config — cria/atualiza config de um cliente. */
export async function PUT(request: Request) {
  let session;
  try {
    session = requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const portalClienteId =
    typeof body.portalClienteId === "number"
      ? body.portalClienteId
      : parseId(String(body.portalClienteId ?? ""));
  if (portalClienteId == null || portalClienteId <= 0) {
    return NextResponse.json({ ok: false, error: "cliente_invalido" }, { status: 400 });
  }

  const emails = parseEmails(body.emails);
  const periodo = parsePeriodo(body.periodo);

  try {
    const config = await upsertMusicboardConfig({
      portalClienteId,
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(emails != null ? { emails } : {}),
      ...(periodo != null ? { periodo } : {}),
      ...(typeof body.depoimentoTexto === "string" ? { depoimentoTexto: body.depoimentoTexto } : {}),
      ...(typeof body.depoimentoAutor === "string" ? { depoimentoAutor: body.depoimentoAutor } : {}),
      ...(typeof body.narrativaCurador === "string" ? { narrativaCurador: body.narrativaCurador } : {}),
      atualizadoPor: actorFrom(session),
    });
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("[musicboard/config PUT]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
