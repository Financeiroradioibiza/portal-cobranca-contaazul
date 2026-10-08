#!/usr/bin/env node
/**
 * Build Vite (sites/preview-musical) → public/preview-musical/
 * Requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (mesmas do Netlify preview.radioibiza.com.br).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "sites/preview-musical");
const outPublic = path.join(root, "public/preview-musical");

const dotEnvPath = path.join(appDir, ".env");
if (existsSync(dotEnvPath)) {
  for (const line of readFileSync(dotEnvPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.warn(
    "[preview-musical] SKIP: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para gerar public/preview-musical/",
  );
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(npm, ["ci"], appDir);
run(npm, ["run", "build"], appDir);

rmSync(outPublic, { recursive: true, force: true });
mkdirSync(path.dirname(outPublic), { recursive: true });
cpSync(path.join(appDir, "dist"), outPublic, { recursive: true });

console.log("[preview-musical] OK → public/preview-musical/");
