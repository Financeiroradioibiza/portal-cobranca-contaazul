"use client";

import { useEffect, useRef, useState } from "react";
import { CompareTrack } from "@/components/criacao/waveform/CompareTrack";
import {
  buildLocalLegacyAudioUrl,
  pingLocalServidorUp,
} from "@/lib/criacao/localServidorUpClient";

type PreviewCacheEntry = {
  downloadItemId: string;
  stagingPreviewUrl: string | null;
};

async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "Resposta inválida" : `HTTP ${res.status}`);
  }
}

async function pollPreviewReady(
  downloadItemId: string,
  signal: AbortSignal,
): Promise<{ stagingPreviewUrl: string | null; erroMsg?: string }> {
  for (let round = 0; round < 36; round++) {
    if (signal.aborted) throw new Error("cancelado");

    await fetch("/api/criacao/download/sync-pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1, timeoutMs: 45_000 }),
      signal,
    }).catch(() => {});

    const res = await fetch(
      `/api/criacao/servidor-up/preview-compare?itemId=${encodeURIComponent(downloadItemId)}`,
      { signal },
    );
    const data = await readApiJson<{
      ok?: boolean;
      status?: string;
      stagingPreviewUrl?: string | null;
      erroMsg?: string;
      error?: string;
    }>(res);

    if (!res.ok) throw new Error(data.error ?? "Falha ao consultar preview.");

    if (data.status === "concluido") {
      return { stagingPreviewUrl: data.stagingPreviewUrl ?? null };
    }
    if (data.status === "erro") {
      throw new Error(data.erroMsg?.trim() || "Download Deemix falhou.");
    }

    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Tempo esgotado — tente de novo ou abra o Download link.");
}

export function ServidorUpTrackCompareInline({
  relativePath,
  legacyLabel,
  deemixLabel,
  deezerUrl,
  previewJobId,
  onPreviewJobId,
  onClose,
}: {
  relativePath: string;
  legacyLabel: string;
  deemixLabel: string;
  deezerUrl: string;
  previewJobId: string | null;
  onPreviewJobId: (jobId: string) => void;
  onClose: () => void;
}) {
  const cacheRef = useRef<Map<string, PreviewCacheEntry>>(new Map());
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [statusMsg, setStatusMsg] = useState("Preparando comparação…");
  const [stagingPreviewUrl, setStagingPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  const [streamOk, setStreamOk] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const legacyPreviewUrl = agentOk ? buildLocalLegacyAudioUrl(relativePath) : null;

  useEffect(() => {
    let cancelled = false;
    void pingLocalServidorUp().then((h) => {
      if (!cancelled) setAgentOk(Boolean(h?.ok));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = `${relativePath}::${deezerUrl}`;
    const cached = cacheRef.current.get(cacheKey);

    async function run() {
      if (cached?.stagingPreviewUrl) {
        setStagingPreviewUrl(cached.stagingPreviewUrl);
        setPhase("ready");
        return;
      }

      setPhase("loading");
      setErr(null);
      setStatusMsg("Baixando preview Deemix (temp)…");

      try {
        const startRes = await fetch("/api/criacao/servidor-up/preview-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deezerUrl, previewJobId: previewJobId ?? undefined }),
          signal: controller.signal,
        });
        const start = await readApiJson<{
          ok?: boolean;
          previewJobId?: string;
          downloadItemId?: string;
          stagingPreviewUrl?: string | null;
          streamEnabled?: boolean;
          status?: string;
          erroMsg?: string;
          error?: string;
        }>(startRes);

        if (controller.signal.aborted) return;

        if (!startRes.ok || !start.downloadItemId) {
          throw new Error(start.error ?? "Falha ao iniciar preview.");
        }

        if (start.previewJobId) onPreviewJobId(start.previewJobId);
        setStreamOk(start.streamEnabled !== false);

        if (start.status === "concluido" && start.stagingPreviewUrl) {
          cacheRef.current.set(cacheKey, {
            downloadItemId: start.downloadItemId,
            stagingPreviewUrl: start.stagingPreviewUrl,
          });
          setStagingPreviewUrl(start.stagingPreviewUrl);
          setPhase("ready");
          return;
        }

        if (start.status === "erro") {
          throw new Error(start.erroMsg?.trim() || "Download Deemix falhou.");
        }

        setStatusMsg("Processando no Deemix… aguarde (~30s)");
        const ready = await pollPreviewReady(start.downloadItemId, controller.signal);
        if (controller.signal.aborted) return;

        cacheRef.current.set(cacheKey, {
          downloadItemId: start.downloadItemId,
          stagingPreviewUrl: ready.stagingPreviewUrl,
        });
        setStagingPreviewUrl(ready.stagingPreviewUrl);
        setPhase("ready");
      } catch (e) {
        if (controller.signal.aborted) return;
        setErr(e instanceof Error ? e.message : "Falha na comparação.");
        setPhase("error");
      }
    }

    void run();
    return () => controller.abort();
  }, [deezerUrl, relativePath, previewJobId, onPreviewJobId, retryKey]);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
            Check visual — legado vs Deemix
          </p>
          <p className="mt-0.5 text-[11px] text-amber-900/80 dark:text-amber-200/80">
            Preview sob demanda; o MP3 Deemix fica em staging temporário no cloud2.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-amber-400 px-2 py-0.5 text-[10px] font-semibold dark:border-amber-700"
        >
          Fechar
        </button>
      </div>

      {phase === "loading" ?
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{statusMsg}</p>
      : null}
      {err ?
        <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">{err}</p>
      : null}
      {phase === "error" ?
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Tentar de novo
        </button>
      : null}

      {phase === "ready" ?
        <>
          {!streamOk ?
            <p className="mb-2 text-xs text-red-700 dark:text-red-300">
              Preview Deemix indisponível — CRIACAO_INGEST_SECRET ausente.
            </p>
          : null}
          {agentOk === false ?
            <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
              Agente Servidor UP offline — só o áudio Deemix estará disponível.
            </p>
          : null}

          <div className="space-y-3">
            <CompareTrack
              label="Legado (cliente)"
              subtitle={legacyLabel}
              previewUrl={legacyPreviewUrl}
              accentClass="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30"
              crossOrigin=""
            />
            <CompareTrack
              label="Deemix (Deezer)"
              subtitle={deemixLabel}
              previewUrl={stagingPreviewUrl}
              accentClass="border-sky-200 bg-sky-50/80 dark:border-sky-900 dark:bg-sky-950/30"
            />
          </div>
        </>
      : null}
    </div>
  );
}
