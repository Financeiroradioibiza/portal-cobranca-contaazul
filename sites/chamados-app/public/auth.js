(function (global) {
  var TOKEN_KEY = "chamados_app_portal_session";

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
      var cookie = "portal_session=";
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
      h.Authorization = "Bearer " + t;
      h["X-Portal-Session"] = t;
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
    return apiFetch("/api/auth/me")
      .then(function (r) {
        if (!r.ok) throw new Error("unauthorized");
        return r.json();
      });
  }

  global.ChamadosAppAuth = {
    getToken: getToken,
    setToken: setToken,
    authHeaders: authHeaders,
    apiFetch: apiFetch,
    logout: logout,
    requireSession: requireSession,
  };
})(window);
