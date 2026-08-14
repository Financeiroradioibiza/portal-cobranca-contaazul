(function () {
  fetch("/api/site-cliente/dashboard", { credentials: "same-origin" })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok) window.location.replace("/app.html");
    })
    .catch(function () {
      //
    });
})();
