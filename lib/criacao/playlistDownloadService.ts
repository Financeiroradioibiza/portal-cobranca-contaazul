import { prisma } from "@/lib/prisma";
import { buildAtlFolderPath, sanitizePathSegment } from "@/lib/criacao/pathSanitize";
import { masterOnB2 } from "@/lib/criacao/musicaStorageBadges";
import {
  buildPresignedMaster192Url,
  resolveMasterB2ObjectKeys,
} from "@/lib/criacao/b2MasterFetch";
import {
  buildCloud3Master192DownloadUrl,
  buildMaster192PortalDownloadUrl,
  masterDownloadMode,
} from "@/lib/criacao/masterDownloadUrl";

export type PlaylistDownloadTrack = {
  musicaId: string;
  titulo: string;
  artista: string;
  pastaNome: string;
  zipRelativePath: string;
  downloadUrl: string | null;
  skipReason: string | null;
};

export type PlaylistDownloadManifest = {
  programacaoId: string;
  clienteNome: string;
  programacaoNome: string;
  zipRootFolder: string;
  tracks: PlaylistDownloadTrack[];
  totalFaixas: number;
  baixaveis: number;
  omitidas: number;
};

function buildMp3FileName(artista: string, titulo: string, usedInFolder: Set<string>): string {
  const stem = sanitizePathSegment(`${artista.trim()} - ${titulo.trim()}`) || "faixa";
  let name = stem.toLowerCase().endsWith(".mp3") ? stem : `${stem}.mp3`;
  if (!usedInFolder.has(name.toLowerCase())) {
    usedInFolder.add(name.toLowerCase());
    return name;
  }
  const base = name.replace(/\.mp3$/i, "");
  let n = 2;
  while (usedInFolder.has(`${base} (${n}).mp3`.toLowerCase())) n += 1;
  name = `${base} (${n}).mp3`;
  usedInFolder.add(name.toLowerCase());
  return name;
}

/** Lista faixas da programação na ordem pastas → músicas, com URLs master 192k (cloud2/B2). */
export async function loadPlaylistDownloadManifest(
  programacaoId: string,
): Promise<PlaylistDownloadManifest | null> {
  const id = programacaoId.trim();
  if (!id) return null;

  const p = await prisma.programacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      clienteNome: true,
      pastas: {
        orderBy: { sortOrder: "asc" },
        select: {
          nome: true,
          musicas: {
            orderBy: { sortOrder: "asc" },
            select: {
              musica: {
                select: {
                  id: true,
                  titulo: true,
                  artista: true,
                  masterStorageKey: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!p) return null;

  const clienteNome = p.clienteNome.trim() || "Cliente";
  const programacaoNome = p.nome.trim() || "Programacao";
  const zipRootFolder = sanitizePathSegment(`${clienteNome} - ${programacaoNome}`);

  const tracks: PlaylistDownloadTrack[] = [];
  const usedNamesByFolder = new Map<string, Set<string>>();

  for (const pasta of p.pastas) {
    const pastaNome = pasta.nome.trim() || "Pasta";
    const folderKey = pastaNome.toLowerCase();
    let used = usedNamesByFolder.get(folderKey);
    if (!used) {
      used = new Set<string>();
      usedNamesByFolder.set(folderKey, used);
    }

    for (const pm of pasta.musicas) {
      const m = pm.musica;
      const musicaId = m.id;
      const fileName = buildMp3FileName(m.artista, m.titulo, used);
      const folderPath = buildAtlFolderPath(clienteNome, programacaoNome, pastaNome);
      const zipRelativePath = `${folderPath}/${fileName}`;

      let skipReason: string | null = null;
      let downloadUrl: string | null = null;

      if (!masterOnB2(m.masterStorageKey)) {
        skipReason = m.masterStorageKey?.startsWith("local:") ? "master_somente_local" : "sem_master_b2";
      } else {
        const mode = masterDownloadMode();
        if (mode === "b2_presigned") {
          downloadUrl = await buildPresignedMaster192Url(musicaId, m.masterStorageKey);
        } else if (mode === "cloud3") {
          const keys = resolveMasterB2ObjectKeys(musicaId, m.masterStorageKey, "master/");
          downloadUrl = keys[0] ? buildCloud3Master192DownloadUrl(keys[0]) : null;
        } else {
          downloadUrl = buildMaster192PortalDownloadUrl(musicaId);
        }
        if (!downloadUrl) skipReason = "download_desabilitado";
      }

      tracks.push({
        musicaId,
        titulo: m.titulo,
        artista: m.artista,
        pastaNome,
        zipRelativePath,
        downloadUrl,
        skipReason,
      });
    }
  }

  const baixaveis = tracks.filter((t) => t.downloadUrl).length;

  return {
    programacaoId: p.id,
    clienteNome,
    programacaoNome,
    zipRootFolder,
    tracks,
    totalFaixas: tracks.length,
    baixaveis,
    omitidas: tracks.length - baixaveis,
  };
}
