import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getProducaoCatalogMeta } from "@/lib/cadastros/producaoCatalogo";
import { loadMergedProducaoPlayerContext } from "@/lib/player/producaoPlayerBuckets";

export const CLIENTE_PLAYER_EMAIL_DOMAIN = "radioibiza.com.br";

const PASSWORD_NAME_MAX_LEN = Number(process.env.CLIENTE_PLAYER_PASSWORD_NAME_LEN) || 6;

export function slugClientePlayerPasswordPart(nome: string, maxLen = PASSWORD_NAME_MAX_LEN): string {
  const firstWord = nome.trim().split(/\s+/)[0] ?? nome;
  return slugClientePlayerEmailLocal(firstWord, maxLen);
}

export function clientePlayerPasswordForCliente(clienteNome: string, portalClienteId: number): string {
  const part = slugClientePlayerPasswordPart(clienteNome);
  return `${part}${portalClienteId}`;
}

export function slugClientePlayerEmailLocal(nome: string, maxLen = 36): string {
  const s = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, maxLen);
  return s || "cliente";
}

export function buildClientePlayerEmail(
  nomeFantasia: string,
  portalClienteId: number,
  taken: Set<string>,
): string {
  let local = slugClientePlayerEmailLocal(nomeFantasia);
  let email = `${local}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  if (taken.has(email)) {
    local = `${slugClientePlayerEmailLocal(nomeFantasia, 28)}${portalClienteId}`;
    email = `${local}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  }
  if (taken.has(email)) {
    email = `cliente${portalClienteId}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  }
  taken.add(email);
  return email;
}

export type ClientePlayerLoginRow = {
  portalClienteId: number;
  clienteNome: string;
  email: string;
  password: string | null;
  suggestedPassword: string;
  pdvCount: number;
  hasLogin: boolean;
};

async function loadTakenEmails(): Promise<Set<string>> {
  const rows = await prisma.clientePlayerLogin.findMany({ select: { email: true } });
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

/** Cria login **somente se ainda não existir** — nunca sobrescreve credenciais estáveis. */
export async function createLoginForClienteIfMissing(
  portalClienteId: number,
  clienteNome: string,
): Promise<"created" | "exists"> {
  const existing = await prisma.clientePlayerLogin.findUnique({
    where: { portalClienteId },
  });
  if (existing) return "exists";

  const taken = await loadTakenEmails();
  const email = buildClientePlayerEmail(clienteNome, portalClienteId, taken);
  const passwordPlain = clientePlayerPasswordForCliente(clienteNome, portalClienteId);
  const passwordHash = bcrypt.hashSync(passwordPlain, 12);

  await prisma.clientePlayerLogin.create({
    data: {
      portalClienteId,
      email,
      passwordHash,
      passwordPlain,
      clienteNome,
      active: true,
    },
  });
  return "created";
}

/** Gera logins **faltantes** (1ª vez em massa). Não altera logins já existentes. */
export async function generateMissingClientePlayerLogins(): Promise<{
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  created: number;
  skipped: number;
  total: number;
}> {
  const meta = await getProducaoCatalogMeta();
  const ctx = await loadMergedProducaoPlayerContext();
  const buckets = ctx.buckets.filter((b) => b.portalClienteId != null);

  let created = 0;
  let skipped = 0;

  for (const bucket of buckets) {
    const portalClienteId = bucket.portalClienteId!;
    const clienteNome = bucket.nome.trim() || "Cliente";
    const result = await createLoginForClienteIfMissing(portalClienteId, clienteNome);
    if (result === "created") created++;
    else skipped++;
  }

  return { ...meta, created, skipped, total: buckets.length };
}

export async function updateClientePlayerLoginManual(
  portalClienteId: number,
  input: { email?: string; password?: string; clienteNome?: string },
): Promise<void> {
  const login = await prisma.clientePlayerLogin.findUnique({ where: { portalClienteId } });
  if (!login) throw new Error("login_nao_encontrado");

  const data: {
    email?: string;
    passwordHash?: string;
    passwordPlain?: string;
    clienteNome?: string;
  } = {};

  if (input.email != null) {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("email_invalido");
    data.email = email;
  }
  if (input.password != null) {
    const password = input.password.trim();
    if (password.length < 4) throw new Error("senha_curta");
    data.passwordPlain = password;
    data.passwordHash = bcrypt.hashSync(password, 12);
  }
  if (input.clienteNome != null) {
    data.clienteNome = input.clienteNome.trim();
  }

  if (Object.keys(data).length === 0) return;

  await prisma.clientePlayerLogin.update({
    where: { portalClienteId },
    data,
  });
}

export async function listClientePlayerLogins(): Promise<{
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  rows: ClientePlayerLoginRow[];
}> {
  const meta = await getProducaoCatalogMeta();
  const [ctx, logins] = await Promise.all([
    loadMergedProducaoPlayerContext(),
    prisma.clientePlayerLogin.findMany({
      select: {
        portalClienteId: true,
        email: true,
        passwordPlain: true,
        clienteNome: true,
        active: true,
      },
    }),
  ]);

  const loginById = new Map(logins.map((l) => [l.portalClienteId, l]));
  const takenEmails = new Set(logins.map((l) => l.email.toLowerCase()));

  const rows: ClientePlayerLoginRow[] = ctx.buckets
    .filter((b) => b.portalClienteId != null)
    .map((bucket) => {
      const portalClienteId = bucket.portalClienteId!;
      const login = loginById.get(portalClienteId);
      const clienteNome = bucket.nome.trim() || "Cliente";
      const suggestedPassword = clientePlayerPasswordForCliente(clienteNome, portalClienteId);
      const pdvCount = bucket.pdvs.length;
      const hasLogin = Boolean(login?.active);
      return {
        portalClienteId,
        clienteNome: login?.clienteNome || clienteNome,
        email:
          login?.email ??
          buildClientePlayerEmail(clienteNome, portalClienteId, new Set(takenEmails)),
        password: hasLogin ? login!.passwordPlain || suggestedPassword : null,
        suggestedPassword,
        pdvCount,
        hasLogin,
      };
    });

  return { ...meta, rows };
}

/** @deprecated use generateMissingClientePlayerLogins */
export async function generateAllClientePlayerLogins() {
  const r = await generateMissingClientePlayerLogins();
  return { ...r, updated: 0 };
}
