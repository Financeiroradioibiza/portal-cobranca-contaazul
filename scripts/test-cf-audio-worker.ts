/**
 * Homolog Fase A/C — Worker CF entrega .rib do B2.
 *   npx tsx scripts/test-cf-audio-worker.ts
 *   npx tsx scripts/test-cf-audio-worker.ts --host=cloud3.radioibiza.app.br
 *   npx tsx scripts/test-cf-audio-worker.ts --host=cloud3.radioibiza.app.br --signed
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const root = path.resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) loadEnv({ path: p });
}

const TEST_MUSICA = "cf85f05e-05be-43b8-8e72-f79b1240e296";
const DEFAULT_HOST = "radioibiza-audio-b2.radioibiza-audio.workers.dev";
const OBJECT_KEY = `uso/musicas/${TEST_MUSICA}/mp3_128_mono.rib`;

function argHost(): string {
  const hit = process.argv.find((a) => a.startsWith("--host="));
  return hit ? hit.slice("--host=".length) : DEFAULT_HOST;
}

function useSigned(): boolean {
  return process.argv.includes("--signed");
}

function signUrl(host: string, secret: string, ttlSec = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac("sha256", secret).update(`${OBJECT_KEY}:${exp}`).digest("hex");
  return `https://${host}/${OBJECT_KEY}?exp=${exp}&sig=${sig}`;
}

async function main(): Promise<void> {
  const secret = process.env.CRIACAO_INGEST_SECRET?.trim();
  if (!secret) {
    console.error("CRIACAO_INGEST_SECRET ausente em .env.local");
    process.exit(1);
  }

  const host = argHost();
  const signed = useSigned();
  const url = signed
    ? signUrl(host, secret)
    : `https://${host}/${OBJECT_KEY}`;

  console.log(signed ? "HEAD (Fase C signed URL)" : "HEAD (Fase A x-criacao-secret)", url.split("?")[0] + (signed ? "?exp=…&sig=…" : ""));
  const head = await fetch(url, {
    method: "HEAD",
    headers: signed ? {} : { "x-criacao-secret": secret },
  });
  console.log("status:", head.status, head.statusText);
  console.log("content-type:", head.headers.get("content-type"));
  console.log("content-length:", head.headers.get("content-length"));

  if (head.status !== 200) {
    const body = await fetch(url, {
      headers: signed ? {} : { "x-criacao-secret": secret },
    }).then((r) => r.text());
    console.log("body:", body.slice(0, 200));
    process.exit(1);
  }

  console.log("\nOK — Worker entrega .rib via", host, signed ? "(URL assinada Fase C)" : "(header ops Fase A)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
