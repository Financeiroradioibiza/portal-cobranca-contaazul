/**
 * Aplica regras CORS no bucket B2 (128 .rib / futuras URLs presigned diretas).
 *
 *   npx tsx scripts/apply-b2-cors.ts
 *   npx tsx scripts/apply-b2-cors.ts --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const root = path.resolve(__dirname, "..");
for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) loadEnv({ path: p });
}

const dryRun = process.argv.includes("--dry-run");

const ORIGINS = [
  "https://player5.radioibiza.app.br",
  "https://portal.radioibiza.app.br",
  "https://cloud3.radioibiza.app.br",
];

async function main(): Promise<void> {
  const endpoint = process.env.B2_ENDPOINT ?? process.env.B2_S3_ENDPOINT ?? "";
  const bucket = process.env.B2_BUCKET ?? "";
  const accessKeyId = process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY ?? "";
  const region = process.env.B2_REGION ?? "us-east-005";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    console.error("Faltam B2_ENDPOINT, B2_BUCKET, B2_KEY_ID, B2_APPLICATION_KEY no .env");
    process.exit(1);
  }

  const corsRules = {
    CORSRules: [
      {
        AllowedOrigins: ORIGINS,
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
        MaxAgeSeconds: 86400,
      },
    ],
  };

  console.log("Bucket:", bucket);
  console.log("Origins:", ORIGINS.join(", "));
  console.log("Rules:", JSON.stringify(corsRules, null, 2));

  if (dryRun) {
    console.log("\n(dry-run — nada aplicado)");
    return;
  }

  const { S3Client, PutBucketCorsCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsRules,
    }),
  );

  console.log("\nCORS aplicado com sucesso.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
