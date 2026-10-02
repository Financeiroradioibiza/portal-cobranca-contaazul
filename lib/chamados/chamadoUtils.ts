import type { Chamado } from "@prisma/client";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";

export function parseStringArrayJson(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function serializeStringArray(arr: string[]): string {
  return JSON.stringify([...new Set(arr.map((s) => s.trim()).filter(Boolean))]);
}

const PRAZO_TZ = "America/Sao_Paulo";

/** YYYY-MM-DD (São Paulo) — padrão ao abrir formulário de chamado. */
export function defaultPrazoLimiteInput(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAZO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function prazoLimiteInputFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: PRAZO_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Converte YYYY-MM-DD ou ISO para Date (meio-dia em São Paulo evita mudar o dia na grade). */
export function parsePrazoEntregaInput(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00-03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function chamadoToView(row: Chamado): ChamadoView {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao,
    status: row.status,
    prioridade: row.prioridade,
    setores: parseStringArrayJson(row.setoresJson),
    responsaveis: parseStringArrayJson(row.responsaveisJson),
    criadoPorEmail: row.criadoPorEmail,
    criadoPorNome: row.criadoPorNome,
    fechadoPorEmail: row.fechadoPorEmail,
    fechadoPorNome: row.fechadoPorNome,
    fechadoEm: row.fechadoEm?.toISOString() ?? null,
    rioLinhaId: row.rioLinhaId,
    rioPdvKey: row.rioPdvKey,
    clienteNome: row.clienteNome,
    prazoEntrega: row.prazoEntrega?.toISOString() ?? null,
    templateKind: row.templateKind,
    sequenciaGrupoId: row.sequenciaGrupoId,
    sequenciaPasso: row.sequenciaPasso,
    sequenciaTotal: row.sequenciaTotal,
    sequenciaRotulo: row.sequenciaRotulo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
