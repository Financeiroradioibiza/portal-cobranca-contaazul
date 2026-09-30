(function () {
  var auth = window.ChamadosAppAuth;
  if (!auth) return;

  var SETORES = [
    { id: "financeiro", label: "Financeiro" },
    { id: "suporte", label: "Suporte" },
    { id: "cadastros", label: "Cadastros" },
    { id: "producao", label: "Produção" },
    { id: "criacao", label: "Criação" },
    { id: "relacionamento", label: "Relacionamento" },
    { id: "admin", label: "Admin" },
    { id: "geral", label: "Geral" },
  ];

  var state = {
    user: null,
    tab: "tickets",
    ticketFilter: "abertos",
    chamados: [],
    resumo: null,
    participants: [],
    assuntos: [],
    selectedTicket: null,
    selectedAssunto: null,
    messages: [],
    ticketComments: [],
    ticketAnexos: [],
    detailDraft: null,
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

  function initials(name, email) {
    var p = String(name || email || "?")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
    return String(name || email || "?")
      .slice(0, 2)
      .toUpperCase();
  }

  function avatarGradient(seed) {
    var hues = [320, 260, 210, 170, 30, 280];
    var h = 0;
    for (var i = 0; i < seed.length; i += 1) h = (h + seed.charCodeAt(i) * 17) % hues.length;
    return "linear-gradient(135deg,hsl(" + hues[h] + " 70% 45%),hsl(" + hues[(h + 2) % hues.length] + " 65% 50%))";
  }

  function participantByEmail(email) {
    var key = String(email || "").toLowerCase();
    for (var i = 0; i < state.participants.length; i += 1) {
      if (state.participants[i].email.toLowerCase() === key) return state.participants[i];
    }
    return null;
  }

  function normalizeTagCor(raw) {
    var c = String(raw || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#6366f1";
  }

  function slugifyName(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function participantForMentionToken(rawToken) {
    var token = String(rawToken || "").replace(/^@/, "").trim();
    if (!token) return null;
    if (token.indexOf("@") >= 0) {
      var key = token.toLowerCase();
      for (var i = 0; i < state.participants.length; i += 1) {
        if (state.participants[i].email.toLowerCase() === key) return state.participants[i];
      }
      return null;
    }
    var needle = token.toLowerCase();
    for (var j = 0; j < state.participants.length; j += 1) {
      var p = state.participants[j];
      var local = p.email.split("@")[0].toLowerCase();
      var slug = slugifyName(p.displayName);
      if (local === needle || slug === needle || slug.indexOf(needle) === 0) return p;
    }
    return null;
  }

  function corpoWithMentionsHtml(corpo) {
    var parts = String(corpo || "").split(/(@[a-zA-Z0-9._\-]+(?:@[a-zA-Z0-9.\-]+)?)/g);
    return parts
      .map(function (part) {
        if (part.indexOf("@") !== 0) return escapeHtml(part);
        var person = participantForMentionToken(part);
        var color = normalizeTagCor(person && person.tagCor);
        return '<span style="font-weight:800;color:' + color + '">' + escapeHtml(part) + "</span>";
      })
      .join("");
  }

  function avatarHtml(email, name, extraClass) {
    var p = participantByEmail(email);
    var cls = "avatar avatar-xs" + (extraClass ? " " + extraClass : "");
    if (p && p.userId && p.hasAvatar) {
      var v = p.avatarVersion ? "?v=" + encodeURIComponent(p.avatarVersion) : "";
      return (
        '<img class="' +
        cls +
        '" src="/api/config/users/' +
        encodeURIComponent(p.userId) +
        "/avatar" +
        v +
        '" alt="" />'
      );
    }
    return (
      '<span class="' +
      cls +
      '" style="background:' +
      avatarGradient(email || name) +
      '">' +
      escapeHtml(initials(name || email, email)) +
      "</span>"
    );
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

  function loadParticipants() {
    return auth.apiFetch("/api/chamados/participants").then(function (r) {
      if (!r.ok) return { participants: [] };
      return r.json();
    }).then(function (d) {
      state.participants = d.participants || [];
    });
  }

  function loadChamados() {
    return auth.apiFetch("/api/chamados").then(function (r) {
      if (!r.ok) throw new Error("chamados");
      return r.json();
    }).then(function (d) {
      state.chamados = d.chamados || [];
      state.resumo = d.resumo || null;
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

  function loadTicketThread(chamadoId) {
    return Promise.all([
      auth.apiFetch("/api/chamados/" + encodeURIComponent(chamadoId) + "/comentarios"),
      auth.apiFetch("/api/chamados/" + encodeURIComponent(chamadoId) + "/anexos"),
    ]).then(function (results) {
      return Promise.all([
        results[0].ok ? results[0].json() : { comentarios: [] },
        results[1].ok ? results[1].json() : { anexos: [] },
      ]);
    }).then(function (pair) {
      state.ticketComments = pair[0].comentarios || [];
      state.ticketAnexos = pair[1].anexos || [];
    });
  }

  function markTicketRead(chamadoId, unread) {
    if (!unread) return Promise.resolve();
    return auth
      .apiFetch("/api/chamados/" + encodeURIComponent(chamadoId) + "/read", { method: "POST" })
      .then(function () {
        state.chamados = state.chamados.map(function (c) {
          if (c.id === chamadoId) return Object.assign({}, c, { unreadCount: 0 });
          return c;
        });
        if (state.resumo) {
          state.resumo = Object.assign({}, state.resumo, {
            chamadosNaoLidos: Math.max(0, (state.resumo.chamadosNaoLidos || 0) - unread),
          });
        }
      });
  }

  function updateNavBadges() {
    var r = state.resumo || {};
    navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
      var tab = btn.getAttribute("data-tab");
      var old = btn.querySelector(".nav-badge");
      if (old) old.parentNode.removeChild(old);
      var n = 0;
      if (tab === "tickets") n = r.chamadosNaoLidos || 0;
      if (tab === "chat") {
        n = r.conversasNaoLidas || 0;
        if (r.conversasMencoes > 0) n = r.conversasMencoes;
      }
      if (n > 0) {
        var badge = document.createElement("span");
        badge.className = "nav-badge";
        badge.textContent = tab === "chat" && r.conversasMencoes > 0 ? "@" : n > 99 ? "99+" : String(n);
        btn.appendChild(badge);
      }
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
      var ua = a.unreadCount || 0;
      var ub = b.unreadCount || 0;
      if (ub !== ua) return ub - ua;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return list;
  }

  function noticeBarHtml() {
    var r = state.resumo;
    if (!r) return "";
    var parts = [];
    if (r.chamadosNaoLidos > 0) parts.push(r.chamadosNaoLidos + " não lido(s) em chamados");
    if (r.conversasMencoes > 0) parts.push(r.conversasMencoes + " menção(ões) no chat");
    else if (r.conversasNaoLidas > 0) parts.push(r.conversasNaoLidas + " msg no chat");
    if (parts.length === 0) return "";
    return '<p class="notice-bar">' + escapeHtml(parts.join(" · ")) + "</p>";
  }

  function openTicket(c) {
    state.selectedTicket = c;
    state.detailDraft = {
      titulo: c.titulo,
      descricao: c.descricao || "",
      prioridade: c.prioridade,
      setores: (c.setores || []).slice(),
      responsaveis: (c.responsaveis || []).slice(),
    };
    var unread = c.unreadCount || 0;
    markTicketRead(c.id, unread).then(function () {
      return loadTicketThread(c.id);
    }).then(function () {
      renderTicketDetail();
    });
  }

  function renderTickets() {
    titleEl.textContent = "Chamados";
    navEl.hidden = false;
    var list = filteredTickets();
    var html = noticeBarHtml() +
      '<div class="pill-row">' +
      ["abertos", "todos", "fechados"].map(function (f) {
        var labels = { abertos: "Em aberto", todos: "Todos", fechados: "Resolvidos" };
        return (
          '<button type="button" class="pill' +
          (state.ticketFilter === f ? " active" : "") +
          '" data-filter="' +
          f +
          '">' +
          labels[f] +
          "</button>"
        );
      }).join("") +
      "</div>";

    if (list.length === 0) {
      html += '<p class="empty">Nenhum chamado neste filtro.</p>';
    } else {
      html += '<div class="card-list">';
      list.forEach(function (c) {
        var st = STATUS[c.status] || STATUS.aberto;
        var pr = PRI[c.prioridade] || PRI.media;
        var unread = c.unreadCount || 0;
        html +=
          '<button type="button" class="ticket-card" data-ticket="' +
          escapeHtml(c.id) +
          '">' +
          (unread > 0 ?
            '<span class="ticket-unread">' + (unread > 99 ? "99+" : unread) + "</span>"
          : "") +
          '<h3 class="ticket-title">' +
          escapeHtml(c.titulo) +
          "</h3>" +
          '<div class="ticket-meta">' +
          '<span class="badge ' +
          st.cls +
          '">' +
          st.label +
          "</span>" +
          '<span class="badge ' +
          pr.cls +
          '">' +
          pr.label +
          "</span>" +
          '<span class="muted">' +
          fmtWhen(c.updatedAt) +
          "</span>" +
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
        var c = state.chamados.find(function (x) {
          return x.id === id;
        });
        if (c) openTicket(c);
      };
    });

    updateNavBadges();
    ensureFab(state.tab === "tickets" ? "ticket" : "channel");
  }

  function patchTicket(body) {
    var c = state.selectedTicket;
    if (!c) return Promise.reject();
    return auth
      .apiFetch("/api/chamados/" + encodeURIComponent(c.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      .then(function (r) {
        if (!r.ok) throw new Error("patch");
        return r.json();
      })
      .then(function (d) {
        if (d.chamado) {
          var prev = state.chamados.find(function (x) {
            return x.id === d.chamado.id;
          });
          var merged = Object.assign({}, d.chamado, { unreadCount: prev ? prev.unreadCount || 0 : 0 });
          state.selectedTicket = merged;
          state.chamados = state.chamados.map(function (x) {
            return x.id === merged.id ? merged : x;
          });
          state.detailDraft = {
            titulo: merged.titulo,
            descricao: merged.descricao || "",
            prioridade: merged.prioridade,
            setores: (merged.setores || []).slice(),
            responsaveis: (merged.responsaveis || []).slice(),
          };
        }
        return loadChamados();
      });
  }

  function renderTicketDetail() {
    var c = state.selectedTicket;
    var d = state.detailDraft;
    if (!c || !d) return renderTickets();
    navEl.hidden = true;
    titleEl.textContent = "Detalhe";
    var st = STATUS[c.status] || STATUS.aberto;

    var setoresHtml = SETORES.map(function (s) {
      var on = d.setores.indexOf(s.id) >= 0;
      return (
        '<button type="button" class="setor-chip' +
        (on ? " on" : "") +
        '" data-setor="' +
        s.id +
        '">' +
        escapeHtml(s.label) +
        "</button>"
      );
    }).join("");

    var peopleHtml = state.participants
      .map(function (p) {
        var checked = d.responsaveis.indexOf(p.email) >= 0;
        return (
          '<label class="person-row">' +
          '<input type="checkbox" data-resp="' +
          escapeHtml(p.email) +
          '"' +
          (checked ? " checked" : "") +
          " />" +
          avatarHtml(p.email, p.displayName) +
          "<span>" +
          escapeHtml(p.displayName) +
          "</span></label>"
        );
      })
      .join("");

    var commentsHtml =
      state.ticketComments.length === 0 ?
        '<p class="muted">Nenhuma resposta ainda.</p>'
      : state.ticketComments
          .map(function (cm) {
            var mine = cm.autorEmail === (state.user && state.user.email);
            return (
              '<div class="comment-row' +
              (mine ? " mine" : "") +
              '">' +
              (mine ? "" : avatarHtml(cm.autorEmail, cm.autorNome)) +
              '<div class="comment-bubble' +
              (mine ? " mine" : "") +
              '">' +
              '<div class="muted" style="font-size:0.72rem;margin-bottom:0.25rem">' +
              escapeHtml(cm.autorNome) +
              " · " +
              fmtWhen(cm.createdAt) +
              "</div>" +
              corpoWithMentionsHtml(cm.corpo) +
              "</div></div>"
            );
          })
          .join("");

    var anexosHtml =
      state.ticketAnexos.length === 0 ?
        '<p class="muted">Nenhum anexo.</p>'
      : "<ul>" +
        state.ticketAnexos
          .map(function (a) {
            return (
              '<li><a href="/api/chamados/anexos/' +
              encodeURIComponent(a.id) +
              '/file" target="_blank" rel="noopener">' +
              escapeHtml(a.fileName) +
              "</a></li>"
            );
          })
          .join("") +
        "</ul>";

    var html =
      '<button type="button" class="back-link" id="back-tickets">← Voltar</button>' +
      '<div class="ticket-meta" style="margin-bottom:0.75rem">' +
      '<span class="badge ' +
      st.cls +
      '">' +
      st.label +
      "</span></div>" +
      '<div class="detail-block">' +
      "<label><span>Título</span>" +
      '<input id="d-titulo" value="' +
      escapeHtml(d.titulo) +
      '" maxlength="200" /></label>' +
      "<label><span>Pedido inicial</span>" +
      '<textarea id="d-desc">' +
      escapeHtml(d.descricao) +
      "</textarea></label>" +
      "<label><span>Prioridade</span>" +
      '<select id="d-pri">' +
      ["baixa", "media", "alta", "urgente"]
        .map(function (p) {
          return (
            '<option value="' +
            p +
            '"' +
            (d.prioridade === p ? " selected" : "") +
            ">" +
            (PRI[p] ? PRI[p].label : p) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      "<p><span>Setores</span></p>" +
      setoresHtml +
      '<p style="margin-top:0.75rem"><span>Pessoas</span></p>' +
      '<div style="max-height:160px;overflow:auto">' +
      peopleHtml +
      "</div></div>" +
      '<div class="detail-block"><h3>Respostas</h3>' +
      commentsHtml +
      '<form id="form-reply" style="margin-top:0.75rem">' +
      '<textarea id="reply-body" placeholder="Responder…" rows="3"></textarea>' +
      '<button type="submit" class="btn-primary" style="margin-top:0.5rem;width:100%">Enviar resposta</button></form></div>' +
      '<div class="detail-block"><h3>Anexos</h3>' +
      anexosHtml +
      '<label style="display:block;margin-top:0.75rem"><span>Adicionar arquivo</span>' +
      '<input type="file" id="d-anexo" /></label></div>' +
      '<div class="sheet-actions" style="margin-top:1rem;flex-wrap:wrap;gap:0.5rem">' +
      (c.status !== "em_andamento" ?
        '<button type="button" class="btn-secondary" data-quick-status="em_andamento">Em andamento</button>'
      : "") +
      (c.status !== "fechado" ?
        '<button type="button" class="btn-primary" data-quick-status="fechado">Resolver</button>'
      : "") +
      (c.status === "fechado" ?
        '<button type="button" class="btn-secondary" data-quick-status="aberto">Reabrir</button>'
      : "") +
      '<button type="button" class="btn-primary" id="btn-save-ticket">Salvar alterações</button></div>';

    mainEl.innerHTML = html;

    document.getElementById("back-tickets").onclick = function () {
      state.selectedTicket = null;
      state.detailDraft = null;
      navEl.hidden = false;
      renderTickets();
    };

    mainEl.querySelectorAll("[data-setor]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-setor");
        var idx = d.setores.indexOf(id);
        if (idx >= 0) d.setores.splice(idx, 1);
        else d.setores.push(id);
        renderTicketDetail();
      };
    });

    mainEl.querySelectorAll("[data-resp]").forEach(function (inp) {
      inp.onchange = function () {
        var email = inp.getAttribute("data-resp");
        var idx = d.responsaveis.indexOf(email);
        if (inp.checked && idx < 0) d.responsaveis.push(email);
        if (!inp.checked && idx >= 0) d.responsaveis.splice(idx, 1);
      };
    });

    document.getElementById("d-titulo").oninput = function (e) {
      d.titulo = e.target.value;
    };
    document.getElementById("d-desc").oninput = function (e) {
      d.descricao = e.target.value;
    };
    document.getElementById("d-pri").onchange = function (e) {
      d.prioridade = e.target.value;
    };

    document.getElementById("form-reply").onsubmit = function (e) {
      e.preventDefault();
      var body = document.getElementById("reply-body").value.trim();
      if (!body) return;
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      auth
        .apiFetch("/api/chamados/" + encodeURIComponent(c.id) + "/comentarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corpo: body }),
        })
        .then(function (r) {
          if (!r.ok) throw new Error("reply");
          return loadTicketThread(c.id);
        })
        .then(function () {
          renderTicketDetail();
        })
        .catch(function () {
          alert("Não foi possível enviar a resposta.");
        })
        .finally(function () {
          btn.disabled = false;
        });
    };

    document.getElementById("d-anexo").onchange = function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append("file", file);
      auth
        .apiFetch("/api/chamados/" + encodeURIComponent(c.id) + "/anexos", {
          method: "POST",
          body: fd,
        })
        .then(function (r) {
          if (!r.ok) throw new Error("anexo");
          e.target.value = "";
          return loadTicketThread(c.id);
        })
        .then(function () {
          renderTicketDetail();
        })
        .catch(function () {
          alert("Não foi possível enviar o anexo.");
        });
    };

    mainEl.querySelectorAll("[data-quick-status]").forEach(function (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        patchTicket({ status: btn.getAttribute("data-quick-status"), notificar: true })
          .then(function () {
            renderTicketDetail();
          })
          .catch(function () {
            alert("Não foi possível atualizar o status.");
          })
          .finally(function () {
            btn.disabled = false;
          });
      };
    });

    document.getElementById("btn-save-ticket").onclick = function () {
      var btn = document.getElementById("btn-save-ticket");
      btn.disabled = true;
      patchTicket({
        titulo: d.titulo,
        descricao: d.descricao,
        prioridade: d.prioridade,
        setores: d.setores,
        responsaveis: d.responsaveis,
        notificar: true,
      })
        .then(function () {
          alert("Chamado salvo.");
          renderTicketDetail();
        })
        .catch(function () {
          alert("Não foi possível salvar.");
        })
        .finally(function () {
          btn.disabled = false;
        });
    };

    removeFab();
  }

  function renderChatList() {
    titleEl.textContent = "Chat";
    navEl.hidden = false;
    state.selectedAssunto = null;
    state.messages = [];
    setUrl();

    var html = noticeBarHtml();
    if (state.assuntos.length === 0) {
      html += '<p class="empty">Nenhum canal # ainda. Crie um com +.</p>';
    } else {
      html += '<div class="card-list">';
      state.assuntos.forEach(function (a) {
        var unread = a.unreadCount || 0;
        html +=
          '<button type="button" class="channel-card" data-assunto="' +
          escapeHtml(a.id) +
          '">' +
          (unread > 0 || a.mentionUnread ?
            '<span class="ticket-unread">' + (a.mentionUnread ? "@" : unread > 99 ? "99+" : unread) + "</span>"
          : "") +
          '<h3 class="ticket-title"><span class="channel-hash">#</span>' +
          escapeHtml(a.display || a.slug) +
          "</h3>" +
          '<p class="muted" style="margin:0.35rem 0 0">' +
          (a.lastMessagePreview ? escapeHtml(a.lastMessagePreview.slice(0, 120)) : "Sem mensagens") +
          "</p></button>";
      });
      html += "</div>";
    }
    mainEl.innerHTML = html;

    mainEl.querySelectorAll("[data-assunto]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-assunto");
        state.selectedAssunto =
          state.assuntos.find(function (a) {
            return a.id === id;
          }) || null;
        renderChatThread();
      };
    });

    updateNavBadges();
    ensureFab("channel");
  }

  function renderChatThread() {
    var a = state.selectedAssunto;
    if (!a) return renderChatList();
    navEl.hidden = true;
    titleEl.textContent = "#" + (a.display || a.slug);
    setUrl();

    mainEl.innerHTML =
      '<button type="button" class="back-link" id="back-chat">← Canais</button>' +
      '<div class="chat-thread" id="thread"><p class="loading">Carregando…</p></div>' +
      '<form class="composer" id="composer">' +
      '<input id="msg-input" placeholder="Mensagem… use @ para mencionar" autocomplete="off" />' +
      '<button type="submit">Enviar</button></form>';

    document.getElementById("back-chat").onclick = function () {
      state.selectedAssunto = null;
      loadAssuntos().then(function () {
        return loadChamados();
      }).then(renderChatList);
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
      auth
        .apiFetch("/api/chamados/conversas/" + encodeURIComponent(a.id) + "/mensagens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ corpo: corpo }),
        })
        .then(function (r) {
          if (!r.ok) throw new Error("send");
          input.value = "";
          return loadMessages(a.id);
        })
        .then(function () {
          return loadChamados();
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
        return (
          '<div class="msg ' +
          (mine ? "mine" : "theirs") +
          '">' +
          (mine ? "" : avatarHtml(m.autorEmail, m.autorNome || m.autorEmail)) +
          '<div class="msg-body">' +
          (mine ? "" : '<div class="msg-author">' + escapeHtml(m.autorNome || m.autorEmail) + "</div>") +
          corpoWithMentionsHtml(m.corpo) +
          '<div class="muted" style="font-size:0.75rem;margin-top:0.35rem">' +
          fmtWhen(m.createdAt) +
          "</div></div></div>"
        );
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
      auth
        .apiFetch("/api/chamados", {
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
      auth
        .apiFetch("/api/chamados/conversas", {
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
    updateNavBadges();
  }

  navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.onclick = function () {
      state.tab = btn.getAttribute("data-tab");
      state.selectedTicket = null;
      state.selectedAssunto = null;
      state.detailDraft = null;
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

  auth
    .requireSession()
    .then(function (user) {
      state.user = user;
      return Promise.all([loadParticipants(), loadChamados(), loadAssuntos()]);
    })
    .then(function () {
      if (deepConversa) {
        state.selectedAssunto =
          state.assuntos.find(function (a) {
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
