"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { registerChamadosWebPush } from "@/lib/push/registerChamadosPush";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function ChamadosPwaSetup() {
  const [pushState, setPushState] = useState<"idle" | "loading" | "on" | "off" | "unsupported">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const ios = useMemo(() => isIosDevice(), []);
  const standalone = useMemo(() => isStandaloneDisplay(), []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const ensureLink = (rel: string, href: string, extra?: Record<string, string>) => {
      const sel = `link[rel="${rel}"][href="${href}"]`;
      if (document.querySelector(sel)) return;
      const link = document.createElement("link");
      link.rel = rel;
      link.href = href;
      if (extra) {
        for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
      }
      document.head.appendChild(link);
    };

    ensureLink("manifest", "/chamados.webmanifest");
    ensureLink("apple-touch-icon", "/chamados-icon-180.png");
    ensureLink("icon", "/chamados-icon-192.png", { sizes: "192x192", type: "image/png" });

    let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!theme) {
      theme = document.createElement("meta");
      theme.name = "theme-color";
      document.head.appendChild(theme);
    }
    theme.content = "#c4146a";

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/chamados-sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "granted") setPushState("on");
    else if (Notification.permission === "denied") setPushState("off");
  }, []);

  const onEnablePush = useCallback(async () => {
    setMessage(null);
    setPushState("loading");
    const result = await registerChamadosWebPush();
    if (result.ok) {
      setPushState("on");
      setMessage("Notificações ativas neste dispositivo.");
      return;
    }
    if (result.reason === "denied") {
      setPushState("off");
      setMessage("Permissão negada. Ajuste em Ajustes → Notificações (app Chamados).");
      return;
    }
    if (result.reason === "not_configured") {
      setPushState("idle");
      setMessage("Push ainda não configurado no servidor (VAPID).");
      return;
    }
    if (result.reason === "unsupported") {
      setPushState("unsupported");
      setMessage("Este navegador não suporta Web Push.");
      return;
    }
    setPushState("idle");
    setMessage(result.message ?? "Não foi possível ativar notificações.");
  }, []);

  const showInstallHint = ios && !standalone;

  if (!showInstallHint && pushState === "on") return null;

  return (
    <div className="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50 to-orange-50 px-4 py-3 text-sm text-slate-800 dark:border-pink-900/40 dark:from-pink-950/40 dark:to-orange-950/30 dark:text-slate-100">
      {showInstallHint ?
        <div className="mb-3">
          <p className="font-semibold text-[#c4146a]">Instalar no iPhone</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-700 dark:text-slate-300">
            <li>Toque em Compartilhar (ícone quadrado com seta).</li>
            <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Abra o app <strong>Chamados</strong> pela tela inicial (obrigatório para push no iOS).</li>
          </ol>
        </div>
      : null}

      {pushState !== "on" && pushState !== "unsupported" ?
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pushState === "loading" || (ios && !standalone)}
            onClick={() => void onEnablePush()}
            className="rounded-lg bg-[#c4146a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pushState === "loading" ? "Ativando…" : "Ativar notificações"}
          </button>
          {ios && !standalone ?
            <span className="text-xs text-slate-600 dark:text-slate-400">Disponível após instalar na tela inicial.</span>
          : null}
        </div>
      : null}

      {message ?
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{message}</p>
      : null}
    </div>
  );
}
