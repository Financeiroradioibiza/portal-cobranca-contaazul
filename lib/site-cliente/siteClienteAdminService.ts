import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import {
  parseSiteClientePermissoes,
  type SiteClientePermissoes,
} from "@/lib/site-cliente/permissions";

export type SiteClienteGrupoListItem = {
  id: string;
  nome: string;
  active: boolean;
  usuarioCount: number;
  clienteCount: number;
  pdvCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SiteClienteUsuarioView = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  funcao: string;
  loginEmail: string;
  active: boolean;
  permissoes: SiteClientePermissoes;
  createdAt: string;
  updatedAt: string;
};

export type SiteClienteGrupoDetail = {
  id: string;
  nome: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  usuarios: SiteClienteUsuarioView[];
  clientes: Array<{ rioLinhaId: string; portalClienteId: number | null; nome: string }>;
  pdvs: Array<{ rioPdvKey: string; portalPdvId: number | null; nome: string; clienteNome: string }>;
  moodboards: Array<{
    rioLinhaId: string;
    portalClienteId: number | null;
    perfilPublico: string;
    posicionamentoMarca: string;
    estiloMusicalPrincipal: string;
    objetivoPeriodo: string;
    notasInternas: string;
  }>;
};

export type SiteClienteCatalog = {
  clientes: Array<{
    key: string;
    nome: string;
    rioLinhaId: string;
    portalClienteId: number | null;
    pdvs: Array<{ rioPdvKey: string; nome: string; portalPdvId: number | null }>;
  }>;
};

function mapUsuario(u: {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  funcao: string;
  loginEmail: string;
  active: boolean;
  permissoes: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SiteClienteUsuarioView {
  return {
    id: u.id,
    nome: u.nome,
    telefone: u.telefone,
    email: u.email,
    funcao: u.funcao,
    loginEmail: u.loginEmail,
    active: u.active,
    permissoes: parseSiteClientePermissoes(u.permissoes),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export async function listSiteClienteGrupos(): Promise<SiteClienteGrupoListItem[]> {
  const rows = await prisma.siteClienteGrupo.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { usuarios: true, clientes: true, pdvs: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    nome: g.nome,
    active: g.active,
    usuarioCount: g._count.usuarios,
    clienteCount: g._count.clientes,
    pdvCount: g._count.pdvs,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }));
}

export async function searchSiteClienteCatalog(query: string, limit = 30): Promise<SiteClienteCatalog> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { clientes: [] };

  const [dash, layout] = await Promise.all([getProducaoDashboard(), getProducaoCatalogLayout()]);
  const pdvIds = layout.portalPdvIdsByRioPdvKey;
  const clienteIds = layout.portalClienteIdsByBucketKey;

  const clientes = dash.clientes
    .filter((c) => {
      const blob = `${c.nome} ${c.pdvs.map((p) => p.nome).join(" ")}`.toLowerCase();
      return blob.includes(q);
    })
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((c) => ({
      key: c.key,
      nome: c.nome,
      rioLinhaId: c.rioLinhaId,
      portalClienteId: clienteIds[c.key] ?? null,
      pdvs: c.pdvs.map((p) => ({
        rioPdvKey: p.rioPdvKey,
        nome: p.nome,
        portalPdvId: pdvIds[p.rioPdvKey] ?? null,
      })),
    }));

  return { clientes };
}

export async function getSiteClienteGrupo(grupoId: string): Promise<SiteClienteGrupoDetail | null> {
  const g = await prisma.siteClienteGrupo.findUnique({
    where: { id: grupoId },
    include: {
      usuarios: { orderBy: { nome: "asc" } },
      clientes: true,
      pdvs: true,
      moodboards: true,
    },
  });
  if (!g) return null;

  const rioLinhaIds = g.clientes.map((c) => c.rioLinhaId);
  const rioPdvKeys = g.pdvs.map((p) => p.rioPdvKey);
  const pdvMeta = new Map<string, { nome: string; clienteNome: string }>();
  let clienteByLinha = new Map<string, string>();

  if (rioLinhaIds.length > 0 || rioPdvKeys.length > 0) {
    const d = await getProducaoDashboard();
    const bucketByScopeKey = new Map<string, (typeof d.clientes)[0]>();
    for (const bucket of d.clientes) {
      bucketByScopeKey.set(bucket.key, bucket);
      if (bucket.rioLinhaId) bucketByScopeKey.set(bucket.rioLinhaId, bucket);
    }

    for (const { pdv, bucket } of d.clientes.flatMap((c) =>
      c.pdvs.map((pdv) => ({ pdv, bucket: c })),
    )) {
      if (rioPdvKeys.includes(pdv.rioPdvKey)) {
        pdvMeta.set(pdv.rioPdvKey, { nome: pdv.nome, clienteNome: bucket.nome });
      }
    }

    clienteByLinha = new Map(
      rioLinhaIds.map((id) => {
        const bucket = bucketByScopeKey.get(id);
        return [id, bucket?.nome ?? id] as const;
      }),
    );
  }

  return {
    id: g.id,
    nome: g.nome,
    active: g.active,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    usuarios: g.usuarios.map(mapUsuario),
    clientes: g.clientes.map((c) => ({
      rioLinhaId: c.rioLinhaId,
      portalClienteId: c.portalClienteId,
      nome: clienteByLinha.get(c.rioLinhaId) ?? c.rioLinhaId,
    })),
    pdvs: g.pdvs.map((p) => {
      const meta = pdvMeta.get(p.rioPdvKey);
      return {
        rioPdvKey: p.rioPdvKey,
        portalPdvId: p.portalPdvId,
        nome: meta?.nome ?? p.rioPdvKey,
        clienteNome: meta?.clienteNome ?? "",
      };
    }),
    moodboards: g.moodboards.map((m) => ({
      rioLinhaId: m.rioLinhaId,
      portalClienteId: m.portalClienteId,
      perfilPublico: m.perfilPublico,
      posicionamentoMarca: m.posicionamentoMarca,
      estiloMusicalPrincipal: m.estiloMusicalPrincipal,
      objetivoPeriodo: m.objetivoPeriodo,
      notasInternas: m.notasInternas,
    })),
  };
}

export async function createSiteClienteGrupo(input: {
  nome: string;
  createdBy?: string;
}): Promise<{ id: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("nome_obrigatorio");
  const g = await prisma.siteClienteGrupo.create({
    data: {
      nome,
      createdBy: input.createdBy?.trim() ?? "",
    },
    select: { id: true },
  });
  return g;
}

export async function updateSiteClienteGrupo(
  grupoId: string,
  input: { nome?: string; active?: boolean },
): Promise<void> {
  const data: { nome?: string; active?: boolean } = {};
  if (typeof input.nome === "string") {
    const nome = input.nome.trim();
    if (!nome) throw new Error("nome_obrigatorio");
    data.nome = nome;
  }
  if (typeof input.active === "boolean") data.active = input.active;
  if (Object.keys(data).length === 0) return;
  await prisma.siteClienteGrupo.update({ where: { id: grupoId }, data });
}

export async function deleteSiteClienteGrupo(grupoId: string): Promise<void> {
  await prisma.siteClienteGrupo.delete({ where: { id: grupoId } });
}

export async function setSiteClienteGrupoEscopo(
  grupoId: string,
  input: {
    clientes: Array<{ rioLinhaId: string; portalClienteId?: number | null }>;
    pdvs: Array<{ rioPdvKey: string; portalPdvId?: number | null }>;
  },
): Promise<void> {
  await prisma.$transaction([
    prisma.siteClienteGrupoCliente.deleteMany({ where: { grupoId } }),
    prisma.siteClienteGrupoPdv.deleteMany({ where: { grupoId } }),
    ...(input.clientes.length > 0
      ? [
          prisma.siteClienteGrupoCliente.createMany({
            data: input.clientes.map((c) => ({
              grupoId,
              rioLinhaId: c.rioLinhaId,
              portalClienteId: c.portalClienteId ?? null,
            })),
          }),
        ]
      : []),
    ...(input.pdvs.length > 0
      ? [
          prisma.siteClienteGrupoPdv.createMany({
            data: input.pdvs.map((p) => ({
              grupoId,
              rioPdvKey: p.rioPdvKey,
              portalPdvId: p.portalPdvId ?? null,
            })),
          }),
        ]
      : []),
  ]);
}

export async function createSiteClienteUsuario(
  grupoId: string,
  input: {
    nome: string;
    telefone?: string;
    email: string;
    funcao?: string;
    loginEmail: string;
    password: string;
    permissoes?: SiteClientePermissoes;
    active?: boolean;
  },
): Promise<{ id: string }> {
  const loginEmail = input.loginEmail.trim().toLowerCase();
  const password = input.password.trim();
  if (!loginEmail || !password) throw new Error("login_senha_obrigatorios");
  if (password.length < 6) throw new Error("senha_curta");

  const existing = await prisma.siteClienteUsuario.findUnique({
    where: { loginEmail },
    select: { id: true },
  });
  if (existing) throw new Error("login_email_em_uso");

  const u = await prisma.siteClienteUsuario.create({
    data: {
      grupoId,
      nome: input.nome.trim(),
      telefone: input.telefone?.trim() ?? "",
      email: input.email.trim(),
      funcao: input.funcao?.trim() ?? "",
      loginEmail,
      passwordHash: bcrypt.hashSync(password, 12),
      permissoes: input.permissoes ?? {},
      active: input.active ?? true,
    },
    select: { id: true },
  });
  return u;
}

export async function updateSiteClienteUsuario(
  usuarioId: string,
  input: {
    nome?: string;
    telefone?: string;
    email?: string;
    funcao?: string;
    loginEmail?: string;
    password?: string;
    permissoes?: SiteClientePermissoes;
    active?: boolean;
  },
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (typeof input.nome === "string") data.nome = input.nome.trim();
  if (typeof input.telefone === "string") data.telefone = input.telefone.trim();
  if (typeof input.email === "string") data.email = input.email.trim();
  if (typeof input.funcao === "string") data.funcao = input.funcao.trim();
  if (typeof input.active === "boolean") data.active = input.active;
  if (input.permissoes) data.permissoes = input.permissoes;

  if (typeof input.loginEmail === "string") {
    const loginEmail = input.loginEmail.trim().toLowerCase();
    if (!loginEmail) throw new Error("login_email_obrigatorio");
    const dup = await prisma.siteClienteUsuario.findFirst({
      where: { loginEmail, NOT: { id: usuarioId } },
      select: { id: true },
    });
    if (dup) throw new Error("login_email_em_uso");
    data.loginEmail = loginEmail;
  }

  if (typeof input.password === "string" && input.password.trim()) {
    const password = input.password.trim();
    if (password.length < 6) throw new Error("senha_curta");
    data.passwordHash = bcrypt.hashSync(password, 12);
  }

  if (Object.keys(data).length === 0) return;
  await prisma.siteClienteUsuario.update({ where: { id: usuarioId }, data });
}

export async function deleteSiteClienteUsuario(usuarioId: string): Promise<void> {
  await prisma.siteClienteUsuario.delete({ where: { id: usuarioId } });
}

export async function upsertSiteClienteMoodboard(
  grupoId: string,
  rioLinhaId: string,
  input: {
    portalClienteId?: number | null;
    perfilPublico?: string;
    posicionamentoMarca?: string;
    estiloMusicalPrincipal?: string;
    objetivoPeriodo?: string;
    notasInternas?: string;
  },
): Promise<void> {
  await prisma.siteClienteMoodboard.upsert({
    where: { grupoId_rioLinhaId: { grupoId, rioLinhaId } },
    create: {
      grupoId,
      rioLinhaId,
      portalClienteId: input.portalClienteId ?? null,
      perfilPublico: input.perfilPublico?.trim() ?? "",
      posicionamentoMarca: input.posicionamentoMarca?.trim() ?? "",
      estiloMusicalPrincipal: input.estiloMusicalPrincipal?.trim() ?? "",
      objetivoPeriodo: input.objetivoPeriodo?.trim() ?? "",
      notasInternas: input.notasInternas?.trim() ?? "",
    },
    update: {
      portalClienteId: input.portalClienteId ?? null,
      perfilPublico: input.perfilPublico?.trim() ?? "",
      posicionamentoMarca: input.posicionamentoMarca?.trim() ?? "",
      estiloMusicalPrincipal: input.estiloMusicalPrincipal?.trim() ?? "",
      objetivoPeriodo: input.objetivoPeriodo?.trim() ?? "",
      notasInternas: input.notasInternas?.trim() ?? "",
    },
  });
}

export async function authenticateSiteClienteUser(
  loginEmail: string,
  password: string,
): Promise<{
  id: string;
  grupoId: string;
  grupoNome: string;
  nome: string;
  loginEmail: string;
  permissoes: SiteClientePermissoes;
} | null> {
  const email = loginEmail.trim().toLowerCase();
  if (!email || !password) return null;

  const u = await prisma.siteClienteUsuario.findUnique({
    where: { loginEmail: email },
    include: { grupo: { select: { id: true, nome: true, active: true } } },
  });
  if (!u || !u.active || !u.grupo.active) return null;
  if (!bcrypt.compareSync(password, u.passwordHash)) return null;

  return {
    id: u.id,
    grupoId: u.grupoId,
    grupoNome: u.grupo.nome,
    nome: u.nome,
    loginEmail: u.loginEmail,
    permissoes: parseSiteClientePermissoes(u.permissoes),
  };
}
