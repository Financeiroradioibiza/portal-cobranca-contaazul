import "server-only";

import { loadMergedProducaoPlayerContext } from "@/lib/player/producaoPlayerBuckets";
import type { ChamadoProducaoClienteOpcao } from "@/lib/chamados/chamadoProducaoTypes";

export type { ChamadoProducaoClienteOpcao, ChamadoProducaoPdvOpcao } from "@/lib/chamados/chamadoProducaoTypes";
export { tituloChamadoParaCliente, tituloChamadoParaPdv } from "@/lib/chamados/chamadoProducaoTypes";

/** Clientes/PDVs visíveis no catálogo operacional de Produção (não Conta Azul / planilha Rio). */
export async function listChamadoProducaoOpcoes(search?: string): Promise<ChamadoProducaoClienteOpcao[]> {
  const ctx = await loadMergedProducaoPlayerContext();
  let list: ChamadoProducaoClienteOpcao[] = ctx.buckets.map((b) => ({
    key: b.key,
    nome: b.nome.trim() || "Sem nome",
    rioLinhaId: b.rioLinhaId,
    pdvs: b.pdvs.map((p) => ({
      rioPdvKey: p.rioPdvId,
      nome: p.nome.trim() || b.nome.trim() || "PDV",
    })),
  }));

  const q = search?.trim().toLowerCase();
  if (q && q.length >= 1) {
    list = list.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.pdvs.some((p) => p.nome.toLowerCase().includes(q)),
    );
  }

  list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return list;
}
