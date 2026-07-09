import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  matchServidorUpInventory,
  type ServidorUpInventoryTrack,
} from "@/lib/criacao/servidorUpMatchService";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      tracks?: ServidorUpInventoryTrack[];
    };
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks_obrigatorio" }, { status: 400 });
    }
    if (tracks.length > 500) {
      return NextResponse.json({ error: "limite_500_faixas" }, { status: 400 });
    }
    const result = await matchServidorUpInventory(tracks.slice(0, 500));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/match-inventory POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
