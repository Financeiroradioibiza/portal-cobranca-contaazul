(function () {
  var auth = window.ChamadosAppAuth;
  if (!auth) return;

  var state = {
    user: null,
    tab: "tickets",
    ticketFilter: "abertos",
    chamados: [],
    assuntos: [],
    selectedTicket: null,
    selectedAssunto: null,
    messages: [],
    loading: true,
  };

  var mainEl = document.getElementById("main");
  var titleEl = document.getElementById("screen-title");
  var overlayEl = document.getElementById("overlay");
  var navEl = document.getElementById("bottom-nav");
  var fabEl = null;

  var STATUS = {
    aberto: { label: "Aberto", cls: "badge-status-aberto" },
    em_andamento: { label: "Em andamento", cls: "badge-status-em_andamento" },
    fechado: { label: "Resolvido", cls: "badge-status-fechado" },
  };

  var PRI = {
    urgente: { label: "Urgente", cls: "badge-pri-urgente" },
    alta: { label: "Alta", cls: "badge-pri-alta" },
    media: { label: "Média", cls: "badge-pri-media" },
    baixa: { label: "Baixa", cls: "badge-pri-baixa" },
  };

  function fmtWhen(iso) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso));
    } catch (e) {
      return "";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseParams() {
    var p = new URLSearchParams(window.location.search);
    var view = p.get("view");
    var conversa = p.get("conversa");
    if (view === "chat" || conversa) {
      state.tab = "chat";
    }
    return conversa;
  }

  function setUrl() {
    var p = new URLSearchParams();
    if (state.tab === "chat" && state.selectedAssunto) {
      p.set("view", "chat");
      p.set("conversa", state.selectedAssunto.slug);
    }
    var qs = p.toString();
    var path = window.location.pathname;
    history.replaceState({}, "", qs ? path + "?" + qs : path);
  }

  function showOverlay(innerHtml) {
    overlayEl.innerHTML = '<div class="sheet" role="dialog">' + innerHtml + "</div>";
    overlayEl.removeAttribute("hidden");
    overlayEl.hidden = false;
    overlayEl.onclick = function (e) {
      if (e.target === overlayEl) closeOverlay();
    };
  }

  function closeOverlay() {
    overlayEl.hidden = true;
    overlayEl.setAttribute("hidden", "");
    overlayEl.innerHTML = "";
  }

  function loadChamados() {
    return auth.apiFetch("/api/chamados").then(function (r) {
      if (!r.ok) throw new Error("chamados");
      return r.json();
    }).then(function (d) {
      state.chamados = d.chamados || [];
    });
  }

  function loadAssuntos() {
    return auth.apiFetch("/api/chamados/conversas").then(function (r) {
      if (!r.ok) throw new Error("conversas");
      return r.json();
    }).then(function (d) {
      state.assuntos = d.assuntos || [];
    });
  }

  function loadMessages(assuntoId) {
    return auth.apiFetch("/api/chamados/conversas/" + encodeURIComponent(assuntoId) + "/mensagens")
      .then(function (r) {
        if (!r.ok) throw new Error("msgs");
        return r.json();
      })
      .then(function (d) {
        state.messages = d.mensagens || [];
        return auth.apiFetch("/api/chamados/conversas/" + encodeURIComponent(assuntoId) + "/read", {
          method: "POST",
        });
      });
  }

  function filteredTickets() {
    var list = state.chamados.slice();
    if (state.ticketFilter === "abertos") {
      list = list.filter(function (c) {
        return c.status !== "fechado";
      });
    } else if (state.ticketFilter === "fechados") {
      list = list.filter(function (c) {
        return c.status === "fechado";
      });
    }
    list.sort(function (a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return list;
  }

  function renderTickets() {
    titleEl.textContent = "Chamados";
    navEl.hidden = false;
    var list = filteredTickets();
    var html = '<div class="pill-row">' +
      ['abertos', 'todos', 'fechados'].map(function (f) {
        var labels = { abertos: "Em aberto", todos: "Todos", fechados: "Resolvidos" };
        return '<button type="button" class="pill' + (state.ticketFilter === f ? " active" : "") +
          '" data-filter="' + f + '">' + labels[f] + "</button>";
      }).join("") +
      "</div>";

    if (list.length === 0) {
      html += '<p class="empty">Nenhum chamado neste filtro.</p>';
    } else {
      html += '<div class="card-list">';
      list.forEach(function (c) {
        var st = STATUS[c.status] || STATUS.aberto;
        var pr = PRI[c.prioridade] || PRI.media;
        html += '<button type="button" class="ticket-card" data-ticket="' + escapeHtml(c.id) + '">' +
          '<h3 class="ticket-title">' + escapeHtml(c.titulo) + "</h3>" +
          '<div class="ticket-meta">' +
          '<span class="badge ' + st.cls + '">' + st.label + "</span>" +
          '<span class="badge ' + pr.cls + '">' + pr.label + "</span>" +
          '<span class="muted">' + fmtWhen(c.updatedAt) + "</span>" +
          "</div></button>";
      });
      html += "</div>";
    }
    mainEl.innerHTML = html;

    mainEl.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        state.ticketFilter = btn.getAttribute("data-filter");
        renderTickets();
      };
    });
    mainEl.querySelectorAll("[data-ticket]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-ticket");
        state.selectedTicket = state.chamados.find(function (c) {
          return c.id === id;
        }) || null;
        renderTicketDetail();
      };
    });

    ensureFab(state.tab === "tickets" ? "ticket" : "channel");
  }

  function renderTicketDetail() {
    var c = state.selectedTicket;
    if (!c) return renderTickets();
    navEl.hidden = true;
    titleEl.textContent = "Detalhe";
    var st = STATUS[c.status] || STATUS.aberto;
    var html = '<button type="button" class="back-link" id="back-tickets">← Voltar</button>' +
      '<h2 style="margin:0 0 0.5rem;font-size:1.35rem">' + escapeHtml(c.titulo) + "</h2>" +
      '<div class="ticket-meta" style="margin-bottom:1rem">' +
      '<span class="badge ' + st.cls + '">' + st.label + "</span></div>" +
      '<p style="font-size:1.05rem;line-height:1.5;white-space:pre-wrap">' +
      escapeHtml(c.descricao || "—") + "</p>" +
      '<p class="muted" style="margin-top:1rem">Atualizado ' + fmtWhen(c.updatedAt) + "</p>" +
      '<div class="sheet-actions" style="margin-top:1.25rem">' +
      (c.status !== "em_andamento" ?
        '<button type="button" class="btn-secondary" data-status="em_andamento">Em andamento</button>' : "") +
      (c.status !== "fechado" ?
        '<button type="button" class="btn-primary" data-status="fechado">Resolver</button>' : "") +
      (c.status === "fechado" ?
        '<button type="button" class="btn-secondary" data-status="aberto">Reabrir</button>' : "") +
      "</div>";
    mainEl.innerHTML = html;

    document.getElementById("back-tickets").onclick = function () {
      state.selectedTicket = null;
      navEl.hidden = false;
      renderTickets();
    };

    mainEl.querySelectorAll("[data-status]").forEach(function (btn) {
      btn.onclick = function () {
        var status = btn.getAttribute("data-status");
        btn.disabled = true;
        auth.apiFetch("/api/chamados/" + encodeURIComponent(c.id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: status, notificar: true }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (d.chamado) state.selectedTicket = d.chamado;
            return loadChamados();
          })
          .then(function () {
            renderTicketDetail();
          })
          .catch(function () {
            alert("Não foi possível atualizar.");
          });
      };
    });
    removeFab();
  }

  function renderChatList() {
    titleEl.textContent = "Chat";
    navEl.hidden = false;
    state.selectedAssunto = null;
    state.messages = [];
    setUrl();

    var html = "";
    if (state.assuntos.length === 0) {
      html += '<p class="empty">Nenhum canal # ainda. Crie um com +.</p>';
    } else {
      html += '<div class="card-list">';
      state.assuntos.forEach(function (a) {
        html += '<button type="button" class="channel-card" data-assunto="' + escapeHtml(a.id) + '">' +
          '<h3 class="ticket-title"><span class="channel-hash">#</span>' + escapeHtml(a.display || a.slug) + "</h3>" +
          '<p class="muted" style="margin:0.35rem 0 0">' +
          (a.lastMessagePreview ? escapeHtml(a.lastMessagePreview.slice(0, 120)) : "Sem mensagens") +
          "</p>" +
          (a.unreadCount > 0 ? ' <span class="unread-dot" title="Não lidas"></span>' : "") +
          "</button>";
      });
      html += "</div>";
    }
    mainEl.innerHTML = html;

    mainEl.querySelectorAll("[data-assunto]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-assunto");
        state.selectedAssunto = state.assuntos.find(function (a) {
          return a.id === id;
        }) || null;
        renderChatThread();
      };
    });

    ensureFab("channel");
  }

  function renderChatThread() {
    var a = state.selectedAssunto;
    if (!a) return renderChatList();
    navEl.hidden = true;
    titleEl.textContent = "#" + (a.display || a.slug);
    setUrl();

    mainEl.innerHTML = '<button type="button" class="back-link" id="back-chat">← Canais</button>' +
      '<div class="chat-thread" id="thread"><p class="loading">Carregando…</p></div>' +
      '<form class="composer" id="composer">' +
      '<input id="msg-input" placeholder="Mensagem… use @ para mencionar" autocomplete="off" />' +
      '<button type="submit">Enviar</button></form>';

    document.getElementById("back-chat").onclick = function () {
      state.selectedAssunto = null;
      loadAssuntos().then(renderChatList);
    };

    loadMessages(a.id).then(renderMessages).catch(function () {
      document.getElementById("thread").innerHTML = '<p class="empty">Erro ao carregar mensagens.</p>';
    });

    document.getElementById("composer").onsubmit = function (e) {
      e.preventDefault();
      var input = document.getElementById("msg-input");
      var corpo = input.value.trim();
      if (!corpo) return;
      input.disabled = true;
      auth.apiFetch("/api/chamados/conversas/" + encodeURIComponent(a.id) + "/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpo: corpo }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("send");
          input.value = "";
          return loadMessages(a.id);
        })
        .then(renderMessages)
        .finally(function () {
          input.disabled = false;
          input.focus();
        });
    };

    removeFab();
  }

  function renderMessages() {
    var thread = document.getElementById("thread");
    if (!thread) return;
    var me = (state.user && state.user.email) || "";
    if (state.messages.length === 0) {
      thread.innerHTML = '<p class="empty">Seja o primeiro a escrever aqui.</p>';
      return;
    }
    thread.innerHTML = state.messages
      .map(function (m) {
        var mine = m.autorEmail === me;
        return '<div class="msg ' + (mine ? "mine" : "theirs") + '">' +
          (mine ? "" : '<div class="msg-author">' + escapeHtml(m.autorNome || m.autorEmail) + "</div>") +
          escapeHtml(m.corpo) +
          '<div class="muted" style="font-size:0.75rem;margin-top:0.35rem">' + fmtWhen(m.createdAt) + "</div>" +
          "</div>";
      })
      .join("");
    thread.scrollTop = thread.scrollHeight;
  }

  function ensureFab(kind) {
    removeFab();
    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.className = "fab";
    fabEl.setAttribute("aria-label", "Novo");
    fabEl.textContent = "+";
    fabEl.onclick = function () {
      if (kind === "ticket") openNewTicketSheet();
      else openNewChannelSheet();
    };
    document.body.appendChild(fabEl);
  }

  function removeFab() {
    if (fabEl && fabEl.parentNode) fabEl.parentNode.removeChild(fabEl);
    fabEl = null;
  }

  function openNewTicketSheet() {
    showOverlay(
      "<h2>Novo chamado</h2>" +
        '<form id="form-ticket">' +
        '<label><span>Título</span><input name="titulo" required maxlength="200" /></label>' +
        '<label><span>Descrição</span><textarea name="descricao" required></textarea></label>' +
        '<label><span>Prioridade</span><select name="prioridade">' +
        '<option value="media">Média</option><option value="baixa">Baixa</option>' +
        '<option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>' +
        '<div class="sheet-actions">' +
        '<button type="button" class="btn-secondary" id="cancel-sheet">Cancelar</button>' +
        '<button type="submit" class="btn-primary">Criar</button></div></form>',
    );
    document.getElementById("cancel-sheet").onclick = closeOverlay;
    document.getElementById("form-ticket").onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      auth.apiFetch("/api/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: fd.get("titulo"),
          descricao: fd.get("descricao"),
          prioridade: fd.get("prioridade"),
          setores: ["geral"],
          responsaveis: [],
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("create");
          closeOverlay();
          return loadChamados();
        })
        .then(function () {
          renderTickets();
        })
        .catch(function () {
          alert("Erro ao criar chamado.");
        });
    };
  }

  function openNewChannelSheet() {
    showOverlay(
      "<h2>Novo canal #</h2>" +
        '<form id="form-channel">' +
        '<label><span>Nome do assunto</span><input name="titulo" required placeholder="Ex.: financeiro-semana" /></label>' +
        '<p class="muted" style="font-size:0.9rem">Virá um canal #automático no portal.</p>' +
        '<div class="sheet-actions">' +
        '<button type="button" class="btn-secondary" id="cancel-sheet">Cancelar</button>' +
        '<button type="submit" class="btn-primary">Criar</button></div></form>',
    );
    document.getElementById("cancel-sheet").onclick = closeOverlay;
    document.getElementById("form-channel").onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      auth.apiFetch("/api/chamados/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: fd.get("titulo") }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("create");
          closeOverlay();
          return loadAssuntos();
        })
        .then(function () {
          renderChatList();
        })
        .catch(function () {
          alert("Erro ao criar canal.");
        });
    };
  }

  function render() {
    if (state.tab === "tickets") {
      if (state.selectedTicket) renderTicketDetail();
      else renderTickets();
    } else if (state.selectedAssunto) {
      renderChatThread();
    } else {
      renderChatList();
    }
    navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === state.tab);
    });
  }

  navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.onclick = function () {
      state.tab = btn.getAttribute("data-tab");
      state.selectedTicket = null;
      state.selectedAssunto = null;
      render();
    };
  });

  document.getElementById("btn-logout").onclick = function () {
    auth.logout();
  };

  closeOverlay();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

  var deepConversa = parseParams();

  auth.requireSession()
    .then(function (user) {
      state.user = user;
      return Promise.all([loadChamados(), loadAssuntos()]);
    })
    .then(function () {
      if (deepConversa) {
        state.selectedAssunto = state.assuntos.find(function (a) {
          return a.slug === deepConversa;
        }) || null;
        state.tab = "chat";
      }
      state.loading = false;
      render();
    })
    .catch(function () {
      window.location.replace("/login.html");
    });
})();
