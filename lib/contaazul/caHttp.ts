import { CONTA_AZUL_API_BASE } from "./config";

const RETRYABLE_HTTP = new Set([429, 502, 503, 504]);

function caHttpMaxRetries(): number {
  return Math.min(5, Math.max(0, Number(process.env.CA_HTTP_RETRIES ?? "3") || 3));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function caHttpErrorMessage(pathWithQuery: string, status: number, body: string): string {
  const short = pathWithQuery.split("?")[0];
  let detail = body.trim();
  if (/<html/i.test(detail)) {
    detail =
      status === 503 ?
        "serviço temporariamente indisponível (503). Aguarde e tente novamente."
      : `resposta HTML de erro (${status})`;
  } else if (detail.length > 240) {
    detail = `${detail.slice(0, 240)}…`;
  }
  return `Conta Azul ${short}: ${status} ${detail}`;
}

export async function caFetch<T>(
  pathWithQuery: string,
  accessToken: string,
): Promise<T> {
  const url = `${CONTA_AZUL_API_BASE}${pathWithQuery}`;
  const maxRetries = caHttpMaxRetries();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();

    if (!res.ok) {
      if (RETRYABLE_HTTP.has(res.status) && attempt < maxRetries) {
        await sleep(750 * 2 ** attempt);
        continue;
      }
      throw new Error(caHttpErrorMessage(pathWithQuery, res.status, text));
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

  throw new Error(`Conta Azul ${pathWithQuery.split("?")[0]}: falha após tentativas`);
}
