#!/usr/bin/env node
import bcrypt from "bcryptjs";

const pwd = process.argv[2];
if (!pwd) {
  console.error("Uso: node scripts/portal-hash-password.mjs <senha>");
  process.exit(1);
}

console.log(bcrypt.hashSync(pwd, 12));
