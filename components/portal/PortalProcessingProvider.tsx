"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { shouldTrackPortalFetch, type PortalFetchInit } from "@/lib/portal/portalProcessing";

type PortalProcessingContextValue = {
  busy: boolean;
  /** Operações longas fora de `fetch` (upload externo, etc.). */
  runProcessing: <T>(fn: () => Promise<T>, label?: string) => Promise<T>;
  beginProcessing: (label?: string) => void;
  endProcessing: () => void;
};

const PortalProcessingContext = createContext<PortalProcessingContextValue | null>(null);

const SHOW_DELAY_MS = 280;

export function PortalProcessingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const labelRef = useRef<string | null>(null);

  const beginProcessing = useCallback((nextLabel?: string) => {
    setCount((c) => c + 1);
    if (nextLabel?.trim()) {
      labelRef.current = nextLabel.trim();
      setLabel(nextLabel.trim());
    }
  }, []);

  const endProcessing = useCallback(() => {
    setCount((c) => {
      const next = Math.max(0, c - 1);
      if (next === 0) {
        labelRef.current = null;
        setLabel(null);
      }
      return next;
    });
  }, []);

  const runProcessing = useCallback(
    async <T,>(fn: () => Promise<T>, nextLabel?: string): Promise<T> => {
      beginProcessing(nextLabel);
      try {
        return await fn();
      } finally {
        endProcessing();
      }
    },
    [beginProcessing, endProcessing],
  );

  useEffect(() => {
    if (count <= 0) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [count]);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const track = shouldTrackPortalFetch(input, init as PortalFetchInit | undefined);
      if (track) beginProcessing();
      try {
        return await original(input, init);
      } finally {
        if (track) endProcessing();
      }
    };
    return () => {
      window.fetch = original;
    };
  }, [beginProcessing, endProcessing]);

  const value = useMemo<PortalProcessingContextValue>(
    () => ({
      busy: count > 0,
      runProcessing,
      beginProcessing,
      endProcessing,
    }),
    [count, runProcessing, beginProcessing, endProcessing],
  );

  return (
    <PortalProcessingContext.Provider value={value}>
      {children}
      {visible ?
        <div
          className="portal-processing-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={label ?? "Processando"}
        >
          <div className="portal-processing-card">
            <div className="portal-processing-mark" aria-hidden>
              <span className="portal-processing-r">R</span>
            </div>
            <p className="portal-processing-text">{label ?? "Processando…"}</p>
          </div>
        </div>
      : null}
    </PortalProcessingContext.Provider>
  );
}

export function usePortalProcessing(): PortalProcessingContextValue {
  const ctx = useContext(PortalProcessingContext);
  if (!ctx) {
    throw new Error("usePortalProcessing must be used within PortalProcessingProvider");
  }
  return ctx;
}

/** Versão opcional — não quebra fora do provider. */
export function usePortalProcessingOptional(): PortalProcessingContextValue | null {
  return useContext(PortalProcessingContext);
}
