const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Separa destinatários por vírgula ou ponto-e-vírgula (um único e-mail para todos no To). */
export function parseDestinatarioEmails(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!EMAIL_RE.test(part)) return [];
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function destinatarioEmailsValid(raw: string): boolean {
  return parseDestinatarioEmails(raw).length > 0;
}

export function formatDestinatarioEmails(emails: readonly string[]): string {
  return emails.join(", ");
}
