import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  deleteSiteClienteLogo,
  getSiteClienteLogoBase64,
  saveSiteClienteLogo,
} from "@/lib/site-cliente/clienteLogoService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ grupoId: string; rioLinhaId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId, rioLinhaId } = await ctx.params;
    const scopeKey = decodeURIComponent(rioLinhaId);
    const url = new URL(_req.url);
    const portalClienteIdRaw = url.searchParams.get("portalClienteId");
    const portalClienteId = portalClienteIdRaw ? parseInt(portalClienteIdRaw, 10) : null;
    const jpegBase64 = await getSiteClienteLogoBase64(
      grupoId,
      scopeKey,
      Number.isFinite(portalClienteId) ? portalClienteId : null,
    );
    return NextResponse.json({ ok: true, hasLogo: Boolean(jpegBase64), jpegBase64 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/logo GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId, rioLinhaId } = await ctx.params;
    const scopeKey = decodeURIComponent(rioLinhaId);
    const body = (await req.json()) as {
      jpegBase64?: string;
      dataUrl?: string;
      portalClienteId?: number | null;
    };
    const raw =
      typeof body.jpegBase64 === "string"
        ? body.jpegBase64
        : typeof body.dataUrl === "string"
          ? body.dataUrl
          : "";
    if (!raw.trim()) {
      return NextResponse.json({ ok: false, error: "missing_image" }, { status: 400 });
    }
    await saveSiteClienteLogo(grupoId, scopeKey, body.portalClienteId ?? null, raw);
    if (cloud2Enabled() && body.portalClienteId) {
      await syncPlayerGatewayRegistry().catch(() => null);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "save_falhou";
    console.error("[suporte/site-clientes/logo PUT]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { grupoId, rioLinhaId } = await ctx.params;
    const scopeKey = decodeURIComponent(rioLinhaId);
    const url = new URL(req.url);
    const portalClienteIdRaw = url.searchParams.get("portalClienteId");
    const portalClienteId = portalClienteIdRaw ? parseInt(portalClienteIdRaw, 10) : null;
    await deleteSiteClienteLogo(
      grupoId,
      scopeKey,
      Number.isFinite(portalClienteId) ? portalClienteId : null,
    );
    if (cloud2Enabled() && portalClienteId) {
      await syncPlayerGatewayRegistry().catch(() => null);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/site-clientes/logo DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
