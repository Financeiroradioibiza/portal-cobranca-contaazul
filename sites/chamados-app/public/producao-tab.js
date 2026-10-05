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
      clientes: [],
      clienteRef: null,
      clienteNome: "",
      payload: null,
      busy: false,
      editorUrl: null,
    };

    var searchTimer = null;

    function loadClientes(q) {
      var url = "/api/criacao/clientes";
      if (q && q.trim()) url += "?q=" + encodeURIComponent(q.trim());
      return auth.apiFetch(url).then(function (r) {
        return r.json();
      });
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
      var listHtml =
        state.clientes.length === 0 ?
          '<p class="empty-hint">' +
          (state.q.trim().length >= 2 ? "Nenhum cliente." : "Digite para filtrar clientes.") +
          "</p>"
        : '<ul class="tool-search-list">' +
          state.clientes
            .slice(0, 40)
            .map(function (c) {
              return (
                '<li><button type="button" class="tool-search-item prod-cliente-pick" data-ref="' +
                escapeHtml(c.ref) +
                '" data-nome="' +
                escapeHtml(c.nome) +
                '">' +
                "<strong>" +
                escapeHtml(c.nome) +
                "</strong>" +
                '<span>' +
                String(c.pdvCount || 0) +
                " PDVs</span></button></li>"
              );
            })
            .join("") +
          "</ul>";

      mainEl.innerHTML =
        '<div class="producao-panel tool-panel">' +
        '<label class="tool-search">' +
        "<span>Cliente produção</span>" +
        '<input type="search" id="prod-q" autocomplete="off" placeholder="Nome do cliente…" value="' +
        escapeHtml(state.q) +
        '" />' +
        "</label>" +
        listHtml +
        '<div class="producao-body">' +
        (state.clienteRef ?
          ""
        : '<p class="empty-hint">Selecione um cliente.</p>') +
        "</div></div>";

      var input = mainEl.querySelector("#prod-q");
      if (input) {
        input.oninput = function () {
          state.q = input.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            loadClientes(state.q).then(function (data) {
              state.clientes = Array.isArray(data.clientes) ? data.clientes : [];
              render();
            });
          }, 300);
        };
      }

      mainEl.querySelectorAll(".prod-cliente-pick").forEach(function (btn) {
        btn.onclick = function () {
          state.clienteRef = btn.getAttribute("data-ref");
          state.clienteNome = btn.getAttribute("data-nome") || "";
          state.clientes = [];
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
