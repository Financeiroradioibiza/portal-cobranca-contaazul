import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  listMusicasRanking,
  listVotosFeed,
  type MusicaRankingSort,
  type MusicaVotoTipo,
} from "@/lib/criacao/musicaVotoService";

export const runtime = "nodejs";

function parseView(raw: string | null): "feed" | "ranking" {
  return raw === "ranking" ? "ranking" : "feed";
}

function parseVotoFilter(raw: string | null): MusicaVotoTipo | "all" {
  const v = raw?.trim().toLowerCase();
  if (v === "like" || v === "dislike") return v;
  return "all";
}

function parseRankingSort(raw: string | null): MusicaRankingSort {
  return raw === "most_disliked" ? "most_disliked" : "most_liked";
}

/** GET /api/clientes/likes — feed cronológico ou ranking por faixa. */
export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const url = new URL(request.url);
    const view = parseView(url.searchParams.get("view"));
    const voto = parseVotoFilter(url.searchParams.get("voto"));
    const sort = parseRankingSort(url.searchParams.get("sort"));
    const limit = Number(url.searchParams.get("limit") ?? "200");

    if (view === "ranking") {
      const ranking = await listMusicasRanking(sort);
      return NextResponse.json({ ok: true, view, sort, ranking });
    }

    const feed = await listVotosFeed({ voto, limit });
    return NextResponse.json({ ok: true, view, voto, feed });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[clientes/likes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
