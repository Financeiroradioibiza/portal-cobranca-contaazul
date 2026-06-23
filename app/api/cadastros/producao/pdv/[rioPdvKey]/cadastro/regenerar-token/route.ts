import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Regeneração de token movida para Suporte → Central de suporte (coluna TOKEN). */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "movido_para_suporte",
      message: "Regerar token está disponível na Central de suporte (coluna TOKEN).",
    },
    { status: 410 },
  );
}
