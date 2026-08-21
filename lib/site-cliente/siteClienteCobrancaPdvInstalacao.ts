import { prisma } from "@/lib/prisma";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import { loadSiteClienteCobrancaEscopo } from "@/lib/site-cliente/siteClienteCobrancaEscopo";
import { computePdvPlayStatus, type PdvPlayStatus } from "@/lib/site-cliente/pdvStatus";

export type SiteClienteCobrancaPdvInstalacaoRow = {
  rioPdvKey: string;
  nome: string;
  cnpj: string;
  clienteNome: string;
  cachePercent: number | null;
  status: PdvPlayStatus;
  firstPingAt: string | null;
  lastPingAt: string | null;
  playerVersion: string | null;
  programacaoMusical: string;
};

function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** PDVs das unidades de cobrança do grupo (CNPJ / linha Rio / PDV avulso). */
export async function loadSiteClienteCobrancaPdvInstalacao(
  grupoId: string,
): Promise<SiteClienteCobrancaPdvInstalacaoRow[]> {
  const [escopo, grupoPdvs, dash] = await Promise.all([
    loadSiteClienteCobrancaEscopo(grupoId),
    prisma.siteClienteGrupoPdv.findMany({
      where: { grupoId },
      select: { rioPdvKey: true },
    }),
    getProducaoDashboard(),
  ]);

  const pdvKeys = new Set(grupoPdvs.map((p) => p.rioPdvKey));
  const docDigits = new Set<string>();
  const linhaIds = new Set<string>();

  for (const row of escopo.byCaPersonId.values()) {
    const d = digitsOnly(row.documento);
    if (d.length >= 11) docDigits.add(d);
    const linha = row.rioLinhaId?.trim();
    if (linha) linhaIds.add(linha);
  }

  if (docDigits.size === 0 && linhaIds.size === 0 && pdvKeys.size === 0) {
    return [];
  }

  const now = new Date();
  const rows: SiteClienteCobrancaPdvInstalacaoRow[] = [];
  const seen = new Set<string>();

  for (const cliente of dash.clientes) {
    const clienteMatch =
      linhaIds.has(cliente.key) ||
      (cliente.rioLinhaId && linhaIds.has(cliente.rioLinhaId));

    for (const pdv of cliente.pdvs) {
      if (seen.has(pdv.rioPdvKey)) continue;

      const cnpjDigits = digitsOnly(pdv.cnpj);
      const match =
        pdvKeys.has(pdv.rioPdvKey) ||
        clienteMatch ||
        (cnpjDigits.length >= 11 && docDigits.has(cnpjDigits));

      if (!match) continue;
      seen.add(pdv.rioPdvKey);

      const tel = pdv.telemetry;
      rows.push({
        rioPdvKey: pdv.rioPdvKey,
        nome: pdv.nome,
        cnpj: pdv.cnpj,
        clienteNome: cliente.nome,
        cachePercent: tel.downloadPercent,
        status: computePdvPlayStatus(tel.firstPingAt, tel.lastPingAt, now),
        firstPingAt: tel.firstPingAt,
        lastPingAt: tel.lastPingAt,
        playerVersion: tel.playerVersion,
        programacaoMusical: pdv.programacaoMusical,
      });
    }
  }

  rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return rows;
}
