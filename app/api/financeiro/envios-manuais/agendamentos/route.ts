import { NextResponse } from "next/server";
import { listEnvioManualAgendamentos, replaceEnvioManualAgendamentos } from "@/lib/enviosManuais/agendamentoStore";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";
import type { EnvioManualAgendamentoDto } from "@/lib/enviosManuais/types";

export const runtime = "nodejs";

function parseAgendamentosBody(raw: unknown): EnvioManualAgendamentoDto[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "agendamentos_not_array" };
  const out: EnvioManualAgendamentoDto[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return { error: "bad_row" };
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    if (!id) return { error: "missing_id" };
    const tipo = r.tipo === "grupo" ? "grupo" : "individual";
    out.push({
      id,
      tipo,
      client: String(r.client ?? r.clientLabel ?? "").trim() || "Cliente",
      clienteId: typeof r.clienteId === "string" ? r.clienteId.trim() || null : null,
      day: typeof r.day === "number" ? r.day : 5,
      rec: Boolean(r.rec),
      emails: Array.isArray(r.emails) ? r.emails.filter((e): e is string => typeof e === "string") : [],
      msg: String(r.msg ?? r.mensagem ?? ""),
      colorIdx: typeof r.colorIdx === "number" ? r.colorIdx : 0,
      sent: Boolean(r.sent),
      grupoClientes:
        Array.isArray(r.grupoClientes) ?
          r.grupoClientes
            .map((c) => {
              if (typeof c !== "object" || c === null) return null;
              const o = c as Record<string, unknown>;
              const cid = String(o.id ?? "").trim();
              const nome = String(o.nome ?? o.name ?? "").trim();
              return cid && nome ? { id: cid, nome } : null;
            })
            .filter((x): x is { id: string; nome: string } => x !== null)
        : null,
    });
  }
  return out;
}

export async function GET() {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;
  const agendamentos = await listEnvioManualAgendamentos();
  return NextResponse.json({ ok: true, agendamentos });
}

export async function PUT(request: Request) {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const parsed = parseAgendamentosBody((body as { agendamentos?: unknown }).agendamentos);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const total = await replaceEnvioManualAgendamentos(parsed);
  return NextResponse.json({ ok: true, total });
}
