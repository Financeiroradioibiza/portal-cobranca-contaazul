/**
 * Utilitário de upload para R2 / S3-compatible (Backblaze B2, Cloudflare R2).
 * O bucket é o mesmo usado pelo portal (CRIACAO_DOWNLOAD_*).
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    const endpoint = process.env.R2_ENDPOINT;
    const region = process.env.R2_REGION ?? "auto";
    _s3 = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

const BUCKET = process.env.R2_BUCKET ?? "radioibiza-criacao";

/**
 * Faz upload de um arquivo local para R2 e retorna a storageKey.
 * storageKey = "dl/<provider>/<jobId>/<filename>"
 */
export async function uploadToR2(opts: {
  localPath: string;
  provider: string;
  jobId: string;
  filename: string;
}): Promise<string> {
  const key = `dl/${opts.provider}/${opts.jobId}/${opts.filename}`;
  const info = await stat(opts.localPath);
  const stream = createReadStream(opts.localPath);

  await getS3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: stream,
      ContentType: "audio/mpeg",
      ContentLength: info.size,
    }),
  );

  return key;
}
