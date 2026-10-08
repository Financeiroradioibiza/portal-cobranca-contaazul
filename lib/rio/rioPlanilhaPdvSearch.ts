import { onlyDigits } from "@/lib/format";
import type { RioLinhaCb, RioPdvCb } from "@/components/rio/ClienteMarcaBlock";

export type RioPlanilhaPdvHit = {
  linhaId: string;
  pdvId: string;
  pdvNome: string;
  clienteNome: string;
  marcaNome: string;
  /** Visível na lista expandida padrão (sem saída). */
  ocultoNaLista: boolean;
  motivoOculto?: string;
};

function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function pdvOcultoNaLista(p: RioPdvCb): { oculto: boolean; motivo?: string } {
  if ((p.movimento ?? "estavel") === "saida") {
    return { oculto: true, motivo: "mov. saída" };
  }
  if (p.dataSaidaTexto?.trim()) {
    return { oculto: true, motivo: "com data saída" };
  }
  return { oculto: false };
}

function pdvMatchesQuery(p: RioPdvCb, ln: RioLinhaCb, qNorm: string, qDigits: string): boolean {
  const parts = [p.nome, p.notes, p.documento ?? "", ln.nomeFantasia, ln.razaoSocial, ln.grupoSite, ln.documento ?? ""];
  if (parts.some((t) => normText(t).includes(qNorm))) return true;
  if (qDigits.length >= 4) {
    const pdvDoc = onlyDigits(p.documento ?? "");
    const lnDoc = onlyDigits(ln.documento ?? "");
    if (pdvDoc.includes(qDigits) || lnDoc.includes(qDigits)) return true;
  }
  return false;
}

/** Busca PDVs em todas as linhas (inclui encerrados / mov. saída). */
export function searchRioPlanilhaPdvs(
  linhas: RioLinhaCb[],
  query: string,
  opts?: { limit?: number },
): RioPlanilhaPdvHit[] {
  const qNorm = normText(query);
  if (qNorm.length < 2) return [];
  const qDigits = onlyDigits(query);
  const limit = opts?.limit ?? 40;
  const out: RioPlanilhaPdvHit[] = [];
  const seen = new Set<string>();

  for (const ln of linhas) {
    const marcaNome = ln.grupo?.nome?.trim() || "Sem MARCA";
    for (const p of ln.pdvs) {
      if (!pdvMatchesQuery(p, ln, qNorm, qDigits)) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const { oculto, motivo } = pdvOcultoNaLista(p);
      out.push({
        linhaId: ln.id,
        pdvId: p.id,
        pdvNome: p.nome.trim() || "(sem nome)",
        clienteNome: ln.nomeFantasia.trim() || "(cliente)",
        marcaNome,
        ocultoNaLista: oculto,
        motivoOculto: motivo,
      });
    }
  }

  out.sort((a, b) =>
    `${a.clienteNome}\0${a.pdvNome}`.localeCompare(`${b.clienteNome}\0${b.pdvNome}`, "pt-BR", {
      sensitivity: "base",
    }),
  );
  return out.slice(0, limit);
}
