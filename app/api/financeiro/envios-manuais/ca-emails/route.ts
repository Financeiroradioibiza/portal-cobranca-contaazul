import { NextResponse } from "next/server";
import { fetchCaClienteEmails } from "@/lib/enviosManuais/caEmails";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("clienteId")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_cliente_id" }, { status: 400 });
  }

  try {
    const emails = await fetchCaClienteEmails(auth.token, id);
    return NextResponse.json({ ok: true, emails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ca_fetch_failed";
    return NextResponse.json({ ok: false, error: msg.slice(0, 480) }, { status: 502 });
  }
}
