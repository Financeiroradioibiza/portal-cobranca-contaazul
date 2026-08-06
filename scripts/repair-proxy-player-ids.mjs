/**
 * Atribui IDs Player aos proxies «cliente = PDV» em buckets mistos (sem gravar .001 duplicado).
 * Uso: node scripts/repair-proxy-player-ids.mjs [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const PORTAL_PDV_SEQ_MULTIPLIER = 1000;
const LAYOUT_YM = 0;
const dryRun = process.argv.includes("--dry-run");

function formatDisplay(portalPdvId) {
  const clienteId = Math.floor(portalPdvId / PORTAL_PDV_SEQ_MULTIPLIER);
  const seq = portalPdvId % PORTAL_PDV_SEQ_MULTIPLIER;
  return `${clienteId}.${String(seq).padStart(3, "0")}`;
}

function buildPortalPdvId(portalClienteId, seq) {
  return portalClienteId * PORTAL_PDV_SEQ_MULTIPLIER + seq;
}

const prisma = new PrismaClient();

try {
  const layout = await prisma.cadastroProducaoLayout.findUnique({
    where: { yearMonth: LAYOUT_YM },
  });
  if (!layout) throw new Error("layout_not_found");

  const stored = { ...(layout.portalPdvIdsByRioPdvKey ?? {}) };
  const bucketClienteIds = { ...(layout.portalClienteIdsByBucketKey ?? {}) };

  const repairs = [
    {
      rioPdvKey: "linha:cmshjituz000d13qp5n3ga33h",
      nome: "Ofner Shopping Bourbon",
      portalClienteId: 229,
    },
    {
      rioPdvKey: "linha:cmqz6sud8000h3a53obzf83jn",
      nome: "Lacca Barra",
      portalClienteId: 200,
    },
    {
      rioPdvKey: "linha:cmqz6sn020005u0i6tk9nmglo",
      nome: "Lacca Niteroi",
      portalClienteId: 200,
    },
    {
      rioPdvKey: "linha:cmqfjznm90001dv77cpitgq1i",
      nome: "Reserva Campos Dos Goytacazes (F)",
      portalClienteId: 246,
    },
  ];

  function maxSeqForCliente(portalClienteId) {
    let max = 0;
    for (const id of Object.values(stored)) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      if (Math.floor(n / PORTAL_PDV_SEQ_MULTIPLIER) !== portalClienteId) continue;
      max = Math.max(max, n % PORTAL_PDV_SEQ_MULTIPLIER);
    }
    return max;
  }

  const assigned = [];
  for (const item of repairs) {
    if (stored[item.rioPdvKey] != null) {
      console.log("SKIP (já tem ID):", item.nome, formatDisplay(Number(stored[item.rioPdvKey])));
      continue;
    }
    const seq = maxSeqForCliente(item.portalClienteId) + 1;
    const portalPdvId = buildPortalPdvId(item.portalClienteId, seq);
    stored[item.rioPdvKey] = portalPdvId;
    assigned.push({ ...item, portalPdvId, display: formatDisplay(portalPdvId) });
    console.log("ASSIGN:", item.nome, "→", formatDisplay(portalPdvId));
  }

  if (assigned.length === 0) {
    console.log("\nNada a reparar.");
  } else if (dryRun) {
    console.log("\n[dry-run] Não gravou no banco.");
  } else {
    await prisma.cadastroProducaoLayout.update({
      where: { yearMonth: LAYOUT_YM },
      data: { portalPdvIdsByRioPdvKey: stored },
    });
    console.log("\nGravado em cadastro_producao_layout.");
    console.log("Próximo passo: sync gateway para", assigned.map((a) => a.display).join(", "));
  }
} finally {
  await prisma.$disconnect();
}
