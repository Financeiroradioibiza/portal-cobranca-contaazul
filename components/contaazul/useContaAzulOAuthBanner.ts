"use client";

import { useEffect, useState } from "react";

/** Lê `?connected=1` ou `?oauth_error=` na URL e limpa a query. */
export function useContaAzulOAuthBanner() {
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get("connected");
    const err = sp.get("oauth_error");
    if (connected === "1") {
      setBanner("Conta Azul conectada com sucesso.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err) {
      setBanner(`OAuth Conta Azul: ${decodeURIComponent(err)}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return banner;
}
