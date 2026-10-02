(function (global) {
  function isIos() {
    if (typeof navigator === "undefined") return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function isStandalone() {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean(navigator.standalone))
    );
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  /**
   * @returns {Promise<{ok:boolean, reason?:string, message?:string}>}
   */
  function registerWebPush(auth) {
    if (!auth || typeof auth.apiFetch !== "function") {
      return Promise.resolve({ ok: false, reason: "error", message: "auth" });
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }
    if (isIos() && !isStandalone()) {
      return Promise.resolve({
        ok: false,
        reason: "install_required",
        message: "No iPhone, instale o IbiZap na Tela de Início (Safari → Compartilhar).",
      });
    }

    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") {
        return { ok: false, reason: "denied", message: "Permissão negada." };
      }
      return fetch("/api/push/vapid-public-key", { credentials: "same-origin" }).then(function (keyRes) {
        if (!keyRes.ok) {
          return {
            ok: false,
            reason: keyRes.status === 503 ? "not_configured" : "error",
            message: keyRes.status === 503 ? "Push não configurado no servidor." : "HTTP " + keyRes.status,
          };
        }
        return keyRes.json().then(function (keyData) {
          var publicKey = keyData && keyData.publicKey;
          if (!publicKey) {
            return { ok: false, reason: "not_configured", message: "VAPID ausente." };
          }
          return navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then(function () {
              return navigator.serviceWorker.ready;
            })
            .then(function (reg) {
              return reg.pushManager.getSubscription().then(function (sub) {
                if (sub) return sub;
                return reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey),
                });
              });
            })
            .then(function (sub) {
              var json = sub.toJSON();
              return auth
                .apiFetch("/api/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint: json.endpoint,
                    keys: json.keys,
                  }),
                })
                .then(function (saveRes) {
                  if (!saveRes.ok) {
                    return {
                      ok: false,
                      reason: "error",
                      message: "Não foi possível salvar inscrição (HTTP " + saveRes.status + ").",
                    };
                  }
                  try {
                    localStorage.setItem("ibizap_push_active", "1");
                  } catch (e) {
                    //
                  }
                  return { ok: true };
                });
            });
        });
      });
    });
  }

  /** Re-inscreve se o usuário já concedeu permissão (ex.: reinstalou o app). */
  function syncIfGranted(auth) {
    if (!auth || Notification.permission !== "granted") return Promise.resolve();
    if (!isIos() || isStandalone()) {
      return registerWebPush(auth).catch(function () {});
    }
    return Promise.resolve();
  }

  function permissionState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  global.ChamadosAppPush = {
    isIos: isIos,
    isStandalone: isStandalone,
    registerWebPush: registerWebPush,
    syncIfGranted: syncIfGranted,
    permissionState: permissionState,
  };
})(window);
