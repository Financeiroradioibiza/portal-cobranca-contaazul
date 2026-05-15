#!/usr/bin/env node
/**
 * Gera bcrypt (cost 12) para PORTAL_USERS_JSON.
 *
 * Evita erros do zsh com ! e aspas:
 *   node scripts/portal-hash-password.mjs
 * (modo interativo — digite a senha quando pedir)
 *
 * Ou, com heredoc (senha não passa na linha de comando):
 *   node scripts/portal-hash-password.mjs --stdin <<'EOF'
 *   sua senha aqui
 *   EOF
 */
import bcrypt from "bcryptjs";
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main() {
  const arg = process.argv[2];

  let pwd;
  if (arg === "--stdin") {
    pwd = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
  } else if (arg) {
    pwd = arg;
  } else {
    const rl = readline.createInterface({ input, output });
    pwd = await rl.question("Digite a senha e pressione Enter: ");
    await rl.close();
  }

  if (!pwd) {
    console.error("Senha vazia. Nada a fazer.");
    process.exit(1);
  }

  console.log(bcrypt.hashSync(pwd, 12));
}

await main();
