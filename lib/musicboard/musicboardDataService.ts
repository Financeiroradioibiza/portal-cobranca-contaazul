import { prisma } from "@/lib/prisma";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import {
  loadMergedProducaoPlayerContext,
  loadProgramacaoMusicalMaps,
} from "@/lib/player/producaoPlayerBuckets";
import { resolveTrackCovers } from "@/lib/musicboard/deezerCover";
import type { MusicboardPeriodo } from "@/lib/musicboard/musicboardConfigService";
import type { MusicboardClienteConfigRow } from "@/lib/musicboard/musicboardConfigService";

export type MusicboardTrackRow = {
  musicaId: string;
  titulo: string;
  artista: string;
  likes: number;
  coverUrl: string;
};

export type MusicboardRewindData = {
  portalClienteId: number;
  clienteNome: string;
  bucketKey: string;
  periodo: MusicboardPeriodo;
  periodoLabel: string;
  programacaoNome: string;
  topTracks: MusicboardTrackRow[];
  topTrack: MusicboardTrackRow | null;
  stats: {
    horasCuradas: number;
    lojasVibrando: number;
    faixasNarrativa: number;
  };
  depoimentoTexto: string;
  depoimentoAutor: string;
  narrativaCurador: string;
  lojasSample: string[];
};

const MESES_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function periodoMonths(periodo: MusicboardPeriodo): number {
  return periodo === "3m" ? 3 : 6;
}

export function formatPeriodoLabel(periodo: MusicboardPeriodo, refDate = new Date()): string {
  const months = periodoMonths(periodo);
  const end = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - (months - 1));
  const a = `${MESES_PT[start.getMonth()]}–${MESES_PT[end.getMonth()]} ${end.getFullYear()}`;
  return a;
}

function sinceDate(periodo: MusicboardPeriodo, refDate = new Date()): Date {
  const d = new Date(refDate);
  d.setMonth(d.getMonth() - periodoMonths(periodo));
  return d;
}

function bucketKeyForPortalClienteId(
  portalClienteId: number,
  map: Record<string, number>,
): string | null {
  for (const [key, id] of Object.entries(map)) {
    if (id === portalClienteId) return key;
  }
  return null;
}

function parseVoto(raw: string): "like" | "dislike" | null {
  const v = raw.trim().toLowerCase();
  return v === "like" || v === "dislike" ? v : null;
}

async function rankingLikesForCliente(
  portalClienteId: number,
  since: Date,
  limit: number,
): Promise<Array<{ musicaId: string; titulo: string; artista: string; likes: number }>> {
  const rows = await prisma.musicaBibliotecaVoto.findMany({
    where: {
      portalClienteId,
      voto: "like",
      updatedAt: { gte: since },
    },
    select: {
      musicaId: true,
      voto: true,
      musica: { select: { titulo: true, artista: true } },
    },
  }).catch(() => []);

  const byMusica = new Map<
    string,
    { titulo: string; artista: string; likes: number }
  >();

  for (const r of rows) {
    if (parseVoto(r.voto) !== "like") continue;
    const cur = byMusica.get(r.musicaId) ?? {
      titulo: r.musica.titulo.trim() || "—",
      artista: r.musica.artista.trim() || "—",
      likes: 0,
    };
    cur.likes += 1;
    byMusica.set(r.musicaId, cur);
  }

  return [...byMusica.entries()]
    .map(([musicaId, m]) => ({ musicaId, ...m }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit);
}

async function countFaixasProgramacao(
  portalClienteId: number,
  bucketKey: string | null,
): Promise<{ count: number; programacaoNome: string }> {
  const maps = await loadProgramacaoMusicalMaps();
  const programacaoNome =
    maps.byPortalClienteId.get(portalClienteId) ??
    (bucketKey ? maps.byClienteRef.get(bucketKey) : undefined) ??
    "Padrão";

  const prog = await prisma.programacao.findFirst({
    where: {
      publicada: true,
      OR: [
        { clienteGatewayId: portalClienteId },
        ...(bucketKey ? [{ clienteRef: bucketKey }] : []),
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      nome: true,
      pastas: { select: { musicas: { select: { musicaId: true } } } },
    },
  });

  if (!prog) return { count: 0, programacaoNome };

  const ids = new Set<string>();
  for (const pasta of prog.pastas) {
    for (const pm of pasta.musicas) ids.add(pm.musicaId);
  }
  return { count: ids.size, programacaoNome: prog.nome.trim() || programacaoNome };
}

async function pickDepoimentoFromLikes(
  portalClienteId: number,
  since: Date,
): Promise<{ texto: string; autor: string } | null> {
  const row = await prisma.musicaBibliotecaVoto.findFirst({
    where: { portalClienteId, voto: "like", updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    include: { musica: { select: { titulo: true } } },
  }).catch(() => null);

  if (!row) return null;
  const pdv = row.pdvNome.trim();
  const musica = row.musica.titulo.trim();
  if (!pdv && !musica) return null;

  const texto =
    musica
      ? `A equipe curtiu «${musica}» na programação — a trilha está no clima certo da loja.`
      : "A equipe está engajada com a curadoria — a trilha combina com o ambiente da loja.";

  const autor = pdv ? `${pdv}` : row.clienteNome.trim() || "Equipe da loja";
  return { texto, autor };
}

export async function resolveClienteContext(portalClienteId: number): Promise<{
  clienteNome: string;
  bucketKey: string | null;
  pdvCount: number;
  lojasSample: string[];
} | null> {
  const dash = await getProducaoDashboard();
  const layout = await getProducaoCatalogLayout();
  const bucketKey = bucketKeyForPortalClienteId(portalClienteId, layout.portalClienteIdsByBucketKey);

  for (const c of dash.clientes) {
    const id = layout.portalClienteIdsByBucketKey[c.key];
    if (id === portalClienteId) {
      const lojas = c.pdvs
        .filter((p) => p.statusPlayer === "Ativo")
        .map((p) => p.nome.trim())
        .filter(Boolean)
        .slice(0, 6);
      return {
        clienteNome: c.nome,
        bucketKey: c.key,
        pdvCount: c.pdvCount,
        lojasSample: lojas,
      };
    }
  }

  if (bucketKey) {
    const c = dash.clientes.find((x) => x.key === bucketKey);
    if (c) {
      return {
        clienteNome: c.nome,
        bucketKey: c.key,
        pdvCount: c.pdvCount,
        lojasSample: c.pdvs.map((p) => p.nome.trim()).filter(Boolean).slice(0, 6),
      };
    }
  }

  const ctx = await loadMergedProducaoPlayerContext();
  const bucket = ctx.buckets.find((b) => b.portalClienteId === portalClienteId);
  if (bucket) {
    return {
      clienteNome: bucket.nome,
      bucketKey: bucket.key,
      pdvCount: bucket.pdvs.length,
      lojasSample: bucket.pdvs.map((p) => p.nome.trim()).filter(Boolean).slice(0, 6),
    };
  }

  return null;
}

export async function buildMusicboardRewindData(input: {
  portalClienteId: number;
  config: MusicboardClienteConfigRow | null;
  periodoOverride?: MusicboardPeriodo;
}): Promise<MusicboardRewindData> {
  const periodo = input.periodoOverride ?? input.config?.periodo ?? "6m";
  const since = sinceDate(periodo);
  const ctx = await resolveClienteContext(input.portalClienteId);
  if (!ctx) throw new Error("cliente_nao_encontrado");

  const ranking = await rankingLikesForCliente(input.portalClienteId, since, 9);
  const covers = await resolveTrackCovers(
    ranking.map((r) => ({ artista: r.artista, titulo: r.titulo })),
  );

  const topTracks: MusicboardTrackRow[] = ranking.map((r, i) => ({
    musicaId: r.musicaId,
    titulo: r.titulo,
    artista: r.artista,
    likes: r.likes,
    coverUrl: covers[i] ?? "",
  }));

  while (topTracks.length < 9) {
    const i = topTracks.length;
    topTracks.push({
      musicaId: `placeholder-${i}`,
      titulo: "Em curadoria",
      artista: "Radio Ibiza",
      likes: 0,
      coverUrl: `https://placehold.co/200x200/${["E93A7D", "FF7A3D", "9B6BFF"][i % 3]}/0D0B14?text=+`,
    });
  }

  const { count: faixasNarrativa, programacaoNome } = await countFaixasProgramacao(
    input.portalClienteId,
    ctx.bucketKey,
  );

  const horasPorDia = 10;
  const dias = periodoMonths(periodo) * 30;
  const horasCuradas = Math.round(ctx.pdvCount * horasPorDia * dias);

  let depoimentoTexto = input.config?.depoimentoTexto.trim() ?? "";
  let depoimentoAutor = input.config?.depoimentoAutor.trim() ?? "";
  if (!depoimentoTexto) {
    const auto = await pickDepoimentoFromLikes(input.portalClienteId, since);
    if (auto) {
      depoimentoTexto = auto.texto;
      depoimentoAutor = auto.autor;
    }
  }

  let narrativaCurador = input.config?.narrativaCurador.trim() ?? "";
  if (!narrativaCurador) {
    const progLabel = programacaoNome !== "Padrão" ? `«${programacaoNome}»` : "sua programação";
    narrativaCurador =
      `Neste semestre, ${progLabel} manteve uma narrativa sonora alinhada ao posicionamento da marca. ` +
      `As faixas mais curtidas refletem o engajamento das lojas com a curadoria Radio Ibiza.`;
  }

  const topTrack = topTracks.find((t) => t.likes > 0) ?? topTracks[0] ?? null;

  return {
    portalClienteId: input.portalClienteId,
    clienteNome: ctx.clienteNome,
    bucketKey: ctx.bucketKey ?? "",
    periodo,
    periodoLabel: formatPeriodoLabel(periodo),
    programacaoNome,
    topTracks: topTracks.slice(0, 9),
    topTrack,
    stats: {
      horasCuradas,
      lojasVibrando: ctx.pdvCount,
      faixasNarrativa: faixasNarrativa || topTracks.filter((t) => t.likes > 0).length,
    },
    depoimentoTexto,
    depoimentoAutor,
    narrativaCurador,
    lojasSample: ctx.lojasSample,
  };
}

export type MusicboardClienteListItem = {
  portalClienteId: number;
  clienteNome: string;
  pdvCount: number;
  enabled: boolean;
  emails: string[];
  periodo: MusicboardPeriodo;
  ultimoEnvioEm: string | null;
};

export async function listMusicboardClientes(): Promise<MusicboardClienteListItem[]> {
  const dash = await getProducaoDashboard();
  const layout = await getProducaoCatalogLayout();
  const configs = await prisma.musicboardClienteConfig.findMany();
  const configById = new Map(configs.map((c) => [c.portalClienteId, c]));

  const out: MusicboardClienteListItem[] = [];

  for (const c of dash.clientes) {
    const portalClienteId = layout.portalClienteIdsByBucketKey[c.key];
    if (portalClienteId == null || portalClienteId <= 0) continue;

    const cfg = configById.get(portalClienteId);
    out.push({
      portalClienteId,
      clienteNome: c.nome,
      pdvCount: c.pdvCount,
      enabled: cfg?.enabled ?? false,
      emails: Array.isArray(cfg?.emailsJson)
        ? (cfg!.emailsJson as string[]).filter((e) => typeof e === "string")
        : [],
      periodo: cfg?.periodo === "3m" ? "3m" : "6m",
      ultimoEnvioEm: cfg?.ultimoEnvioEm?.toISOString() ?? null,
    });
  }

  out.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  return out;
}
