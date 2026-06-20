import fs from 'node:fs';
import { r2Enabled, criacaoConfig } from './config.js';

/** Upload versão de uso (.rib ou .mp3) para R2 quente — opcional. */
export async function uploadUsoToR2(
  musicaId: string,
  localFile: string,
  objectName: string,
): Promise<string | null> {
  if (!r2Enabled()) return null;

  const mod = await import('@aws-sdk/client-s3');
  const { S3Client, PutObjectCommand } = mod;
  const r2 = criacaoConfig.r2;
  const key = `${r2.prefix.replace(/\/?$/, '/')}${musicaId}/${objectName}`;

  const client = new S3Client({
    endpoint: r2.endpoint,
    region: r2.region,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
    forcePathStyle: true,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: fs.createReadStream(localFile),
      ContentType: objectName.endsWith('.rib') ? 'application/octet-stream' : 'audio/mpeg',
    }),
  );

  return `r2:${key}`;
}
