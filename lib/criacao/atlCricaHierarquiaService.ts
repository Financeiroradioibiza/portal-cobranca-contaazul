import { getAtlCricaBoard } from "@/lib/criacao/atlCricaService";
import { buildAtlFolderPath } from "@/lib/criacao/pathSanitize";
import { defaultUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { programacaoOwnedByEmail } from "@/lib/criacao/programacaoOwnership";

export type AtlCricaManifestPasta = {
  path: string;
  clienteRef: string;
  clienteNome: string;
  programacaoId: string;
  programacaoNome: string;
  pastaId: string;
  pastaNome: string;
};

export type AtlCricaExportManifest = {
  ok: true;
  version: 1;
  competencia: string;
  uploadTag: string;
  criadorEmail: string;
  pastas: AtlCricaManifestPasta[];
  clientes: Array<{ clienteRef: string; clienteNome: string; programacoes: number; pastas: number }>;
  warnings: string[];
  blockExport: boolean;
};

function uploadTagFromCompetencia(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia.trim());
  if (m) return `${m[2]}/${m[1]!.slice(-2)}`;
  return defaultUploadCompetenciaTag();
}

function uniquePath(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const next = `${base}-${n}`;
  used.add(next);
  return next;
}

export async function buildAtlCricaExportManifest(opts: {
  competencia?: string | null;
  sessionEmail: string;
}): Promise<AtlCricaExportManifest> {
  const board = await getAtlCricaBoard(opts);
  const sessionEmail = normalizePortalEmail(opts.sessionEmail);
  const warnings: string[] = [];
  const pastas: AtlCricaManifestPasta[] = [];
  const usedPaths = new Set<string>();
  const clienteStats = new Map<
    string,
    { clienteNome: string; programacoes: Set<string>; pastas: number }
  >();

  const progIdsOnBoard = board.rows.map((r) => r.programacaoId);
  if (progIdsOnBoard.length === 0) {
    warnings.push("Nenhuma programação sua nesta competência — defina o Dono na Central de programações.");
    return {
      ok: true,
      version: 1,
      competencia: board.competencia,
      uploadTag: uploadTagFromCompetencia(board.competencia),
      criadorEmail: board.sessionEmail,
      pastas: [],
      clientes: [],
      warnings,
      blockExport: true,
    };
  }

  const progsComPastas = await prisma.programacao.findMany({
    where: { id: { in: progIdsOnBoard } },
    orderBy: [{ clienteNome: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
      criativoUserId: true,
      pastas: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, nome: true },
      },
    },
  });

  for (const prog of progsComPastas) {
    if (!programacaoOwnedByEmail(prog, sessionEmail)) continue;

    const row = board.rows.find((r) => r.programacaoId === prog.id);
    if (row && row.pastasCount === 0) {
      warnings.push(
        `${prog.clienteNome} · ${prog.nome} — sem pastas (crie na Central de programações).`,
      );
    }
    if (prog.pastas.length === 0) continue;

    for (const pasta of prog.pastas) {
      const basePath = buildAtlFolderPath(prog.clienteNome, prog.nome, pasta.nome);
      const path = uniquePath(basePath, usedPaths);
      pastas.push({
        path,
        clienteRef: prog.clienteRef,
        clienteNome: prog.clienteNome,
        programacaoId: prog.id,
        programacaoNome: prog.nome,
        pastaId: pasta.id,
        pastaNome: pasta.nome,
      });

      const stat = clienteStats.get(prog.clienteRef) ?? {
        clienteNome: prog.clienteNome,
        programacoes: new Set<string>(),
        pastas: 0,
      };
      stat.programacoes.add(prog.id);
      stat.pastas += 1;
      clienteStats.set(prog.clienteRef, stat);
    }
  }

  if (pastas.length === 0) {
    warnings.push("Nenhuma pasta encontrada para exportar nesta competência.");
  }

  const blockExport = warnings.some((w) => w.includes("sem pastas"));

  return {
    ok: true,
    version: 1,
    competencia: board.competencia,
    uploadTag: uploadTagFromCompetencia(board.competencia),
    criadorEmail: board.sessionEmail,
    pastas,
    clientes: [...clienteStats.entries()].map(([clienteRef, s]) => ({
      clienteRef,
      clienteNome: s.clienteNome,
      programacoes: s.programacoes.size,
      pastas: s.pastas,
    })),
    warnings,
    blockExport,
  };
}

export const ATL_CRICA_LEIA_ME = `ATL CRICA — hierarquia de pastas
================================

1. Coloque arquivos .mp3 dentro das pastas (Cliente/Programação/Pasta).
2. Não renomeie as pastas de primeiro nível se possível — o portal usa atl-manifest.json para saber o destino.
3. Volte ao portal ATL CRICA e use «Importar pasta preenchida» ou envie este ZIP de volta.

Competência e tag de upload estão em atl-manifest.json.
`;
