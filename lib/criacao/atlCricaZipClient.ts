import JSZip from "jszip";
import {
  ATL_CRICA_LEIA_ME,
  type AtlCricaExportManifest,
} from "@/lib/criacao/atlCricaHierarquiaService";

export async function downloadAtlCricaHierarchyZip(manifest: AtlCricaExportManifest): Promise<void> {
  const zip = new JSZip();
  zip.file("atl-manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("LEIA-ME.txt", ATL_CRICA_LEIA_ME);

  for (const pasta of manifest.pastas) {
    zip.folder(pasta.path)?.file(".gitkeep", "");
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `atl-crica-${manifest.competencia}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseAtlManifestFromZip(file: File): Promise<AtlCricaExportManifest | null> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file("atl-manifest.json");
  if (!entry) return null;
  const raw = await entry.async("string");
  return JSON.parse(raw) as AtlCricaExportManifest;
}

export async function listMp3PathsFromZip(file: File): Promise<Array<{ path: string }>> {
  const zip = await JSZip.loadAsync(file);
  const files: Array<{ path: string }> = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized.toLowerCase().startsWith("__macosx/")) return;
    const name = normalized.split("/").pop() ?? "";
    if (!name.toLowerCase().endsWith(".mp3")) return;
    if (name === ".gitkeep") return;
    files.push({ path: normalized });
  });
  return files;
}

export function listMp3PathsFromFileList(fileList: FileList): Array<{ path: string }> {
  const files: Array<{ path: string }> = [];
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    if (!f) continue;
    if (!f.name.toLowerCase().endsWith(".mp3")) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    files.push({ path: rel.replace(/\\/g, "/") });
  }
  return files;
}

export async function readManifestFromFileList(fileList: FileList): Promise<AtlCricaExportManifest | null> {
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    if (!f) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (rel.endsWith("atl-manifest.json") || f.name === "atl-manifest.json") {
      const raw = await f.text();
      return JSON.parse(raw) as AtlCricaExportManifest;
    }
  }
  return null;
}

/** Mapa nome de arquivo → File a partir de FileList (folder picker). */
export function buildFileMapFromFileList(fileList: FileList): Map<string, File> {
  const map = new Map<string, File>();
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    if (!f) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    map.set(rel.replace(/\\/g, "/"), f);
  }
  return map;
}

export async function buildFileMapFromZip(file: File): Promise<Map<string, File>> {
  const zip = await JSZip.loadAsync(file);
  const map = new Map<string, File>();
  const tasks: Promise<void>[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    tasks.push(
      (async () => {
        const blob = await entry.async("blob");
        const path = relativePath.replace(/\\/g, "/");
        map.set(path, new File([blob], path.split("/").pop() ?? "audio.mp3", { type: "audio/mpeg" }));
      })(),
    );
  });
  await Promise.all(tasks);
  return map;
}
