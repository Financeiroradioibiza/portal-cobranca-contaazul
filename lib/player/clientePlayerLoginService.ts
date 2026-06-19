import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getProducaoCatalogMeta } from "@/lib/cadastros/producaoCatalogo";
import { loadMergedProducaoPlayerContext } from "@/lib/player/producaoPlayerBuckets";

export const CLIENTE_PLAYER_EMAIL_DOMAIN = "radioibiza.com.br";
export const CLIENTE_PLAYER_EMAIL_LOCAL_MAX = 65;

const PASSWORD_NAME_MAX_LEN = Number(process.env.CLIENTE_PLAYER_PASSWORD_NAME_LEN) || 6;
const EMAIL_BRAND_CHARS = 3;
const EMAIL_VARIANT_CHARS = 3;

const EMAIL_STOP_WORDS = new Set([
  "grupo",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
  "co",
  "ltda",
  "sa",
  "me",
  "epp",
]);

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

function normalizeClienteNomeWords(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !EMAIL_STOP_WORDS.has(w));
}

/** Local-part curto: marca + variante (ex. Arezzo Franquias → arefra). Máx. 65 chars. */
export function buildShortClientePlayerEmailLocal(
  nome: string,
  maxLen = CLIENTE_PLAYER_EMAIL_LOCAL_MAX,
): string {
  let s = nome.trim().replace(/^\.+/, "").trim();
  if (!s) return "cliente";

  const mainPart = s.split(/\s*\(/)[0]?.trim() ?? s;
  const segments = mainPart.split(/\s*[-–—]\s*/).map((x) => x.trim()).filter(Boolean);
  const chunks: string[] = [];

  if (segments.length >= 2) {
    const brandWords = normalizeClienteNomeWords(segments[0]!);
    const variantWords = normalizeClienteNomeWords(segments[1]!);
    chunks.push((brandWords[0] ?? "cli").slice(0, EMAIL_BRAND_CHARS));
    chunks.push((variantWords[0] ?? slugClientePlayerEmailLocal(segments[1]!, EMAIL_VARIANT_CHARS)).slice(
      0,
      EMAIL_VARIANT_CHARS,
    ));
  } else {
    const words = normalizeClienteNomeWords(mainPart);
    if (words.length >= 2) {
      chunks.push(words[0]!.slice(0, EMAIL_BRAND_CHARS), words[1]!.slice(0, EMAIL_VARIANT_CHARS));
    } else if (words.length === 1) {
      chunks.push(words[0]!.slice(0, Math.min(8, maxLen)));
    }
  }

  const local = chunks.join("").slice(0, maxLen);
  return local || "cliente";
}

export function buildClientePlayerEmail(
  nomeFantasia: string,
  portalClienteId: number,
  taken: Set<string>,
): string {
  const has = (email: string) => taken.has(email.toLowerCase());

  let local = buildShortClientePlayerEmailLocal(nomeFantasia);
  let email = `${local}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  if (has(email)) {
    const idStr = String(portalClienteId);
    local = `${buildShortClientePlayerEmailLocal(nomeFantasia, CLIENTE_PLAYER_EMAIL_LOCAL_MAX - idStr.length)}${idStr}`;
    email = `${local}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  }
  if (has(email)) {
    email = `cliente${portalClienteId}@${CLIENTE_PLAYER_EMAIL_DOMAIN}`;
  }
  taken.add(email.toLowerCase());
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

/** Regera e-mails curtos de todos os logins ativos (senhas inalteradas). Operação em massa — uso pontual. */
export async function regenerateAllClientePlayerEmails(): Promise<{
  layoutYearMonth: number;
  rioSourceYearMonth: number;
  updated: number;
  unchanged: number;
  total: number;
}> {
  const meta = await getProducaoCatalogMeta();
  const [ctx, logins] = await Promise.all([
    loadMergedProducaoPlayerContext(),
    prisma.clientePlayerLogin.findMany({
      where: { active: true },
      select: { portalClienteId: true, email: true, clienteNome: true },
      orderBy: { portalClienteId: "asc" },
    }),
  ]);

  const nomeById = new Map(
    ctx.buckets
      .filter((b) => b.portalClienteId != null)
      .map((b) => [b.portalClienteId!, b.nome.trim() || "Cliente"]),
  );

  const taken = new Set<string>();
  const updates: Array<{ portalClienteId: number; email: string }> = [];
  let unchanged = 0;

  for (const login of logins) {
    const clienteNome = nomeById.get(login.portalClienteId) ?? login.clienteNome ?? "Cliente";
    const email = buildClientePlayerEmail(clienteNome, login.portalClienteId, taken);
    if (email.toLowerCase() === login.email.toLowerCase()) {
      unchanged++;
      continue;
    }
    updates.push({ portalClienteId: login.portalClienteId, email });
  }

  for (const row of updates) {
    await prisma.clientePlayerLogin.update({
      where: { portalClienteId: row.portalClienteId },
      data: { email: row.email },
    });
  }

  return {
    ...meta,
    updated: updates.length,
    unchanged,
    total: logins.length,
  };
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
