import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { cloud2Enabled, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

type Cloud2Result = {
  musicaId: string;
  ok: boolean;
  error?: string;
  mixSegundos?: number;
  trimFimMs?: number;
};

/** POST — reanalisa ponto de mix (fade) das faixas selecionadas no cloud2. Trim é manual. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    if (!cloud2Enabled()) {
      return NextResponse.json({ error: "cloud2_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as { musicaIds?: string[] };
    const musicaIds = [...new Set((body.musicaIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 80);
    if (musicaIds.length === 0) {
      return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 });
    }

    const res = await cloud2FetchWithTimeout(
      "/reanalisar-mix-trim",
      {
        method: "POST",
        body: JSON.stringify({ musicaIds }),
      },
      Math.min(120_000, 15_000 + musicaIds.length * 2000),
    );
    if (!res) {
      return NextResponse.json({ error: "cloud2_timeout" }, { status: 504 });
    }

    const data = await parseCloud2Json<{
      ok?: boolean;
      okCount?: number;
      failCount?: number;
      results?: Cloud2Result[];
    }>(res, "reanalisar_mix_trim");

    const results = data.results ?? [];
    return NextResponse.json({
      ok: true,
      okCount: data.okCount ?? results.filter((r) => r.ok).length,
      failCount: data.failCount ?? results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/edicao/reanalisar-mix-trim POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
