export const CONVERSA_REACOES = [
  { id: "thumbs_up", emoji: "👍", label: "Joia" },
  { id: "eyes", emoji: "👀", label: "Vi" },
  { id: "raised_hand", emoji: "🙋", label: "Mão" },
  { id: "clap", emoji: "👏", label: "Palmas" },
  { id: "heart", emoji: "❤️", label: "Coração" },
  { id: "fire", emoji: "🔥", label: "Urgente" },
] as const;

export type ConversaReacaoTipo = (typeof CONVERSA_REACOES)[number]["id"];

const VALID_REACAO = new Set<string>(CONVERSA_REACOES.map((r) => r.id));

export function parseConversaReacaoTipo(raw: unknown): ConversaReacaoTipo | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  return VALID_REACAO.has(t) ? (t as ConversaReacaoTipo) : null;
}
