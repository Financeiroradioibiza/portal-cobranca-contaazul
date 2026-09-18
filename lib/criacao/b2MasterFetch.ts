import { AwsClient } from "aws4fetch";
import { prisma } from "@/lib/prisma";

type B2Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  masterPrefix: string;
};

export type B2MasterFetchResult =
  | { kind: "ok"; response: Response; objectKey: string }
  | { kind: "not_configured" }
  | { kind: "not_found"; keysTried: string[] }
  | { kind: "upstream_error"; status: number; keysTried: string[] };

function trimEnv(value: string | undefined): string {
  let v = (value ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function readB2Config(): B2Config {
  return {
    endpoint: trimEnv(process.env.B2_S3_ENDPOINT ?? process.env.B2_ENDPOINT),
    region: trimEnv(process.env.B2_REGION) || "us-east-005",
    bucket: trimEnv(process.env.B2_BUCKET),
    accessKeyId: trimEnv(process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID),
    secretAccessKey: trimEnv(
      process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY,
    ),
    masterPrefix: (trimEnv(process.env.B2_MASTER_PREFIX) || "master/").replace(/^\/+/, ""),
  };
}

export function b2MasterFetchEnabled(): boolean {
  const c = readB2Config();
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

/** Chaves candidatas no B2 — mesma lógica do cloud2 + fallbacks master/ vs masters/. */
export function resolveMasterB2ObjectKeys(
  musicaId: string,
  neonKey: string | null | undefined,
  masterPrefix: string,
): string[] {
  const id = musicaId.trim();
  if (!id) return [];

  const out: string[] = [];
  const push = (k: string) => {
    const key = k.trim();
    if (key && !out.includes(key)) out.push(key);
  };

  const k = neonKey?.trim() ?? "";
  if (k.startsWith("local:")) return [];
  if (k.startsWith("b2:")) push(k.slice(3));
  else if (k) push(k);

  const normalized = masterPrefix.replace(/\/?$/, "/");
  push(`${normalized}${id}.mp3`);
  if (normalized !== "master/") push(`master/${id}.mp3`);
  if (normalized !== "masters/") push(`masters/${id}.mp3`);

  return out;
}

function awsClient(c: B2Config): AwsClient {
  return new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: "s3",
    region: c.region,
  });
}

function b2ObjectUrl(objectKey: string, c: B2Config): string {
  const endpoint = c.endpoint.replace(/\/$/, "");
  return `${endpoint}/${c.bucket}/${objectKey}`;
}

async function b2SignedRequest(
  objectKey: string,
  c: B2Config,
  method: "GET" | "HEAD",
): Promise<Response> {
  const signed = await awsClient(c).sign(b2ObjectUrl(objectKey, c), { method });
  return fetch(signed);
}

async function b2GetObject(objectKey: string, c: B2Config): Promise<Response> {
  return b2SignedRequest(objectKey, c, "GET");
}

async function presignObjectKey(objectKey: string, c: B2Config, ttlSeconds: number): Promise<string> {
  const url = new URL(b2ObjectUrl(objectKey, c));
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  const signed = await awsClient(c).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** URL presigned GET no B2 — browser baixa direto (CORS no bucket). */
export async function buildPresignedMaster192Url(
  musicaId: string,
  neonKey: string | null | undefined,
  ttlSeconds = 4 * 60 * 60,
): Promise<string | null> {
  if (!b2MasterFetchEnabled()) return null;

  const c = readB2Config();
  const keys = resolveMasterB2ObjectKeys(musicaId.trim(), neonKey, c.masterPrefix);
  if (keys.length === 0) return null;

  for (const objectKey of keys) {
    try {
      const head = await b2SignedRequest(objectKey, c, "HEAD");
      if (head.ok) return presignObjectKey(objectKey, c, ttlSeconds);
    } catch {
      /* próxima key */
    }
  }

  return presignObjectKey(keys[0]!, c, ttlSeconds);
}

/** GET master 192 kbps direto do Backblaze B2 (server-side, portal/Netlify). */
export async function fetchMaster192FromB2(musicaId: string): Promise<B2MasterFetchResult> {
  if (!b2MasterFetchEnabled()) return { kind: "not_configured" };

  const c = readB2Config();
  const id = musicaId.trim();
  if (!id) return { kind: "not_found", keysTried: [] };

  let neonKey: string | null = null;
  try {
    const row = await prisma.musicaBiblioteca.findUnique({
      where: { id },
      select: { masterStorageKey: true },
    });
    neonKey = row?.masterStorageKey ?? null;
  } catch {
    /* tenta keys padrão */
  }

  const keys = resolveMasterB2ObjectKeys(id, neonKey, c.masterPrefix);
  if (keys.length === 0) return { kind: "not_found", keysTried: [] };

  let lastStatus = 404;
  for (const objectKey of keys) {
    try {
      const res = await b2GetObject(objectKey, c);
      if (res.ok) return { kind: "ok", response: res, objectKey };
      lastStatus = res.status;
      if (res.status !== 404) {
        return { kind: "upstream_error", status: res.status, keysTried: keys };
      }
    } catch {
      return { kind: "upstream_error", status: 502, keysTried: keys };
    }
  }

  return { kind: "not_found", keysTried: keys };
}
