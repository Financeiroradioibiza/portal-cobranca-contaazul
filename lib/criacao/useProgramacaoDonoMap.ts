"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearProgramacaoDono,
  getProgramacaoDono,
  PROGRAMACAO_DONO_CHANGED_EVENT,
  readProgramacaoDonoMap,
  setProgramacaoDono,
  type ProgramacaoDono,
} from "@/lib/criacao/programacaoDonoLocal";

export function useProgramacaoDonoMap() {
  const [map, setMap] = useState<Record<string, ProgramacaoDono>>({});

  const refresh = useCallback(() => {
    setMap(readProgramacaoDonoMap());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("criacao-programacao-donos")) refresh();
    };
    const onCustom = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROGRAMACAO_DONO_CHANGED_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROGRAMACAO_DONO_CHANGED_EVENT, onCustom);
    };
  }, [refresh]);

  const assignDono = useCallback(
    (
      programacaoId: string,
      criativo: {
        email: string;
        displayName: string;
        tagIniciais: string;
        tagCor: string;
      },
    ) => {
      setProgramacaoDono(programacaoId, criativo);
      refresh();
    },
    [refresh],
  );

  const removeDono = useCallback(
    (programacaoId: string) => {
      clearProgramacaoDono(programacaoId);
      refresh();
    },
    [refresh],
  );

  const getDono = useCallback(
    (programacaoId: string) => map[programacaoId] ?? getProgramacaoDono(programacaoId),
    [map],
  );

  return { map, assignDono, removeDono, getDono, refresh };
}
