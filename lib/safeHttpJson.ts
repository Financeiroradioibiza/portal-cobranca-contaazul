/**
 * Lê o corpo da resposta e faz parse JSON de forma segura (evita crash quando o edge/CDN devolve HTML).
 */
export async function readJsonFromResponse<T>(
  res: Response,
): Promise<{ ok: boolean; status: number; data: T | null; rawText: string; parseError: boolean }> {
  const rawText = await res.text();
  if (!rawText.trim()) {
    return { ok: res.ok, status: res.status, data: null, rawText: "", parseError: false };
  }
  try {
    return {
      ok: res.ok,
      status: res.status,
      data: JSON.parse(rawText) as T,
      rawText,
      parseError: false,
    };
  } catch {
    return { ok: res.ok, status: res.status, data: null, rawText, parseError: true };
  }
}
