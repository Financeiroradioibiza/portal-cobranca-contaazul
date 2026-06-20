import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listMusicasBiblioteca } from "@/lib/criacao/bibliotecaService";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
    const search = url.searchParams.get("search") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const tagId = url.searchParams.get("tagId") ?? undefined;
    const gravadora = url.searchParams.get("gravadora") ?? undefined;
    const listFilterRaw = url.searchParams.get("listFilter");
    const listFilter =
      listFilterRaw === "unused" || listFilterRaw === "leastUsed" ? listFilterRaw : "all";

    const { rows, total } = await listMusicasBiblioteca({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 100,
      search,
      status,
      tagId,
      gravadora,
      listFilter,
    });

    return NextResponse.json({ musicas: rows, total });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/biblioteca GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
