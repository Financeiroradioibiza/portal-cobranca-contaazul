import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { b2Enabled, criacaoConfig } from './config.js';
import { masterLocalPath, masterStorageKey } from './storage.js';

/** Envia master 192k para B2 (S3-compatible). Requer @aws-sdk/client-s3 no portal-ibiza. */
export async function uploadMasterToB2(musicaId: string, localFile: string): Promise<string> {
  const key = masterStorageKey(musicaId);

  if (!b2Enabled()) {
    const fallback = masterLocalPath(musicaId);
    await fsp.mkdir(path.dirname(fallback), { recursive: true });
    await fsp.copyFile(localFile, fallback);
    console.warn('[b2] B2 não configurado — master gravado localmente em', fallback);
    return `local:${path.basename(fallback)}`;
  }

  const mod = await import('@aws-sdk/client-s3');
  const { S3Client, PutObjectCommand } = mod;
  const client = new S3Client({
    endpoint: criacaoConfig.b2.endpoint,
    region: criacaoConfig.b2.region,
    credentials: {
      accessKeyId: criacaoConfig.b2.accessKeyId,
      secretAccessKey: criacaoConfig.b2.secretAccessKey,
    },
    forcePathStyle: true,
  });

  const body = fs.createReadStream(localFile);
  await client.send(
    new PutObjectCommand({
      Bucket: criacaoConfig.b2.bucket,
      Key: key,
      Body: body,
      ContentType: 'audio/mpeg',
    }),
  );

  return key;
}

/** Baixa master 192k do B2 (ou copia do disco local) para reprocessamento de trim. */
export async function downloadMasterToFile(musicaId: string, destPath: string): Promise<boolean> {
  const local = masterLocalPath(musicaId);
  if (fs.existsSync(local)) {
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    await fsp.copyFile(local, destPath);
    return true;
  }

  if (!b2Enabled()) return false;

  const key = masterStorageKey(musicaId);
  const mod = await import('@aws-sdk/client-s3');
  const { S3Client, GetObjectCommand } = mod;
  const client = new S3Client({
    endpoint: criacaoConfig.b2.endpoint,
    region: criacaoConfig.b2.region,
    credentials: {
      accessKeyId: criacaoConfig.b2.accessKeyId,
      secretAccessKey: criacaoConfig.b2.secretAccessKey,
    },
    forcePathStyle: true,
  });

  const out = await client.send(
    new GetObjectCommand({
      Bucket: criacaoConfig.b2.bucket,
      Key: key,
    }),
  );
  if (!out.Body) return false;

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const chunks: Buffer[] = [];
  for await (const chunk of out.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  await fsp.writeFile(destPath, Buffer.concat(chunks));
  return true;
}
