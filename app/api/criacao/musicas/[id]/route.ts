import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { updateFaixaEdicao } from "@/lib/criacao/edicaoService";
import { cloud2Enabled, cloud2Fetch, parseCloud2Json } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      mixSegundosFinais?: number | null;
      trimInicioMs?: number | null;
      trimFimMs?: number | null;
    };
    const ok = await updateFaixaEdicao(id, body);
    if (!ok) return NextResponse.json({ ok: false });

    const trimChanged = "trimInicioMs" in body || "trimFimMs" in body;
    if (trimChanged && cloud2Enabled()) {
      try {
        const res = await cloud2Fetch("/reprocess-edicao", {
          method: "POST",
          body: JSON.stringify({ musicaId: id }),
        });
        const data = await parseCloud2Json<{ ok?: boolean; error?: string }>(res, "reprocess_edicao");
        if (!res.ok || !data.ok) {
          return NextResponse.json(
            { ok: true, reprocessOk: false, reprocessError: data.error ?? "reprocess_falhou" },
          );
        }
        return NextResponse.json({ ok: true, reprocessOk: true });
      } catch (e) {
        console.error("[criacao/musicas/:id PATCH] reprocess", e);
        return NextResponse.json({ ok: true, reprocessOk: false, reprocessError: "reprocess_falhou" });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/musicas/:id PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
