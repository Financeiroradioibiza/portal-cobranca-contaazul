(function (global) {
  global.ChamadosProducaoModule = function (deps) {
    var auth = deps.auth;
    var mainEl = deps.mainEl;
    var escapeHtml = deps.escapeHtml;
    var setScreenHeader = deps.setScreenHeader;
    var getUser = deps.getUser;
    var showToast = deps.showToast || function (msg) {
      window.alert(msg);
    };

    var state = {
      q: "",
      searchResults: [],
      clienteRef: null,
      clienteNome: "",
      payload: null,
      busy: false,
      editorUrl: null,
      searchBusy: false,
    };

    function formatCodigo(portalPdvId) {
      var id = Number(portalPdvId);
      if (!Number.isFinite(id)) return "";
      var clienteId = Math.floor(id / 1000);
      var seq = id % 1000;
      return clienteId + "." + String(seq).padStart(3, "0");
    }

    function focusSearchInput() {
      requestAnimationFrame(function () {
        var el = mainEl.querySelector("#prod-q");
        if (!el) return;
        el.focus();
        try {
          var len = el.value.length;
          el.setSelectionRange(len, len);
        } catch (e) {
          //
        }
      });
    }

    function submitSearch() {
      var term = String(state.q || "").trim();
      if (term.length < 2) {
        showToast("Digite pelo menos 2 caracteres para buscar.");
        return;
      }
      state.searchBusy = true;
      state.searchResults = [];
      render();
      focusSearchInput();
      runSearch(term)
        .catch(function () {
          showToast("Falha na busca. Tente de novo.");
        })
        .finally(function () {
          state.searchBusy = false;
          render();
          focusSearchInput();
        });
    }

    function runSearch(q) {
      var term = String(q || "").trim();
      if (term.length < 2) {
        state.searchResults = [];
        return Promise.resolve();
      }
      return auth
        .apiFetch("/api/producao/suporte?q=" + encodeURIComponent(term))
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          var pdvs = Array.isArray(data.pdvs) ? data.pdvs : [];
          state.searchResults = pdvs
            .filter(function (p) {
              return p.clienteKey && p.portalPdvId != null;
            })
            .slice(0, 30)
            .map(function (p) {
              return {
                clienteKey: p.clienteKey,
                clienteNome: p.clienteNome || "Cliente",
                pdvNome: p.nome || formatCodigo(p.portalPdvId),
                codigoDisplay: formatCodigo(p.portalPdvId),
              };
            });
        })
        .catch(function () {
          state.searchResults = [];
        });
    }

    function searchResultsHtml() {
      if (state.searchBusy) {
        return (
          '<div class="tool-loading" aria-live="polite">' +
          '<span class="tool-loading-spin" aria-hidden="true"></span>' +
          "<p>Buscando PDVs…</p></div>"
        );
      }
      if (state.searchResults.length === 0) {
        if (state.q.trim().length >= 2) {
          return '<p class="empty-hint">Nenhum PDV encontrado.</p>';
        }
        return '<p class="empty-hint">Digite e toque em Buscar.</p>';
      }
      return (
        '<ul class="tool-search-list">' +
        state.searchResults
          .map(function (t) {
            return (
              '<li><button type="button" class="tool-search-item prod-cliente-pick" data-ref="' +
              escapeHtml(t.clienteKey) +
              '" data-nome="' +
              escapeHtml(t.clienteNome) +
              '" data-label="' +
              escapeHtml(t.pdvNome) +
              '">' +
              "<strong>" +
              escapeHtml(t.pdvNome) +
              "</strong>" +
              "<span>" +
              escapeHtml(t.clienteNome) +
              " · " +
              escapeHtml(t.codigoDisplay) +
              "</span></button></li>"
            );
          })
          .join("") +
        "</ul>"
      );
    }

    function loadClientePdvs(ref) {
      return auth
        .apiFetch("/api/criacao/clientes/" + encodeURIComponent(ref) + "/pdv-programacoes")
        .then(function (r) {
          return r.json();
        });
    }

    function openProgramacao(id) {
      try {
        sessionStorage.setItem("criacao-open-prog", id);
        sessionStorage.setItem("ibizap_return", "/app.html#producao");
      } catch (e) {
        //
      }
      window.location.assign("/m/criacao/programacoes");
    }

    function renderPdvRows() {
      if (!state.payload || !state.payload.pdvs) return "";
      var progs = state.payload.programacoes || [];
      return state.payload.pdvs
        .map(function (pdv) {
          var opts =
            '<option value="">— sem —</option>' +
            progs
              .map(function (pr) {
                var sel = pdv.programacaoId === pr.id ? " selected" : "";
                return (
                  '<option value="' +
                  escapeHtml(pr.id) +
                  '"' +
                  sel +
                  ">" +
                  escapeHtml(pr.nome) +
                  "</option>"
                );
              })
              .join("");
          return (
            '<div class="prod-pdv-row">' +
            "<div>" +
            "<strong>" +
            escapeHtml(pdv.nome) +
            "</strong>" +
            '<span class="prod-pdv-meta">' +
            escapeHtml(pdv.codigoDisplay || "") +
            "</span></div>" +
            '<select class="prod-prog-select" data-rio="' +
            escapeHtml(pdv.rioPdvKey) +
            '">' +
            opts +
            "</select></div>"
          );
        })
        .join("");
    }

    function renderProgramacoes() {
      if (!state.payload || !state.payload.programacoes) return "";
      return (
        '<ul class="prod-prog-list">' +
        state.payload.programacoes
          .map(function (pr) {
            return (
              '<li><button type="button" class="prod-prog-open" data-id="' +
              escapeHtml(pr.id) +
              '">' +
              escapeHtml(pr.nome) +
              '<span>Abrir editor completo →</span></button></li>'
            );
          })
          .join("") +
        "</ul>"
      );
    }

    function bindPanel(root) {
      root.querySelectorAll(".prod-prog-select").forEach(function (sel) {
        sel.onchange = function () {
          if (!state.clienteRef) return;
          var rio = sel.getAttribute("data-rio");
          var progId = sel.value || null;
          state.busy = true;
          auth
            .apiFetch(
              "/api/criacao/clientes/" + encodeURIComponent(state.clienteRef) + "/pdv-programacoes",
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rioPdvKey: rio, programacaoId: progId }),
              },
            )
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (data.error && !data.pdvs) throw new Error(data.error);
              state.payload = data.pdvs ? data : data;
              if (data.hint) showToast(data.hint);
              else showToast("Programação do PDV atualizada.");
            })
            .catch(function () {
              showToast("Falha ao trocar programação.");
              return loadClientePdvs(state.clienteRef).then(function (data) {
                state.payload = data;
                renderOnly();
              });
            })
            .finally(function () {
              state.busy = false;
              renderOnly();
            });
        };
      });

      root.querySelectorAll(".prod-prog-open").forEach(function (btn) {
        btn.onclick = function () {
          openProgramacao(btn.getAttribute("data-id"));
        };
      });

      var nova = root.querySelector("#btn-nova-prog");
      if (nova) {
        nova.onclick = function () {
          var nome = window.prompt("Nome da nova programação:");
          if (!nome || !nome.trim()) return;
          var user = getUser();
          state.busy = true;
          auth
            .apiFetch("/api/criacao/programacoes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clienteRef: state.clienteRef,
                clienteNome: state.clienteNome,
                nome: nome.trim(),
                donoUserId: user && user.email,
              }),
            })
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (data.error) throw new Error(data.error);
              if (data.id) {
                openProgramacao(data.id);
                return;
              }
              return loadClientePdvs(state.clienteRef).then(function (p) {
                state.payload = p;
                render();
              });
            })
            .catch(function (e) {
              showToast(e.message || "Erro ao criar programação.");
            })
            .finally(function () {
              state.busy = false;
            });
        };
      }
    }

    function renderOnly() {
      var panel = mainEl.querySelector(".producao-panel");
      if (!panel) return;
      var body = panel.querySelector(".producao-body");
      if (!body) return;
      if (!state.clienteRef) {
        body.innerHTML = '<p class="empty-hint">Selecione um cliente abaixo.</p>';
        return;
      }
      body.innerHTML =
        "<h2>" +
        escapeHtml(state.clienteNome) +
        "</h2>" +
        '<p class="tool-sub">PDVs · troque a programação amarrada</p>' +
        '<div class="prod-pdv-list">' +
        renderPdvRows() +
        "</div>" +
        "<h3>Programações</h3>" +
        renderProgramacoes() +
        '<button type="button" class="btn-primary" id="btn-nova-prog">+ Nova programação</button>' +
        '<p class="tool-foot">Editor completo (pastas, faixas, preview, cronograma) abre aqui no IbiZap — use «Voltar ao IbiZap» no topo.</p>';
      bindPanel(body);
    }

    function render() {
      setScreenHeader("Produção", true);
      var searchBtnLabel = state.searchBusy ? "Buscando…" : "Buscar";

      mainEl.innerHTML =
        '<div class="producao-panel tool-panel">' +
        '<div class="tool-search">' +
        "<span>Buscar PDV</span>" +
        '<div class="tool-search-row">' +
        '<input type="search" enterkeyhint="search" id="prod-q" autocomplete="off" placeholder="Nome, cliente ou código 316.001…" value="' +
        escapeHtml(state.q) +
        '" />' +
        '<button type="button" id="btn-prod-search" class="btn-search"' +
        (state.searchBusy ? " disabled" : "") +
        ">" +
        escapeHtml(searchBtnLabel) +
        "</button></div></div>" +
        '<div class="producao-results">' +
        searchResultsHtml() +
        "</div>" +
        '<div class="producao-body">' +
        (state.clienteRef ?
          ""
        : '<p class="empty-hint">Selecione um PDV na lista.</p>') +
        "</div></div>";

      var input = mainEl.querySelector("#prod-q");
      var searchBtn = mainEl.querySelector("#btn-prod-search");
      if (input) {
        input.oninput = function () {
          state.q = input.value;
        };
        input.onkeydown = function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            submitSearch();
          }
        };
      }
      if (searchBtn) {
        searchBtn.onclick = function () {
          if (state.searchBusy) return;
          state.q = input ? input.value : state.q;
          submitSearch();
        };
      }

      mainEl.querySelectorAll(".prod-cliente-pick").forEach(function (btn) {
        btn.onclick = function () {
          state.clienteRef = btn.getAttribute("data-ref");
          state.clienteNome = btn.getAttribute("data-nome") || "";
          state.q = btn.getAttribute("data-label") || state.q;
          state.searchResults = [];
          state.busy = true;
          loadClientePdvs(state.clienteRef)
            .then(function (data) {
              state.payload = data;
            })
            .finally(function () {
              state.busy = false;
              render();
            });
        };
      });

      if (state.clienteRef && state.payload) renderOnly();
    }

    return {
      render: render,
      refresh: function () {
        if (!state.clienteRef) return Promise.resolve();
        return loadClientePdvs(state.clienteRef).then(function (data) {
          state.payload = data;
        });
      },
    };
  };
})(typeof window !== "undefined" ? window : global);
