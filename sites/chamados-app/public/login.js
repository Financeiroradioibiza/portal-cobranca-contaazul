(function () {
  var form = document.getElementById("form");
  var err = document.getElementById("err");
  var btn = document.getElementById("btn");
  var auth = window.ChamadosAppAuth;
  if (!form || !err || !btn || !auth) return;

  auth.clearLegacyPortalCookie();
  auth.redirectIfLoggedIn();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;

    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        totpCode: document.getElementById("totp").value.trim(),
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
          err.textContent =
            "Login OK, mas o portal não devolveu sessão para o app. Confira deploy do portal (commit 588e87c+) e proxy Netlify.";
          err.hidden = false;
          return;
        }
        auth.setToken(x.data.sessionToken);
        window.location.replace("/app.html");
      })
      .catch(function () {
        err.textContent = "Erro de conexão. Verifique a internet.";
        err.hidden = false;
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
})();
