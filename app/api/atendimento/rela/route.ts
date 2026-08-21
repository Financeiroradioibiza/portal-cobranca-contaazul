import { NextResponse } from "next/server";
import { buildAtendimentoRelaPayload } from "@/lib/atendimento/relaService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await buildAtendimentoRelaPayload();
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
