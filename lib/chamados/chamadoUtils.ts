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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
