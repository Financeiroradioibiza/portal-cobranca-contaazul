import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; atualizacaoId: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  void ctx;
  return NextResponse.json(
    {
      error: "restore_desativado",
      message:
        "Restaurar programação inteira a partir do log foi desativado. Use Biblioteca → OFFs para recuperar faixas de um OFF antigo.",
    },
    { status: 410 },
  );
}
