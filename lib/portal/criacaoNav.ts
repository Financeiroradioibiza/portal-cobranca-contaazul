/** Sidebar do módulo Criação — ordem criação (1–6) · produção (7–13). */
export type CriacaoSidebarEntry =
  | { type: "item"; href: string; label: string; icon: string }
  | { type: "separator" };

export const CRIACAO_SIDEBAR: CriacaoSidebarEntry[] = [
  { type: "item", href: "/criacao/criador", label: "Criador", icon: "🎧" },
  { type: "item", href: "/criacao/biblioteca", label: "Biblioteca musical", icon: "🎵" },
  { type: "item", href: "/criacao/programacoes", label: "Programações", icon: "🎼" },
  { type: "item", href: "/criacao/atl-crica", label: "ATL Crica", icon: "📅" },
  { type: "item", href: "/criacao/edicao", label: "Edição de música", icon: "✂️" },
  { type: "item", href: "/criacao/relatorios", label: "Relatórios", icon: "📊" },
  { type: "separator" },
  { type: "item", href: "/criacao/atualizacoes", label: "Produção", icon: "📋" },
  { type: "item", href: "/criacao/upload", label: "Upload", icon: "⬆️" },
  { type: "item", href: "/criacao/fila", label: "Fila de processamento", icon: "⏳" },
  { type: "item", href: "/criacao/download", label: "Download link", icon: "🔗" },
  { type: "item", href: "/criacao/vinhetas", label: "Vinhetas", icon: "📢" },
  { type: "item", href: "/criacao/erros", label: "Diagnóstico", icon: "🔍" },
  { type: "item", href: "/criacao/wizard", label: "Wizard IA", icon: "✨" },
  { type: "item", href: "/criacao/servidor-up", label: "Servidor UP", icon: "🖥️" },
];

/** Página principal ao clicar em Criação no topo. */
export const CRIACAO_HOME_HREF = "/criacao/criador";
