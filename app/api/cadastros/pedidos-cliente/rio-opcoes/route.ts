import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  listRioClientesForPedido,
  listRioPdvsForLinha,
} from "@/lib/cadastros/pedidoPdvLookupService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const { searchParams } = new URL(request.url);
    const linhaId = searchParams.get("linhaId")?.trim();

    if (linhaId) {
      const pdvs = await listRioPdvsForLinha(linhaId);
      return NextResponse.json({ ok: true, pdvs });
    }

    const ymRaw = searchParams.get("ym");
    const ym = ymRaw ? Number.parseInt(ymRaw, 10) : undefined;
    const { yearMonth, clientes } = await listRioClientesForPedido(
      Number.isFinite(ym) ? ym : undefined,
    );
    return NextResponse.json({ ok: true, yearMonth, clientes });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[pedidos-cliente rio-opcoes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
