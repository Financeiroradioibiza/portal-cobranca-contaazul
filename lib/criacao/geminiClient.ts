const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(4_000, Number(process.env.GEMINI_TIMEOUT_MS) || 8_000),
);

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function geminiTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS;
}

function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Chamada server-side ao Gemini (JSON). Retorna null se desabilitado, timeout ou falha. */
export async function geminiGenerateJson<T>(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
        },
      }),
    });
    if (!res.ok) {
      console.warn("[gemini] HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      const arr = extractJsonArray(text);
      return (arr as T) ?? null;
    }
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(aborted ? "[gemini] timeout" : "[gemini] fetch failed", e);
    return null;
  }
}
