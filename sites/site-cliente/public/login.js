(function () {
  var form = document.getElementById("form");
  var err = document.getElementById("err");
  var ok = document.getElementById("ok");
  var btn = document.getElementById("btn");
  var auth = window.SiteClienteAuth;
  if (!form || !err || !ok || !btn || !auth) return;

  auth.redirectIfLoggedIn();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.style.display = "none";
    ok.style.display = "none";
    btn.disabled = true;

    fetch("/api/site-cliente/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        loginEmail: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { status: r.status, data: d };
        });
      })
      .then(function (x) {
        if (x.status === 429) {
          err.textContent = "Muitas tentativas. Aguarde alguns minutos.";
          err.style.display = "block";
          return;
        }
        if (!x.data.ok) {
          err.textContent =
            x.data.error === "credenciais_invalidas"
              ? "E-mail ou senha incorretos."
              : x.data.error === "server_error"
                ? "Erro no servidor. Tente de novo em instantes."
                : "Não foi possível entrar.";
          err.style.display = "block";
          return;
        }
        if (!x.data.sessionToken) {
          err.textContent = "Resposta de login incompleta. Tente de novo.";
          err.style.display = "block";
          return;
        }
        auth.setToken(x.data.sessionToken);
        var home = auth.homePathForGrupoTipo(x.data.grupoTipo);
        var dashUrl =
          x.data.grupoTipo === "cobranca"
            ? "/api/site-cliente/cobranca/dashboard"
            : "/api/site-cliente/dashboard";
        return auth.apiFetch(dashUrl).then(function (r) {
          return r.json().then(function (d) {
            return { status: r.status, data: d, home: home };
          });
        });
      })
      .then(function (x) {
        if (!x) return;
        if (x.status !== 200 || !x.data.ok) {
          auth.setToken(null);
          err.textContent = "Não foi possível validar a sessão. Tente de novo.";
          err.style.display = "block";
          return;
        }
        window.location.replace(x.home);
      })
      .catch(function () {
        err.textContent = "Erro de conexão. Verifique sua internet e tente de novo.";
        err.style.display = "block";
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
})();
