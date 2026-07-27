/**
 * Fase A — GET .rib do B2 via borda Cloudflare.
 * Não altera player, playlist nem pipeline. Auth ops: header x-criacao-secret.
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

    const secret = request.headers.get("x-criacao-secret") ?? "";
    if (!env.CRIACAO_INGEST_SECRET || secret !== env.CRIACAO_INGEST_SECRET) {
      return new Response("nao_autorizado", { status: 401, headers: cors });
    }

    const objectKey = normalizeObjectKey(new URL(request.url).pathname, env);
    if (!objectKey) {
      return new Response("caminho_invalido", { status: 403, headers: cors });
    }

    try {
      const upstream = await b2GetObject(env, objectKey, request.headers.get("Range"));
      if (!upstream.ok) {
        return new Response(upstream.status === 404 ? "nao_encontrado" : "origin_erro", {
          status: upstream.status === 404 ? 404 : 502,
          headers: cors,
        });
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
