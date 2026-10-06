import { NextResponse } from "next/server";
import { replaceEnvioManualAgendamentos } from "@/lib/enviosManuais/agendamentoStore";
import { mapUpstashAgendamentos } from "@/lib/enviosManuais/importFromUpstash";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";

export const runtime = "nodejs";

/** Importa backup JSON (export do Vercel / Upstash) sem KV no Netlify. */
export async function POST(request: Request) {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const raw =
    typeof body === "object" && body !== null && "agendamentos" in body ?
      (body as { agendamentos: unknown }).agendamentos
    : body;

  const agendamentos = mapUpstashAgendamentos(raw);
  if (!agendamentos.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "json_empty_or_invalid",
        hint: "Envie { \"agendamentos\": [ ... ] } ou um array JSON igual ao export do painel Vercel.",
      },
      { status: 400 },
    );
  }

  const total = await replaceEnvioManualAgendamentos(agendamentos);
  return NextResponse.json({ ok: true, total });
}
