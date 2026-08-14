import fs from 'node:fs';
import path from 'node:path';
import { criacaoConfig } from './config.js';

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function root(): string {
  return criacaoConfig.storageRoot;
}

function pathDentroDe(baseDir: string, rel: string): string | null {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, rel);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

export function isValidCheckSessionId(sessionId: string): boolean {
  return SESSION_RE.test(sessionId.trim());
}

export function isValidCheckFileId(fileId: string): boolean {
  return FILE_RE.test(fileId.trim());
}

export function checkScratchRoot(): string {
  return path.join(root(), 'check-scratch');
}

export function checkSessionDir(sessionId: string): string {
  if (!isValidCheckSessionId(sessionId)) throw new Error('session_id_invalido');
  const dir = pathDentroDe(checkScratchRoot(), sessionId);
  if (!dir) throw new Error('session_id_invalido');
  return dir;
}

export function checkFilePath(sessionId: string, fileId: string, ext = '.mp3'): string {
  if (!isValidCheckFileId(fileId)) throw new Error('file_id_invalido');
  const sessionDir = checkSessionDir(sessionId);
  const filePath = pathDentroDe(sessionDir, `${fileId}${ext}`);
  if (!filePath) throw new Error('file_id_invalido');
  return filePath;
}

export function ensureCheckScratchDirs(): void {
  fs.mkdirSync(checkScratchRoot(), { recursive: true });
}

export function listCheckSessionFiles(sessionId: string): Array<{ fileId: string; arquivoNome: string; ext: string }> {
  const dir = checkSessionDir(sessionId);
  if (!fs.existsSync(dir)) return [];
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { files?: Array<{ fileId: string; arquivoNome: string; ext?: string }> };
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files
      .filter((f) => f.fileId && f.arquivoNome)
      .map((f) => ({ fileId: f.fileId, arquivoNome: f.arquivoNome, ext: f.ext || '.mp3' }));
  } catch {
    return [];
  }
}

export function appendCheckManifestEntry(
  sessionId: string,
  entry: { fileId: string; arquivoNome: string; ext: string },
): void {
  const dir = checkSessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  let files: Array<{ fileId: string; arquivoNome: string; ext: string }> = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        files?: Array<{ fileId: string; arquivoNome: string; ext?: string }>;
      };
      if (Array.isArray(parsed.files)) {
        files = parsed.files.map((f) => ({
          fileId: f.fileId,
          arquivoNome: f.arquivoNome,
          ext: f.ext || '.mp3',
        }));
      }
    } catch {
      files = [];
    }
  }
  if (!files.some((f) => f.fileId === entry.fileId)) {
    files.push(entry);
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ sessionId, files, updatedAt: new Date().toISOString() }));
}

export async function deleteCheckSession(sessionId: string): Promise<void> {
  const dir = checkSessionDir(sessionId);
  await fs.promises.rm(dir, { recursive: true, force: true });
}
