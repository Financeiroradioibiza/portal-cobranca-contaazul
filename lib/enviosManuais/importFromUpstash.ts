import type { EnvioManualAgendamentoDto } from "@/lib/enviosManuais/types";

type UpstashRow = {
  id?: string;
  client?: string;
  clienteId?: string;
  day?: number;
  rec?: boolean;
  emails?: string[];
  msg?: string;
  colorIdx?: number;
  sent?: boolean;
  tipo?: string;
  grupoClientes?: { id: string; nome: string }[];
};

function decodeKvResult(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return JSON.parse(raw);
  }
}

async function kvGet(key: string): Promise<unknown | null> {
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (!kvUrl || !kvToken) return null;
  const r = await fetch(`${kvUrl}/get/${key}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const json = (await r.json()) as { result?: string | null };
  if (!json.result) return null;
  return decodeKvResult(json.result);
}

export function mapUpstashAgendamentos(raw: unknown): EnvioManualAgendamentoDto[] {
  if (!Array.isArray(raw)) return [];
  const out: EnvioManualAgendamentoDto[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as UpstashRow;
    const id = String(r.id ?? `import-${out.length}`).trim();
    if (!id) continue;
    out.push({
      id,
      tipo: r.tipo === "grupo" ? "grupo" : "individual",
      client: String(r.client ?? "").trim() || "Cliente",
      clienteId: r.clienteId?.trim() || null,
      day: typeof r.day === "number" && r.day >= 1 && r.day <= 31 ? r.day : 5,
      rec: Boolean(r.rec),
      emails: Array.isArray(r.emails) ? r.emails.filter((e) => typeof e === "string") : [],
      msg: String(r.msg ?? ""),
      colorIdx: typeof r.colorIdx === "number" ? r.colorIdx : 0,
      sent: Boolean(r.sent),
      grupoClientes:
        Array.isArray(r.grupoClientes) ?
          r.grupoClientes
            .map((c) => ({ id: String(c.id ?? "").trim(), nome: String(c.nome ?? "").trim() }))
            .filter((c) => c.id && c.nome)
        : null,
    });
  }
  return out;
}

export async function fetchUpstashAgendamentos(): Promise<EnvioManualAgendamentoDto[]> {
  const data = await kvGet("agendamentos");
  return mapUpstashAgendamentos(data);
}

export async function fetchUpstashLogs(): Promise<
  { client: string; emails: string; ref: string; ok: boolean; aviso?: string | null }[]
> {
  const data = await kvGet("logs_historico");
  if (!Array.isArray(data)) return [];
  const out: { client: string; emails: string; ref: string; ok: boolean; aviso?: string | null }[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    out.push({
      client: String(r.client ?? ""),
      emails: String(r.emails ?? ""),
      ref: String(r.ref ?? r.referencia ?? ""),
      ok: r.ok !== false,
      aviso: r.aviso != null ? String(r.aviso) : null,
    });
  }
  return out;
}
