import { prisma } from "@/lib/prisma";
import { listPrimeiroPingRows } from "@/lib/cadastros/primeiroPingService";
import { listPortalPlayerRows } from "@/lib/player/listPortalPlayerRows";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { displayBrazilianTaxId } from "@/lib/format";

export type ToInstaladoRow = {
  id: string;
  instaladoEm: string;
  clienteNome: string;
  pdvNome: string;
  cnpj: string;
  codigoDisplay: string;
  portalPdvId: number;
  contato: string;
  primeiroPingEm: string | null;
};

function formatContato(nome: string, tel: string, email: string): string {
  const parts = [nome.trim(), tel.trim(), email.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function formatPrimeiroPing(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export { formatPrimeiroPing as formatToInstaladoPrimeiroPing };

/** Sincroniza linhas a partir de `producao_pdv_cadastro.player_instalado_em` (backfill + novas instalações). */
export async function syncToInstaladoLogFromCadastros(): Promise<number> {
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { playerInstaladoEm: { not: null } },
    select: {
      rioPdvKey: true,
      nome: true,
      cnpj: true,
      contatoLojaNome: true,
      contatoLojaTelefone: true,
      contatoLojaEmail: true,
      playerInstaladoEm: true,
    },
  });
  if (cadastros.length === 0) return 0;

  const { rows: portalRows } = await listPortalPlayerRows();
  const portalByRioKey = new Map(
    portalRows
      .filter((r) => r.portalPlayerId)
      .map((r) => [r.rioPdvId, r]),
  );

  let inserted = 0;
  for (const cad of cadastros) {
    const instaladoEm = cad.playerInstaladoEm!;
    const exists = await prisma.pdvInstalacaoConcluidaLog.findUnique({
      where: {
        rioPdvKey_instaladoEm: {
          rioPdvKey: cad.rioPdvKey,
          instaladoEm,
        },
      },
      select: { id: true },
    });
    if (exists) continue;

    const portal = portalByRioKey.get(cad.rioPdvKey);
    const portalPdvId = portal?.portalPlayerId?.portalPdvId;
    const portalClienteId = portal?.portalPlayerId?.portalClienteId;
    if (portal == null || portalPdvId == null || portalClienteId == null) continue;

    await prisma.pdvInstalacaoConcluidaLog.create({
      data: {
        rioPdvKey: cad.rioPdvKey,
        portalClienteId,
        portalPdvId,
        clienteNome: portal.clienteNome.trim() || "Cliente",
        pdvNome: portal.rioPdvNome.trim() || cad.nome.trim() || "PDV",
        cnpj: cad.cnpj.trim(),
        contatoLojaNome: cad.contatoLojaNome.trim(),
        contatoLojaTelefone: cad.contatoLojaTelefone.trim(),
        contatoLojaEmail: cad.contatoLojaEmail.trim(),
        codigoDisplay: formatPortalPdvIdDisplay(portalPdvId),
        instaladoEm,
      },
    });
    inserted++;
  }
  return inserted;
}

async function enrichPrimeiroPingEm(): Promise<void> {
  const pingRes = await listPrimeiroPingRows();
  if (!pingRes.ok) return;

  const byPdvId = new Map(pingRes.rows.map((r) => [r.pdvId, r.firstPingAt]));
  const pending = await prisma.pdvInstalacaoConcluidaLog.findMany({
    where: { primeiroPingEm: null },
    select: { id: true, portalPdvId: true },
    take: 200,
  });

  await Promise.all(
    pending.map(async (row) => {
      const iso = byPdvId.get(row.portalPdvId);
      if (!iso) return;
      await prisma.pdvInstalacaoConcluidaLog.update({
        where: { id: row.id },
        data: { primeiroPingEm: new Date(iso) },
      });
    }),
  );
}

export async function listToInstaladoRows(): Promise<{
  rows: ToInstaladoRow[];
  synced: number;
}> {
  const synced = await syncToInstaladoLogFromCadastros();
  await enrichPrimeiroPingEm();

  const logs = await prisma.pdvInstalacaoConcluidaLog.findMany({
    orderBy: { instaladoEm: "desc" },
    take: 500,
  });

  const rows: ToInstaladoRow[] = logs.map((log) => ({
    id: log.id,
    instaladoEm: log.instaladoEm.toISOString(),
    clienteNome: log.clienteNome.trim() || "—",
    pdvNome: log.pdvNome.trim() || "—",
    cnpj: displayBrazilianTaxId(log.cnpj),
    codigoDisplay: log.codigoDisplay.trim() || formatPortalPdvIdDisplay(log.portalPdvId),
    portalPdvId: log.portalPdvId,
    contato: formatContato(log.contatoLojaNome, log.contatoLojaTelefone, log.contatoLojaEmail),
    primeiroPingEm: log.primeiroPingEm?.toISOString() ?? null,
  }));

  return { rows, synced };
}
