(function (global) {
  var STORAGE_KEY = "chamados_app_theme";
  var ORDER = ["day", "night", "ibiza"];
  var LABELS = { day: "Diurno", night: "Noturno", ibiza: "Ibiza" };
  var ICONS = { day: "☀️", night: "🌙", ibiza: "💜" };
  var META_COLORS = { day: "#1565c0", night: "#0f172a", ibiza: "#6b21a8" };

  var DEFAULT_THEME = "ibiza";

  function normalize(raw) {
    return ORDER.indexOf(raw) >= 0 ? raw : DEFAULT_THEME;
  }

  function getTheme() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null || raw === "") return DEFAULT_THEME;
      return normalize(raw);
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function updateMeta(theme) {
    var color = META_COLORS[theme] || META_COLORS.day;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i += 1) {
      metas[i].setAttribute("content", color);
    }
  }

  function applyTheme(theme) {
    var t = normalize(theme);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {
      //
    }
    updateMeta(t);
    return t;
  }

  function nextTheme(current) {
    var t = normalize(current || getTheme());
    var idx = ORDER.indexOf(t);
    return ORDER[(idx + 1) % ORDER.length];
  }

  function syncThemeButton() {
    var btn = document.getElementById("btn-theme");
    if (!btn) return;
    var t = getTheme();
    btn.textContent = ICONS[t] || ICONS.day;
    btn.setAttribute("title", "Tema: " + (LABELS[t] || LABELS.day));
    btn.setAttribute("aria-label", "Tema " + (LABELS[t] || LABELS.day) + ". Toque para alternar.");
  }

  function initThemeButton() {
    var btn = document.getElementById("btn-theme");
    if (!btn) return;
    btn.onclick = function () {
      applyTheme(nextTheme());
      syncThemeButton();
    };
    syncThemeButton();
  }

  applyTheme(getTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeButton);
  } else {
    initThemeButton();
  }

  global.ChamadosTheme = {
    get: getTheme,
    set: applyTheme,
    cycle: function () {
      return applyTheme(nextTheme());
    },
    labels: LABELS,
  };
})(typeof window !== "undefined" ? window : globalThis);
