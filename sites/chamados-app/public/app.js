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
    tab: "agenda",
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
    detailPeopleOpen: false,
    ticketFlowBusy: false,
    loading: true,
    ptrRefreshing: false,
    createDraft: null,
    agendaSequencias: [],
    inbox: null,
    chatSearch: "",
  };

  var SVG_REFRESH =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg>';
  var SVG_SEARCH =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';

  var CLIENT_AVATAR_COLORS = ["#62b8ff", "#3fd6a0", "#b392ff", "#f5c04a", "#ff8f7a"];

  var mainEl = document.getElementById("main");
  var titleEl = document.getElementById("screen-title");
  var overlayEl = document.getElementById("overlay");
  var navEl = document.getElementById("bottom-nav");
  var fabEl = null;

  var STATUS = {
    aberto: { label: "Aberto", cls: "badge-status-aberto" },
    em_andamento: { label: "Em andamento", cls: "badge-status-em_andamento" },
    aguardando: { label: "Aguardando", cls: "badge-status-aguardando" },
    fechado: { label: "Resolvido", cls: "badge-status-fechado" },
  };

  var seqDefaults = window.ChamadosSequenciaDefaults;
  var agendaApi = null;

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

  function fmtPrazoEntrega(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso));
    } catch (e) {
      return "";
    }
  }

  function prazoToInputDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    } catch (e) {
      return "";
    }
  }

  function defaultPrazoInputDate() {
    return prazoToInputDate(new Date().toISOString()) || "";
  }

  function loadTemplateStepsForDraft(d, opts) {
    opts = opts || {};
    var editor = window.ChamadosSequenciaEditor;
    if (!d || !editor) return Promise.resolve();
    if (d.template !== "cliente_novo" && d.template !== "vinhetas") {
      d.sequenciaSteps = [];
      return Promise.resolve();
    }
    var template = opts.template || d.template;
    var prazoModo = opts.prazoModo || d.prazoModo || "um_dia_util";
    var dataInstalacao = opts.dataInstalacao !== undefined ? opts.dataInstalacao : d.dataInstalacao || "";
    var prev = (d.sequenciaSteps || []).slice();
    return editor
      .fetchTemplateSteps(auth, template, prazoModo, dataInstalacao)
      .then(function (data) {
        d.setorEmails = data.setorEmails || {};
        d.setoresMeta = data.setores || [];
        d.prazoModo = prazoModo;
        if (prev.length && template === d.template && opts.merge !== false) {
          d.sequenciaSteps = editor.mergePrazosFromServer(prev, data.steps || []);
        } else {
          d.sequenciaSteps = data.steps || [];
        }
      })
      .catch(function () {
        if (seqDefaults && d.template === "cliente_novo") {
          d.sequenciaSteps = seqDefaults.buildDefaultClienteNovoSteps(new Date());
        } else if (seqDefaults && d.template === "vinhetas") {
          d.sequenciaSteps = seqDefaults.buildDefaultVinhetasSteps(
            new Date(),
            seqDefaults.defaultVinhetasRafaelEmail(state.participants),
          );
        }
      });
  }

  function refreshSequenciaStepsForDraft(d) {
    return loadTemplateStepsForDraft(d, { merge: false });
  }

  function chatUnreadTotals() {
    var mention = 0;
    var general = 0;
    (state.assuntos || []).forEach(function (a) {
      mention += Number(a.unreadMentionCount) || 0;
      general += Number(a.unreadGeneralCount) || 0;
    });
    if (state.resumo && !(state.assuntos && state.assuntos.length)) {
      mention = state.resumo.conversasMencoes || mention;
      general = state.resumo.conversasNaoLidas || general;
    }
    return { mention: mention, general: general };
  }

  function userInAssunto(a) {
    var me = (state.user && state.user.email) || "";
    if (!me) return true;
    var key = me.toLowerCase();
    var grupo = a.grupoEmails || [];
    if (!grupo.length) return true;
    if (
      grupo.some(function (e) {
        return String(e).toLowerCase() === key;
      })
    ) {
      return true;
    }
    if (a.criadoPorEmail && String(a.criadoPorEmail).toLowerCase() === key) return true;
    return (Number(a.unreadMentionCount) || 0) > 0 || (Number(a.unreadGeneralCount) || 0) > 0;
  }

  function sortedAssuntosForChat() {
    var list = (state.assuntos || []).filter(userInAssunto);
    list.sort(function (a, b) {
      var ma = Number(a.unreadMentionCount) || 0;
      var mb = Number(b.unreadMentionCount) || 0;
      if (mb !== ma) return mb - ma;
      var ga = Number(a.unreadGeneralCount) || 0;
      var gb = Number(b.unreadGeneralCount) || 0;
      if (gb !== ga) return gb - ga;
      var la = a.lastMessageAt || a.updatedAt || "";
      var lb = b.lastMessageAt || b.updatedAt || "";
      if (lb !== la) return lb.localeCompare(la);
      return String(a.display || a.slug || "").localeCompare(String(b.display || b.slug || ""), "pt-BR");
    });
    return list;
  }

  function chatBadgesHtml(a) {
    var mention = Number(a.unreadMentionCount) || 0;
    var general = Number(a.unreadGeneralCount) || 0;
    if (mention <= 0 && general <= 0) return "";
    var html = '<span class="channel-badges">';
    if (mention > 0) {
      html +=
        '<span class="chat-badge chat-badge-mention" title="Menções @">' +
        (mention > 99 ? "99+" : mention === 1 ? "@" : String(mention)) +
        "</span>";
    }
    if (general > 0) {
      html +=
        '<span class="chat-badge chat-badge-general" title="Não lidas no assunto">' +
        (general > 99 ? "99+" : String(general)) +
        "</span>";
    }
    html += "</span>";
    return html;
  }

  function openChamadoById(id) {
    function tryOpen() {
      var c = state.chamados.find(function (x) {
        return x.id === id;
      });
      if (c) {
        state.tab = "tickets";
        navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
          btn.classList.toggle("active", btn.getAttribute("data-tab") === "tickets");
        });
        openTicket(c);
        return true;
      }
      return false;
    }
    if (tryOpen()) return;
    loadChamados().then(function () {
      if (!tryOpen()) alert("Chamado não encontrado ou sem acesso.");
    });
  }

  function setScreenHeader(sectionTitle, layoutV2) {
    var shell = document.getElementById("app");
    if (layoutV2) {
      titleEl.textContent = "";
      if (shell) shell.classList.add("head-v2");
    } else {
      titleEl.textContent = (sectionTitle || "Chamados").toUpperCase();
      if (shell) shell.classList.remove("head-v2");
    }
  }

  function ibizMarkLetter() {
    var name = (state.user && (state.user.displayName || state.user.email)) || "Z";
    return escapeHtml(String(name).trim().charAt(0).toUpperCase() || "Z");
  }

  function ibizScreenHead(title) {
    return (
      '<header class="ibiz-head">' +
      '<div class="ibiz-head-row">' +
      '<div class="ibiz-head-brand">' +
      '<div class="ibiz-head-mark" aria-hidden="true">' +
      ibizMarkLetter() +
      "</div>" +
      '<div class="ibiz-head-title">' +
      escapeHtml(title) +
      "</div></div>" +
      '<button type="button" class="ibiz-icon-btn" id="ibiz-refresh" aria-label="Atualizar">' +
      SVG_REFRESH +
      "</button></div></header>"
    );
  }

  function bindIbizRefresh() {
    var btn = document.getElementById("ibiz-refresh");
    if (!btn) return;
    btn.onclick = function () {
      refreshCurrentView();
    };
  }

  function sequenciaSortKey(seq) {
    var t = Infinity;
    (seq.passos || []).forEach(function (p) {
      if (!p.prazoEntrega) return;
      var x = new Date(p.prazoEntrega).getTime();
      if (x < t) t = x;
    });
    return t === Infinity ? 0 : t;
  }

  function sequenciaAccentIndex(grupoId) {
    var sorted = (state.agendaSequencias || []).slice().sort(function (a, b) {
      return sequenciaSortKey(a) - sequenciaSortKey(b) || String(a.grupoId).localeCompare(String(b.grupoId));
    });
    var idx = sorted.findIndex(function (s) {
      return s.grupoId === grupoId;
    });
    return idx >= 0 ? idx : 0;
  }

  function sequenciaUnreadForGrupo(grupoId) {
    var n = 0;
    state.chamados.forEach(function (c) {
      if (c.sequenciaGrupoId === grupoId) n += Number(c.unreadCount) || 0;
    });
    return n;
  }

  function activeChamadoForSequencia(seq) {
    var passos = seq.passos || [];
    var active = passos.find(function (p) {
      return p.status === "aberto" || p.status === "em_andamento";
    });
    return (active && active.chamadoId) || (passos[0] && passos[0].chamadoId) || null;
  }

  function sequenciaStatusFromChamados(grupoId) {
    var rows = state.chamados.filter(function (c) {
      return c.sequenciaGrupoId === grupoId;
    });
    if (rows.some(function (c) {
      return c.status === "em_andamento";
    })) {
      return STATUS.em_andamento;
    }
    if (rows.some(function (c) {
      return c.status === "aberto";
    })) {
      return STATUS.aberto;
    }
    return STATUS.aguardando;
  }

  function sequenciaLimiteLabel(seq) {
    var passos = seq.passos || [];
    var active = passos.find(function (p) {
      return p.status === "aberto" || p.status === "em_andamento";
    });
    var pick = active || passos[passos.length - 1];
    if (pick && pick.prazoLabel) return "Limite " + pick.prazoLabel.replace(/\./g, "/");
    return "";
  }

  function renderSequenciasRailHtml() {
    var seqs = (state.agendaSequencias || []).slice().sort(function (a, b) {
      return sequenciaSortKey(a) - sequenciaSortKey(b) || String(a.grupoId).localeCompare(String(b.grupoId));
    });
    if (!seqs.length) return "";
    var html =
      '<section><div class="ibiz-section-head">' +
      '<span class="ibiz-kicker ibiz-kicker-seq">Minhas sequências</span>' +
      '<span class="ibiz-kicker-meta">' +
      seqs.length +
      " ativa" +
      (seqs.length === 1 ? "" : "s") +
      '</span></div><div class="ibiz-seq-stack">';
    seqs.forEach(function (seq) {
      var accentIdx = sequenciaAccentIndex(seq.grupoId);
      var accentCls = accentIdx % 2 === 1 ? " ibiz-seq-card--yellow" : "";
      var dotCls = accentIdx % 2 === 1 ? " ibiz-seq-dot--yellow" : "";
      var unread = sequenciaUnreadForGrupo(seq.grupoId);
      var st = sequenciaStatusFromChamados(seq.grupoId);
      var pr =
        PRI.media;
      state.chamados.forEach(function (c) {
        if (c.sequenciaGrupoId === seq.grupoId && c.prioridade) pr = PRI[c.prioridade] || pr;
      });
      var cols = Math.max((seq.passos || []).length, 1);
      html +=
        '<button type="button" class="ibiz-seq-card' +
        accentCls +
        '" data-seq-grupo="' +
        escapeHtml(seq.grupoId) +
        '">' +
        '<div class="ibiz-seq-card-top"><div class="ibiz-seq-card-name">' +
        '<span class="ibiz-seq-dot' +
        dotCls +
        '"></span><span>' +
        escapeHtml(seq.titulo || "Sequência") +
        "</span></div>" +
        (unread > 0 ?
          '<span class="ibiz-seq-unread">' + (unread > 99 ? "99+" : String(unread)) + "</span>"
        : "") +
        "</div>" +
        '<div class="ibiz-seq-badges">' +
        '<span class="badge ' +
        st.cls +
        '">' +
        st.label.toUpperCase() +
        "</span>" +
        '<span class="badge ' +
        pr.cls +
        '">' +
        pr.label.toUpperCase() +
        "</span>" +
        (sequenciaLimiteLabel(seq) ?
          '<span class="ibiz-seq-limit">' + escapeHtml(sequenciaLimiteLabel(seq)) + "</span>"
        : "") +
        "</div>" +
        '<div class="ibiz-seq-steps" style="grid-template-columns:repeat(' +
        cols +
        ',minmax(0,1fr))">';
      (seq.passos || []).forEach(function (p) {
        var done = p.status === "fechado";
        var isActive = p.status === "aberto" || p.status === "em_andamento";
        var rot = p.rotulo ? p.passo + " · " + p.rotulo : String(p.passo);
        if (rot.length > 14) rot = rot.slice(0, 13) + "…";
        html +=
          '<div><div class="ibiz-seq-step-bar' +
          (done ? " is-done" : isActive ? " is-active" : "") +
          '"></div><div class="ibiz-seq-step-date' +
          (isActive ? " is-active" : "") +
          '">' +
          escapeHtml(rot) +
          "</div></div>";
      });
      html += "</div></button>";
    });
    html += "</div></section>";
    return html;
  }

  function chamadosNoticeHtml() {
    if (!state.resumo || !(state.resumo.chamadosNaoLidos > 0)) return "";
    return (
      '<p class="ibiz-notice">' +
      '<span class="ibiz-notice-dot" aria-hidden="true"></span>' +
      escapeHtml(state.resumo.chamadosNaoLidos + " não lido(s) em chamados") +
      "</p>"
    );
  }

  function clienteAvatarColor(key) {
    var h = 0;
    var s = String(key || "");
    for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % CLIENT_AVATAR_COLORS.length;
    return CLIENT_AVATAR_COLORS[h];
  }

  function clienteInitials(nome) {
    var parts = String(nome || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(nome || "?")
      .slice(0, 2)
      .toUpperCase();
  }

  function papelCanalLabel(papel) {
    return papel === "mus" ? "Musical" : "Suporte";
  }

  function assuntoTipoTag(a) {
    if (a.tipo === "cliente") {
      var p = a.clientePapel === "mus" ? "MUSICAL" : a.clientePapel === "sup" ? "SUPORTE" : "CLIENTE";
      return p;
    }
    if (a.tipo === "prospect") return "PROSPECT";
    return "GERAL";
  }

  function recentConversas() {
    return sortedAssuntosForChat()
      .filter(function (a) {
        return a.lastMessagePreview;
      })
      .slice(0, 6);
  }

  function clientesInboxFiltered() {
    var rows = (state.inbox && state.inbox.clientes) || [];
    var q = String(state.chatSearch || "")
      .trim()
      .toLowerCase();
    if (!q) return rows;
    return rows.filter(function (c) {
      return String(c.nome || "")
        .toLowerCase()
        .includes(q);
    });
  }

  function openAssuntoById(id) {
    var a =
      state.assuntos.find(function (x) {
        return x.id === id;
      }) || null;
    if (!a) return;
    state.selectedAssunto = a;
    renderChatThread();
  }

  function openClienteCanal(clienteKey, papel) {
    auth
      .apiFetch("/api/chamados/conversas/cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteKey: clienteKey, papel: papel }),
      })
      .then(function (r) {
        if (!r.ok) throw new Error("canal");
        return r.json();
      })
      .then(function (d) {
        return Promise.all([loadAssuntos(), loadInbox()]).then(function () {
          if (d.assunto && d.assunto.id) openAssuntoById(d.assunto.id);
        });
      })
      .catch(function () {
        alert("Não foi possível abrir o assunto.");
      });
  }

  function messageRowHtml(opts) {
    var email = opts.email || "";
    var name = opts.name || email;
    var corpo = opts.corpo || "";
    var when = opts.when || "";
    var mine = !!opts.mine;
    return (
      '<div class="msg-row' +
      (mine ? " msg-row-mine" : "") +
      '">' +
      avatarHtml(email, name) +
      '<div class="msg-body">' +
      '<div class="msg-author">' +
      escapeHtml(name) +
      "</div>" +
      corpoWithMentionsHtml(corpo) +
      (when ? '<div class="msg-time">' + escapeHtml(when) + "</div>" : "") +
      "</div></div>"
    );
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

  function digitsOnlyPhone(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function normalizeWhatsAppE164(raw) {
    var d = digitsOnlyPhone(raw);
    if (!d) return null;
    if (d.charAt(0) === "0") d = d.replace(/^0+/, "");
    if (d.indexOf("55") === 0) {
      if (d.length < 12 || d.length > 13) return null;
      return "+" + d;
    }
    if (d.length === 10 || d.length === 11) return "+55" + d;
    return null;
  }

  function corpoPlainRichHtml(text) {
    var URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    var PHONE_RE =
      /(?:\+?\s*55\s*)?(?:\(\s*\d{2}\s*\)|\d{2})[\s.\-]*(?:9\s*)?\d{4}[\s.\-]*\d{4}|\+\s*55\s*\(?\d{2}\)?[\s.\-]*\d{4,5}[\s.\-]*\d{4}/g;
    var s = String(text || "");
    var matches = [];
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(s))) {
      var label = m[0];
      var href = label;
      if (/^www\./i.test(href)) href = "https://" + href;
      matches.push({ start: m.index, end: m.index + label.length, kind: "url", href: href, label: label });
    }
    PHONE_RE.lastIndex = 0;
    while ((m = PHONE_RE.exec(s))) {
      var pl = m[0];
      var e164 = normalizeWhatsAppE164(pl);
      if (!e164) continue;
      matches.push({
        start: m.index,
        end: m.index + pl.length,
        kind: "phone",
        href: "https://wa.me/" + e164.slice(1),
        label: pl,
      });
    }
    matches.sort(function (a, b) {
      return a.start - b.start || b.end - a.end;
    });
    var filtered = [];
    var lastEnd = 0;
    matches.forEach(function (x) {
      if (x.start < lastEnd) return;
      filtered.push(x);
      lastEnd = x.end;
    });
    var out = "";
    var cursor = 0;
    filtered.forEach(function (x) {
      if (x.start > cursor) out += escapeHtml(s.slice(cursor, x.start));
      out +=
        '<a class="corpo-link" href="' +
        escapeHtml(x.href) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(x.label) +
        "</a>";
      cursor = x.end;
    });
    if (cursor < s.length) out += escapeHtml(s.slice(cursor));
    return out;
  }

  function corpoWithMentionsHtml(corpo) {
    var parts = String(corpo || "").split(/(@[a-zA-Z0-9._\-]+(?:@[a-zA-Z0-9.\-]+)?)/g);
    return parts
      .map(function (part) {
        if (part.indexOf("@") !== 0) return corpoPlainRichHtml(part);
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
    if (view === "agenda") {
      state.tab = "agenda";
    } else if (view === "chat" || conversa) {
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
    state.createDraft = null;
  }

  function emptyCreateDraft() {
    return {
      modo: "livre",
      rioLinhaId: null,
      rioPdvKey: null,
      clienteNome: "",
      clienteKey: null,
      pdvKey: null,
      titulo: "",
      tituloManual: false,
      descricao: "",
      prioridade: "media",
      setores: [],
      responsaveis: [],
      busca: "",
      opcoes: [],
      opcoesLoading: false,
      opcoesErr: "",
      opcoesTimer: null,
      template: "padrao",
      sequenciaSteps: [],
      prazoModo: "um_dia_util",
      dataInstalacao: "",
      setorEmails: {},
      setoresMeta: [],
      prazoLimite: defaultPrazoInputDate(),
      prazoVisivelDesde: defaultPrazoInputDate(),
    };
  }

  function closeTicketDetailScreen() {
    state.selectedTicket = null;
    state.detailDraft = null;
    state.detailPeopleOpen = false;
    state.ticketFlowBusy = false;
    navEl.hidden = false;
    renderTickets();
  }

  function tituloChamadoParaCliente(nome) {
    return String(nome || "").trim().slice(0, 200);
  }

  function tituloChamadoParaPdv(pdvNome, clienteNome) {
    var pdv = String(pdvNome || "").trim();
    var cli = String(clienteNome || "").trim();
    if (!pdv) return cli.slice(0, 200);
    if (!cli || pdv.toLowerCase() === cli.toLowerCase()) return pdv.slice(0, 200);
    return (pdv + " — " + cli).slice(0, 200);
  }

  function createDraftResumoVinculo(d) {
    if (d.modo === "cliente" && d.clienteNome) return "Cliente: " + d.clienteNome;
    if (d.modo === "pdv" && d.pdvKey && d.clienteNome) {
      var pdvLabel = d.pdvKey;
      for (var i = 0; i < d.opcoes.length; i += 1) {
        var c = d.opcoes[i];
        if (c.key !== d.clienteKey) continue;
        for (var j = 0; j < (c.pdvs || []).length; j += 1) {
          if (c.pdvs[j].rioPdvKey === d.pdvKey) {
            pdvLabel = c.pdvs[j].nome;
            break;
          }
        }
      }
      return "PDV: " + pdvLabel + " (" + d.clienteNome + ")";
    }
    return "";
  }

  function renderCreateOpcoesHtml(d) {
    if (d.modo === "livre") return "";
    var html = "";
    if (d.opcoesErr) {
      html += '<p class="sheet-hint sheet-hint-err">' + escapeHtml(d.opcoesErr) + "</p>";
    }
    if (d.opcoesLoading) {
      html += '<p class="sheet-hint">Carregando catálogo…</p>';
    }
    if (!d.opcoesLoading && d.opcoes.length > 0) {
      html += '<div class="create-opcoes-list" id="create-opcoes-list">';
      d.opcoes.forEach(function (c) {
        if (d.modo === "cliente") {
          html +=
            '<button type="button" class="create-opcao-item' +
            (d.clienteKey === c.key ? " selected" : "") +
            '" data-pick-cliente="' +
            escapeHtml(c.key) +
            '">' +
            escapeHtml(c.nome) +
            '<span class="muted">' +
            (c.pdvs ? c.pdvs.length : 0) +
            " PDV(s)</span></button>";
        } else {
          html += '<div class="create-opcao-group"><p class="create-opcao-group-title">' + escapeHtml(c.nome) + "</p>";
          (c.pdvs || []).forEach(function (p) {
            html +=
              '<button type="button" class="create-opcao-item create-opcao-pdv' +
              (d.pdvKey === p.rioPdvKey ? " selected" : "") +
              '" data-pick-pdv="' +
              escapeHtml(c.key) +
              '" data-pdv-key="' +
              escapeHtml(p.rioPdvKey) +
              '">' +
              escapeHtml(p.nome) +
              "</button>";
          });
          html += "</div>";
        }
      });
      html += "</div>";
    }
    if (!d.opcoesLoading && d.busca.trim() && d.opcoes.length === 0) {
      html += '<p class="sheet-hint">Nenhum resultado. Use «Assunto livre».</p>';
    }
    var resumo = createDraftResumoVinculo(d);
    if (resumo) {
      html += '<p class="sheet-vinculo-resumo">' + escapeHtml(resumo) + "</p>";
    }
    return html;
  }

  function renderNewTicketSheet() {
    var d = state.createDraft;
    if (!d) return;
    var setoresHtml = SETORES.map(function (s) {
      var on = d.setores.indexOf(s.id) >= 0;
      return (
        '<button type="button" class="setor-chip' +
        (on ? " on" : "") +
        '" data-create-setor="' +
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
          '<input type="checkbox" data-create-resp="' +
          escapeHtml(p.email) +
          '"' +
          (checked ? " checked" : "") +
          " />" +
          avatarHtml(p.email, p.displayName) +
          '<span class="person-name">' +
          escapeHtml(p.displayName) +
          "</span></label>"
        );
      })
      .join("");

    var vinculoBlock =
      d.modo !== "livre" ?
        '<label><span>Buscar ' +
        (d.modo === "cliente" ? "cliente" : "cliente ou PDV") +
        '</span><input type="search" id="create-busca" value="' +
        escapeHtml(d.busca) +
        '" placeholder="Digite para filtrar…" autocomplete="off" /></label>' +
        '<div id="create-opcoes-wrap">' +
        renderCreateOpcoesHtml(d) +
        "</div>"
      : "";

    var templateBlock =
      '<div class="sheet-block">' +
      '<p class="sheet-block-title">Modelo</p>' +
      '<div class="modo-row">' +
      [
        ["padrao", "Padrão"],
        ["cliente_novo", "Cliente novo"],
        ["vinhetas", "Vinhetas"],
      ]
        .map(function (pair) {
          return (
            '<button type="button" class="modo-chip' +
            (d.template === pair[0] ? " on" : "") +
            '" data-create-template="' +
            pair[0] +
            '">' +
            pair[1] +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      "</div>";

    var seqEditorHtml = "";
    if (d.template === "cliente_novo" || d.template === "vinhetas") {
      var seqEd = window.ChamadosSequenciaEditor;
      if (seqEd) {
        seqEditorHtml =
          '<div class="sheet-block" id="seq-editor-wrap">' +
          seqEd.renderEditorHtml(d, state.participants, escapeHtml) +
          "</div>";
      }
    }

    var showPadraoSetores = d.template === "padrao";

    var inner =
      "<h2>Novo chamado</h2>" +
      '<form id="form-ticket-create">' +
      templateBlock +
      seqEditorHtml +
      '<div class="sheet-block">' +
      '<p class="sheet-block-title">Vínculo (opcional)</p>' +
      '<p class="sheet-hint">Assunto livre ou cliente/PDV da Produção.</p>' +
      '<div class="modo-row">' +
      ['livre', 'Assunto livre', 'cliente', 'Cliente', 'pdv', 'PDV']
        .reduce(function (acc, _v, i, arr) {
          if (i % 2 !== 0) return acc;
          var id = arr[i];
          var label = arr[i + 1];
          acc +=
            '<button type="button" class="modo-chip' +
            (d.modo === id ? " on" : "") +
            '" data-create-modo="' +
            id +
            '">' +
            label +
            "</button>";
          return acc;
        }, "") +
      "</div>" +
      vinculoBlock +
      "</div>" +
      '<label><span>Assunto</span><input name="titulo" id="create-titulo" required maxlength="200" value="' +
      escapeHtml(d.titulo) +
      '" placeholder="' +
      (d.modo === "livre" ? "Ex.: Prospect — reunião" : "Preenchido ao escolher cliente/PDV") +
      '" /></label>' +
      '<label><span>Descrição</span><textarea name="descricao" id="create-descricao" placeholder="Detalhes do que precisa ser feito…">' +
      escapeHtml(d.descricao) +
      "</textarea></label>" +
      '<label><span>Prioridade</span><select name="prioridade" id="create-prioridade">' +
      '<option value="media"' +
      (d.prioridade === "media" ? " selected" : "") +
      ">Média</option>" +
      '<option value="baixa"' +
      (d.prioridade === "baixa" ? " selected" : "") +
      ">Baixa</option>" +
      '<option value="alta"' +
      (d.prioridade === "alta" ? " selected" : "") +
      ">Alta</option>" +
      '<option value="urgente"' +
      (d.prioridade === "urgente" ? " selected" : "") +
      ">Urgente</option></select></label>" +
      (showPadraoSetores ?
        '<div class="agenda-comp-row">' +
        '<label><span>Visível a partir de</span><input type="date" id="create-prazo-visivel" required value="' +
        escapeHtml(d.prazoVisivelDesde || defaultPrazoInputDate()) +
        '" /></label>' +
        '<label><span>Data limite (agenda)</span><input type="date" id="create-prazo-limite" required value="' +
        escapeHtml(d.prazoLimite || defaultPrazoInputDate()) +
        '" /></label></div>' +
        '<p class="sheet-hint">Antes da data inicial o chamado não aparece na agenda nem nas notificações.</p>'
      : "") +
      (showPadraoSetores ?
        '<div class="sheet-block"><p class="sheet-block-title">Setores</p><div class="setor-row">' +
        setoresHtml +
        "</div></div>" +
        (peopleHtml ?
          '<div class="sheet-block sheet-people"><p class="sheet-block-title">Pessoas</p>' +
          peopleHtml +
          "</div>"
        : '<p class="sheet-hint">Carregando lista de pessoas…</p>')
      : "") +
      '<div class="sheet-actions">' +
      '<button type="button" class="btn-secondary" id="cancel-sheet">Cancelar</button>' +
      '<button type="submit" class="btn-primary">Criar chamado</button></div></form>';

    showOverlay(inner);
    bindNewTicketSheetEvents();
  }

  function fetchCreateProducaoOpcoes() {
    var d = state.createDraft;
    if (!d || d.modo === "livre") return;
    if (d.opcoesTimer) clearTimeout(d.opcoesTimer);
    var q = d.busca.trim();
    d.opcoesTimer = setTimeout(function () {
      if (!state.createDraft) return;
      d.opcoesLoading = true;
      d.opcoesErr = "";
      var wrap = document.getElementById("create-opcoes-wrap");
      if (wrap) wrap.innerHTML = renderCreateOpcoesHtml(d);
      var url =
        q.length > 0 ?
          "/api/chamados/producao-opcoes?q=" + encodeURIComponent(q)
        : "/api/chamados/producao-opcoes";
      auth
        .apiFetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error("load");
          return r.json();
        })
        .then(function (data) {
          if (!state.createDraft) return;
          d.opcoes = (data && data.clientes) || [];
          d.opcoesLoading = false;
          var w = document.getElementById("create-opcoes-wrap");
          if (w) w.innerHTML = renderCreateOpcoesHtml(d);
          bindCreateOpcoesPickers();
        })
        .catch(function () {
          if (!state.createDraft) return;
          d.opcoesLoading = false;
          d.opcoesErr = "Não foi possível carregar o catálogo.";
          d.opcoes = [];
          var w2 = document.getElementById("create-opcoes-wrap");
          if (w2) w2.innerHTML = renderCreateOpcoesHtml(d);
        });
    }, q ? 250 : 0);
  }

  function bindCreateOpcoesPickers() {
    var d = state.createDraft;
    if (!d) return;
    overlayEl.querySelectorAll("[data-pick-cliente]").forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute("data-pick-cliente");
        var c = null;
        for (var i = 0; i < d.opcoes.length; i += 1) {
          if (d.opcoes[i].key === key) {
            c = d.opcoes[i];
            break;
          }
        }
        if (!c) return;
        d.modo = "cliente";
        d.clienteKey = c.key;
        d.clienteNome = c.nome;
        d.rioLinhaId = c.rioLinhaId;
        d.rioPdvKey = null;
        d.pdvKey = null;
        d.busca = c.nome;
        if (!d.tituloManual) d.titulo = tituloChamadoParaCliente(c.nome);
        syncCreateTituloInput();
        fetchCreateProducaoOpcoes();
      };
    });
    overlayEl.querySelectorAll("[data-pick-pdv]").forEach(function (btn) {
      btn.onclick = function () {
        var cKey = btn.getAttribute("data-pick-pdv");
        var pdvKey = btn.getAttribute("data-pdv-key");
        var c = null;
        var p = null;
        for (var i = 0; i < d.opcoes.length; i += 1) {
          if (d.opcoes[i].key === cKey) {
            c = d.opcoes[i];
            for (var j = 0; j < (c.pdvs || []).length; j += 1) {
              if (c.pdvs[j].rioPdvKey === pdvKey) {
                p = c.pdvs[j];
                break;
              }
            }
            break;
          }
        }
        if (!c || !p) return;
        d.modo = "pdv";
        d.clienteKey = c.key;
        d.clienteNome = c.nome;
        d.rioLinhaId = c.rioLinhaId;
        d.rioPdvKey = p.rioPdvKey;
        d.pdvKey = p.rioPdvKey;
        d.busca = p.nome + " — " + c.nome;
        if (!d.tituloManual) d.titulo = tituloChamadoParaPdv(p.nome, c.nome);
        syncCreateTituloInput();
        fetchCreateProducaoOpcoes();
      };
    });
  }

  function syncCreateTituloInput() {
    var d = state.createDraft;
    var el = document.getElementById("create-titulo");
    if (d && el) el.value = d.titulo;
  }

  function bindNewTicketSheetEvents() {
    var d = state.createDraft;
    if (!d) return;
    document.getElementById("cancel-sheet").onclick = closeOverlay;

    overlayEl.querySelectorAll("[data-create-template]").forEach(function (btn) {
      btn.onclick = function () {
        d.template = btn.getAttribute("data-create-template");
        if (d.template === "vinhetas") d.prazoModo = "dois_dias_uteis";
        else if (d.template === "cliente_novo") d.prazoModo = "um_dia_util";
        refreshSequenciaStepsForDraft(d)
          .then(function () {
            renderNewTicketSheet();
          })
          .catch(function () {
            renderNewTicketSheet();
          });
      };
    });

    var seqWrap = document.getElementById("seq-editor-wrap");
    if (seqWrap && window.ChamadosSequenciaEditor) {
      window.ChamadosSequenciaEditor.bindEditor(seqWrap, d, {
        auth: auth,
        rerenderSheet: renderNewTicketSheet,
        loadTemplateSteps: function (template, prazoModo, dataInstalacao) {
          return loadTemplateStepsForDraft(d, {
            template: template,
            prazoModo: prazoModo,
            dataInstalacao: dataInstalacao,
            merge: true,
          });
        },
      });
    }

    overlayEl.querySelectorAll("[data-create-modo]").forEach(function (btn) {
      btn.onclick = function () {
        var modo = btn.getAttribute("data-create-modo");
        d.modo = modo;
        d.rioLinhaId = null;
        d.rioPdvKey = null;
        d.clienteNome = "";
        d.clienteKey = null;
        d.pdvKey = null;
        d.busca = "";
        d.opcoes = [];
        d.tituloManual = false;
        if (modo === "livre") d.titulo = "";
        renderNewTicketSheet();
        if (modo !== "livre") fetchCreateProducaoOpcoes();
      };
    });

    overlayEl.querySelectorAll("[data-create-setor]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-create-setor");
        var idx = d.setores.indexOf(id);
        if (idx >= 0) d.setores.splice(idx, 1);
        else d.setores.push(id);
        btn.classList.toggle("on", d.setores.indexOf(id) >= 0);
      };
    });

    overlayEl.querySelectorAll("[data-create-resp]").forEach(function (inp) {
      inp.onchange = function () {
        var email = inp.getAttribute("data-create-resp");
        var idx = d.responsaveis.indexOf(email);
        if (inp.checked && idx < 0) d.responsaveis.push(email);
        if (!inp.checked && idx >= 0) d.responsaveis.splice(idx, 1);
      };
    });

    var buscaEl = document.getElementById("create-busca");
    if (buscaEl) {
      buscaEl.oninput = function () {
        d.busca = buscaEl.value;
        fetchCreateProducaoOpcoes();
      };
    }

    var tituloEl = document.getElementById("create-titulo");
    if (tituloEl) {
      tituloEl.oninput = function () {
        d.tituloManual = true;
        d.titulo = tituloEl.value;
      };
    }

    var descEl = document.getElementById("create-descricao");
    if (descEl) {
      descEl.oninput = function () {
        d.descricao = descEl.value;
      };
    }

    var priEl = document.getElementById("create-prioridade");
    if (priEl) {
      priEl.onchange = function () {
        d.prioridade = priEl.value;
      };
    }

    var prazoLimiteEl = document.getElementById("create-prazo-limite");
    if (prazoLimiteEl) {
      prazoLimiteEl.onchange = function () {
        d.prazoLimite = prazoLimiteEl.value || "";
      };
    }
    var prazoVisivelEl = document.getElementById("create-prazo-visivel");
    if (prazoVisivelEl) {
      prazoVisivelEl.onchange = function () {
        d.prazoVisivelDesde = prazoVisivelEl.value || "";
      };
    }

    bindCreateOpcoesPickers();

    document.getElementById("form-ticket-create").onsubmit = function (e) {
      e.preventDefault();
      d.titulo = (document.getElementById("create-titulo").value || "").trim();
      d.descricao = (document.getElementById("create-descricao").value || "").trim();
      d.prioridade = document.getElementById("create-prioridade").value;

      if (d.modo === "cliente" && !d.clienteKey) {
        alert("Selecione um cliente ou use «Assunto livre».");
        return;
      }
      if (d.modo === "pdv" && !d.pdvKey) {
        alert("Selecione um PDV ou use «Assunto livre».");
        return;
      }
      if (!d.titulo) {
        alert("Informe o assunto do chamado.");
        return;
      }
      if ((d.template || "padrao") === "padrao") {
        var pl = prazoLimiteEl ? prazoLimiteEl.value : d.prazoLimite;
        if (!pl) {
          alert("Informe a data limite (agenda).");
          return;
        }
        d.prazoLimite = pl;
      }

      var body = {
        titulo: d.titulo,
        descricao: d.descricao,
        prioridade: d.prioridade,
        setores: d.setores.slice(),
        responsaveis: d.responsaveis.slice(),
        rioLinhaId: d.modo !== "livre" ? d.rioLinhaId : null,
        rioPdvKey: d.modo === "pdv" ? d.rioPdvKey : null,
        clienteNome: d.modo !== "livre" ? d.clienteNome : "",
        template: d.template || "padrao",
      };
      if ((d.template || "padrao") === "padrao") {
        body.prazoEntrega = d.prazoLimite;
        var pv = prazoVisivelEl ? prazoVisivelEl.value : d.prazoVisivelDesde;
        body.agendaVisivelDesde = pv || defaultPrazoInputDate();
      }
      if (d.template === "cliente_novo" || d.template === "vinhetas") {
        var enabled = (d.sequenciaSteps || []).filter(function (s) {
          return s.enabled !== false;
        });
        if (!enabled.length) {
          alert("Modelo sem etapas válidas.");
          return;
        }
        body.sequenciaSteps = d.sequenciaSteps;
        body.setores = [];
        body.responsaveis = [];
      }

      auth
        .apiFetch("/api/chamados", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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

  function loadParticipants() {
    return auth.apiFetch("/api/chamados/participants").then(function (r) {
      if (!r.ok) return { participants: [] };
      return r.json();
    }).then(function (d) {
      state.participants = d.participants || [];
    });
  }

  function loadChamados() {
    return auth
      .apiFetch("/api/chamados?scope=mine-all")
      .then(function (r) {
        if (!r.ok) throw new Error("chamados");
        return r.json();
      })
      .then(function (d) {
        state.chamados = d.chamados || [];
        state.resumo = d.resumo || null;
      })
      .catch(function () {
        state.chamados = state.chamados || [];
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

  function loadInbox() {
    return auth
      .apiFetch("/api/chamados/conversas/inbox")
      .then(function (r) {
        if (!r.ok) throw new Error("inbox");
        return r.json();
      })
      .then(function (d) {
        state.inbox = d.inbox || null;
      })
      .catch(function () {
        state.inbox = null;
      });
  }

  function loadAgendaSequencias() {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    var next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var q =
      "from=" +
      encodeURIComponent(first.toISOString()) +
      "&to=" +
      encodeURIComponent(next.toISOString()) +
      "&includeFinalizados=0";
    return auth
      .apiFetch("/api/chamados/agenda?" + q)
      .then(function (r) {
        if (!r.ok) throw new Error("agenda");
        return r.json();
      })
      .then(function (d) {
        state.agendaSequencias = d.sequencias || [];
      })
      .catch(function () {
        state.agendaSequencias = [];
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

  function ticketUnreadTotal() {
    if (!state.chamados || !state.chamados.length) {
      return (state.resumo && state.resumo.chamadosNaoLidos) || 0;
    }
    return state.chamados.reduce(function (acc, c) {
      return acc + (Number(c.unreadCount) || 0);
    }, 0);
  }

  function updateNavBadges() {
    var r = state.resumo || {};
    navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
      var tab = btn.getAttribute("data-tab");
      var old = btn.querySelector(".nav-badge");
      if (old) old.parentNode.removeChild(old);
      var n = 0;
      if (tab === "tickets") n = ticketUnreadTotal();
      if (tab === "chat") {
        var cu = chatUnreadTotals();
        if (cu.mention > 0) {
          var bm = document.createElement("span");
          bm.className = "nav-badge nav-badge-mention";
          bm.textContent = cu.mention > 99 ? "99+" : cu.mention === 1 ? "@" : String(cu.mention);
          bm.title = "Menções @";
          btn.appendChild(bm);
        }
        if (cu.general > 0) {
          var bg = document.createElement("span");
          bg.className = "nav-badge nav-badge-general";
          bg.textContent = cu.general > 99 ? "99+" : String(cu.general);
          bg.title = "Mensagens não lidas";
          btn.appendChild(bg);
        }
        return;
      }
      if (n > 0) {
        var badge = document.createElement("span");
        badge.className = "nav-badge nav-badge-unread";
        badge.textContent = n > 99 ? "99+" : String(n);
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
      var ta = a.prazoEntrega ? new Date(a.prazoEntrega).getTime() : Number.MAX_SAFE_INTEGER;
      var tb = b.prazoEntrega ? new Date(b.prazoEntrega).getTime() : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      var ua = Number(a.unreadCount) || 0;
      var ub = Number(b.unreadCount) || 0;
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
    state.detailPeopleOpen = false;
    state.detailDraft = {
      titulo: c.titulo,
      descricao: c.descricao || "",
      prioridade: c.prioridade,
      setores: (c.setores || []).slice(),
      responsaveis: (c.responsaveis || []).slice(),
      prazoAgenda: prazoToInputDate(c.prazoEntrega),
      prazoVisivelDesde: prazoToInputDate(c.agendaVisivelDesde) || defaultPrazoInputDate(),
    };
    var unread = c.unreadCount || 0;
    markTicketRead(c.id, unread).then(function () {
      return loadTicketThread(c.id);
    }).then(function () {
      renderTicketDetail();
    });
  }

  function renderTickets() {
    setScreenHeader("Chamados", true);
    navEl.hidden = false;
    mainEl.className = "main ibiz-main";
    var list = filteredTickets();
    var html =
      '<div class="ibiz-screen">' +
      ibizScreenHead("Chamados") +
      chamadosNoticeHtml() +
      renderSequenciasRailHtml() +
      '<section class="ibiz-assuntos">' +
      '<div class="ibiz-section-head">' +
      '<span class="ibiz-kicker">Assuntos</span>' +
      '<span class="ibiz-kicker-meta">' +
      list.length +
      (state.ticketFilter === "fechados" ? " resolvido(s)" : " em aberto") +
      "</span></div>" +
      '<div class="ibiz-filter-row">' +
      ["abertos", "todos", "fechados"].map(function (f) {
        var labels = { abertos: "Em aberto", todos: "Todos", fechados: "Resolvidos" };
        return (
          '<button type="button" class="ibiz-filter-pill' +
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
      list.forEach(function (c) {
        var st = STATUS[c.status] || STATUS.aberto;
        var pr = PRI[c.prioridade] || PRI.media;
        var prazoLabel = fmtPrazoEntrega(c.prazoEntrega);
        html +=
          '<button type="button" class="ibiz-ticket-card" data-ticket="' +
          escapeHtml(c.id) +
          '">' +
          '<h3 class="ibiz-ticket-title">' +
          escapeHtml(c.titulo) +
          "</h3>" +
          '<div class="ticket-meta">' +
          '<span class="badge ' +
          st.cls +
          '">' +
          st.label.toUpperCase() +
          "</span>" +
          '<span class="badge ' +
          pr.cls +
          '">' +
          pr.label.toUpperCase() +
          "</span>" +
          '<span class="muted">' +
          fmtWhen(c.updatedAt) +
          "</span></div>" +
          (prazoLabel ?
            '<div class="ticket-seq-prazo">Limite: ' + escapeHtml(prazoLabel) + "</div>"
          : '<div class="ticket-seq-prazo" style="font-weight:800;color:var(--agenda-hoje-text)">Sem data limite · toque para definir</div>') +
          "</button>";
      });
    }
    html += "</section></div>";
    mainEl.innerHTML = html;

    bindIbizRefresh();
    mainEl.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        state.ticketFilter = btn.getAttribute("data-filter");
        renderTickets();
      };
    });
    mainEl.querySelectorAll("[data-seq-grupo]").forEach(function (btn) {
      btn.onclick = function () {
        var gid = btn.getAttribute("data-seq-grupo");
        var seq = (state.agendaSequencias || []).find(function (s) {
          return s.grupoId === gid;
        });
        var id = seq ? activeChamadoForSequencia(seq) : null;
        if (id) openChamadoById(id);
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
            prazoAgenda: prazoToInputDate(merged.prazoEntrega),
          };
        }
        return loadChamados();
      });
  }

  function setorLabels(ids) {
    return ids
      .map(function (id) {
        var s = SETORES.find(function (x) {
          return x.id === id;
        });
        return s ? s.label : id;
      })
      .join(", ");
  }

  function involvedPeopleEmails(c, d) {
    var seen = {};
    var out = [];
    function add(email) {
      var key = String(email || "").toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(email);
    }
    add(c.criadoPorEmail);
    (d.responsaveis || []).forEach(add);
    return out;
  }

  function avatarStackHtml(emails, max) {
    var list = emails.slice(0, max || 5);
    var extra = emails.length - list.length;
    var html = '<span class="avatar-stack">';
    list.forEach(function (email) {
      var p = participantByEmail(email);
      html += avatarHtml(email, (p && p.displayName) || email, "avatar-xs");
    });
    if (extra > 0) {
      html += '<span class="avatar avatar-xs" style="background:#64748b">+' + extra + "</span>";
    }
    html += "</span>";
    return html;
  }

  function renderTicketDetail() {
    var c = state.selectedTicket;
    var d = state.detailDraft;
    if (!c || !d) return renderTickets();
    navEl.hidden = true;
    setScreenHeader("Detalhe");
    var st = STATUS[c.status] || STATUS.aberto;
    var pr = PRI[c.prioridade] || PRI.media;
    var involved = involvedPeopleEmails(c, d);

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
          '<span class="person-name">' +
          escapeHtml(p.displayName) +
          "</span></label>"
        );
      })
      .join("");

    var initialHtml = messageRowHtml({
      email: c.criadoPorEmail,
      name: c.criadoPorNome || c.criadoPorEmail,
      corpo: c.descricao || "—",
      when: fmtWhen(c.createdAt),
      mine: c.criadoPorEmail === (state.user && state.user.email),
    });

    var commentsHtml =
      state.ticketComments.length === 0 ?
        '<p class="muted">Nenhuma resposta ainda.</p>'
      : '<div class="thread-list">' +
        state.ticketComments
          .map(function (cm) {
            return messageRowHtml({
              email: cm.autorEmail,
              name: cm.autorNome || cm.autorEmail,
              corpo: cm.corpo,
              when: fmtWhen(cm.createdAt),
              mine: cm.autorEmail === (state.user && state.user.email),
            });
          })
          .join("") +
        "</div>";

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
      '<div class="ticket-head-meta">' +
      '<span class="badge ' +
      pr.cls +
      '">' +
      pr.label +
      "</span>" +
      '<span class="badge ' +
      st.cls +
      '">' +
      st.label +
      "</span></div>" +
      '<h2 class="ticket-head-title">' +
      escapeHtml(c.titulo) +
      (c.sequenciaGrupoId ? ' <span class="ticket-seq-tag">(SEQUÊNCIA)</span>' : "") +
      "</h2>" +
      (c.sequenciaRotulo ? '<p class="ticket-seq-rotulo">' + escapeHtml(c.sequenciaRotulo) + "</p>" : "") +
      (c.sequenciaGrupoId && c.prazoEntrega ?
        '<p class="muted" style="margin:0 0 0.5rem">Prazo da etapa: ' + escapeHtml(fmtPrazoEntrega(c.prazoEntrega)) + "</p>"
      : "") +
      (!c.sequenciaGrupoId ?
        '<div class="agenda-comp-row">' +
        '<label class="detail-agenda-date"><span>Visível a partir de</span>' +
        '<input type="date" id="d-prazo-visivel" required value="' +
        escapeHtml(d.prazoVisivelDesde || defaultPrazoInputDate()) +
        '" /></label>' +
        '<label class="detail-agenda-date"><span>Data limite (agenda)</span>' +
        '<input type="date" id="d-prazo-agenda" required value="' +
        escapeHtml(d.prazoAgenda || defaultPrazoInputDate()) +
        '" /></label></div>' +
        '<p class="sheet-hint" style="margin:0 0 0.5rem">Antes da data inicial não aparece na agenda/notificações.</p>'
      : "") +
      '<div class="detail-block detail-block-tight">' +
      '<div class="thread-list">' +
      initialHtml +
      "</div></div>" +
      '<div class="detail-block">' +
      '<button type="button" class="people-summary" id="toggle-people-panel">' +
      '<span class="setor-summary">' +
      escapeHtml(setorLabels(d.setores) || "Setores") +
      "</span>" +
      avatarStackHtml(involved, 4) +
      '<span class="people-summary-label">Pessoas</span>' +
      '<span class="people-summary-chevron">' +
      (state.detailPeopleOpen ? "▾" : "▸") +
      "</span></button>" +
      '<div id="people-panel" class="people-panel"' +
      (state.detailPeopleOpen ? "" : " hidden") +
      ">" +
      "<p><span>Setores</span></p>" +
      setoresHtml +
      '<p style="margin:0.5rem 0 0;font-size:0.75rem;font-weight:700;color:var(--muted)">Responsáveis</p>' +
      '<div class="people-list">' +
      peopleHtml +
      "</div></div></div>" +
      '<div class="detail-block"><h3>Respostas</h3>' +
      commentsHtml +
      '<form id="form-reply" class="reply-form">' +
      '<textarea id="reply-body" placeholder="Responder…" rows="2"></textarea>' +
      '<button type="submit" class="btn-primary" style="margin-top:0.4rem;width:100%">Enviar resposta</button></form></div>' +
      '<div class="detail-block"><h3>Anexos</h3>' +
      anexosHtml +
      '<label style="display:block;margin-top:0.75rem"><span>Adicionar arquivo</span>' +
      '<input type="file" id="d-anexo" /></label></div>' +
      '<div class="sheet-actions" style="margin-top:1rem;flex-wrap:wrap;gap:0.5rem">' +
      (c.status !== "em_andamento" ?
        '<button type="button" class="btn-secondary" data-quick-status="em_andamento"' +
        (state.ticketFlowBusy ? " disabled" : "") +
        ">" +
        (state.ticketFlowBusy ? "Processando…" : "Em andamento") +
        "</button>"
      : "") +
      (function () {
        var isSeq = Boolean(c.sequenciaGrupoId);
        var sequenciaAtiva =
          isSeq &&
          c.status !== "fechado" &&
          c.status !== "aguardando" &&
          (c.sequenciaPasso || 0) < (c.sequenciaTotal || 0);
        var sequenciaUltima = isSeq && c.sequenciaPasso === c.sequenciaTotal && c.status !== "fechado";
        if (sequenciaAtiva || sequenciaUltima) {
          return (
            '<button type="button" class="btn-primary" id="btn-seq-proximo"' +
            (state.ticketFlowBusy ? " disabled" : "") +
            ">" +
            (state.ticketFlowBusy ? "Processando…" : "Encerrar / próximo processo") +
            "</button>"
          );
        }
        if (c.status !== "fechado") {
          return (
            '<button type="button" class="btn-primary" data-quick-status="fechado"' +
            (state.ticketFlowBusy ? " disabled" : "") +
            ">" +
            (state.ticketFlowBusy ? "Processando…" : "Resolver") +
            "</button>"
          );
        }
        return "";
      })() +
      (c.status === "fechado" ?
        '<button type="button" class="btn-secondary" data-quick-status="aberto">Reabrir</button>'
      : "") +
      '<button type="button" class="btn-primary" id="btn-save-ticket">Salvar setores e pessoas</button></div>';

    mainEl.innerHTML = html;

    document.getElementById("back-tickets").onclick = function () {
      closeTicketDetailScreen();
    };

    var togglePeople = document.getElementById("toggle-people-panel");
    if (togglePeople) {
      togglePeople.onclick = function () {
        state.detailPeopleOpen = !state.detailPeopleOpen;
        renderTicketDetail();
      };
    }

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

    var prazoInp = document.getElementById("d-prazo-agenda");
    if (prazoInp) {
      prazoInp.onchange = function () {
        d.prazoAgenda = prazoInp.value || "";
      };
    }
    var prazoVisInp = document.getElementById("d-prazo-visivel");
    if (prazoVisInp) {
      prazoVisInp.onchange = function () {
        d.prazoVisivelDesde = prazoVisInp.value || "";
      };
    }

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
        if (state.ticketFlowBusy) return;
        state.ticketFlowBusy = true;
        renderTicketDetail();
        patchTicket({ status: btn.getAttribute("data-quick-status"), notificar: true })
          .then(function () {
            return loadChamados();
          })
          .then(function () {
            closeTicketDetailScreen();
          })
          .catch(function () {
            alert("Não foi possível atualizar o status.");
            state.ticketFlowBusy = false;
            renderTicketDetail();
          });
      };
    });

    var btnSeq = document.getElementById("btn-seq-proximo");
    if (btnSeq) {
      btnSeq.onclick = function () {
        if (state.ticketFlowBusy) return;
        state.ticketFlowBusy = true;
        renderTicketDetail();
        auth
          .apiFetch("/api/chamados/" + encodeURIComponent(c.id) + "/sequencia/proximo", { method: "POST" })
          .then(function (r) {
            if (!r.ok) throw new Error("seq");
            return r.json();
          })
          .then(function (data) {
            var fechado = data.fechado;
            if (fechado) {
              state.chamados = state.chamados.map(function (x) {
                return x.id === fechado.id ? fechado : x;
              });
            }
            return loadChamados();
          })
          .then(function () {
            closeTicketDetailScreen();
          })
          .catch(function () {
            alert("Não foi possível avançar a sequência.");
            state.ticketFlowBusy = false;
            renderTicketDetail();
          });
      };
    }

    document.getElementById("btn-save-ticket").onclick = function () {
      var btn = document.getElementById("btn-save-ticket");
      btn.disabled = true;
      if (!c.sequenciaGrupoId && !(d.prazoAgenda || "").trim()) {
        alert("Informe a data limite (agenda).");
        btn.disabled = false;
        return;
      }
      patchTicket({
        setores: d.setores,
        responsaveis: d.responsaveis,
        prazoEntrega: d.prazoAgenda ? d.prazoAgenda : null,
        agendaVisivelDesde: d.prazoVisivelDesde ? d.prazoVisivelDesde : null,
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
    setScreenHeader("Chat", true);
    navEl.hidden = false;
    state.selectedAssunto = null;
    state.messages = [];
    setUrl();
    mainEl.className = "main ibiz-main";

    var recent = recentConversas();
    var clientes = clientesInboxFiltered();
    var canais = sortedAssuntosForChat().filter(function (a) {
      return a.tipo === "canal" || a.tipo === "prospect";
    });

    var html =
      '<div class="ibiz-screen">' +
      ibizScreenHead("Chat") +
      '<label class="ibiz-search">' +
      SVG_SEARCH +
      '<input type="search" id="chat-search" placeholder="Buscar cliente ou assunto" aria-label="Buscar cliente ou assunto" value="' +
      escapeHtml(state.chatSearch) +
      '" /></label>';

    if (recent.length) {
      html +=
        '<section><div class="ibiz-section-head">' +
        '<span class="ibiz-kicker">Conversas recentes</span>' +
        '<span class="ibiz-kicker-meta">' +
        recent.length +
        " com mensagens</span></div>";
      recent.forEach(function (a) {
        var unread = (Number(a.unreadMentionCount) || 0) + (Number(a.unreadGeneralCount) || 0);
        var title = a.tipo === "cliente" ? a.titulo.split(" · ")[0] : a.display || a.slug;
        html +=
          '<button type="button" class="ibiz-recent-btn" data-assunto="' +
          escapeHtml(a.id) +
          '">' +
          '<span class="ibiz-avatar" style="background:' +
          clienteAvatarColor(a.clienteKey || a.slug) +
          ";color:#fff\">" +
          escapeHtml(clienteInitials(title)) +
          "</span>" +
          '<span class="ibiz-recent-body">' +
          '<span class="ibiz-recent-title-row">' +
          '<span class="ibiz-recent-title">' +
          escapeHtml(title) +
          "</span>" +
          '<span class="ibiz-tag-pill">' +
          escapeHtml(assuntoTipoTag(a)) +
          "</span></span>" +
          '<span class="ibiz-recent-preview">' +
          (a.lastMessagePreview ? corpoWithMentionsHtml(a.lastMessagePreview.slice(0, 140)) : "Sem mensagens") +
          "</span></span>" +
          (unread > 0 ?
            '<span class="ibiz-chat-unread">' + (unread > 99 ? "99+" : String(unread)) + "</span>"
          : "") +
          "</button>";
      });
      html += "</section>";
    }

    html +=
      '<section><div class="ibiz-section-head">' +
      '<span class="ibiz-kicker">Clientes</span>' +
      '<span class="ibiz-kicker-meta">' +
      clientes.length +
      " cliente" +
      (clientes.length === 1 ? "" : "s") +
      "</span></div>";

    if (clientes.length === 0 && !canais.length) {
      html += '<p class="empty" style="padding:0 1rem">Nenhum cliente ou canal ainda.</p>';
    }

    clientes.forEach(function (cl) {
      var bg = clienteAvatarColor(cl.clienteKey);
      var canaisComId = (cl.canais || []).filter(function (ch) {
        return ch.assuntoId || ch.assuntoSlug;
      });
      var count = canaisComId.length || (cl.canais || []).length;
      html +=
        '<div class="ibiz-client-card">' +
        '<div class="ibiz-client-head">' +
        '<span class="ibiz-avatar ibiz-avatar-sm" style="background:' +
        bg +
        ';color:#08243d">' +
        escapeHtml(clienteInitials(cl.nome)) +
        "</span>" +
        '<span class="ibiz-client-name">' +
        escapeHtml(cl.nome) +
        "</span>" +
        '<span class="ibiz-client-meta">' +
        count +
        " assunto" +
        (count === 1 ? "" : "s") +
        '</span></div><div class="ibiz-channel-row">';
      (cl.canais || []).forEach(function (ch) {
        var unread = (Number(ch.unreadMention) || 0) + (Number(ch.unreadGeneral) || 0);
        html +=
          '<button type="button" class="ibiz-channel-chip" data-cliente-key="' +
          escapeHtml(cl.clienteKey) +
          '" data-cliente-papel="' +
          escapeHtml(ch.papel) +
          '"' +
          (ch.assuntoId ? ' data-assunto="' + escapeHtml(ch.assuntoId) + '"' : "") +
          "><span class=\"ibiz-hash\">#</span> " +
          escapeHtml(papelCanalLabel(ch.papel)) +
          (unread > 0 ? '<span class="ibiz-channel-dot" aria-label="Não lidas"></span>' : "") +
          "</button>";
      });
      html += "</div></div>";
    });

    canais.forEach(function (a) {
      html +=
        '<div class="ibiz-client-card">' +
        '<div class="ibiz-client-head">' +
        '<span class="ibiz-avatar ibiz-avatar-sm" style="background:var(--agenda-lilac);color:var(--agenda-lilac-fg)">#</span>' +
        '<span class="ibiz-client-name">' +
        escapeHtml(a.display || a.slug) +
        "</span></div>" +
        '<div class="ibiz-channel-row">' +
        '<button type="button" class="ibiz-channel-chip" data-assunto="' +
        escapeHtml(a.id) +
        '"><span class="ibiz-hash">#</span> Abrir</button></div></div>';
    });

    html += "</section></div>";
    mainEl.innerHTML = html;

    bindIbizRefresh();
    var searchEl = document.getElementById("chat-search");
    if (searchEl) {
      searchEl.oninput = function () {
        state.chatSearch = searchEl.value;
        renderChatList();
      };
    }

    mainEl.querySelectorAll("[data-assunto]").forEach(function (btn) {
      btn.onclick = function () {
        openAssuntoById(btn.getAttribute("data-assunto"));
      };
    });
    mainEl.querySelectorAll("[data-cliente-key]").forEach(function (btn) {
      btn.onclick = function () {
        var aid = btn.getAttribute("data-assunto");
        if (aid) {
          openAssuntoById(aid);
          return;
        }
        openClienteCanal(btn.getAttribute("data-cliente-key"), btn.getAttribute("data-cliente-papel"));
      };
    });

    updateNavBadges();
    ensureFab("channel");
  }

  function renderChatThread() {
    var a = state.selectedAssunto;
    if (!a) return renderChatList();
    navEl.hidden = true;
    setScreenHeader("Chat");
    setUrl();

    var channelLabel = String(a.display || a.slug || "").replace(/^#+/, "");
    mainEl.innerHTML =
      '<button type="button" class="back-link" id="back-chat">← Canais</button>' +
      '<p class="channel-heading">#' +
      escapeHtml(channelLabel) +
      "</p>" +
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
        return messageRowHtml({
          email: m.autorEmail,
          name: m.autorNome || m.autorEmail,
          corpo: m.corpo,
          when: fmtWhen(m.createdAt),
          mine: m.autorEmail === me,
        });
      })
      .join("");
    thread.scrollTop = thread.scrollHeight;
  }

  function ensureFab(kind, customClick) {
    removeFab();
    if (kind === "none") return;
    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.className = "fab ibiz-fab";
    fabEl.setAttribute("aria-label", "Novo");
    fabEl.textContent = "+";
    fabEl.onclick = function () {
      if (typeof customClick === "function") customClick();
      else if (kind === "ticket") openNewTicketSheet();
      else openNewChannelSheet();
    };
    document.body.appendChild(fabEl);
  }

  function removeFab() {
    if (fabEl && fabEl.parentNode) fabEl.parentNode.removeChild(fabEl);
    fabEl = null;
  }

  function openNewTicketSheet() {
    function start() {
      state.createDraft = emptyCreateDraft();
      renderNewTicketSheet();
    }
    if (!state.participants.length) {
      loadParticipants().then(start);
    } else {
      start();
    }
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
    } else if (state.tab === "agenda") {
      if (agendaApi) agendaApi.render();
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

  function refreshCurrentView() {
    if (state.ptrRefreshing || (overlayEl && !overlayEl.hidden)) {
      return Promise.resolve();
    }
    state.ptrRefreshing = true;
    var tasks = [loadParticipants(), loadChamados(), loadAssuntos(), loadInbox(), loadAgendaSequencias()];
    return Promise.all(tasks)
      .then(function () {
        if (state.selectedTicket) {
          var id = state.selectedTicket.id;
          var fresh = state.chamados.find(function (c) {
            return c.id === id;
          });
          if (fresh) {
            state.selectedTicket = fresh;
            state.detailDraft = {
              titulo: fresh.titulo,
              descricao: fresh.descricao || "",
              prioridade: fresh.prioridade,
              setores: (fresh.setores || []).slice(),
              responsaveis: (fresh.responsaveis || []).slice(),
              prazoAgenda: prazoToInputDate(fresh.prazoEntrega),
            };
          }
          return loadTicketThread(id).then(function () {
            renderTicketDetail();
          });
        }
        if (state.selectedAssunto) {
          var sid = state.selectedAssunto.id;
          var ass = state.assuntos.find(function (a) {
            return a.id === sid;
          });
          if (ass) state.selectedAssunto = ass;
          return loadMessages(state.selectedAssunto.id).then(function () {
            renderChatThread();
            renderMessages();
          });
        }
        if (state.tab === "agenda" && agendaApi) {
          return agendaApi.refresh().then(function () {
            agendaApi.renderOnly();
          });
        }
        render();
      })
      .catch(function () {
        alert("Não foi possível atualizar agora.");
      })
      .finally(function () {
        state.ptrRefreshing = false;
      });
  }

  function initPullToRefresh() {
    var ptrEl = document.getElementById("ptr");
    var ptrLabel = document.getElementById("ptr-label");
    if (!ptrEl || !mainEl) return;

    var startY = 0;
    var pulling = false;
    var THRESHOLD = 56;

    function scrollRoot() {
      return mainEl;
    }

    function atTop() {
      return scrollRoot().scrollTop <= 0;
    }

    function resetPtr() {
      pulling = false;
      startY = 0;
      ptrEl.classList.remove("ptr-open", "ptr-loading");
      ptrEl.hidden = true;
      mainEl.classList.remove("ptr-shift");
      mainEl.style.transform = "";
      if (ptrLabel) ptrLabel.textContent = "Puxe para atualizar";
    }

    function setPull(px) {
      var pull = Math.max(0, Math.min(px, 80));
      if (pull <= 2) {
        resetPtr();
        return;
      }
      ptrEl.hidden = false;
      ptrEl.classList.add("ptr-open");
      mainEl.classList.add("ptr-shift");
      mainEl.style.transform = "translateY(" + Math.min(pull, 48) + "px)";
      if (ptrLabel) {
        ptrLabel.textContent = pull >= THRESHOLD ? "Solte para atualizar" : "Puxe para atualizar";
      }
    }

    mainEl.addEventListener(
      "touchstart",
      function (e) {
        if (state.ptrRefreshing || (overlayEl && !overlayEl.hidden)) return;
        if (!atTop() || !e.touches[0]) return;
        startY = e.touches[0].clientY;
        pulling = true;
      },
      { passive: true },
    );

    mainEl.addEventListener(
      "touchmove",
      function (e) {
        if (!pulling || state.ptrRefreshing || !e.touches[0]) return;
        var dy = e.touches[0].clientY - startY;
        if (dy <= 0) {
          resetPtr();
          return;
        }
        if (!atTop()) {
          resetPtr();
          return;
        }
        e.preventDefault();
        setPull(dy * 0.45);
      },
      { passive: false },
    );

    mainEl.addEventListener(
      "touchend",
      function () {
        if (!pulling || state.ptrRefreshing) {
          resetPtr();
          return;
        }
        var open = ptrEl.classList.contains("ptr-open");
        var label = ptrLabel ? ptrLabel.textContent : "";
        resetPtr();
        if (open && label === "Solte para atualizar") {
          ptrEl.hidden = false;
          ptrEl.classList.add("ptr-open", "ptr-loading");
          if (ptrLabel) ptrLabel.textContent = "Atualizando…";
          refreshCurrentView().finally(function () {
            resetPtr();
          });
        }
      },
      { passive: true },
    );

    mainEl.addEventListener(
      "touchcancel",
      function () {
        resetPtr();
      },
      { passive: true },
    );
  }

  navEl.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.onclick = function () {
      state.tab = btn.getAttribute("data-tab");
      state.selectedTicket = null;
      state.selectedAssunto = null;
      state.detailDraft = null;
      state.detailPeopleOpen = false;
      render();
    };
  });

  var loginScreenEl = document.getElementById("login-screen");
  var appShellEl = document.getElementById("app");
  var appBooted = false;

  function setAuthGate(mode) {
    document.body.setAttribute("data-auth-gate", mode);
    if (mode === "app") {
      if (loginScreenEl) loginScreenEl.hidden = true;
      if (appShellEl) appShellEl.hidden = false;
    } else if (mode === "login") {
      if (loginScreenEl) loginScreenEl.hidden = false;
      if (appShellEl) appShellEl.hidden = true;
    } else {
      if (loginScreenEl) loginScreenEl.hidden = true;
      if (appShellEl) appShellEl.hidden = true;
    }
  }

  function showLoginScreen() {
    setAuthGate("login");
    if (window.ChamadosLoginPanel) {
      window.ChamadosLoginPanel.mount({
        auth: auth,
        onSuccess: function (user) {
          void bootApp(user);
        },
      });
    }
    if (auth.getToken()) {
      auth
        .requireSessionForApp()
        .then(function (user) {
          void bootApp(user);
        })
        .catch(function () {
          /* mantém formulário — ex.: sem rede */
        });
    }
  }

  function showAppShell() {
    setAuthGate("app");
  }

  document.getElementById("btn-logout").onclick = function () {
    auth.setToken(null);
    appBooted = false;
    state.user = null;
    showLoginScreen();
  };

  closeOverlay();

  if (window.ChamadosAgendaModule) {
    agendaApi = window.ChamadosAgendaModule({
      auth: auth,
      mainEl: mainEl,
      navEl: navEl,
      escapeHtml: escapeHtml,
      setScreenHeader: setScreenHeader,
      showOverlay: showOverlay,
      closeOverlay: closeOverlay,
      getUser: function () {
        return state.user;
      },
      getParticipants: function () {
        return state.participants;
      },
      avatarHtml: avatarHtml,
      openChamadoById: openChamadoById,
      ensureFab: ensureFab,
    });
  }

  var pushApi = window.ChamadosAppPush;
  var pushBannerEl = document.getElementById("push-banner");
  var pushBusy = false;

  function updatePushBanner() {
    if (!pushBannerEl || !pushApi) return;
    var perm = pushApi.permissionState();
    if (perm === "granted") {
      pushBannerEl.hidden = true;
      pushBannerEl.innerHTML = "";
      return;
    }
    if (perm === "unsupported") {
      pushBannerEl.hidden = true;
      return;
    }
    var ios = pushApi.isIos();
    var standalone = pushApi.isStandalone();
    var html = "";
    if (ios && !standalone) {
      html +=
        '<p class="push-banner-title">Instale o IbiZap no iPhone</p>' +
        "<ol>" +
        "<li>Abra este site no <strong>Safari</strong>.</li>" +
        "<li>Toque <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.</li>" +
        "<li>Abra pelo ícone <strong>IbiZap</strong> (sem barra do Safari).</li>" +
        "</ol>" +
        '<p class="push-banner-msg">Só assim o iPhone lista o IbiZap em Ajustes → Notificações.</p>';
    } else {
      html += '<p class="push-banner-title">Notificações no celular</p>';
      if (perm === "denied") {
        html +=
          '<p class="push-banner-msg">Permissão negada. Em <strong>Ajustes → Notificações → IbiZap</strong>, ative alertas e sons.</p>';
      } else {
        html +=
          '<p class="push-banner-msg">Receba menções no chat e novidades nos chamados (mesmo com o app fechado).</p>' +
          '<div class="push-banner-actions">' +
          '<button type="button" class="btn-push" id="btn-push-enable">Ativar notificações</button>' +
          "</div>" +
          '<p class="push-banner-msg" id="push-banner-feedback" hidden></p>';
      }
    }
    pushBannerEl.innerHTML = html;
    pushBannerEl.hidden = false;
    var btn = document.getElementById("btn-push-enable");
    if (btn) {
      btn.disabled = pushBusy;
      btn.onclick = function () {
        if (pushBusy) return;
        pushBusy = true;
        btn.disabled = true;
        var fb = document.getElementById("push-banner-feedback");
        if (fb) {
          fb.hidden = false;
          fb.textContent = "Ativando…";
        }
        pushApi.registerWebPush(auth).then(function (res) {
          pushBusy = false;
          if (res.ok) {
            updatePushBanner();
            return;
          }
          if (fb) {
            fb.hidden = false;
            fb.textContent = res.message || "Não foi possível ativar.";
          }
          btn.disabled = false;
          if (res.reason === "install_required") updatePushBanner();
        });
      };
    }
  }

  var deepConversa = parseParams();

  function registerSwOnce() {
    if (registerSwOnce.done) return;
    registerSwOnce.done = true;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    }
  }

  function bootApp(user) {
    showAppShell();
    state.user = user;
    if (!appBooted) {
      appBooted = true;
      if (pushApi) {
        void pushApi.syncIfGranted(auth).then(function () {
          updatePushBanner();
        });
      }
      registerSwOnce();
    }
    return Promise.all([loadParticipants(), loadChamados(), loadAssuntos(), loadInbox(), loadAgendaSequencias()])
      .catch(function () {
        state.chamados = state.chamados || [];
        state.assuntos = state.assuntos || [];
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
        updatePushBanner();
        render();
        initPullToRefresh();
      });
  }

  setAuthGate("checking");

  auth
    .requireSessionForApp()
    .then(function (user) {
      return bootApp(user);
    })
    .catch(function (e) {
      var st = e && e.status;
      if (st === 401 || st === 403) {
        auth.setToken(null);
      }
      state.loading = false;
      if (st === 401 || st === 403 || !auth.getToken()) {
        showLoginScreen();
        return;
      }
      var errEl = document.getElementById("login-err");
      showLoginScreen();
      if (errEl) {
        errEl.textContent =
          "Sem conexão com o portal. Verifique a internet e toque em Entrar para tentar de novo.";
        errEl.hidden = false;
      }
    });
})();
