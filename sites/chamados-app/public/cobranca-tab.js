(function (global) {
  var PORTAL_ORIGIN = "https://portal.radioibiza.app.br";

  function copyText(text) {
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

  function fmtBRL(value) {
    try {
      return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch (e) {
      return String(value);
    }
  }

  function whatsappHref(tel) {
    var d = String(tel || "").replace(/\D/g, "");
    if (d.length < 10) return null;
    if (d.length <= 11) d = "55" + d;
    return "https://wa.me/" + d;
  }

  global.ChamadosCobrancaModule = function (deps) {
    var auth = deps.auth;
    var mainEl = deps.mainEl;
    var escapeHtml = deps.escapeHtml;
    var setScreenHeader = deps.setScreenHeader;
    var showToast = deps.showToast || function (msg) {
      window.alert(msg);
    };

    var state = {
      q: "",
      searchResults: [],
      searchBusy: false,
      linhaId: null,
      detail: null,
      detailLoading: false,
      selectedParcelas: {},
      waBusy: false,
    };

    function focusSearchInput() {
      requestAnimationFrame(function () {
        var el = mainEl.querySelector("#cobranca-q");
        if (!el) return;
        el.focus();
      });
    }

    function runSearch(term) {
      return auth
        .apiFetch("/api/chamados-app/cobranca/search?q=" + encodeURIComponent(term))
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          state.searchResults = Array.isArray(data.clientes) ? data.clientes : [];
        })
        .catch(function () {
          state.searchResults = [];
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

    function loadDetail(linhaId) {
      state.detailLoading = true;
      state.detail = null;
      state.selectedParcelas = {};
      render();
      return auth
        .apiFetch("/api/chamados-app/cobranca/cliente?linhaId=" + encodeURIComponent(linhaId))
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || "erro");
          state.detail = data;
          state.linhaId = data.linhaId;
        })
        .catch(function () {
          state.detail = null;
          showToast("Não foi possível carregar o cliente.");
        })
        .finally(function () {
          state.detailLoading = false;
          render();
        });
    }

    function resolveParcelaLink(parcelaId, tipo) {
      return auth
        .apiFetch(
          "/api/contaazul/parcela/" + encodeURIComponent(parcelaId) + "?tipo=" + encodeURIComponent(tipo),
        )
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.url) {
            if (data.useSameOrigin) return PORTAL_ORIGIN + data.url;
            return data.url;
          }
          return null;
        })
        .catch(function () {
          return null;
        });
    }

    function sendWhatsAppSelected() {
      if (!state.detail || state.waBusy) return;
      var vendas = state.detail.vendas || [];
      var picked = vendas.filter(function (v) {
        return state.selectedParcelas[v.parcelaId];
      });
      if (picked.length === 0) {
        showToast("Selecione ao menos uma venda.");
        return;
      }
      var tel = window.prompt("WhatsApp do destinatário (com DDD):");
      if (!tel || !tel.trim()) return;
      var wa = whatsappHref(tel);
      if (!wa) {
        showToast("Telefone inválido.");
        return;
      }

      state.waBusy = true;
      render();

      var jobs = [];
      picked.forEach(function (v) {
        jobs.push(
          resolveParcelaLink(v.parcelaId, "boleto").then(function (url) {
            return { v: v, tipo: "boleto", url: url };
          }),
        );
        jobs.push(
          resolveParcelaLink(v.parcelaId, "nf").then(function (url) {
            return { v: v, tipo: "nf", url: url };
          }),
        );
      });

      Promise.all(jobs)
        .then(function (rows) {
          var lines = ["Olá! Seguem os documentos de *" + state.detail.nome + "*:", ""];
          var byParcela = {};
          rows.forEach(function (row) {
            if (!byParcela[row.v.parcelaId]) byParcela[row.v.parcelaId] = { v: row.v, boleto: null, nf: null };
            if (row.tipo === "boleto") byParcela[row.v.parcelaId].boleto = row.url;
            else byParcela[row.v.parcelaId].nf = row.url;
          });
          Object.keys(byParcela).forEach(function (pid) {
            var pack = byParcela[pid];
            var v = pack.v;
            lines.push(
              "• " +
                v.competencia +
                " — " +
                v.resumo +
                " (" +
                fmtBRL(v.valor) +
                ")",
            );
            if (pack.boleto) lines.push("  Boleto: " + pack.boleto);
            else lines.push("  Boleto: (indisponível no momento)");
            if (pack.nf) lines.push("  Nota: " + pack.nf);
            else lines.push("  Nota: (indisponível no momento)");
            lines.push("");
          });
          lines.push("Radio Ibiza");
          var text = lines.join("\n");
          window.open(wa + "?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
        })
        .finally(function () {
          state.waBusy = false;
          render();
        });
    }

    function copyRowHtml(label, value) {
      return (
        '<div class="cob-copy-row">' +
        "<span>" +
        escapeHtml(label) +
        "</span>" +
        '<div class="cob-copy-val">' +
        escapeHtml(value || "—") +
        '<button type="button" class="btn-copy" data-copy="' +
        escapeHtml(value || "") +
        '">Copiar</button></div></div>'
      );
    }

    function detailHtml() {
      if (state.detailLoading) {
        return (
          '<div class="tool-loading" aria-live="polite">' +
          '<span class="tool-loading-spin" aria-hidden="true"></span>' +
          "<p>Carregando cliente…</p></div>"
        );
      }
      if (!state.detail) return "";
      var d = state.detail;
      var emailBlock =
        d.emails && d.emails.length ?
          '<ul class="cob-email-list">' +
          d.emails
            .map(function (em) {
              return (
                '<li><span>' +
                escapeHtml(em) +
                '</span><button type="button" class="btn-copy" data-copy="' +
                escapeHtml(em) +
                '">Copiar</button></li>'
              );
            })
            .join("") +
          "</ul>"
        : '<p class="empty-hint">Nenhum e-mail cadastrado.</p>';

      var vendas = d.vendas || [];
      var vendasBlock =
        vendas.length === 0 ?
          '<p class="empty-hint">' +
          (!d.caConnected ?
            "Conta Azul não conectada no portal."
          : !d.caLinked ?
            "Cliente sem vínculo Conta Azul na Planilha Rio."
          : "Nenhuma venda no período consultado.") +
          "</p>"
        : '<ul class="cob-venda-list">' +
          vendas
            .map(function (v) {
              var checked = state.selectedParcelas[v.parcelaId] ? " checked" : "";
              return (
                '<li class="cob-venda-item">' +
                '<label class="cob-venda-check">' +
                '<input type="checkbox" data-parcela="' +
                escapeHtml(v.parcelaId) +
                '"' +
                checked +
                " />" +
                "<div>" +
                "<strong>" +
                escapeHtml(v.competencia) +
                " · " +
                escapeHtml(fmtBRL(v.valor)) +
                "</strong>" +
                "<span>" +
                escapeHtml(v.resumo) +
                " · Venc. " +
                escapeHtml(v.vencimento) +
                " · " +
                escapeHtml(v.statusLabel) +
                "</span></div></label></li>"
              );
            })
            .join("") +
          "</ul>";

      return (
        '<div class="cob-detail">' +
        copyRowHtml("Cliente", d.nome) +
        copyRowHtml("CNPJ", d.cnpj) +
        '<div class="cob-copy-row"><span>E-mails</span>' +
        emailBlock +
        "</div>" +
        "<h3>Últimas 6 vendas emitidas</h3>" +
        vendasBlock +
        (vendas.length ?
          '<div class="cob-wa-actions">' +
          '<button type="button" class="btn-primary" id="btn-cob-wa"' +
          (state.waBusy ? " disabled" : "") +
          ">" +
          (state.waBusy ? "Montando links…" : "Enviar WhatsApp (boletos e notas)") +
          "</button>" +
          '<p class="tool-foot">Selecione as vendas, informe o WhatsApp e enviamos uma mensagem com links de boleto e nota de cada parcela.</p></div>'
        : "") +
        "</div>"
      );
    }

    function searchResultsHtml() {
      if (state.searchBusy) {
        return (
          '<div class="tool-loading" aria-live="polite">' +
          '<span class="tool-loading-spin" aria-hidden="true"></span>' +
          "<p>Buscando clientes…</p></div>"
        );
      }
      if (state.searchResults.length === 0) {
        if (state.q.trim().length >= 2) {
          return '<p class="empty-hint">Nenhum cliente na Planilha Rio.</p>';
        }
        return '<p class="empty-hint">Digite e toque em Buscar.</p>';
      }
      return (
        '<ul class="tool-search-list">' +
        state.searchResults
          .map(function (c) {
            return (
              '<li><button type="button" class="tool-search-item cob-cliente-pick" data-linha="' +
              escapeHtml(c.linhaId) +
              '" data-nome="' +
              escapeHtml(c.nome) +
              '">' +
              "<strong>" +
              escapeHtml(c.nome) +
              "</strong>" +
              "<span>" +
              escapeHtml(c.documentoDisplay) +
              (c.emailPreview ? " · " + escapeHtml(c.emailPreview) : "") +
              "</span></button></li>"
            );
          })
          .join("") +
        "</ul>"
      );
    }

    function bindPanel(root) {
      root.querySelectorAll(".btn-copy").forEach(function (btn) {
        btn.onclick = function () {
          var val = btn.getAttribute("data-copy") || "";
          copyText(val).then(function (ok) {
            showToast(ok ? "Copiado." : "Não foi possível copiar.");
          });
        };
      });
      root.querySelectorAll('input[type="checkbox"][data-parcela]').forEach(function (cb) {
        cb.onchange = function () {
          var id = cb.getAttribute("data-parcela");
          if (!id) return;
          if (cb.checked) state.selectedParcelas[id] = true;
          else delete state.selectedParcelas[id];
        };
      });
      var waBtn = root.querySelector("#btn-cob-wa");
      if (waBtn) waBtn.onclick = function () {
        sendWhatsAppSelected();
      };
    }

    function render() {
      setScreenHeader("Cobrança", true);
      var searchBtnLabel = state.searchBusy ? "Buscando…" : "Buscar";

      mainEl.innerHTML =
        '<div class="cobranca-panel tool-panel">' +
        '<div class="tool-search">' +
        "<span>Buscar cliente (Planilha Rio)</span>" +
        '<div class="tool-search-row">' +
        '<input type="search" enterkeyhint="search" id="cobranca-q" autocomplete="off" placeholder="Nome, CNPJ ou e-mail…" value="' +
        escapeHtml(state.q) +
        '" />' +
        '<button type="button" id="btn-cobranca-search" class="btn-search"' +
        (state.searchBusy ? " disabled" : "") +
        ">" +
        escapeHtml(searchBtnLabel) +
        "</button></div></div>" +
        '<div class="cobranca-results">' +
        (state.linhaId && (state.detail || state.detailLoading) ? "" : searchResultsHtml()) +
        "</div>" +
        detailHtml() +
        "</div>";

      var input = mainEl.querySelector("#cobranca-q");
      var searchBtn = mainEl.querySelector("#btn-cobranca-search");
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

      mainEl.querySelectorAll(".cob-cliente-pick").forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute("data-linha");
          if (!id) return;
          state.q = btn.getAttribute("data-nome") || state.q;
          state.searchResults = [];
          void loadDetail(id);
        };
      });

      bindPanel(mainEl);
    }

    return {
      render: render,
      refresh: function () {
        if (!state.linhaId) return Promise.resolve();
        return loadDetail(state.linhaId);
      },
    };
  };
})(typeof window !== "undefined" ? window : global);
