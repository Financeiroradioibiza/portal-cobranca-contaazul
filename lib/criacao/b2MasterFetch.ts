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

function readB2Config(): B2Config {
  return {
    endpoint: (process.env.B2_S3_ENDPOINT ?? process.env.B2_ENDPOINT ?? "").trim(),
    region: (process.env.B2_REGION ?? "us-east-005").trim(),
    bucket: (process.env.B2_BUCKET ?? "").trim(),
    accessKeyId: (process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID ?? "").trim(),
    secretAccessKey: (
      process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY ?? ""
    ).trim(),
    masterPrefix: (process.env.B2_MASTER_PREFIX ?? "master/").replace(/^\/+/, ""),
  };
}

export function b2MasterFetchEnabled(): boolean {
  const c = readB2Config();
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

function resolveB2Key(
  raw: string | null | undefined,
  musicaId: string,
  masterPrefix: string,
): string | null {
  const k = raw?.trim() ?? "";
  if (k.startsWith("local:")) return null;
  if (k.startsWith("b2:")) return k.slice(3);
  if (k) return k;
  return `${masterPrefix.replace(/\/?$/, "/")}${musicaId}.mp3`;
}

/** GET master 192 kbps direto do Backblaze B2 (server-side, portal/Netlify). */
export async function fetchMaster192FromB2(musicaId: string): Promise<Response | null> {
  if (!b2MasterFetchEnabled()) return null;
  const c = readB2Config();
  const id = musicaId.trim();
  if (!id) return null;

  let neonKey: string | null = null;
  try {
    const row = await prisma.musicaBiblioteca.findUnique({
      where: { id },
      select: { masterStorageKey: true },
    });
    neonKey = row?.masterStorageKey ?? null;
  } catch {
    /* tenta key padrão */
  }

  const objectKey = resolveB2Key(neonKey, id, c.masterPrefix);
  if (!objectKey) return null;

  const endpoint = c.endpoint.replace(/\/$/, "");
  const url = `${endpoint}/${c.bucket}/${objectKey}`;

  const aws = new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: "s3",
    region: c.region,
  });

  const signed = await aws.sign(url, { method: "GET" });
  return fetch(signed);
}
