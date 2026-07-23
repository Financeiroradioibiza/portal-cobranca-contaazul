const DEFAULT_TIMEOUT_MS = Math.min(
  20_000,
  Math.max(4000, Number(process.env.GEMINI_TIMEOUT_MS) || 12000),
);

const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL?.trim(),
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
].filter(Boolean);

const UNIQUE_MODELS = [...new Set(MODEL_FALLBACKS)];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function extractJsonArray(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function geminiGenerateJsonWithModel(model, prompt, timeoutMs) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { data: null, error: 'no_key' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 1024,
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[gemini] HTTP', model, res.status, errText.slice(0, 200));
      return { data: null, httpStatus: res.status, error: errText.slice(0, 120) || `http_${res.status}` };
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) return { data: null, error: 'empty_response' };
    try {
      return { data: JSON.parse(text) };
    } catch {
      const arr = extractJsonArray(text);
      return arr ? { data: arr } : { data: null, error: 'parse_failed' };
    }
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.warn(aborted ? '[gemini] timeout' : '[gemini] fetch failed', model, e);
    return { data: null, error: aborted ? 'timeout' : 'fetch_failed' };
  }
}

export async function geminiGenerateJson(prompt, opts) {
  if (!geminiEnabled()) return { data: null, modelUsed: null, error: 'disabled' };

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError;

  for (const model of UNIQUE_MODELS) {
    const attempt = await geminiGenerateJsonWithModel(model, prompt, timeoutMs);
    if (attempt.data != null) {
      return { data: attempt.data, modelUsed: model };
    }
    lastError = attempt.error ?? `http_${attempt.httpStatus ?? 'unknown'}`;

    const retryable =
      attempt.httpStatus === 429 ||
      attempt.httpStatus === 503 ||
      attempt.httpStatus === 502 ||
      attempt.error === 'timeout' ||
      attempt.error === 'fetch_failed';

    if (retryable) {
      await sleep(900);
      const retry = await geminiGenerateJsonWithModel(model, prompt, timeoutMs);
      if (retry.data != null) {
        return { data: retry.data, modelUsed: model };
      }
      lastError = retry.error ?? lastError;
    }

    if (attempt.httpStatus === 404 || attempt.httpStatus === 400) continue;
    if (attempt.error === 'timeout' || attempt.httpStatus === 429) continue;
  }

  return { data: null, modelUsed: null, error: lastError ?? 'all_models_failed' };
}
