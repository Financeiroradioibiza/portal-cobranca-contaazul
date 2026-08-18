(function (global) {
  var TOKEN_KEY = "site_cliente_bearer";

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
      // Cookie legível no domínio cliente — proxy repassa Cookie ao portal.
      var cookie = "site_cliente_session=";
      if (token) {
        cookie += encodeURIComponent(token) + "; path=/; max-age=43200; secure; samesite=lax";
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
      // Proxy Netlify cliente→portal pode não repassar Authorization.
      h["X-Site-Cliente-Session"] = t;
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
    return fetch("/api/site-cliente/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: authHeaders({}),
    });
  }

  function homePathForGrupoTipo(grupoTipo) {
    return grupoTipo === "cobranca" ? "/cobranca.html" : "/app.html";
  }

  function redirectIfLoggedIn() {
    return fetch("/api/site-cliente/auth/session", {
      credentials: "same-origin",
      headers: authHeaders({}),
    })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (s) {
        if (s && s.ok) window.location.replace(homePathForGrupoTipo(s.grupoTipo));
      })
      .catch(function () {
        //
      });
  }

  global.SiteClienteAuth = {
    getToken: getToken,
    setToken: setToken,
    authHeaders: authHeaders,
    apiFetch: apiFetch,
    logout: logout,
    homePathForGrupoTipo: homePathForGrupoTipo,
    redirectIfLoggedIn: redirectIfLoggedIn,
  };
})(window);
