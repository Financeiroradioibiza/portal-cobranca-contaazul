import { prisma } from "@/lib/prisma";
import {
  cloud2Enabled,
  cloud2FetchWithTimeout,
  CRIACAO_CLOUD2_BASE,
  parseCloud2Json,
} from "@/lib/criacao/cloud2Client";
import { getDownloadDiagnostics } from "@/lib/criacao/downloadService";

export type HealthProbe = {
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  data: Record<string, unknown> | null;
};

export type DiskStatsView = {
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
};

export type BucketStatsView = {
  configured: boolean;
  enabled: boolean;
  bucket: string;
  prefix: string;
  objectCount: number;
  totalBytes: number;
  truncated: boolean;
  error: string | null;
};

export type ServidoresStatus = {
  collectedAt: string;
  cloud2: {
    baseUrl: string;
    api: HealthProbe;
    downloadWorker: HealthProbe;
    ops: {
      available: boolean;
      error: string | null;
      disk: DiskStatsView | null;
      dirs: { name: string; path: string; bytes: number | null }[];
      r2: BucketStatsView | null;
      b2: BucketStatsView | null;
      providers: Record<string, boolean>;
    };
  };
  neon: {
    versoesUsoBytes: number;
    versoesCount: number;
    downloadStagingBytes: number;
    downloadItemsR2: number;
  };
  cloudflare: {
    configured: boolean;
    r2Analytics: Record<string, unknown> | null;
    error: string | null;
  };
};

function cloud2PublicBase(): string {
  const raw =
    process.env.CLOUD2_PUBLIC_URL?.trim() ||
    CRIACAO_CLOUD2_BASE.replace(/\/criacao\/?$/, "") ||
    "https://cloud2.radioibiza.app.br";
  return raw.replace(/\/$/, "");
}

async function probeUrl(url: string, init?: RequestInit): Promise<HealthProbe> {
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    const latencyMs = Date.now() - start;
    const ct = res.headers.get("content-type") ?? "";
    let data: Record<string, unknown> | null = null;
    if (ct.includes("json")) {
      data = (await res.json()) as Record<string, unknown>;
    }
    return {
      ok: res.ok,
      latencyMs,
      error: res.ok ? null : `HTTP ${res.status}`,
      data,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : "erro_rede",
      data: null,
    };
  }
}

async function fetchCloud2Ops(): Promise<ServidoresStatus["cloud2"]["ops"]> {
  const empty: ServidoresStatus["cloud2"]["ops"] = {
    available: false,
    error: cloud2Enabled() ? null : "CRIACAO_INGEST_SECRET não configurado",
    disk: null,
    dirs: [],
    r2: null,
    b2: null,
    providers: {},
  };
  if (!cloud2Enabled()) return empty;

  const res = await cloud2FetchWithTimeout("/ops/storage", {}, 20000);
  if (!res) {
    return {
      ...empty,
      error: "Timeout ao consultar cloud2 /ops/storage — publique a rota no servidor.",
    };
  }
  if (res.status === 404) {
    return {
      ...empty,
      error: "Rota /criacao/ops/storage ainda não deployada no cloud2 (sync-cloud2-to-portal-ibiza).",
    };
  }
  if (!res.ok) {
    return { ...empty, error: `cloud2 ops HTTP ${res.status}` };
  }

  try {
    const data = await parseCloud2Json<{
      disk?: DiskStatsView | null;
      dirs?: { name: string; path: string; bytes: number | null }[];
      r2?: BucketStatsView;
      b2?: BucketStatsView;
      providers?: Record<string, boolean>;
    }>(res, "ops_storage");
    return {
      available: true,
      error: null,
      disk: data.disk ?? null,
      dirs: data.dirs ?? [],
      r2: data.r2 ?? null,
      b2: data.b2 ?? null,
      providers: data.providers ?? {},
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "ops_parse_error",
    };
  }
}

async function fetchNeonStorageTotals() {
  const [versoes, dlR2, dlBytes] = await Promise.all([
    prisma.musicaVersao.aggregate({ _sum: { sizeBytes: true }, _count: true }),
    prisma.downloadItem.count({ where: { storageKey: { startsWith: "r2:" } } }),
    prisma.downloadItem.aggregate({
      where: { storageKey: { not: "" } },
      _sum: { sizeBytes: true },
    }),
  ]);
  return {
    versoesUsoBytes: versoes._sum.sizeBytes ?? 0,
    versoesCount: versoes._count,
    downloadStagingBytes: dlBytes._sum.sizeBytes ?? 0,
    downloadItemsR2: dlR2,
  };
}

/** Opcional: métricas R2 via Cloudflare GraphQL (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID). */
async function fetchCloudflareR2Analytics(): Promise<{
  configured: boolean;
  r2Analytics: Record<string, unknown> | null;
  error: string | null;
}> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) {
    return { configured: false, r2Analytics: null, error: null };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const query = `
    query R2Storage($accountTag: String!, $start: Time!, $end: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: $start, datetime_leq: $end }) {
            max { payloadSize metadataSize }
          }
          r2OperationsAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
            sum { requests uploadBytes downloadBytes }
            dimensions { actionType }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: accountId,
          start: start.toISOString(),
          end: end.toISOString(),
        },
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      errors?: { message: string }[];
      data?: Record<string, unknown>;
    };
    if (!res.ok || json.errors?.length) {
      return {
        configured: true,
        r2Analytics: null,
        error: json.errors?.[0]?.message ?? `HTTP ${res.status}`,
      };
    }
    return { configured: true, r2Analytics: json.data ?? null, error: null };
  } catch (e) {
    return {
      configured: true,
      r2Analytics: null,
      error: e instanceof Error ? e.message : "erro_cf",
    };
  }
}

export async function loadServidoresStatus(): Promise<ServidoresStatus> {
  const publicBase = cloud2PublicBase();
  const [api, downloadDiag, ops, neon, cloudflare] = await Promise.all([
    probeUrl(`${publicBase}/health`),
    (async (): Promise<HealthProbe> => {
      const d = await getDownloadDiagnostics();
      return {
        ok: d.cloud2Configured && !d.cloud2Error,
        latencyMs: null,
        error: d.cloud2Error,
        data: d.cloud2Health,
      };
    })(),
    fetchCloud2Ops(),
    fetchNeonStorageTotals(),
    fetchCloudflareR2Analytics(),
  ]);

  return {
    collectedAt: new Date().toISOString(),
    cloud2: {
      baseUrl: publicBase,
      api,
      downloadWorker: downloadDiag,
      ops,
    },
    neon,
    cloudflare,
  };
}
