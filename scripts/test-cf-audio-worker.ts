/**
 * Homolog Fase A — Worker CF entrega .rib do B2.
 *   npx tsx scripts/test-cf-audio-worker.ts
 *   npx tsx scripts/test-cf-audio-worker.ts --host=cloud3.radioibiza.app.br
 */
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

function argHost(): string {
  const hit = process.argv.find((a) => a.startsWith("--host="));
  return hit ? hit.slice("--host=".length) : DEFAULT_HOST;
}

async function main(): Promise<void> {
  const secret = process.env.CRIACAO_INGEST_SECRET?.trim();
  if (!secret) {
    console.error("CRIACAO_INGEST_SECRET ausente em .env.local");
    process.exit(1);
  }

  const host = argHost();
  const url = `https://${host}/uso/musicas/${TEST_MUSICA}/mp3_128_mono.rib`;

  console.log("HEAD", url);
  const head = await fetch(url, { method: "HEAD", headers: { "x-criacao-secret": secret } });
  console.log("status:", head.status, head.statusText);
  console.log("content-type:", head.headers.get("content-type"));
  console.log("content-length:", head.headers.get("content-length"));

  if (head.status !== 200) {
    const body = await fetch(url, { headers: { "x-criacao-secret": secret } }).then((r) => r.text());
    console.log("body:", body.slice(0, 200));
    process.exit(1);
  }

  console.log("\nOK — Fase A Worker entrega .rib do B2 via", host);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
