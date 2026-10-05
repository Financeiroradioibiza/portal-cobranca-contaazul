(function (global) {
  var GOOGLE_PLAY =
    "https://play.google.com/store/apps/details?id=br.com.radioibiza.player5.twa&pcampaignid=web_share";

  function fmtPing(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso));
    } catch (e) {
      return "—";
    }
  }

  function whatsappHref(tel) {
    var d = String(tel || "").replace(/\D/g, "");
    if (d.length < 10) return null;
    if (d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d;
  }

  function copyText(text, okMsg) {
    var t = String(text || "").trim();
    if (!t) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(
        function () {
          return true;
        },
        function () {
          return false;
        },
      );
    }
    return Promise.resolve(false);
  }

  global.ChamadosSuporteModule = function (deps) {
    var auth = deps.auth;
    var mainEl = deps.mainEl;
    var escapeHtml = deps.escapeHtml;
    var setScreenHeader = deps.setScreenHeader;
    var showToast = deps.showToast || function (msg) {
      window.alert(msg);
    };

    var state = {
      q: "",
      results: [],
      searchBusy: false,
      selected: null,
      detail: null,
      busy: false,
      tipo: "pdv_play5",
      link: "",
      senhaTemp: "",
      codigoPlay: "",
    };

    var searchTimer = null;

    function postInstalacao(body) {
      return auth
        .apiFetch("/api/suporte/instalacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
        });
    }

    function loadDetail(pdv) {
      state.busy = true;
      state.link = "";
      state.senhaTemp = "";
      state.codigoPlay = "";
      return auth
        .apiFetch(
          "/api/chamados-app/suporte/pdv?portalClienteId=" +
            encodeURIComponent(String(pdv.portalClienteId)) +
            "&portalPdvId=" +
            encodeURIComponent(String(pdv.portalPdvId)),
        )
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "erro");
          state.detail = data;
        })
        .catch(function () {
          state.detail = null;
          showToast("Não foi possível carregar o PDV.");
        })
        .finally(function () {
          state.busy = false;
        });
    }

    function runSearch(q) {
      var term = String(q || "").trim();
      if (term.length < 2) {
        state.results = [];
        return Promise.resolve();
      }
      state.searchBusy = true;
      return auth
        .apiFetch("/api/suporte/player-avisos/pdv-search?q=" + encodeURIComponent(term))
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          state.results = Array.isArray(data.targets) ? data.targets : [];
        })
        .catch(function () {
          state.results = [];
        })
        .finally(function () {
          state.searchBusy = false;
        });
    }

    function rowCopyBtn(label, value) {
      if (!value) return "";
      return (
        '<div class="tool-kv">' +
        "<span>" +
        escapeHtml(label) +
        "</span>" +
        '<div class="tool-kv-row">' +
        '<p class="tool-kv-val">' +
        escapeHtml(value) +
        "</p>" +
        '<button type="button" class="btn-copy" data-copy="' +
        escapeHtml(value) +
        '">Copiar</button>' +
        "</div></div>"
      );
    }

    function renderDetail() {
      var d = state.detail;
      if (!d || !d.pdv) {
        return (
          '<p class="empty-hint">Selecione um PDV na busca acima.</p>'
        );
      }
      var p = d.pdv;
      var tel = p.contatoLojaTelefone || "";
      var wa = whatsappHref(tel);
      var telBlock =
        rowCopyBtn("Contato de loja", tel || p.contatoLojaNome || "—") +
        (wa ?
          '<a class="btn-wa" href="' +
          escapeHtml(wa) +
          '" target="_blank" rel="noopener">WhatsApp</a>'
        : "");

      var cache = d.pdvStatus && d.pdvStatus.telemetry ? d.pdvStatus.telemetry.downloadPercent : null;
      var cacheLabel = cache == null ? "—" : Math.round(cache) + "%";

      var progName = d.programacaoAlert && d.programacaoAlert.programacaoNome;
      var progHtml = progName ?
        '<span class="prog-ok">' + escapeHtml(progName) + "</span>"
      : '<span class="prog-bad" aria-label="Sem programação">✕</span>';

      var instSection = "";
      var gate = d.geracaoGate;
      if (gate && !gate.podeGerarLink && gate.motivo) {
        instSection += '<p class="tool-warn">' + escapeHtml(gate.motivo) + "</p>";
      }

      instSection +=
        '<div class="tool-block">' +
        "<h3>Instalação</h3>" +
        (d.canRegenerarToken ?
          '<button type="button" class="btn-secondary" id="btn-regenerar-token">Regerar token</button>'
        : "") +
        '<label class="tool-select-label">Tipo</label>' +
        '<select id="inst-tipo" class="tool-select">' +
        '<option value="pdv_play5"' +
        (state.tipo === "pdv_play5" ? " selected" : "") +
        ">Player 5 (celular)</option>" +
        '<option value="pdv_senha_temp"' +
        (state.tipo === "pdv_senha_temp" ? " selected" : "") +
        ">Windows — senha temporária</option>" +
        '<option value="electron_ti"' +
        (state.tipo === "electron_ti" ? " selected" : "") +
        ">Electron TI</option>" +
        "</select>" +
        '<button type="button" class="btn-primary" id="btn-gerar-inst">' +
        (state.busy ? "…" : "Gerar instalação") +
        "</button>";

      if (state.link || state.codigoPlay || state.senhaTemp) {
        instSection += '<div class="tool-gen-result">';
        if (state.link) {
          instSection +=
            '<button type="button" class="btn-secondary" data-copy="' +
            escapeHtml(state.link) +
            '">Copiar link instalação</button>';
        }
        if (state.senhaTemp) {
          instSection +=
            '<button type="button" class="btn-secondary" data-copy="' +
            escapeHtml(state.senhaTemp) +
            '">Copiar código temporário</button>';
        }
        if (state.codigoPlay) {
          instSection +=
            '<button type="button" class="btn-secondary" data-copy="' +
            escapeHtml(state.codigoPlay) +
            '">Copiar código Play</button>';
        }
        instSection += "</div>";
      }
      instSection += "</div>";

      return (
        '<article class="tool-card">' +
        "<h2>" +
        escapeHtml(p.pdvNome) +
        "</h2>" +
        '<p class="tool-sub">' +
        escapeHtml(p.clienteNome) +
        " · " +
        escapeHtml(p.codigoDisplay) +
        "</p>" +
        rowCopyBtn("Nome PDV", p.pdvNome) +
        rowCopyBtn("CNPJ PDV", p.cnpj || "—") +
        telBlock +
        '<div class="tool-kv"><span>Cache PDV</span><p class="tool-kv-val">' +
        escapeHtml(cacheLabel) +
        "</p></div>" +
        '<div class="tool-kv"><span>Primeiro ping</span><p class="tool-kv-val">' +
        escapeHtml(fmtPing(d.pdvStatus && d.pdvStatus.telemetry && d.pdvStatus.telemetry.firstPingAt)) +
        "</p></div>" +
        '<div class="tool-kv"><span>Último ping</span><p class="tool-kv-val">' +
        escapeHtml(fmtPing(d.pdvStatus && d.pdvStatus.telemetry && d.pdvStatus.telemetry.lastPingAt)) +
        "</p></div>" +
        '<div class="tool-kv"><span>Dono da programação</span><p class="tool-kv-val">' +
        escapeHtml(p.donoProgramacao || "—") +
        "</p></div>" +
        '<div class="tool-kv"><span>Programação do PDV</span><p class="tool-kv-val">' +
        progHtml +
        "</p></div>" +
        instSection +
        "</article>"
      );
    }

    function bindDetail(root) {
      root.querySelectorAll("[data-copy]").forEach(function (btn) {
        btn.onclick = function () {
          var v = btn.getAttribute("data-copy") || "";
          copyText(v).then(function (ok) {
            showToast(ok ? "Copiado." : "Não foi possível copiar.");
          });
        };
      });
      var tipoEl = root.querySelector("#inst-tipo");
      if (tipoEl) {
        tipoEl.onchange = function () {
          state.tipo = tipoEl.value;
          state.link = "";
          state.senhaTemp = "";
          state.codigoPlay = "";
        };
      }
      var regen = root.querySelector("#btn-regenerar-token");
      if (regen) {
        regen.onclick = function () {
          if (!state.detail || !state.detail.pdv) return;
          if (
            !window.confirm(
              "Nova chave serial: o player atual para de funcionar e ping/cache zeram. Continuar?",
            )
          ) {
            return;
          }
          state.busy = true;
          renderOnly();
          auth
            .apiFetch(
              "/api/suporte/pdv/" + encodeURIComponent(state.detail.pdv.rioPdvKey) + "/regenerar-token",
              { method: "POST" },
            )
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (!data.ok) throw new Error(data.error || "falhou");
              showToast("Token regenerado.");
              return loadDetail(state.selected);
            })
            .catch(function () {
              showToast("Erro ao regerar token.");
            })
            .finally(function () {
              state.busy = false;
              renderOnly();
            });
        };
      }
      var gerar = root.querySelector("#btn-gerar-inst");
      if (gerar) {
        gerar.onclick = function () {
          if (!state.selected) return;
          var plataforma = state.tipo === "pdv_play5" ? "mobile" : "windows";
          state.busy = true;
          renderOnly();
          postInstalacao({
            action: "gerar_link",
            portalClienteId: state.selected.portalClienteId,
            portalPdvId: state.selected.portalPdvId,
            tipo: state.tipo,
            plataforma: plataforma,
          })
            .then(function (res) {
              if (!res.ok || !res.data.ok) {
                var detail = res.data.detail || res.data.error || "erro";
                throw new Error(String(detail));
              }
              var data = res.data;
              if (state.tipo === "pdv_play5") {
                state.link = GOOGLE_PLAY;
                state.codigoPlay = data.codigoPlay || "";
                state.senhaTemp = "";
              } else {
                state.link = data.link || "";
                state.senhaTemp = data.senhaTemporaria || "";
                state.codigoPlay = "";
              }
              showToast("Instalação gerada.");
            })
            .catch(function (e) {
              showToast(e.message || "Não foi possível gerar.");
            })
            .finally(function () {
              state.busy = false;
              renderOnly();
            });
        };
      }
    }

    function renderOnly() {
      var panel = mainEl.querySelector(".suporte-panel");
      if (!panel) return;
      var detailEl = panel.querySelector(".suporte-detail");
      if (detailEl) {
        detailEl.innerHTML = renderDetail();
        bindDetail(detailEl);
      }
    }

    function render() {
      setScreenHeader("Suporte", true);
      var resultsHtml =
        state.results.length === 0 ?
          state.searchBusy ?
            '<p class="empty-hint">Buscando…</p>'
          : state.q.trim().length >= 2 ?
            '<p class="empty-hint">Nenhum PDV com ID Player.</p>'
          : ""
        : '<ul class="tool-search-list">' +
          state.results
            .map(function (t) {
              return (
                '<li><button type="button" class="tool-search-item" data-pdv="' +
                escapeHtml(String(t.portalPdvId)) +
                '">' +
                '<strong>' +
                escapeHtml(t.pdvNome) +
                "</strong>" +
                '<span>' +
                escapeHtml(t.clienteNome) +
                " · " +
                escapeHtml(t.codigoDisplay) +
                "</span></button></li>"
              );
            })
            .join("") +
          "</ul>";

      mainEl.innerHTML =
        '<div class="suporte-panel tool-panel">' +
        '<label class="tool-search">' +
        "<span>Buscar PDV</span>" +
        '<input type="search" id="suporte-q" autocomplete="off" placeholder="Nome, cliente ou código 316.001…" value="' +
        escapeHtml(state.q) +
        '" />' +
        "</label>" +
        resultsHtml +
        '<div class="suporte-detail">' +
        renderDetail() +
        "</div></div>";

      var input = mainEl.querySelector("#suporte-q");
      if (input) {
        input.oninput = function () {
          state.q = input.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            runSearch(state.q).then(renderOnly);
          }, 280);
        };
      }

      mainEl.querySelectorAll(".tool-search-item").forEach(function (btn) {
        btn.onclick = function () {
          var id = Number(btn.getAttribute("data-pdv"));
          var hit = state.results.find(function (r) {
            return r.portalPdvId === id;
          });
          if (!hit) return;
          state.selected = hit;
          state.results = [];
          state.q = hit.pdvNome;
          loadDetail(hit).then(function () {
            render();
          });
        };
      });

      bindDetail(mainEl.querySelector(".suporte-detail"));
    }

    return {
      render: render,
      refresh: function () {
        if (state.selected) return loadDetail(state.selected);
        return Promise.resolve();
      },
    };
  };
})(typeof window !== "undefined" ? window : global);
