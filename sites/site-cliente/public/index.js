(function () {
  var auth = window.SiteClienteAuth;
  if (!auth) return;
  auth.apiFetch("/api/site-cliente/dashboard")
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok) window.location.replace("/app.html");
    })
    .catch(function () {
      //
    });
})();
