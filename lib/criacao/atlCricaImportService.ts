import {
  buildAtlCricaExportManifest,
  type AtlCricaExportManifest,
  type AtlCricaManifestPasta,
} from "@/lib/criacao/atlCricaHierarquiaService";
import { getAtlCricaBoard } from "@/lib/criacao/atlCricaService";
import { getClienteProgramacaoArvore } from "@/lib/criacao/programacaoService";
import {
  atlFolderPathsLooseMatch,
  atlFolderPathsMatch,
  pathSegmentCompareKey,
  pathSegmentLooseKey,
  splitRelativePath,
  stripMacOsxPathPrefix,
} from "@/lib/criacao/pathSanitize";

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
  criativoUserId: string | null;
  criativoNome: string;
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
  /** Exemplos de caminhos ignorados (para diagnóstico). */
  sampleUnknownPaths: string[];
  programacaoIds: string[];
};

type PastaLookup = {
  clienteRef: string;
  clienteNome: string;
  programacaoId: string;
  programacaoNome: string;
  pastaId: string;
  pastaNome: string;
  criativoUserId: string | null;
  criativoNome: string;
};

function isMp3(name: string): boolean {
  return name.toLowerCase().endsWith(".mp3");
}

function lookupFromManifestPasta(
  hit: AtlCricaManifestPasta,
  criativoUserId: string | null,
  criativoNome: string,
): PastaLookup {
  return {
    clienteRef: hit.clienteRef,
    clienteNome: hit.clienteNome,
    programacaoId: hit.programacaoId,
    programacaoNome: hit.programacaoNome,
    pastaId: hit.pastaId,
    pastaNome: hit.pastaNome,
    criativoUserId,
    criativoNome,
  };
}

function criativoForProgramacao(
  boardRows: Array<{ programacaoId: string; criativoUserId: string | null; criativoNomeDb: string }>,
  programacaoId: string,
): { criativoUserId: string | null; criativoNome: string } {
  const row = boardRows.find((r) => r.programacaoId === programacaoId);
  return {
    criativoUserId: row?.criativoUserId ?? null,
    criativoNome: row?.criativoNomeDb ?? "",
  };
}

/**
 * Encontra a pasta do manifest pelo sufixo do caminho do arquivo.
 * Usa o atl-manifest.json exportado — não depende de match exato de string (Mac/ZIP).
 */
export function findManifestPastaForFilePath(
  manifest: AtlCricaExportManifest,
  filePath: string,
): AtlCricaManifestPasta | null {
  const segments = stripMacOsxPathPrefix(splitRelativePath(filePath));
  if (segments.length < 2) return null;
  const fileName = segments[segments.length - 1]!;
  if (!isMp3(fileName)) return null;
  const folderSegs = segments.slice(0, -1);

  let best: { hit: AtlCricaManifestPasta; depth: number } | null = null;
  for (const p of manifest.pastas) {
    const mSegs = splitRelativePath(p.path);
    if (folderSegs.length < mSegs.length) continue;
    const suffix = folderSegs.slice(-mSegs.length).join("/");
    if (atlFolderPathsMatch(suffix, p.path) || atlFolderPathsLooseMatch(suffix, p.path)) {
      if (!best || mSegs.length > best.depth) {
        best = { hit: p, depth: mSegs.length };
      }
    }
  }
  return best?.hit ?? null;
}

function lookupByNames(
  treeByCliente: Map<string, Awaited<ReturnType<typeof getClienteProgramacaoArvore>>>,
  clienteNomeByRef: Map<string, string>,
  clienteRefFilter: string | null,
  programacaoNome: string,
  pastaNome: string,
  progIdsAllowed: Set<string> | null,
  boardRows: Array<{ programacaoId: string; criativoUserId: string | null; criativoNomeDb: string }>,
): PastaLookup | null {
  const progKey = pathSegmentCompareKey(programacaoNome);
  const pastaKey = pathSegmentCompareKey(pastaNome);

  for (const [clienteRef, arvore] of treeByCliente) {
    if (clienteRefFilter && clienteRef !== clienteRefFilter) continue;
    for (const prog of arvore) {
      if (progIdsAllowed && !progIdsAllowed.has(prog.id)) continue;
      if (pathSegmentCompareKey(prog.nome) !== progKey) continue;
      for (const pasta of prog.pastas) {
        if (pathSegmentCompareKey(pasta.nome) !== pastaKey) continue;
        const criativo = criativoForProgramacao(boardRows, prog.id);
        return {
          clienteRef,
          clienteNome: clienteNomeByRef.get(clienteRef) ?? "",
          programacaoId: prog.id,
          programacaoNome: prog.nome,
          pastaId: pasta.id,
          pastaNome: pasta.nome,
          criativoUserId: criativo.criativoUserId,
          criativoNome: criativo.criativoNome,
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
  const key = pathSegmentCompareKey(folderName);
  const loose = pathSegmentLooseKey(folderName);
  for (const c of boardClientes) {
    if (pathSegmentCompareKey(c.clienteNome) === key) return c.clienteRef;
    if (pathSegmentLooseKey(c.clienteNome) === loose) return c.clienteRef;
  }
  return null;
}

export async function previewAtlCricaImport(opts: {
  competencia?: string | null;
  sessionEmail: string;
  manifest?: AtlCricaExportManifest | null;
  files: AtlCricaImportFileInput[];
}): Promise<AtlCricaImportPreview> {
  const board = await getAtlCricaBoard({
    competencia: opts.competencia,
    sessionEmail: opts.sessionEmail,
  });
  const progIdsAllowed = new Set(board.rows.map((r) => r.programacaoId));
  const clienteNomeByRef = new Map(board.clientes.map((c) => [c.clienteRef, c.clienteNome]));

  let manifest = opts.manifest ?? null;
  if (!manifest) {
    manifest = await buildAtlCricaExportManifest({
      competencia: board.competencia,
      sessionEmail: opts.sessionEmail,
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
  const sampleUnknownPaths: string[] = [];

  const loteMap = new Map<string, AtlCricaImportPreviewLote>();

  for (const file of opts.files) {
    const segments = stripMacOsxPathPrefix(splitRelativePath(file.path));
    if (segments.length < 2) {
      unknownPaths += 1;
      if (sampleUnknownPaths.length < 3) sampleUnknownPaths.push(file.path);
      continue;
    }
    const fileName = segments[segments.length - 1]!;
    if (!isMp3(fileName)) {
      ignoredNonMp3 += 1;
      continue;
    }

    let lookup: PastaLookup | null = null;

    if (manifest.pastas.length > 0) {
      const hit = findManifestPastaForFilePath(manifest, file.path);
      if (hit) {
        const criativo = criativoForProgramacao(board.rows, hit.programacaoId);
        lookup = lookupFromManifestPasta(hit, criativo.criativoUserId, criativo.criativoNome);
      }
    }

    if (!lookup) {
      const folderSegments = segments.slice(0, -1);
      const last3 = folderSegments.slice(-3);
      if (last3.length >= 3) {
        const clienteSeg = last3[0]!;
        const progSeg = last3[1]!;
        const pastaSeg = last3[2]!;
        const clienteRef = resolveClienteRefByFolderName(board.clientes, clienteSeg);
        lookup = lookupByNames(
          treeByCliente,
          clienteNomeByRef,
          clienteRef,
          progSeg,
          pastaSeg,
          progIdsAllowed,
          board.rows,
        );
        if (!lookup && opts.manifest) {
          lookup = lookupByNames(
            treeByCliente,
            clienteNomeByRef,
            clienteRef,
            progSeg,
            pastaSeg,
            null,
            board.rows,
          );
        }
      }
    }

    if (!lookup) {
      unknownPaths += 1;
      if (sampleUnknownPaths.length < 3) sampleUnknownPaths.push(file.path);
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
        criativoUserId: lookup.criativoUserId,
        criativoNome: lookup.criativoNome,
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
    warnings.push(`${unknownPaths} caminho(s) ignorado(s) — pasta não encontrada no manifest ou no painel.`);
    if (sampleUnknownPaths.length > 0) {
      warnings.push(`Exemplo: ${sampleUnknownPaths[0]}`);
    }
    warnings.push(
      "Confirme que o ZIP inclui atl-manifest.json (exportado pelo portal) e que a faixa está dentro de Cliente/Programação/Pasta.",
    );
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
    sampleUnknownPaths,
    programacaoIds,
  };
}
