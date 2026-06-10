import type { ProducaoPdvRef, RioLinhaForProducao } from "@/lib/cadastros/producaoHierarchy";

export type SemPainelMotivo = "linha_proxy" | "lista_vinculos";

export type LinhaPdvGap = {
  linhaId: string;
  clienteNome: string;
  numeroPdvSite: number;
  pdvsRegistrados: number;
  faltam: number;
};

export type VinculosReconcileReport = {
  numeroPdvSiteTotal: number;
  pdvsRegistrados: number;
  pdvsSaida: number;
  pdvsAtivosRegistrados: number;
  vinculosTotal: number;
  vinculosLinked: number;
  vinculosUnlinked: number;
  producaoSemPainel: number;
  semPainelLinhaProxy: number;
  semPainelListaVinculos: number;
  linhasComFaltamPdv: LinhaPdvGap[];
  faltamPdvSlots: number;
};

export function semPainelMotivo(pdv: ProducaoPdvRef): SemPainelMotivo | null {
  if (pdv.painelLink) return null;
  return pdv.isLinhaProxy ? "linha_proxy" : "lista_vinculos";
}

export function semPainelMotivoLabel(motivo: SemPainelMotivo): string {
  if (motivo === "linha_proxy") {
    return "fora da lista vínculos (cliente = PDV)";
  }
  return "na lista vínculos";
}

export function buildVinculosReconcileReport(input: {
  linhas: RioLinhaForProducao[];
  vinculosStats: { total: number; linked: number; unlinked: number };
  producaoPdvs: ProducaoPdvRef[];
}): VinculosReconcileReport {
  const { linhas, vinculosStats, producaoPdvs } = input;

  let numeroPdvSiteTotal = 0;
  for (const ln of linhas) {
    if (ln.movimento === "saida") continue;
    numeroPdvSiteTotal += Math.max(0, ln.numeroPdvSite ?? 0);
  }

  let pdvsRegistrados = 0;
  let pdvsSaida = 0;
  let pdvsAtivosRegistrados = 0;
  const linhasComFaltamPdv: LinhaPdvGap[] = [];
  let faltamPdvSlots = 0;

  for (const ln of linhas) {
    const active = ln.pdvs.filter((p) => p.movimento !== "saida");
    const saida = ln.pdvs.filter((p) => p.movimento === "saida");
    pdvsRegistrados += ln.pdvs.length;
    pdvsSaida += saida.length;
    if (ln.movimento !== "saida") pdvsAtivosRegistrados += active.length;

    if (ln.movimento === "saida") continue;
    const nSite = Math.max(0, ln.numeroPdvSite ?? 0);
    const registrados = active.length;
    const esperados = registrados === 0 ? 1 : nSite;
    const faltam = Math.max(0, esperados - registrados);
    if (faltam > 0) {
      const clienteNome = ln.nomeFantasia.trim() || "Sem nome";
      linhasComFaltamPdv.push({
        linhaId: ln.id,
        clienteNome,
        numeroPdvSite: nSite,
        pdvsRegistrados: registrados,
        faltam,
      });
      faltamPdvSlots += faltam;
    }
  }

  const semPainel = producaoPdvs.filter((p) => !p.painelLink);
  const semPainelLinhaProxy = semPainel.filter((p) => p.isLinhaProxy).length;
  const semPainelListaVinculos = semPainel.length - semPainelLinhaProxy;

  return {
    numeroPdvSiteTotal,
    pdvsRegistrados,
    pdvsSaida,
    pdvsAtivosRegistrados,
    vinculosTotal: vinculosStats.total,
    vinculosLinked: vinculosStats.linked,
    vinculosUnlinked: vinculosStats.unlinked,
    producaoSemPainel: semPainel.length,
    semPainelLinhaProxy,
    semPainelListaVinculos,
    linhasComFaltamPdv: linhasComFaltamPdv.sort((a, b) => b.faltam - a.faltam),
    faltamPdvSlots,
  };
}

export function collectProducaoPdvs(
  clientes: Array<{ pdvs: ProducaoPdvRef[] }>,
): ProducaoPdvRef[] {
  const out: ProducaoPdvRef[] = [];
  for (const c of clientes) out.push(...c.pdvs);
  return out;
}
