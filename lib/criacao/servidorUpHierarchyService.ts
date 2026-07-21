import { prisma } from "@/lib/prisma";
import { getClienteProgramacaoMatchArvore } from "@/lib/criacao/programacaoService";
import { buildServidorUpPastaUploadTag } from "@/lib/criacao/servidorUpUploadTag";
import {
  pathSegmentCompareKey,
  pathSegmentLooseKey,
  splitRelativePath,
  stripMacOsxPathPrefix,
} from "@/lib/criacao/pathSanitize";

export type ServidorUpFileInput = {
  /** Path relativo, ex.: Cliente/Prog/Pasta/faixa.mp3 */
  path: string;
};

export type ServidorUpFolderInput = {
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  mp3Count: number;
};

export type ServidorUpHierarchyStatus =
  | "ok"
  | "missing_cliente"
  | "missing_programacao"
  | "missing_pasta";

export type ServidorUpHierarchyRow = {
  key: string;
  clienteNome: string;
  clienteRef: string | null;
  programacaoNome: string;
  programacaoId: string | null;
  pastaNome: string;
  pastaId: string | null;
  mp3Count: number;
  status: ServidorUpHierarchyStatus;
  criativoUserId: string | null;
  criativoNome: string;
  suggestedUploadTag: string;
};

export type ServidorUpHierarchyPreview = {
  ok: true;
  rows: ServidorUpHierarchyRow[];
  stats: {
    totalMp3: number;
    totalPastas: number;
    okPastas: number;
    missingPastas: number;
    missingProgramacoes: number;
    missingClientes: number;
    ignoredPaths: number;
  };
  warnings: string[];
};

function isMp3(name: string): boolean {
  return name.toLowerCase().endsWith(".mp3");
}

function resolveClienteRef(
  clientes: Array<{ ref: string; nome: string }>,
  folderName: string,
): { ref: string; nome: string } | null {
  const key = pathSegmentCompareKey(folderName);
  const loose = pathSegmentLooseKey(folderName);
  for (const c of clientes) {
    if (pathSegmentCompareKey(c.nome) === key) return c;
    if (pathSegmentLooseKey(c.nome) === loose) return c;
  }
  return null;
}

type MatchArvore = Awaited<ReturnType<typeof getClienteProgramacaoMatchArvore>>;

function findProgramacao(arvore: MatchArvore, programacaoNome: string) {
  const progKey = pathSegmentCompareKey(programacaoNome);
  const progLoose = pathSegmentLooseKey(programacaoNome);
  return (
    arvore.find((p) => pathSegmentCompareKey(p.nome) === progKey) ??
    arvore.find((p) => pathSegmentLooseKey(p.nome) === progLoose) ??
    null
  );
}

function findPasta(pastas: Array<{ id: string; nome: string }>, pastaNome: string) {
  const pastaKey = pathSegmentCompareKey(pastaNome);
  const pastaLoose = pathSegmentLooseKey(pastaNome);
  return (
    pastas.find((p) => pathSegmentCompareKey(p.nome) === pastaKey) ??
    pastas.find((p) => pathSegmentLooseKey(p.nome) === pastaLoose) ??
    null
  );
}

/** Agrega paths de MP3 em pastas (Cliente/Programação/Pasta). */
export function aggregateServidorUpFolders(
  files: ServidorUpFileInput[],
): { folders: ServidorUpFolderInput[]; ignoredPaths: number; warnings: string[] } {
  const warnings: string[] = [];
  let ignoredPaths = 0;
  const folderCounts = new Map<string, ServidorUpFolderInput>();

  for (const f of files) {
    const segments = stripMacOsxPathPrefix(splitRelativePath(f.path));
    if (segments.length < 2) {
      ignoredPaths += 1;
      continue;
    }
    const fileName = segments[segments.length - 1]!;
    if (!isMp3(fileName)) {
      ignoredPaths += 1;
      continue;
    }
    const folderSegs = segments.slice(0, -1);
    if (folderSegs.length < 3) {
      ignoredPaths += 1;
      if (warnings.length < 8) {
        warnings.push(
          `Caminho ignorado (esperado …/Cliente/Programação/Pasta/arquivo.mp3): ${f.path}`,
        );
      }
      continue;
    }

    const pastaNome = folderSegs[folderSegs.length - 1]!;
    const programacaoNome = folderSegs[folderSegs.length - 2]!;
    const clienteNome = folderSegs[folderSegs.length - 3]!;
    const key = `${pathSegmentLooseKey(clienteNome)}/${pathSegmentLooseKey(programacaoNome)}/${pathSegmentLooseKey(pastaNome)}`;
    const prev = folderCounts.get(key);
    if (prev) {
      prev.mp3Count += 1;
    } else {
      folderCounts.set(key, { clienteNome, programacaoNome, pastaNome, mp3Count: 1 });
    }
  }

  return { folders: [...folderCounts.values()], ignoredPaths, warnings };
}

async function listClientesFromProgramacoes(): Promise<Array<{ ref: string; nome: string }>> {
  const rows = await prisma.programacao.findMany({
    distinct: ["clienteRef"],
    select: { clienteRef: true, clienteNome: true },
    orderBy: { clienteNome: "asc" },
  });
  const byRef = new Map<string, string>();
  for (const r of rows) {
    const ref = r.clienteRef.trim();
    if (!ref) continue;
    const nome = (r.clienteNome || ref).trim();
    if (!byRef.has(ref)) byRef.set(ref, nome);
  }
  return [...byRef.entries()].map(([ref, nome]) => ({ ref, nome }));
}

async function buildRowsFromFolders(
  folders: ServidorUpFolderInput[],
  ignoredPaths: number,
  warnings: string[],
): Promise<ServidorUpHierarchyPreview> {
  const clientes = await listClientesFromProgramacoes();
  const refsNeeded = new Set<string>();

  for (const item of folders) {
    const hit = resolveClienteRef(clientes, item.clienteNome);
    if (hit) refsNeeded.add(hit.ref);
  }

  const treeByRef = new Map<string, MatchArvore>();
  await Promise.all(
    [...refsNeeded].map(async (ref) => {
      treeByRef.set(ref, await getClienteProgramacaoMatchArvore(ref));
    }),
  );

  const rows: ServidorUpHierarchyRow[] = [];

  for (const item of folders) {
    const key = `${pathSegmentLooseKey(item.clienteNome)}/${pathSegmentLooseKey(item.programacaoNome)}/${pathSegmentLooseKey(item.pastaNome)}`;
    const clienteHit = resolveClienteRef(clientes, item.clienteNome);

    if (!clienteHit) {
      rows.push({
        key,
        clienteNome: item.clienteNome,
        clienteRef: null,
        programacaoNome: item.programacaoNome,
        programacaoId: null,
        pastaNome: item.pastaNome,
        pastaId: null,
        mp3Count: item.mp3Count,
        status: "missing_cliente",
        criativoUserId: null,
        criativoNome: "",
        suggestedUploadTag: buildServidorUpPastaUploadTag(item.pastaNome),
      });
      continue;
    }

    const arvore = treeByRef.get(clienteHit.ref) ?? [];
    const prog = findProgramacao(arvore, item.programacaoNome);

    if (!prog) {
      rows.push({
        key,
        clienteNome: clienteHit.nome,
        clienteRef: clienteHit.ref,
        programacaoNome: item.programacaoNome,
        programacaoId: null,
        pastaNome: item.pastaNome,
        pastaId: null,
        mp3Count: item.mp3Count,
        status: "missing_programacao",
        criativoUserId: null,
        criativoNome: "",
        suggestedUploadTag: buildServidorUpPastaUploadTag(item.pastaNome),
      });
      continue;
    }

    const pasta = findPasta(prog.pastas, item.pastaNome);
    const pastaLabel = pasta?.nome ?? item.pastaNome;

    rows.push({
      key,
      clienteNome: clienteHit.nome,
      clienteRef: clienteHit.ref,
      programacaoNome: prog.nome,
      programacaoId: prog.id,
      pastaNome: item.pastaNome,
      pastaId: pasta?.id ?? null,
      mp3Count: item.mp3Count,
      status: pasta ? "ok" : "missing_pasta",
      criativoUserId: prog.criativoUserId,
      criativoNome: prog.criativoNome,
      suggestedUploadTag: buildServidorUpPastaUploadTag(pastaLabel),
    });
  }

  rows.sort((a, b) => {
    const pathA = `${a.clienteNome}/${a.programacaoNome}/${a.pastaNome}`;
    const pathB = `${b.clienteNome}/${b.programacaoNome}/${b.pastaNome}`;
    return pathA.localeCompare(pathB, "pt-BR");
  });

  const totalMp3 = rows.reduce((s, r) => s + r.mp3Count, 0);

  return {
    ok: true,
    rows,
    stats: {
      totalMp3,
      totalPastas: rows.length,
      okPastas: rows.filter((r) => r.status === "ok").length,
      missingPastas: rows.filter((r) => r.status === "missing_pasta").length,
      missingProgramacoes: rows.filter((r) => r.status === "missing_programacao").length,
      missingClientes: rows.filter((r) => r.status === "missing_cliente").length,
      ignoredPaths,
    },
    warnings,
  };
}

export async function previewServidorUpHierarchy(
  files: ServidorUpFileInput[],
): Promise<ServidorUpHierarchyPreview> {
  const { folders, ignoredPaths, warnings } = aggregateServidorUpFolders(files);
  return buildRowsFromFolders(folders, ignoredPaths, warnings);
}

export async function previewServidorUpHierarchyFromFolders(
  folders: ServidorUpFolderInput[],
): Promise<ServidorUpHierarchyPreview> {
  return buildRowsFromFolders(folders, 0, []);
}
