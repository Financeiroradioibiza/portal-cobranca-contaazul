#!/usr/bin/env node
/**
 * Netlify build: `prisma migrate deploy` com novas tentativas (Neon a acordar / rede intermitente).
 *
 * Emergência (só enquanto corrige DATABASE_URL):
 *   SKIP_PRISMA_MIGRATE=1
 *
 * Se migrate falhar mas quiser publicar o site mesmo assim (migração já feita à mão):
 *   PRISMA_MIGRATE_CONTINUE_ON_FAIL=1
 *
 * Afinar:
 *   PRISMA_MIGRATE_ATTEMPTS=3
 *   PRISMA_MIGRATE_DELAY_MS=4000
 */
import { spawn } from "node:child_process";

if (process.env.SKIP_PRISMA_MIGRATE === "1") {
  console.log("[netlify-migrate] SKIP_PRISMA_MIGRATE=1 — a saltar prisma migrate deploy.");
  process.exit(0);
}

const onNetlify = process.env.NETLIFY === "true";
const defaultAttempts = onNetlify ? 3 : 6;
const attempts = Math.max(1, Number(process.env.PRISMA_MIGRATE_ATTEMPTS || defaultAttempts));
const baseDelay = Math.max(1500, Number(process.env.PRISMA_MIGRATE_DELAY_MS || 4000));
const continueOnFail = process.env.PRISMA_MIGRATE_CONTINUE_ON_FAIL === "1";

function validateDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    return {
      ok: false,
      retryable: false,
      message:
        "DATABASE_URL está vazia no Netlify. Cole a connection string **Pooled** do Neon (começa com postgresql://).",
    };
  }
  const url = raw.trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    return {
      ok: false,
      retryable: false,
      message:
        "DATABASE_URL inválida: tem de começar por postgresql:// ou postgres:// (sem aspas à volta no painel Netlify).",
    };
  }
  return { ok: true, url };
}

function runMigrate() {
  return new Promise((resolve) => {
    let stderr = "";
    const child = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: ["inherit", "inherit", "pipe"],
      shell: process.platform === "win32",
      env: process.env,
    });
    child.stderr?.on("data", (chunk) => {
      const t = String(chunk);
      stderr += t;
      process.stderr.write(t);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", () => resolve({ code: 1, stderr }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hintFromStderr(stderr) {
  if (/P1012|must start with the protocol `postgresql/i.test(stderr)) {
    return "DATABASE_URL mal formatada (P1012) — use a string pooled do Neon, ex.: postgresql://user:pass@ep-….neon.tech/neondb?sslmode=require";
  }
  if (/P1001|Can't reach database/i.test(stderr)) {
    return "Neon inacessível (P1001) — confira DATABASE_URL pooled + ?sslmode=require no painel Netlify.";
  }
  if (/P1000|P1003|authentication failed/i.test(stderr)) {
    return "Credenciais inválidas no DATABASE_URL.";
  }
  if (/P3009|failed migrations/i.test(stderr)) {
    return "Migração falhou no banco — veja o log Prisma e corrija antes de publicar.";
  }
  return null;
}

function finishMigrateFailure(hint, attemptsLabel) {
  console.error(`[netlify-migrate] Falha${attemptsLabel}.`);
  if (hint) console.error(`[netlify-migrate] → ${hint}`);
  console.error(
    `[netlify-migrate] Opções:
→ Netlify → Environment variables → DATABASE_URL = connection string Pooled do Neon.
→ Rode \`npx prisma migrate deploy\` localmente contra o mesmo banco.
→ SKIP_PRISMA_MIGRATE=1 — ignora migrate neste build.
→ PRISMA_MIGRATE_CONTINUE_ON_FAIL=1 — publica o site mesmo se migrate falhar.`,
  );
  if (continueOnFail) {
    console.warn(
      "[netlify-migrate] PRISMA_MIGRATE_CONTINUE_ON_FAIL=1 — build segue; corrija DATABASE_URL para o site gravar no banco.",
    );
    process.exit(0);
  }
  process.exit(1);
}

(async () => {
  const dbCheck = validateDatabaseUrl();
  if (!dbCheck.ok) {
    finishMigrateFailure(dbCheck.message, " (validação DATABASE_URL)");
    return;
  }

  let lastStderr = "";
  for (let i = 1; i <= attempts; i++) {
    console.log(`[netlify-migrate] tentativa ${i}/${attempts}: npx prisma migrate deploy`);
    const { code, stderr } = await runMigrate();
    lastStderr = stderr;
    if (code === 0) {
      console.log("[netlify-migrate] migrate deploy concluído.");
      process.exit(0);
    }
    const hint = hintFromStderr(stderr);
    if (hint && /P1012|mal formatada/i.test(hint)) {
      finishMigrateFailure(hint, "");
      return;
    }
    if (i < attempts) {
      const wait = baseDelay * i;
      console.log(`[netlify-migrate] falhou (código ${code}). Aguardar ${wait} ms e repetir…`);
      await sleep(wait);
    }
  }

  finishMigrateFailure(hintFromStderr(lastStderr), ` após ${attempts} tentativas`);
})();
