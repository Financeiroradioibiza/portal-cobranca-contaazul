import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  bulkDeleteMusicasBiblioteca,
  deleteAllLegacyMusicas,
} from "@/lib/criacao/bibliotecaService";
import { getLegacyDeleteStats } from "@/lib/criacao/bibliotecaSearchService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const stats = await getLegacyDeleteStats();
    return NextResponse.json({ ok: true, ...stats });
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
      return NextResponse.json({ ok: true, ...result });
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
