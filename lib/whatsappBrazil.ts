import { onlyDigits } from "@/lib/format";

/** Partes de um campo «telefone loja» (ex.: `(11) x / (21) y`). */
export function splitTelefoneLojaParts(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  return t
    .split(/\s*[\/|;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Dígitos para `wa.me` (+55…). Retorna null se não parecer telefone BR. */
export function brazilWhatsAppWaDigits(raw: string): string | null {
  let d = onlyDigits(raw);
  if (d.length < 10) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  d = d.replace(/^0+/, "");
  if (d.length < 10) return null;
  return `55${d}`;
}

export type TelefoneWhatsAppLink = {
  display: string;
  waDigits: string;
};

export function parseTelefonesWhatsApp(raw: string): TelefoneWhatsAppLink[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = splitTelefoneLojaParts(trimmed);
  const candidates = parts.length > 0 ? parts : [trimmed];
  const out: TelefoneWhatsAppLink[] = [];
  const seen = new Set<string>();
  for (const part of candidates) {
    const waDigits = brazilWhatsAppWaDigits(part);
    if (!waDigits || seen.has(waDigits)) continue;
    seen.add(waDigits);
    out.push({ display: part, waDigits });
  }
  return out;
}

export function whatsAppWebHref(waDigits: string): string {
  return `https://wa.me/${waDigits}`;
}
