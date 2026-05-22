import { CONTA_AZUL_API_BASE } from "./config";

export async function caFetch<T>(
  pathWithQuery: string,
  accessToken: string,
): Promise<T> {
  const url = `${CONTA_AZUL_API_BASE}${pathWithQuery}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    const short = pathWithQuery.split("?")[0];
    throw new Error(`Conta Azul ${short}: ${res.status} ${text}`);
  }
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) {
    const short = pathWithQuery.split("?")[0];
    throw new Error(
      `Conta Azul ${short}: resposta não é JSON (${t.slice(0, 120)}${t.length > 120 ? "…" : ""})`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const short = pathWithQuery.split("?")[0];
    throw new Error(`Conta Azul ${short}: JSON inválido (${t.slice(0, 120)}…)`);
  }
}
