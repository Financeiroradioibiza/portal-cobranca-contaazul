(function () {
  var auth = window.SiteClienteAuth;
  if (!auth) return;
  auth.redirectIfLoggedIn();
})();
