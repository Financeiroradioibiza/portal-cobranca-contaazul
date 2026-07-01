import { prisma } from "@/lib/prisma";
import { refreshAccessToken } from "./oauth";

const TOKEN_ID = "default";
const SKEW_MS = 120_000;

export async function getValidAccessToken(): Promise<string | null> {
  const row = await prisma.contaAzulToken.findUnique({
    where: { id: TOKEN_ID },
  });
  if (!row) return null;

  const now = Date.now();
  const expires = row.expiresAt.getTime();
  if (expires > now + SKEW_MS) {
    return row.accessToken;
  }

  try {
    const json = await refreshAccessToken(row.refreshToken);
    const newExpires = new Date(Date.now() + json.expires_in * 1000);
    await prisma.contaAzulToken.update({
      where: { id: TOKEN_ID },
      data: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: newExpires,
      },
    });
    return json.access_token;
  } catch {
    await prisma.contaAzulToken.deleteMany({ where: { id: TOKEN_ID } });
    return null;
  }
}

export async function saveTokens(json: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  await prisma.contaAzulToken.upsert({
    where: { id: TOKEN_ID },
    create: {
      id: TOKEN_ID,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
    },
    update: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
    },
  });
}

export async function clearTokens() {
  await prisma.contaAzulToken.deleteMany({ where: { id: TOKEN_ID } });
}
