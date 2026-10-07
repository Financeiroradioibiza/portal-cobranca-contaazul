import { NextResponse } from "next/server";
import { resolveParcelaDanfseMeta } from "@/lib/contaazul/resolveParcelaDanfseMeta";
import { getValidAccessToken } from "@/lib/contaazul/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const meta = await resolveParcelaDanfseMeta(token, id);
  if (!meta) {
    return NextResponse.json(
      { error: "danfse_not_available", message: "Não há NFS-e/DANFSE para esta parcela." },
      { status: 404 },
    );
  }

  return NextResponse.json(meta, {
    headers: { "Cache-Control": "no-store" },
  });
}
