import { randomUUID } from "node:crypto";

export type ContatoLojaExtra = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
};

export type ContatoLojaResumo = {
  kind: "principal" | "extra";
  id: string;
  label: string;
  nome: string;
  email: string;
  telefone: string;
};

function trimField(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseContatosLojaExtras(json: string | null | undefined): ContatoLojaExtra[] {
  if (!json?.trim()) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: ContatoLojaExtra[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const nome = trimField(o.nome);
      const email = trimField(o.email);
      const telefone = trimField(o.telefone);
      if (!nome && !email && !telefone) continue;
      const id = trimField(o.id) || randomUUID();
      out.push({ id, nome, email, telefone });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeContatosLojaExtras(extras: ContatoLojaExtra[]): string {
  return JSON.stringify(
    extras.map((e) => ({
      id: e.id,
      nome: e.nome.trim(),
      email: e.email.trim(),
      telefone: e.telefone.trim(),
    })),
  );
}

export function contatoLojaFingerprint(
  c: Pick<ContatoLojaExtra, "nome" | "email" | "telefone">,
): string {
  return [c.nome, c.email, c.telefone].map((s) => s.trim().toLowerCase()).join("|");
}

export function findMatchingExtraIndex(
  extras: ContatoLojaExtra[],
  patch: Pick<ContatoLojaExtra, "nome" | "email" | "telefone">,
): number {
  const fp = contatoLojaFingerprint(patch);
  return extras.findIndex((e) => contatoLojaFingerprint(e) === fp);
}

export function listContatosLojaResumo(
  principal: Pick<ContatoLojaExtra, "nome" | "email" | "telefone">,
  extras: ContatoLojaExtra[],
): ContatoLojaResumo[] {
  const rows: ContatoLojaResumo[] = [];
  if (principal.nome.trim() || principal.email.trim() || principal.telefone.trim()) {
    rows.push({
      kind: "principal",
      id: "principal",
      label: "Gerente principal",
      nome: principal.nome.trim(),
      email: principal.email.trim(),
      telefone: principal.telefone.trim(),
    });
  }
  extras.forEach((e, i) => {
    rows.push({
      kind: "extra",
      id: e.id,
      label: `Contato extra ${i + 1}`,
      nome: e.nome.trim(),
      email: e.email.trim(),
      telefone: e.telefone.trim(),
    });
  });
  return rows;
}

export function contatoViewToExtra(c: {
  nomeCompleto?: string;
  email?: string;
  telefoneFixo?: string;
  telefoneMovel?: string;
}): ContatoLojaExtra | null {
  const nome = trimField(c.nomeCompleto);
  const email = trimField(c.email);
  const telParts = [trimField(c.telefoneFixo), trimField(c.telefoneMovel)].filter(Boolean);
  const telefone = telParts.join(" / ");
  if (!nome && !email && !telefone) return null;
  return { id: randomUUID(), nome, email, telefone };
}
