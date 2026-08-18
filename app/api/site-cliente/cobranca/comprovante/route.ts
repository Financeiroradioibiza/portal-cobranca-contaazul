import { NextResponse } from "next/server";
import { submitSiteClienteCobrancaComprovante } from "@/lib/site-cliente/siteClienteCobrancaComprovanteService";
import {
  getSiteClienteSession,
  requireSiteClienteSession,
} from "@/lib/site-cliente/siteClienteRequest";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const session = requireSiteClienteSession(await getSiteClienteSession());
    const form = await request.formData();

    const parcelaId = String(form.get("parcelaId") ?? "").trim();
    const caPersonId = String(form.get("caPersonId") ?? "").trim();
    const clienteNome = String(form.get("clienteNome") ?? "").trim();
    const cnpj = String(form.get("cnpj") ?? "").trim();
    const parcelaDue = String(form.get("parcelaDue") ?? "").trim();
    const parcelaSummary = String(form.get("parcelaSummary") ?? "").trim();
    const parcelaValue = Number(String(form.get("parcelaValue") ?? "0").replace(",", "."));

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "arquivo_obrigatorio" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await submitSiteClienteCobrancaComprovante(session, {
      parcelaId,
      caPersonId,
      clienteNome,
      cnpj,
      parcelaDue,
      parcelaSummary,
      parcelaValue,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileBuffer,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) {
      try {
        const body = await e.clone().json();
        return NextResponse.json(body, { status: e.status });
      } catch {
        return e;
      }
    }
    console.error("[site-cliente/cobranca/comprovante POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
