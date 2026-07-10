const DEFAULT_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(4_000, Number(process.env.GEMINI_TIMEOUT_MS) || 12_000),
);

/** Modelos em ordem de tentativa — 2.0-flash desligado em jun/2026. */
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL?.trim(),
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
].filter((m): m is string => Boolean(m));

export function geminiDefaultModel(): string {
  return MODEL_FALLBACKS[0] ?? "gemini-2.5-flash";
}

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

async function geminiGenerateJsonWithModel<T>(
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<{ data: T | null; httpStatus?: number; error?: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { data: null, error: "no_key" };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

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
      const errText = await res.text().catch(() => "");
      console.warn("[gemini] HTTP", model, res.status, errText.slice(0, 200));
      return { data: null, httpStatus: res.status, error: errText.slice(0, 120) || `http_${res.status}` };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) return { data: null, error: "empty_response" };
    try {
      return { data: JSON.parse(text) as T };
    } catch {
      const arr = extractJsonArray(text);
      return arr ? { data: arr as T } : { data: null, error: "parse_failed" };
    }
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(aborted ? "[gemini] timeout" : "[gemini] fetch failed", model, e);
    return { data: null, error: aborted ? "timeout" : "fetch_failed" };
  }
}

export type GeminiJsonResult<T> = {
  data: T | null;
  modelUsed: string | null;
  error?: string;
};

/** Chamada server-side ao Gemini (JSON). Tenta modelos fallback se o principal falhar. */
export async function geminiGenerateJson<T>(
  prompt: string,
  opts?: { timeoutMs?: number },
): Promise<GeminiJsonResult<T>> {
  if (!geminiEnabled()) return { data: null, modelUsed: null, error: "disabled" };

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: string | undefined;

  for (const model of MODEL_FALLBACKS) {
    const attempt = await geminiGenerateJsonWithModel<T>(model, prompt, timeoutMs);
    if (attempt.data != null) {
      return { data: attempt.data, modelUsed: model };
    }
    lastError = attempt.error ?? `http_${attempt.httpStatus ?? "unknown"}`;
    if (attempt.httpStatus === 404 || attempt.httpStatus === 400) continue;
    if (attempt.error === "timeout") break;
  }

  return { data: null, modelUsed: null, error: lastError ?? "all_models_failed" };
}
