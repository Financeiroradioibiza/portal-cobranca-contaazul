import { NextResponse } from "next/server";
import { extractBoletoAndDocUrls } from "@/lib/contaazul/installmentLinks";
import { fetchInstallmentById } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";

/**
 * GET ?tipo=boleto|nf — consulta detalhes da parcela na Conta Azul e devolve URL para abrir em nova aba.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const tipo = new URL(request.url).searchParams.get("tipo") ?? "boleto";

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const detail = await fetchInstallmentById(token, id);
    const { boletoUrl, docUrl, boletoAnexoId, docAnexoId } = extractBoletoAndDocUrls(detail);
    const url = tipo === "nf" ? docUrl : boletoUrl;
    const anexoId = tipo === "nf" ? docAnexoId : boletoAnexoId;

    if (url) {
      return NextResponse.json({ url });
    }

    if (anexoId) {
      return NextResponse.json({
        url: `/api/contaazul/parcela/${encodeURIComponent(id)}/file?tipo=${tipo === "nf" ? "nf" : "boleto"}`,
        useSameOrigin: true,
      });
    }

    const label = tipo === "nf" ? "nota fiscal / documento" : "boleto ou link de pagamento";
    return NextResponse.json(
      {
        error: "not_found",
        message: `Não há ${label} anexado a esta parcela na Conta Azul.`,
      },
      { status: 404 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
