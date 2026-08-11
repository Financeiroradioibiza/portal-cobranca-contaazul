import { NextResponse } from "next/server";
import { getSiteClienteSession } from "@/lib/site-cliente/siteClienteRequest";
import { getSiteClienteLogoBase64 } from "@/lib/site-cliente/clienteLogoService";
import { loadGrupoScopeKeys } from "@/lib/site-cliente/siteClienteLogoAccess";
import { bufferFromStoredBase64 } from "@/lib/player/clienteLogotipoService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioLinhaId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const session = await getSiteClienteSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const scopeKey = decodeURIComponent((await ctx.params).rioLinhaId);
    const allowed = await loadGrupoScopeKeys(session.grupoId);
    if (!allowed.has(scopeKey)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const layout = await getProducaoCatalogLayout();
    const portalClienteId = layout.portalClienteIdsByBucketKey[scopeKey] ?? null;

    const jpegBase64 = await getSiteClienteLogoBase64(
      session.grupoId,
      scopeKey,
      portalClienteId,
    );
    if (!jpegBase64) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const buf = bufferFromStoredBase64(jpegBase64);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[site-cliente/logo GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
