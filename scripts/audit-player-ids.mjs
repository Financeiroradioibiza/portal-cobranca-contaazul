/** Audita IDs Player duplicados e movimentos recentes. Uso: node scripts/audit-player-ids.mjs */
import { PrismaClient } from "@prisma/client";

const PORTAL_PDV_SEQ_MULTIPLIER = 1000;

function formatDisplay(portalPdvId) {
  const clienteId = Math.floor(portalPdvId / PORTAL_PDV_SEQ_MULTIPLIER);
  const seq = portalPdvId % PORTAL_PDV_SEQ_MULTIPLIER;
  return `${clienteId}.${String(seq).padStart(3, "0")}`;
}

function proxyPortalPdvId(portalClienteId) {
  return portalClienteId * PORTAL_PDV_SEQ_MULTIPLIER + 1;
}

const LINHA_PREFIX = "linha:";

function linhaAsPdvKey(linhaId) {
  return `${LINHA_PREFIX}${linhaId}`;
}

const prisma = new PrismaClient();

try {
  const todayStart = new Date("2026-08-06T03:00:00.000Z"); // 00:00 BRT
  const layout = await prisma.cadastroProducaoLayout.findUnique({
    where: { yearMonth: 0 },
    select: {
      updatedAt: true,
      portalPdvIdsByRioPdvKey: true,
      portalClienteIdsByBucketKey: true,
      pdvPlacements: true,
      clienteNomes: true,
    },
  });

  const stored =
    layout?.portalPdvIdsByRioPdvKey && typeof layout.portalPdvIdsByRioPdvKey === "object"
      ? layout.portalPdvIdsByRioPdvKey
      : {};
  const bucketClienteIds =
    layout?.portalClienteIdsByBucketKey && typeof layout.portalClienteIdsByBucketKey === "object"
      ? layout.portalClienteIdsByBucketKey
      : {};

  console.log("layout.updatedAt:", layout?.updatedAt?.toISOString());

  const byPortalId = new Map();
  for (const [key, id] of Object.entries(stored)) {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) continue;
    const list = byPortalId.get(n) ?? [];
    list.push(key);
    byPortalId.set(n, list);
  }

  const dupStored = [...byPortalId.entries()].filter(([, keys]) => keys.length > 1);
  console.log("\n=== DUPLICATAS GRAVADAS (portalPdvIdsByRioPdvKey) ===");
  if (dupStored.length === 0) console.log("(nenhuma)");
  for (const [id, keys] of dupStored.sort((a, b) => a[0] - b[0])) {
    console.log(formatDisplay(id), "→", keys.join(", "));
  }

  const rioYmRow = await prisma.portalConfig.findUnique({
    where: { chave: "producao.rio_source_ym" },
    select: { valor: true },
  });
  const rioYm = Number(rioYmRow?.valor) || (
    await prisma.rioCompMonth.findFirst({ orderBy: { yearMonth: "desc" }, select: { yearMonth: true } })
  )?.yearMonth;

  if (!rioYm) throw new Error("sem rio source ym");

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: rioYm },
    include: {
      linhas: {
        include: {
          pdvs: { where: { movimento: { not: "saida" } }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  const placements = Array.isArray(layout?.pdvPlacements) ? layout.pdvPlacements : [];
  const placementTarget = new Map();
  for (const o of placements) {
    if (!o?.targetClienteKey) continue;
    for (const id of o.pdvIds ?? o.rioPdvIds ?? []) {
      if (id) placementTarget.set(String(id), o.targetClienteKey);
    }
    if (o.rioLinhaId) placementTarget.set(linhaAsPdvKey(o.rioLinhaId), o.targetClienteKey);
  }

  const buckets = new Map();
  for (const ln of month?.linhas ?? []) {
    if (ln.movimento === "saida") continue;
    const nome = ln.nomeFantasia || ln.razaoSocial || "Sem nome";
    const key = ln.id;
    const portalClienteId = bucketClienteIds[key] ?? null;
    const pdvs = [];
    const active = ln.pdvs.filter((p) => p.movimento !== "saida");
    if (active.length === 0) {
      pdvs.push({
        rioPdvId: linhaAsPdvKey(ln.id),
        nome,
        isLinhaProxy: true,
        rioLinhaId: ln.id,
        createdAt: ln.createdAt,
        updatedAt: ln.updatedAt,
      });
    } else {
      for (const p of active) {
        pdvs.push({
          rioPdvId: p.id,
          nome: p.nome,
          isLinhaProxy: false,
          rioLinhaId: ln.id,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        });
      }
    }
    buckets.set(key, { key, nome, portalClienteId, pdvs });
  }

  for (const [pdvId, targetKey] of placementTarget) {
    let found = null;
    for (const b of buckets.values()) {
      const idx = b.pdvs.findIndex((p) => p.rioPdvId === pdvId);
      if (idx >= 0) {
        found = { bucket: b, pdv: b.pdvs[idx], idx };
        break;
      }
    }
    if (!found) continue;
    const target = buckets.get(targetKey);
    if (!target || target.key === found.bucket.key) continue;
    found.bucket.pdvs.splice(found.idx, 1);
    target.pdvs.push(found.pdv);
  }

  function resolveDisplayId(pdv, bucket) {
    const portalClienteId = bucket.portalClienteId;
    if (portalClienteId == null) return null;
    const s = stored[pdv.rioPdvId];
    if (s != null && Number(s) > 0) return Number(s);
    if (!pdv.isLinhaProxy) return null;
    const reals = bucket.pdvs.filter((p) => !p.isLinhaProxy);
    const proxies = bucket.pdvs.filter((p) => p.isLinhaProxy);
    if (reals.length === 0 && proxies.length === 1) return proxyPortalPdvId(portalClienteId);
    return null;
  }

  function resolveLegacyDisplayId(pdv, bucket) {
    const portalClienteId = bucket.portalClienteId;
    if (portalClienteId == null) return null;
    const s = stored[pdv.rioPdvId];
    if (s != null && Number(s) > 0) return Number(s);
    if (pdv.isLinhaProxy) return proxyPortalPdvId(portalClienteId);
    return null;
  }

  const byDisplayLegacy = new Map();
  const byDisplayNew = new Map();
  const mixedProxyBuckets = [];

  for (const bucket of buckets.values()) {
    if (bucket.pdvs.length === 0) continue;
    const reals = bucket.pdvs.filter((p) => !p.isLinhaProxy);
    const proxies = bucket.pdvs.filter((p) => p.isLinhaProxy);
    if (reals.length > 0 && proxies.length > 0) {
      mixedProxyBuckets.push(bucket);
    }
    for (const p of bucket.pdvs) {
      const legacy = resolveLegacyDisplayId(p, bucket);
      const neu = resolveDisplayId(p, bucket);
      if (legacy != null) {
        const list = byDisplayLegacy.get(legacy) ?? [];
        list.push({ ...p, bucketNome: bucket.nome, portalClienteId: bucket.portalClienteId });
        byDisplayLegacy.set(legacy, list);
      }
      if (neu != null) {
        const list = byDisplayNew.get(neu) ?? [];
        list.push({ ...p, bucketNome: bucket.nome, portalClienteId: bucket.portalClienteId });
        byDisplayNew.set(neu, list);
      }
    }
  }

  const dupLegacy = [...byDisplayLegacy.entries()].filter(([, r]) => r.length > 1);
  console.log("\n=== DUPLICATAS NA UI (lógica ANTIGA — proxy sempre .001) ===");
  for (const [id, rows] of dupLegacy.sort((a, b) => a[0] - b[0])) {
    console.log("\n" + formatDisplay(id) + ":");
    for (const r of rows) {
      console.log(
        " ",
        r.nome,
        "| bucket:",
        r.bucketNome,
        "| proxy:",
        r.isLinhaProxy,
        "| stored:",
        stored[r.rioPdvId] ? formatDisplay(Number(stored[r.rioPdvId])) : "—",
      );
    }
  }

  console.log("\n=== BUCKETS MISTOS (proxy + lojas reais) ===");
  for (const b of mixedProxyBuckets.sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"))) {
    console.log("\n", b.nome, `(portal ${b.portalClienteId})`);
    for (const p of b.pdvs.sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"))) {
      const legacy = resolveLegacyDisplayId(p, b);
      const neu = resolveDisplayId(p, b);
      console.log(
        " ",
        p.nome,
        "| antigo:",
        legacy ? formatDisplay(legacy) : "—",
        "| corrigido:",
        neu ? formatDisplay(neu) : "sem ID",
        p.isLinhaProxy ? "[proxy]" : "",
      );
    }
  }

  const linksToday = await prisma.painelPdvLink.findMany({
    where: { OR: [{ updatedAt: { gte: todayStart } }, { createdAt: { gte: todayStart } }] },
    include: {
      rioCompPdv: {
        select: {
          id: true,
          nome: true,
          createdAt: true,
          updatedAt: true,
          cliente: { select: { nomeFantasia: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const pdvsCreatedToday = await prisma.rioCompPdv.findMany({
    where: { createdAt: { gte: todayStart } },
    include: { cliente: { select: { nomeFantasia: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log("\n=== PDVs RIO CRIADOS HOJE ===");
  if (pdvsCreatedToday.length === 0) console.log("(nenhum)");
  for (const p of pdvsCreatedToday) {
    const portalId = stored[p.id];
    console.log(
      p.nome,
      "| cliente:",
      p.cliente?.nomeFantasia,
      "| portal:",
      portalId ? formatDisplay(Number(portalId)) : "—",
      "| created:",
      p.createdAt.toISOString(),
    );
  }

  console.log("\n=== VÍNCULOS PAINEL HOJE ===");
  if (linksToday.length === 0) console.log("(nenhum)");
  for (const l of linksToday) {
    const id = l.rioCompPdvId;
    const portalId = stored[id];
    console.log(
      l.rioCompPdv?.nome ?? l.painelPdvNome,
      "| cliente:",
      l.rioCompPdv?.cliente?.nomeFantasia,
      "| portal:",
      portalId ? formatDisplay(Number(portalId)) : "—",
      "| at:",
      l.updatedAt.toISOString(),
    );
  }

  const instalacaoToday = await prisma.producaoPdvCadastro.findMany({
    where: { updatedAt: { gte: todayStart } },
    select: { rioPdvKey: true, nome: true, updatedAt: true, playerInstaladoEm: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  console.log("\n=== CADASTROS PRODUÇÃO ATUALIZADOS HOJE ===");
  for (const c of instalacaoToday) {
    const portalId = stored[c.rioPdvKey];
    console.log(
      c.nome || c.rioPdvKey,
      "| portal:",
      portalId ? formatDisplay(Number(portalId)) : "—",
      "| at:",
      c.updatedAt.toISOString(),
    );
  }
} finally {
  await prisma.$disconnect();
}
