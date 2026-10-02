(function (global) {
  var TOKEN_KEY = "chamados_app_portal_session";
  var PENDING_TOKEN_KEY = "chamados_pending_token";
  var FRESH_LOGIN_KEY = "chamados_fresh_login";
  var COOKIE_NAME = "portal_session";
  var logoutAbort = null;

  function readCookieToken() {
    try {
      var parts = document.cookie.split(";");
      for (var i = 0; i < parts.length; i += 1) {
        var p = parts[i].trim();
        if (p.indexOf(COOKIE_NAME + "=") !== 0) continue;
        var raw = p.slice(COOKIE_NAME.length + 1);
        try {
          return decodeURIComponent(raw);
        } catch (e) {
          return raw;
        }
      }
    } catch (e) {
      //
    }
    return null;
  }

  function getToken() {
    try {
      var t = localStorage.getItem(TOKEN_KEY);
      if (t) return t;
      t = sessionStorage.getItem(TOKEN_KEY);
      if (t) return t;
    } catch (e) {
      //
    }
    return readCookieToken();
  }

  function clearLegacyPortalCookie() {
    try {
      document.cookie = COOKIE_NAME + "=; path=/; max-age=0; secure; samesite=lax";
    } catch (e) {
      //
    }
  }

  function abortPendingLogout() {
    if (logoutAbort) {
      try {
        logoutAbort.abort();
      } catch (e) {
        //
      }
      logoutAbort = null;
    }
  }

  function setToken(token) {
    abortPendingLogout();
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      }
      clearLegacyPortalCookie();
    } catch (e) {
      //
    }
  }

  function tokenPersisted(token) {
    return getToken() === token;
  }

  /** Token gravado no login imediatamente antes do redirect (Safari iOS). */
  function stashPendingLoginToken(token) {
    try {
      sessionStorage.setItem(PENDING_TOKEN_KEY, token);
      sessionStorage.setItem(FRESH_LOGIN_KEY, "1");
    } catch (e) {
      //
    }
    setToken(token);
  }

  function bootstrapFromPendingLogin() {
    try {
      var pending = sessionStorage.getItem(PENDING_TOKEN_KEY);
      if (pending) {
        setToken(pending);
        sessionStorage.removeItem(PENDING_TOKEN_KEY);
      }
    } catch (e) {
      //
    }
  }

  function authHeaders(extra) {
    var h = extra ? Object.assign({}, extra) : {};
    var t = getToken();
    if (t) {
      h["X-Portal-Session"] = t;
      h.Authorization = "Bearer " + t;
    }
    return h;
  }

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    opts.cache = opts.cache || "no-store";
    opts.headers = authHeaders(opts.headers || {});
    return fetch(url, opts);
  }

  function logout() {
    setToken(null);
    return clearServerSession().finally(function () {
      window.location.replace("/login.html");
    });
  }

  function requireSession(retryLeft) {
    if (retryLeft == null) retryLeft = 0;
    return apiFetch("/api/chamados-app/session").then(function (r) {
      if (!r.ok) {
        if (retryLeft > 0 && (r.status === 401 || r.status === 403)) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 200);
          }).then(function () {
            return requireSession(retryLeft - 1);
          });
        }
        var err = new Error("unauthorized");
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }

  function requireSessionForApp() {
    var retries = 0;
    try {
      if (sessionStorage.getItem(FRESH_LOGIN_KEY) === "1") retries = 5;
    } catch (e) {
      //
    }
    return requireSession(retries).then(function (s) {
      try {
        sessionStorage.removeItem(FRESH_LOGIN_KEY);
      } catch (e) {
        //
      }
      return s;
    });
  }

  function redirectIfLoggedIn() {
    if (!getToken()) return Promise.resolve();
    return requireSession(1)
      .then(function (s) {
        if (s && s.ok) window.location.replace("/app.html");
      })
      .catch(function () {
        setToken(null);
      });
  }

  function clearServerSession() {
    abortPendingLogout();
    logoutAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    var signal = logoutAbort ? logoutAbort.signal : undefined;
    return fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: signal,
    }).catch(function () {});
  }

  bootstrapFromPendingLogin();

  global.ChamadosAppAuth = {
    getToken: getToken,
    setToken: setToken,
    stashPendingLoginToken: stashPendingLoginToken,
    tokenPersisted: tokenPersisted,
    authHeaders: authHeaders,
    apiFetch: apiFetch,
    logout: logout,
    requireSession: requireSession,
    requireSessionForApp: requireSessionForApp,
    redirectIfLoggedIn: redirectIfLoggedIn,
    clearServerSession: clearServerSession,
    clearLegacyPortalCookie: clearLegacyPortalCookie,
  };
})(window);
