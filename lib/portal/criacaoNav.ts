/** Sidebar do módulo Criação (musical) — alinhado ao mockup v5. */
export const CRIACAO_SIDEBAR = [
  { href: "/criacao/programacoes", label: "Programações", icon: "🎼" },
  { href: "/criacao/biblioteca", label: "Biblioteca musical", icon: "🎵" },
  { href: "/criacao/upload", label: "Upload", icon: "⬆️" },
  { href: "/criacao/fila", label: "Fila de processamento", icon: "⏳" },
  { href: "/criacao/edicao", label: "Edição de música", icon: "✂️" },
  { href: "/criacao/wizard", label: "Wizard IA", icon: "✨" },
] as const;

/** Página principal ao clicar em Criação no topo. */
export const CRIACAO_HOME_HREF = "/criacao/programacoes";
