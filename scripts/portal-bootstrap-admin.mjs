#!/usr/bin/env node
/**
 * Cria o primeiro admin no Postgres (perfil Admin + usuário master).
 *
 * Uso:
 *   npm run portal:bootstrap-admin
 *   npm run portal:bootstrap-admin -- --email rafael@radioibiza.com.br --name "Rafael Gasparian"
 *
 * Senha: informe com --password ou será gerada e exibida no final.
 */
import bcrypt from "bcryptjs";
import { generateSecret } from "otplib";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DEFAULT_PROFILES = {
  admin: {
    name: "Admin",
    icon: "⭐",
    sortOrder: 0,
    desc: "Acesso total ao portal.",
    permissionsJson: JSON.stringify("all"),
    rolesJson: JSON.stringify(["master"]),
  },
  operador: {
    name: "Operador",
    icon: "🛠",
    sortOrder: 1,
    desc: "Operação musical e de PDVs.",
    permissionsJson: JSON.stringify({ cadastros: "all", producao: "all", config: ["logs"] }),
    rolesJson: JSON.stringify(["cadastros", "producao", "suporte"]),
  },
  financeiro: {
    name: "Financeiro",
    icon: "💰",
    sortOrder: 3,
    desc: "Cobrança e planilha Rio.",
    permissionsJson: JSON.stringify({ cobranca: "all", cadastros: ["vinculos"], config: ["logs"] }),
    rolesJson: JSON.stringify(["cobranca"]),
  },
  suporte: {
    name: "Suporte",
    icon: "🎧",
    sortOrder: 4,
    desc: "Suporte operacional.",
    permissionsJson: JSON.stringify({
      cobranca: ["consulta-painel"],
      cadastros: ["vinculos"],
      producao: "all",
      config: ["logs"],
    }),
    rolesJson: JSON.stringify(["suporte", "producao"]),
  },
};

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function ensureProfiles() {
  for (const [slug, cfg] of Object.entries(DEFAULT_PROFILES)) {
    await prisma.portalProfile.upsert({
      where: { slug },
      create: {
        slug,
        name: cfg.name,
        icon: cfg.icon,
        description: cfg.desc,
        permissionsJson: cfg.permissionsJson,
        rolesJson: cfg.rolesJson,
        sortOrder: cfg.sortOrder,
        isSystem: true,
      },
      update: {
        name: cfg.name,
        icon: cfg.icon,
        description: cfg.desc,
        sortOrder: cfg.sortOrder,
      },
    });
  }
  return prisma.portalProfile.findUniqueOrThrow({ where: { slug: "admin" } });
}

async function main() {
  const email = arg("--email", "rafael@radioibiza.com.br").trim().toLowerCase();
  const displayName = arg("--name", "Rafael Gasparian").trim();
  const jobTitle = arg("--cargo", "Diretor").trim();
  let password = arg("--password", "").trim();
  const generated = !password;
  if (generated) password = randomPassword();

  if (!email.includes("@")) {
    console.error("E-mail inválido.");
    process.exit(1);
  }

  const existing = await prisma.portalUser.findUnique({ where: { email } });
  if (existing) {
    console.error(`Usuário já existe: ${email}`);
    console.error("Use Config → Usuários no portal ou apague no banco antes de rodar de novo.");
    process.exit(1);
  }

  const adminProfile = await ensureProfiles();
  const passwordHash = bcrypt.hashSync(password, 12);
  const totpSecret = generateSecret();

  await prisma.portalUser.create({
    data: {
      email,
      displayName,
      jobTitle,
      passwordHash,
      totpSecret,
      profileId: adminProfile.id,
    },
  });

  console.log("");
  console.log("✅ Admin criado no banco (Neon).");
  console.log("");
  console.log("── Login no portal ──");
  console.log(`E-mail:  ${email}`);
  if (generated) {
    console.log(`Senha:   ${password}  ← anote agora (temporária)`);
  } else {
    console.log("Senha:   (a que você passou em --password)");
  }
  console.log("");
  console.log("── Google Authenticator ──");
  console.log("No app: + → Inserir chave de configuração");
  console.log(`Conta:   ${displayName}`);
  console.log(`Emissor: Radio Ibiza Portal`);
  console.log(`Chave:   ${totpSecret}`);
  console.log("");
  console.log("Depois entre em:");
  console.log("  https://site-vencidos-ibiza.netlify.app/login");
  console.log("  → Config → Usuários e perfis");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
