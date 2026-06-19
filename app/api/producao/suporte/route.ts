import { NextResponse } from "next/server";
import { getProducaoSuporte } from "@/lib/cadastros/producaoSuporteService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getProducaoSuporte();
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
