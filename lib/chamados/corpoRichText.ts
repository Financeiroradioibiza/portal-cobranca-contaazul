/** Links e telefones em textos de chamados/conversas (portal + mesma lógica no PWA). */

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Trechos que parecem telefone BR (vários formatos). */
const PHONE_CANDIDATE_RE =
  /(?:\+?\s*55\s*)?(?:\(\s*\d{2}\s*\)|\d{2})[\s.\-]*(?:9\s*)?\d{4}[\s.\-]*\d{4}|\+\s*55\s*\(?\d{2}\)?[\s.\-]*\d{4,5}[\s.\-]*\d{4}/g;

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** WhatsApp wa.me — ex.: +5521991040227 */
export function normalizeWhatsAppE164(raw: string): string | null {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.startsWith("55")) {
    if (d.length < 12 || d.length > 13) return null;
    return `+${d}`;
  }
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

export type CorpoRichSegment =
  | { kind: "text"; value: string }
  | { kind: "url"; href: string; label: string }
  | { kind: "phone"; href: string; label: string };

type Match = { start: number; end: number; seg: CorpoRichSegment };

function collectUrlMatches(text: string): Match[] {
  const out: Match[] = [];
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    let label = m[0];
    let href = label;
    if (/^www\./i.test(href)) href = `https://${href}`;
    out.push({ start: m.index, end: m.index + label.length, seg: { kind: "url", href, label } });
  }
  return out;
}

function collectPhoneMatches(text: string): Match[] {
  const out: Match[] = [];
  PHONE_CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_CANDIDATE_RE.exec(text)) !== null) {
    const label = m[0];
    const e164 = normalizeWhatsAppE164(label);
    if (!e164) continue;
    out.push({
      start: m.index,
      end: m.index + label.length,
      seg: { kind: "phone", href: `https://wa.me/${e164.slice(1)}`, label },
    });
  }
  return out;
}

export function splitCorpoRichText(text: string): CorpoRichSegment[] {
  if (!text) return [{ kind: "text", value: "" }];
  const matches = [...collectUrlMatches(text), ...collectPhoneMatches(text)].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start < lastEnd) continue;
    filtered.push(m);
    lastEnd = m.end;
  }
  const segments: CorpoRichSegment[] = [];
  let cursor = 0;
  for (const m of filtered) {
    if (m.start > cursor) segments.push({ kind: "text", value: text.slice(cursor, m.start) });
    segments.push(m.seg);
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: "text", value: text.slice(cursor) });
  return segments.length ? segments : [{ kind: "text", value: text }];
}
