"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "portal:master:criacao-live-diag";

type CriacaoLiveDiagContextValue = {
  isMaster: boolean;
  enabled: boolean;
  requestEnable: () => void;
  disable: () => void;
  toggle: () => void;
};

const CriacaoLiveDiagContext = createContext<CriacaoLiveDiagContextValue | null>(null);

export function CriacaoLiveDiagProvider({
  isMaster,
  children,
}: {
  isMaster: boolean;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isMaster) {
      setEnabled(false);
      return;
    }
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setEnabled(false);
    }
  }, [isMaster]);

  const persist = useCallback(
    (next: boolean) => {
      if (!isMaster) return;
      try {
        if (next) window.localStorage.setItem(STORAGE_KEY, "1");
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setEnabled(next);
    },
    [isMaster],
  );

  const requestEnable = useCallback(() => {
    if (!isMaster || enabled) return;
    if (
      !window.confirm(
        "Ativar diagnóstico ao vivo no rodapé?\n\nSó o usuário Master vê este painel flutuante (fila + erros da Criação).",
      )
    ) {
      return;
    }
    persist(true);
  }, [enabled, isMaster, persist]);

  const disable = useCallback(() => {
    persist(false);
  }, [persist]);

  const toggle = useCallback(() => {
    if (enabled) disable();
    else requestEnable();
  }, [disable, enabled, requestEnable]);

  const value = useMemo(
    () => ({
      isMaster,
      enabled: isMaster && enabled,
      requestEnable,
      disable,
      toggle,
    }),
    [disable, enabled, isMaster, requestEnable, toggle],
  );

  return <CriacaoLiveDiagContext.Provider value={value}>{children}</CriacaoLiveDiagContext.Provider>;
}

export function useCriacaoLiveDiag(): CriacaoLiveDiagContextValue {
  const ctx = useContext(CriacaoLiveDiagContext);
  return (
    ctx ?? {
      isMaster: false,
      enabled: false,
      requestEnable: () => {},
      disable: () => {},
      toggle: () => {},
    }
  );
}
