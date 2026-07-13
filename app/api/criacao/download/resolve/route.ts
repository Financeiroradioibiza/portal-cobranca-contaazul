import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { parseTrackListText } from "@/lib/criacao/trackListParse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json()) as {
      mode?: "txt";
      text?: string;
    };

    if (body.mode !== "txt") {
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
    }

    const tracks = parseTrackListText(body.text ?? "");
    if (tracks.length === 0) {
      return NextResponse.json({ error: "lista_vazia" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, tracks });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    console.error("[criacao/download/resolve POST]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
