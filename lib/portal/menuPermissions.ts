/** Árvore de menus do portal (alinhada ao mockup v5). */
export const PORTAL_MENU_MODULES = [
  {
    id: "financeiro",
    icon: "💰",
    label: "Financeiro",
    subs: [
      { id: "planilha-rio", label: "Planilha Rio" },
      { id: "vencidos", label: "Vencidos" },
      { id: "envios-oc", label: "Envios OC" },
      { id: "consulta-painel", label: "Consulta painel" },
    ],
  },
  {
    id: "cadastros",
    icon: "📋",
    label: "Cadastros",
    subs: [
      { id: "grupos", label: "Grupos & Clientes" },
      { id: "vinculos", label: "Lista vínculos" },
      { id: "prospects", label: "Prospects" },
      { id: "cliente-pdv-novo", label: "Cliente / PDV novo" },
    ],
  },
  {
    id: "producao",
    icon: "🎵",
    label: "Produção",
    subs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "suporte", label: "Suporte" },
    ],
  },
  {
    id: "config",
    icon: "⚙️",
    label: "Configuração",
    subs: [
      { id: "parametros", label: "Parâmetros globais" },
      { id: "usuarios", label: "Usuários e perfis" },
      { id: "integracoes", label: "Integrações" },
      { id: "seguranca", label: "Segurança" },
      { id: "logs", label: "Logs" },
    ],
  },
] as const;

export type PortalMenuModuleId = (typeof PORTAL_MENU_MODULES)[number]["id"];

/** Permissão: "all", array de sub-ids, ou ausente = nenhum. */
export type ModulePermission = "all" | string[] | null | undefined;

export type PortalPermissionsMap = Partial<Record<PortalMenuModuleId, ModulePermission>>;

export type ProfilePermissionConfig =
  | { perm: "all"; desc: string; roles: string[] }
  | { perm: PortalPermissionsMap; desc: string; roles: string[] };

/** Perfis padrão (mockup Config / Usuários). */
export const DEFAULT_PORTAL_PROFILES: Record<
  string,
  { name: string; icon: string; sortOrder: number } & ProfilePermissionConfig
> = {
  admin: {
    name: "Admin",
    icon: "⭐",
    sortOrder: 0,
    desc: "Acesso total ao portal. Pode criar/editar/excluir tudo, gerenciar perfis e usuários.",
    perm: "all",
    roles: ["master"],
  },
  operador: {
    name: "Operador",
    icon: "🛠",
    sortOrder: 1,
    desc: "Operação musical e de PDVs. Não acessa cobrança nem perfis.",
    perm: {
      cadastros: "all",
      producao: "all",
      config: ["logs"],
    },
    roles: ["cadastros", "producao", "suporte"],
  },
  curador: {
    name: "Curador",
    icon: "🎵",
    sortOrder: 2,
    desc: "Foco em criação musical. Sem acesso financeiro.",
    perm: {
      cadastros: ["grupos"],
      producao: ["dashboard"],
    },
    roles: ["criacao"],
  },
  financeiro: {
    name: "Financeiro",
    icon: "💰",
    sortOrder: 3,
    desc: "Cobrança e planilha Rio. Visualiza cadastros.",
    perm: {
      financeiro: "all",
      cadastros: ["vinculos", "prospects", "cliente-pdv-novo"],
      config: ["logs"],
    },
    roles: ["cobranca"],
  },
  suporte: {
    name: "Suporte",
    icon: "🎧",
    sortOrder: 4,
    desc: "Suporte operacional e consulta painel.",
    perm: {
      financeiro: ["consulta-painel"],
      cadastros: ["vinculos"],
      producao: "all",
      config: ["logs"],
    },
    roles: ["suporte", "producao"],
  },
  relacionamento: {
    name: "Relacionamento",
    icon: "🤝",
    sortOrder: 6,
    desc: "Prospects, pedidos de cliente novo e consulta operacional.",
    perm: {
      cadastros: ["prospects", "cliente-pdv-novo"],
      producao: ["dashboard"],
      financeiro: ["consulta-painel"],
    },
    roles: ["relacionamento"],
  },
  cliente: {
    name: "Cliente",
    icon: "👁",
    sortOrder: 5,
    desc: "Acesso restrito (futuro portal cliente).",
    perm: {
      producao: ["dashboard"],
    },
    roles: [],
  },
};

export function serializePermissions(perm: ModulePermission | "all"): string {
  if (perm === "all") return JSON.stringify("all");
  return JSON.stringify(perm ?? null);
}

export function parsePermissionsJson(raw: string): ModulePermission | "all" {
  try {
    const v = JSON.parse(raw || "null");
    if (v === "all") return "all";
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return null;
  } catch {
    return null;
  }
}

export function parseRolesJson(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function countAccessibleSubs(
  moduleId: PortalMenuModuleId,
  perm: PortalPermissionsMap | "all",
): { checked: number; total: number } {
  const mod = PORTAL_MENU_MODULES.find((m) => m.id === moduleId);
  if (!mod) return { checked: 0, total: 0 };
  const total = mod.subs.length;
  if (perm === "all" || (perm as PortalPermissionsMap)[moduleId] === "all") {
    return { checked: total, total };
  }
  const subs = (perm as PortalPermissionsMap)[moduleId];
  const checked = Array.isArray(subs) ? subs.length : 0;
  return { checked, total };
}

export function isSubAllowed(
  moduleId: PortalMenuModuleId,
  subId: string,
  perm: PortalPermissionsMap | "all",
): boolean {
  if (perm === "all") return true;
  const p = (perm as PortalPermissionsMap)[moduleId];
  if (p === "all") return true;
  if (Array.isArray(p)) return p.includes(subId);
  return false;
}
