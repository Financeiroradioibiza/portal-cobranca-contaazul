import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { b2Enabled, criacaoConfig } from './config.js';
import { masterLocalPath, masterStorageKey } from './storage.js';

export type B2VerifiedUpload = {
  objectKey: string;
  sizeBytes: number;
  etag: string | null;
};

async function b2S3Client() {
  const mod = await import('@aws-sdk/client-s3');
  const { S3Client } = mod;
  return {
    client: new S3Client({
      endpoint: criacaoConfig.b2.endpoint,
      region: criacaoConfig.b2.region,
      credentials: {
        accessKeyId: criacaoConfig.b2.accessKeyId,
        secretAccessKey: criacaoConfig.b2.secretAccessKey,
      },
      forcePathStyle: true,
    }),
    mod,
  };
}

/** Confirma que o objeto existe no B2 e que o tamanho bate (HeadObject). */
export async function verifyB2Object(objectKey: string, expectedSizeBytes: number): Promise<B2VerifiedUpload> {
  if (!b2Enabled()) throw new Error('b2_nao_configurado');
  const { client, mod } = await b2S3Client();
  const head = await client.send(
    new mod.HeadObjectCommand({
      Bucket: criacaoConfig.b2.bucket,
      Key: objectKey,
    }),
  );
  const size = head.ContentLength ?? 0;
  if (size !== expectedSizeBytes) {
    throw new Error(
      `b2_verify_tamanho: key=${objectKey} esperado=${expectedSizeBytes} remoto=${size}`,
    );
  }
  return {
    objectKey,
    sizeBytes: size,
    etag: head.ETag ?? null,
  };
}

export async function headB2Object(objectKey: string): Promise<{ sizeBytes: number; etag: string | null } | null> {
  if (!b2Enabled()) return null;
  try {
    const { client, mod } = await b2S3Client();
    const head = await client.send(
      new mod.HeadObjectCommand({
        Bucket: criacaoConfig.b2.bucket,
        Key: objectKey,
      }),
    );
    return { sizeBytes: head.ContentLength ?? 0, etag: head.ETag ?? null };
  } catch {
    return null;
  }
}

async function putBodyToB2(objectKey: string, body: Buffer, contentType: string): Promise<B2VerifiedUpload> {
  if (!b2Enabled()) throw new Error('b2_nao_configurado');
  const { client, mod } = await b2S3Client();
  await client.send(
    new mod.PutObjectCommand({
      Bucket: criacaoConfig.b2.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );
  return verifyB2Object(objectKey, body.length);
}

export async function putLocalFileToB2(
  objectKey: string,
  localFile: string,
  contentType = 'audio/mpeg',
): Promise<B2VerifiedUpload> {
  const stat = await fsp.stat(localFile);
  const body = await fsp.readFile(localFile);
  if (stat.size !== body.length) {
    throw new Error('b2_arquivo_local_inconsistente');
  }
  return putBodyToB2(objectKey, body, contentType);
}

export async function putBufferToB2(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<B2VerifiedUpload> {
  return putBodyToB2(objectKey, body, contentType);
}

/** Envia master 192k para B2 (S3-compatible) e confirma com HeadObject. */
export async function uploadMasterToB2(musicaId: string, localFile: string): Promise<string> {
  const key = masterStorageKey(musicaId);

  if (!b2Enabled()) {
    if (process.env.CRIACAO_ALLOW_LOCAL_MASTER === '1') {
      const fallback = masterLocalPath(musicaId);
      await fsp.mkdir(path.dirname(fallback), { recursive: true });
      await fsp.copyFile(localFile, fallback);
      console.warn('[b2] CRIACAO_ALLOW_LOCAL_MASTER=1 — master gravado localmente em', fallback);
      return `local:${path.basename(fallback)}`;
    }
    throw new Error(
      'b2_nao_configurado: master 192k exige B2_* no .env do cloud2 (api + worker-audio). Ver docs/CLOUD2-ENV-OBRIGATORIO.md',
    );
  }

  const verified = await putLocalFileToB2(key, localFile, 'audio/mpeg');
  console.info('[b2] master verificado', { key: verified.objectKey, bytes: verified.sizeBytes, etag: verified.etag });
  return key;
}

/** Versão 128 mono / .rib no prefixo B2_USO_PREFIX (verify incluso). */
export async function uploadUsoObjectToB2(
  objectKey: string,
  data: Buffer,
  ext: '.mp3' | '.rib',
): Promise<B2VerifiedUpload> {
  const contentType = ext === '.rib' ? 'application/octet-stream' : 'audio/mpeg';
  const verified = await putBufferToB2(objectKey, data, contentType);
  console.info('[b2] uso verificado', { key: verified.objectKey, bytes: verified.sizeBytes, etag: verified.etag });
  return verified;
}

export async function getB2ObjectBuffer(objectKey: string): Promise<Buffer | null> {
  if (!b2Enabled()) return null;
  try {
    const { client, mod } = await b2S3Client();
    const out = await client.send(
      new mod.GetObjectCommand({
        Bucket: criacaoConfig.b2.bucket,
        Key: objectKey,
      }),
    );
    if (!out.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of out.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function deleteB2ObjectKey(objectKey: string): Promise<boolean> {
  if (!b2Enabled()) return false;
  try {
    const { client, mod } = await b2S3Client();
    await client.send(
      new mod.DeleteObjectCommand({
        Bucket: criacaoConfig.b2.bucket,
        Key: objectKey,
      }),
    );
    return true;
  } catch (e) {
    console.warn('[b2] delete falhou:', (e as Error).message);
    return false;
  }
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
  const buf = await getB2ObjectBuffer(key);
  if (!buf) return false;

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await fsp.writeFile(destPath, buf);
  return true;
}
