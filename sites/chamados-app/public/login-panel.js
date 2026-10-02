(function (global) {
  function mount(opts) {
    var auth = opts.auth;
    var onSuccess = opts.onSuccess;
    var form = document.getElementById("login-form");
    var err = document.getElementById("login-err");
    var btn = document.getElementById("login-btn");
    if (!form || !err || !btn || !auth || typeof onSuccess !== "function") return;

    if (form.getAttribute("data-wired") === "1") return;
    form.setAttribute("data-wired", "1");

    auth.clearLegacyPortalCookie();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;

      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          email: document.getElementById("login-email").value.trim(),
          password: document.getElementById("login-password").value,
          totpCode: document.getElementById("login-totp").value.trim(),
        }),
      })
        .then(function (r) {
          return r.json().then(function (d) {
            return { status: r.status, data: d };
          });
        })
        .then(function (x) {
          if (!x.data.ok) {
            err.textContent =
              x.status === 401 ? "E-mail, senha ou código incorretos."
              : x.status === 503 ? "Login indisponível. Tente mais tarde."
              : "Não foi possível entrar.";
            err.hidden = false;
            return;
          }
          if (!x.data.sessionToken) {
            err.textContent = "Login OK, mas o portal não devolveu sessão para o app.";
            err.hidden = false;
            return;
          }
          auth.stashPendingLoginToken(x.data.sessionToken);
          if (!auth.tokenPersisted(x.data.sessionToken)) {
            err.textContent =
              "Não foi possível guardar a sessão neste iPhone. Desative modo privado ou libere dados do site.";
            err.hidden = false;
            return;
          }
          return auth.requireSession(3).then(function (sess) {
            if (!sess || !sess.ok) {
              err.textContent = "Sessão não validou após login. Tente de novo.";
              err.hidden = false;
              auth.setToken(null);
              return;
            }
            onSuccess(sess);
          });
        })
        .catch(function () {
          err.textContent = "Erro de conexão. Verifique a internet.";
          err.hidden = false;
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  global.ChamadosLoginPanel = { mount: mount };
})(window);
