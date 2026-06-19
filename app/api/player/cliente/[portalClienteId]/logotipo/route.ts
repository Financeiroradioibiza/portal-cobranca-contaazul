import { NextResponse } from "next/server";
import { requirePortalSession, getPortalSession } from "@/lib/auth/portalAccess";
import {
  deleteClienteLogotipo,
  getClienteLogotipoBase64,
  saveClienteLogotipoFromBase64,
} from "@/lib/player/clienteLogotipoService";
import { parsePortalPlayerNumericId } from "@/lib/suporte/playerAvisoService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ portalClienteId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { portalClienteId: raw } = await context.params;
  const id = parsePortalPlayerNumericId(raw);
  if (id == null) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const jpegBase64 = await getClienteLogotipoBase64(id);
  return NextResponse.json({ ok: true, hasLogo: Boolean(jpegBase64), jpegBase64 });
}

export async function POST(request: Request, context: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { portalClienteId: raw } = await context.params;
  const id = parsePortalPlayerNumericId(raw);
  if (id == null) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const jpegBase64 =
    typeof body.jpegBase64 === "string" ? body.jpegBase64
    : typeof body.dataUrl === "string" ? body.dataUrl
    : "";
  if (!jpegBase64.trim()) {
    return NextResponse.json({ ok: false, error: "missing_image" }, { status: 400 });
  }

  try {
    await saveClienteLogotipoFromBase64(id, jpegBase64);
    if (cloud2Enabled()) {
      await syncPlayerGatewayRegistry().catch(() => null);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_falhou";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { portalClienteId: raw } = await context.params;
  const id = parsePortalPlayerNumericId(raw);
  if (id == null) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  await deleteClienteLogotipo(id);
  if (cloud2Enabled()) {
    await syncPlayerGatewayRegistry().catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
