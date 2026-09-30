(function (global) {
  var TOKEN_KEY = "chamados_app_portal_session";
  var COOKIE_NAME = "portal_session";

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
      var t = sessionStorage.getItem(TOKEN_KEY);
      if (t) return t;
      t = localStorage.getItem(TOKEN_KEY);
      if (t) return t;
    } catch (e) {
      //
    }
    return readCookieToken();
  }

  function setToken(token) {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
      }
      var cookie = COOKIE_NAME + "=";
      if (token) {
        cookie += encodeURIComponent(token) + "; path=/; max-age=28800; secure; samesite=lax";
      } else {
        cookie += "; path=/; max-age=0; secure; samesite=lax";
      }
      document.cookie = cookie;
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
    opts.headers = authHeaders(opts.headers || {});
    return fetch(url, opts);
  }

  function logout() {
    setToken(null);
    return fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: authHeaders({}),
    }).finally(function () {
      window.location.replace("/login.html");
    });
  }

  function requireSession() {
    return apiFetch("/api/chamados-app/session")
      .then(function (r) {
        if (!r.ok) throw new Error("unauthorized");
        return r.json();
      });
  }

  function redirectIfLoggedIn() {
    return requireSession()
      .then(function (s) {
        if (s && s.ok) window.location.replace("/app.html");
      })
      .catch(function () {
        setToken(null);
      });
  }

  global.ChamadosAppAuth = {
    getToken: getToken,
    setToken: setToken,
    authHeaders: authHeaders,
    apiFetch: apiFetch,
    logout: logout,
    requireSession: requireSession,
    redirectIfLoggedIn: redirectIfLoggedIn,
  };
})(window);
