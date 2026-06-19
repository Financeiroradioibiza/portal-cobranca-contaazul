import { NextResponse } from "next/server";
import { getProducaoCatalogMeta } from "@/lib/cadastros/producaoCatalogo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const meta = await getProducaoCatalogMeta();
    return NextResponse.json({ ok: true, ...meta });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
