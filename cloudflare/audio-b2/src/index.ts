/**
 * Fase A/C — GET .rib do B2 via borda Cloudflare.
 * Auth ops: header x-criacao-secret (Fase A).
 * Auth Player: query exp+sig HMAC (Fase C — emitido pelo cloud2 na playlist).
 */

import { AwsClient } from "aws4fetch";

export interface Env {
  CRIACAO_INGEST_SECRET: string;
  B2_ENDPOINT: string;
  B2_BUCKET: string;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
  B2_REGION?: string;
  B2_USO_PREFIX?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS = [
  "https://player5.radioibiza.app.br",
  "https://portal.radioibiza.app.br",
];

function allowedOrigins(env: Env): string[] {
  const raw = (env.CORS_ALLOWED_ORIGINS ?? "").trim();
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = allowedOrigins(env);
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "x-criacao-secret, Range, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function normalizeObjectKey(pathname: string, env: Env): string | null {
  const key = pathname.replace(/^\/+/, "");
  if (!key) return null;
  const prefix = (env.B2_USO_PREFIX ?? "uso/").replace(/^\/+/, "");
  if (!key.startsWith(prefix)) return null;
  if (key.includes("..")) return null;
  return key;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedUrlAuthorized(
  objectKey: string,
  exp: string | null,
  sig: string | null,
  secret: string,
): Promise<boolean> {
  if (!exp || !sig || !secret) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacSha256Hex(secret, `${objectKey}:${exp}`);
  return timingSafeEqualHex(sig.toLowerCase(), expected.toLowerCase());
}

async function requestAuthorized(
  request: Request,
  env: Env,
  objectKey: string,
): Promise<boolean> {
  const secret = env.CRIACAO_INGEST_SECRET ?? "";
  if (!secret) return false;

  const headerSecret = request.headers.get("x-criacao-secret") ?? "";
  if (headerSecret === secret) return true;

  const url = new URL(request.url);
  return signedUrlAuthorized(
    objectKey,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
    secret,
  );
}

/** Faixas antigas no B2 usam mp3_128_mono.rib; URL pública pode usar outro basename. */
const LEGACY_RIB_BASENAME = "mp3_128_mono";

function b2FetchKeys(signedKey: string): string[] {
  const keys = [signedKey];
  const m = signedKey.match(/^(.+\/musicas\/[^/]+)\/([^/]+)\.rib$/);
  if (m && m[2] !== LEGACY_RIB_BASENAME) {
    keys.push(`${m[1]}/${LEGACY_RIB_BASENAME}.rib`);
  }
  return keys;
}

async function b2GetObject(
  env: Env,
  objectKey: string,
  rangeHeader: string | null,
): Promise<Response> {
  const endpoint = env.B2_ENDPOINT.replace(/\/$/, "");
  const region = env.B2_REGION ?? "us-east-005";
  const url = `${endpoint}/${env.B2_BUCKET}/${objectKey}`;

  const aws = new AwsClient({
    accessKeyId: env.B2_KEY_ID,
    secretAccessKey: env.B2_APPLICATION_KEY,
    service: "s3",
    region,
  });

  const headers: Record<string, string> = {};
  if (rangeHeader) headers.Range = rangeHeader;

  const signed = await aws.sign(url, { method: "GET", headers });
  return fetch(signed);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method_not_allowed", { status: 405, headers: cors });
    }

    const objectKey = normalizeObjectKey(new URL(request.url).pathname, env);
    if (!objectKey) {
      return new Response("caminho_invalido", { status: 403, headers: cors });
    }

    if (!(await requestAuthorized(request, env, objectKey))) {
      return new Response("nao_autorizado", { status: 401, headers: cors });
    }

    try {
      let upstream: Response | null = null;
      for (const b2Key of b2FetchKeys(objectKey)) {
        const res = await b2GetObject(env, b2Key, request.headers.get("Range"));
        if (res.ok) {
          upstream = res;
          break;
        }
        if (res.status !== 404) {
          return new Response("origin_erro", { status: 502, headers: cors });
        }
      }
      if (!upstream) {
        return new Response("nao_encontrado", { status: 404, headers: cors });
      }

      const outHeaders = new Headers(cors);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        const v = upstream.headers.get(h);
        if (v) outHeaders.set(h, v);
      }
      if (!outHeaders.has("content-type")) {
        outHeaders.set(
          "content-type",
          objectKey.endsWith(".rib") ? "application/octet-stream" : "audio/mpeg",
        );
      }
      outHeaders.set("Cache-Control", "private, max-age=3600");

      if (request.method === "HEAD") {
        return new Response(null, { status: upstream.status, headers: outHeaders });
      }

      return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
    } catch {
      return new Response("origin_indisponivel", { status: 503, headers: cors });
    }
  },
};
