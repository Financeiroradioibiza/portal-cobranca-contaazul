/** Dono criativo por programação — só no navegador (localStorage), não vai ao servidor. */

export type ProgramacaoDono = {
  criativoEmail: string;
  criativoNome: string;
  criativoIniciais: string;
  criativoCor: string;
  updatedAt: string;
};

type StoreV1 = {
  version: 1;
  byProgramacaoId: Record<string, ProgramacaoDono>;
};

const STORAGE_KEY = "criacao-programacao-donos-v1";
export const PROGRAMACAO_DONO_CHANGED_EVENT = "criacao-programacao-dono-changed";

function emptyStore(): StoreV1 {
  return { version: 1, byProgramacaoId: {} };
}

function readStore(): StoreV1 {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as StoreV1;
    if (parsed?.version !== 1 || !parsed.byProgramacaoId) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreV1) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(PROGRAMACAO_DONO_CHANGED_EVENT));
}

export function readProgramacaoDonoMap(): Record<string, ProgramacaoDono> {
  return readStore().byProgramacaoId;
}

export function getProgramacaoDono(programacaoId: string): ProgramacaoDono | null {
  return readStore().byProgramacaoId[programacaoId] ?? null;
}

export function setProgramacaoDono(
  programacaoId: string,
  criativo: {
    email: string;
    displayName: string;
    tagIniciais: string;
    tagCor: string;
  },
): ProgramacaoDono {
  const store = readStore();
  const entry: ProgramacaoDono = {
    criativoEmail: criativo.email,
    criativoNome: criativo.displayName,
    criativoIniciais: criativo.tagIniciais,
    criativoCor: criativo.tagCor,
    updatedAt: new Date().toISOString(),
  };
  store.byProgramacaoId[programacaoId] = entry;
  writeStore(store);
  return entry;
}

export function clearProgramacaoDono(programacaoId: string) {
  const store = readStore();
  if (!store.byProgramacaoId[programacaoId]) return;
  delete store.byProgramacaoId[programacaoId];
  writeStore(store);
}

export function donoDisplayLabel(dono: ProgramacaoDono | null | undefined): string {
  if (!dono) return "—";
  return dono.criativoIniciais ?
      `[${dono.criativoIniciais}] ${dono.criativoNome}`
    : dono.criativoNome;
}
