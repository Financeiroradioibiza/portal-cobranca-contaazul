import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

/** Posição do @ ativo antes do cursor (query sem espaços). */
export function parseActiveMentionQuery(
  text: string,
  cursor: number,
): { atIndex: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const between = before.slice(at + 1);
  if (/[\s\n]/.test(between)) return null;
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
  return { atIndex: at, query: between };
}

export function mentionInsertToken(p: ChamadoParticipant): string {
  const local = p.email.split("@")[0]?.trim();
  return local || p.email;
}

export function filterParticipantsForMention(
  participants: ChamadoParticipant[],
  query: string,
): ChamadoParticipant[] {
  const q = query.trim().toLowerCase();
  const sorted = [...participants].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "pt-BR"),
  );
  if (!q) return sorted;
  return sorted.filter((p) => {
    const local = p.email.split("@")[0]!.toLowerCase();
    return (
      local.includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.profileName.toLowerCase().includes(q)
    );
  });
}

export function applyMentionSelection(
  text: string,
  cursor: number,
  atIndex: number,
  token: string,
): { nextText: string; nextCursor: number } {
  const before = text.slice(0, atIndex);
  const after = text.slice(cursor);
  const insert = `@${token} `;
  const nextText = before + insert + after;
  const nextCursor = before.length + insert.length;
  return { nextText, nextCursor };
}
