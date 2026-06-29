import {
  buildAtlCricaExportManifest,
  type AtlCricaExportManifest,
} from "@/lib/criacao/atlCricaHierarquiaService";
import { getAtlCricaBoard } from "@/lib/criacao/atlCricaService";
import { getClienteProgramacaoArvore } from "@/lib/criacao/programacaoService";
import { sanitizePathSegment, splitRelativePath } from "@/lib/criacao/pathSanitize";

export type AtlCricaImportFileInput = {
  /** Path relativo incluindo nome do arquivo, ex.: Cliente/Prog/POP/faixa.mp3 */
  path: string;
};

export type AtlCricaImportPreviewLote = {
  clienteRef: string;
  clienteNome: string;
  programacaoId: string;
  programacaoNome: string;
  pastaId: string;
  pastaNome: string;
  arquivos: string[];
  /** Paths relativos completos (Cliente/Prog/Pasta/arquivo.mp3). */
  paths: string[];
};

export type AtlCricaImportPreview = {
  ok: true;
  competencia: string;
  uploadTag: string;
  lotes: AtlCricaImportPreviewLote[];
  stats: {
    totalFiles: number;
    totalPastas: number;
    totalClientes: number;
    ignoredNonMp3: number;
    unknownPaths: number;
  };
  warnings: string[];
  programacaoIds: string[];
};

type PastaLookup = {
  clienteRef: string;
  clienteNome: string;
  programacaoId: string;
  programacaoNome: string;
  pastaId: string;
  pastaNome: string;
};

function isMp3(name: string): boolean {
  return name.toLowerCase().endsWith(".mp3");
}

function lookupByManifestPath(
  manifest: AtlCricaExportManifest,
  folderPath: string,
): PastaLookup | null {
  const hit = manifest.pastas.find((p) => p.path === folderPath);
  if (!hit) return null;
  return {
    clienteRef: hit.clienteRef,
    clienteNome: hit.clienteNome,
    programacaoId: hit.programacaoId,
    programacaoNome: hit.programacaoNome,
    pastaId: hit.pastaId,
    pastaNome: hit.pastaNome,
  };
}

function lookupByNames(
  treeByCliente: Map<string, Awaited<ReturnType<typeof getClienteProgramacaoArvore>>>,
  clienteNomeByRef: Map<string, string>,
  clienteRefFilter: string | null,
  programacaoNome: string,
  pastaNome: string,
  progIdsAllowed: Set<string>,
): PastaLookup | null {
  const progKey = sanitizePathSegment(programacaoNome).toLowerCase();
  const pastaKey = sanitizePathSegment(pastaNome).toLowerCase();

  for (const [clienteRef, arvore] of treeByCliente) {
    if (clienteRefFilter && clienteRef !== clienteRefFilter) continue;
    for (const prog of arvore) {
      if (!progIdsAllowed.has(prog.id)) continue;
      if (sanitizePathSegment(prog.nome).toLowerCase() !== progKey) continue;
      for (const pasta of prog.pastas) {
        if (sanitizePathSegment(pasta.nome).toLowerCase() !== pastaKey) continue;
        return {
          clienteRef,
          clienteNome: clienteNomeByRef.get(clienteRef) ?? "",
          programacaoId: prog.id,
          programacaoNome: prog.nome,
          pastaId: pasta.id,
          pastaNome: pasta.nome,
        };
      }
    }
  }
  return null;
}

function resolveClienteRefByFolderName(
  boardClientes: Array<{ clienteRef: string; clienteNome: string }>,
  folderName: string,
): string | null {
  const key = sanitizePathSegment(folderName).toLowerCase();
  for (const c of boardClientes) {
    if (sanitizePathSegment(c.clienteNome).toLowerCase() === key) return c.clienteRef;
  }
  return null;
}

export async function previewAtlCricaImport(opts: {
  competencia?: string | null;
  sessionEmail: string;
  isAdmin?: boolean;
  manifest?: AtlCricaExportManifest | null;
  files: AtlCricaImportFileInput[];
}): Promise<AtlCricaImportPreview> {
  const board = await getAtlCricaBoard({
    competencia: opts.competencia,
    sessionEmail: opts.sessionEmail,
    isAdmin: opts.isAdmin,
  });
  const progIdsAllowed = new Set(board.rows.map((r) => r.programacaoId));
  const clienteNomeByRef = new Map(board.clientes.map((c) => [c.clienteRef, c.clienteNome]));

  let manifest = opts.manifest ?? null;
  if (!manifest) {
    manifest = await buildAtlCricaExportManifest({
      competencia: board.competencia,
      sessionEmail: opts.sessionEmail,
      isAdmin: opts.isAdmin,
    });
  }

  const treeByCliente = new Map<
    string,
    Awaited<ReturnType<typeof getClienteProgramacaoArvore>>
  >();
  for (const c of board.clientes) {
    treeByCliente.set(c.clienteRef, await getClienteProgramacaoArvore(c.clienteRef));
  }

  const warnings: string[] = [];
  let ignoredNonMp3 = 0;
  let unknownPaths = 0;

  const loteMap = new Map<string, AtlCricaImportPreviewLote>();

  for (const file of opts.files) {
    const segments = splitRelativePath(file.path);
    if (segments.length < 4) {
      unknownPaths += 1;
      continue;
    }
    const fileName = segments[segments.length - 1]!;
    if (!isMp3(fileName)) {
      ignoredNonMp3 += 1;
      continue;
    }
    const folderSegments = segments.slice(0, -1);
    const folderPath = folderSegments.join("/");

    let lookup: PastaLookup | null = null;
    if (manifest.pastas.length > 0) {
      lookup = lookupByManifestPath(manifest, folderPath);
    }
    if (!lookup && folderSegments.length >= 3) {
      const clienteSeg = folderSegments[0]!;
      const progSeg = folderSegments[1]!;
      const pastaSeg = folderSegments[2]!;
      const clienteRef = resolveClienteRefByFolderName(board.clientes, clienteSeg);
      lookup = lookupByNames(
        treeByCliente,
        clienteNomeByRef,
        clienteRef,
        progSeg,
        pastaSeg,
        progIdsAllowed,
      );
    }

    if (!lookup) {
      unknownPaths += 1;
      continue;
    }

    const key = lookup.pastaId;
    const existing = loteMap.get(key);
    if (existing) {
      existing.arquivos.push(fileName);
      existing.paths.push(file.path);
    } else {
      loteMap.set(key, {
        clienteRef: lookup.clienteRef,
        clienteNome: lookup.clienteNome,
        programacaoId: lookup.programacaoId,
        programacaoNome: lookup.programacaoNome,
        pastaId: lookup.pastaId,
        pastaNome: lookup.pastaNome,
        arquivos: [fileName],
        paths: [file.path],
      });
    }
  }

  const lotes = [...loteMap.values()];
  const programacaoIds = [...new Set(lotes.map((l) => l.programacaoId))];
  const clientes = new Set(lotes.map((l) => l.clienteRef));
  const totalFiles = lotes.reduce((n, l) => n + l.arquivos.length, 0);

  if (totalFiles === 0) {
    warnings.push("Nenhum MP3 reconhecido nas pastas enviadas.");
  }
  if (unknownPaths > 0) {
    warnings.push(`${unknownPaths} caminho(s) ignorado(s) — pasta desconhecida ou fora da hierarquia.`);
  }

  return {
    ok: true,
    competencia: board.competencia,
    uploadTag: manifest.uploadTag,
    lotes,
    stats: {
      totalFiles,
      totalPastas: lotes.length,
      totalClientes: clientes.size,
      ignoredNonMp3,
      unknownPaths,
    },
    warnings,
    programacaoIds,
  };
}
