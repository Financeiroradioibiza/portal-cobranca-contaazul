const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

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

/** Chamada server-side ao Gemini (JSON). Retorna null se desabilitado ou falha. */
export async function geminiGenerateJson(prompt) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      console.warn('[gemini] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      const arr = extractJsonArray(text);
      return arr ?? null;
    }
  } catch (e) {
    console.warn('[gemini] fetch failed', e);
    return null;
  }
}
