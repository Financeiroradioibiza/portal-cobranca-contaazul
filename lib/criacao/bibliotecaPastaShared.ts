/** Tipos e ícones de pasta — sem Prisma (safe para "use client"). */

export type BibliotecaPastaView = {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  criativoUserId: string | null;
  criativoNome: string;
  criativoIniciais: string;
  musicaCount: number;
  sortOrder: number;
  createdAt: string;
};

export const BIBLIOTECA_PASTA_ICONES = [
  "folder",
  "music",
  "party",
  "sun",
  "star",
  "vinyl",
  "wave",
  "fire",
  "heart",
  "spark",
] as const;

const ICONES_VALIDOS = new Set<string>(BIBLIOTECA_PASTA_ICONES);

export function normalizeBibliotecaPastaIcone(raw: string | undefined): string {
  const v = (raw ?? "folder").trim().toLowerCase();
  return ICONES_VALIDOS.has(v) ? v : "folder";
}

export function iconeBibliotecaPastaEmoji(icone: string): string {
  switch (icone) {
    case "music":
      return "🎵";
    case "party":
      return "🎉";
    case "sun":
      return "☀️";
    case "star":
      return "⭐";
    case "vinyl":
      return "💿";
    case "wave":
      return "🌊";
    case "fire":
      return "🔥";
    case "heart":
      return "❤️";
    case "spark":
      return "✨";
    default:
      return "📁";
  }
}
