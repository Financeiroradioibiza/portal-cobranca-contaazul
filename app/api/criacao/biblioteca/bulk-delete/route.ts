import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  bulkDeleteMusicasBiblioteca,
  deleteAllLegacyMusicas,
  deleteAllPreB2Musicas,
} from "@/lib/criacao/bibliotecaService";
import {
  countB2FullMusicas,
  getLegacyDeleteStats,
  getPreB2DeleteStats,
} from "@/lib/criacao/bibliotecaSearchService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "pre_b2") {
      const [stats, keepB2Full] = await Promise.all([getPreB2DeleteStats(), countB2FullMusicas()]);
      return NextResponse.json({ ok: true, scope: "pre_b2", keepB2Full, ...stats });
    }
    const stats = await getLegacyDeleteStats();
    return NextResponse.json({ ok: true, scope: "legacy", ...stats });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/bulk-delete GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());

    const body = (await request.json().catch(() => null)) as
      | { scope?: string; ids?: string[] }
      | null;

    if (body?.scope === "legacy") {
      const result = await deleteAllLegacyMusicas();
      return NextResponse.json({ ok: true, scope: "legacy", ...result });
    }

    if (body?.scope === "pre_b2") {
      const result = await deleteAllPreB2Musicas();
      return NextResponse.json({ ok: true, scope: "pre_b2", ...result });
    }

    const ids = Array.isArray(body?.ids) ? body!.ids.filter((id) => typeof id === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = await bulkDeleteMusicasBiblioteca(ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca/bulk-delete POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
