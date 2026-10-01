(function (global) {
  var WEEKDAY_SHORT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function toIsoLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function prazoDayKey(iso) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  }

  function rangeForMode(mode, anchor) {
    var a = startOfDay(anchor);
    if (mode === "dia") {
      return {
        from: a.toISOString(),
        to: addDays(a, 1).toISOString(),
        title: a.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }),
      };
    }
    if (mode === "semana") {
      var dow = a.getDay();
      var mon = addDays(a, dow === 0 ? -6 : 1 - dow);
      var sun = addDays(mon, 7);
      return {
        from: mon.toISOString(),
        to: sun.toISOString(),
        title: "Semana " + toIsoLocal(mon) + " – " + toIsoLocal(addDays(sun, -1)),
      };
    }
    var first = new Date(a.getFullYear(), a.getMonth(), 1);
    var next = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return {
      from: first.toISOString(),
      to: next.toISOString(),
      title: first.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    };
  }

  function weekDaysFromAnchor(anchor) {
    var a = startOfDay(anchor);
    var dow = a.getDay();
    var mon = addDays(a, dow === 0 ? -6 : 1 - dow);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(mon, i));
    return days;
  }

  function monthGridCells(anchor) {
    var y = anchor.getFullYear();
    var m = anchor.getMonth();
    var first = new Date(y, m, 1);
    var start = addDays(first, -first.getDay());
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var date = addDays(start, i);
      cells.push({ date: date, inMonth: date.getMonth() === m, key: toIsoLocal(date) });
    }
    return cells;
  }

  function groupEntriesByDay(items, compromissos) {
    var map = {};
    function push(key, entry) {
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    }
    (items || []).forEach(function (it) {
      if (!it.prazoEntrega) return;
      var key = prazoDayKey(it.prazoEntrega);
      push(key, { kind: "chamado", sortAt: it.prazoEntrega, data: it });
    });
    (compromissos || []).forEach(function (c) {
      var key = prazoDayKey(c.inicioEm);
      push(key, { kind: "compromisso", sortAt: c.inicioEm, data: c });
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        return a.sortAt.localeCompare(b.sortAt);
      });
    });
    return map;
  }

  function createModule(deps) {
    var state = {
      mode: "semana",
      anchor: startOfDay(new Date()),
      items: [],
      compromissos: [],
      sequencias: [],
      loading: false,
      monthPickDay: null,
    };

    function loadAgenda() {
      var range = rangeForMode(state.mode, state.anchor);
      state.loading = true;
      var q = "from=" + encodeURIComponent(range.from) + "&to=" + encodeURIComponent(range.to);
      return deps.auth
        .apiFetch("/api/chamados/agenda?" + q)
        .then(function (r) {
          if (!r.ok) throw new Error("agenda");
          return r.json();
        })
        .then(function (data) {
          state.items = Array.isArray(data.items) ? data.items : [];
          state.sequencias = Array.isArray(data.sequencias) ? data.sequencias : [];
          state.compromissos = Array.isArray(data.compromissos) ? data.compromissos : [];
        })
        .catch(function () {
          state.items = [];
          state.sequencias = [];
          state.compromissos = [];
        })
        .finally(function () {
          state.loading = false;
        });
    }

    function chipChamadoHtml(it) {
      var seq = Boolean(it.sequenciaGrupoId);
      var finalizado = Boolean(it.agendaFinalizado || (seq && it.status === "fechado"));
      var cls = finalizado ? "agenda-chip agenda-chip-done" : seq ? "agenda-chip agenda-chip-seq" : "agenda-chip agenda-chip-ticket";
      var inner = "";
      if (finalizado) inner += '<span class="agenda-chip-tag">Finalizado</span>';
      if (it.sequenciaRotulo) inner += '<span class="agenda-chip-sub">' + deps.escapeHtml(it.sequenciaRotulo) + "</span>";
      if (seq && it.sequenciaPasso && it.sequenciaTotal) {
        inner += '<span class="agenda-chip-step">' + it.sequenciaPasso + "/" + it.sequenciaTotal + "</span> ";
      }
      inner += '<span class="agenda-chip-title">' + deps.escapeHtml(it.titulo) + "</span>";
      return (
        '<button type="button" class="' +
        cls +
        '" data-chamado-id="' +
        deps.escapeHtml(it.id) +
        '">' +
        inner +
        "</button>"
      );
    }

    function chipCompromissoHtml(c, canDelete) {
      var mine = c.papel === "criador";
      var cls = mine ? "agenda-chip agenda-chip-mine" : "agenda-chip agenda-chip-invite";
      var tag = mine ? "Meu compromisso" : "Convite · " + (c.criadoPorNome || "");
      var html =
        '<div class="' +
        cls +
        '">' +
        (canDelete ?
          '<button type="button" class="agenda-chip-del" data-del-comp="' +
          deps.escapeHtml(c.id) +
          '" aria-label="Excluir">×</button>'
        : "") +
        '<span class="agenda-chip-tag">' +
        deps.escapeHtml(tag) +
        "</span>";
      if (c.horaLabel) html += '<span class="agenda-chip-step">' + deps.escapeHtml(c.horaLabel) + "</span> ";
      html += '<span class="agenda-chip-title">' + deps.escapeHtml(c.titulo) + "</span></div>";
      return html;
    }

    function sequenciasHtml() {
      if (!state.sequencias.length) return "";
      var html = '<div class="agenda-seq-block">';
      state.sequencias.forEach(function (seq) {
        html += '<div class="agenda-seq-card"><p class="agenda-seq-title">' + deps.escapeHtml(seq.titulo);
        html += ' <span class="agenda-seq-badge">SEQUÊNCIA</span></p><div class="agenda-seq-steps">';
        (seq.passos || []).forEach(function (p) {
          var active = p.status === "aberto" || p.status === "em_andamento";
          var done = p.status === "fechado";
          var stepCls = active ? "agenda-seq-step active" : done ? "agenda-seq-step done" : "agenda-seq-step";
          html +=
            '<button type="button" class="' +
            stepCls +
            '" data-chamado-id="' +
            deps.escapeHtml(p.chamadoId) +
            '">' +
            '<div class="agenda-seq-step-n">' +
            p.passo +
            "/" +
            p.total +
            "</div>" +
            '<div class="agenda-seq-step-d">' +
            deps.escapeHtml(p.prazoLabel || "") +
            "</div>" +
            (p.rotulo ? '<div class="agenda-seq-step-l">' + deps.escapeHtml(p.rotulo) + "</div>" : "") +
            "</button>";
        });
        html += "</div></div>";
      });
      html += "</div>";
      return html;
    }

    function daySectionHtml(day, entriesByDay, todayKey) {
      var key = toIsoLocal(day);
      var list = entriesByDay[key] || [];
      var isToday = key === todayKey;
      var html =
        '<section class="agenda-day-section' +
        (isToday ? " agenda-day-today" : "") +
        '"><header class="agenda-day-head">' +
        '<span class="agenda-day-wd">' +
        WEEKDAY_SHORT[day.getDay()] +
        "</span>" +
        '<span class="agenda-day-num' +
        (isToday ? " agenda-day-num-today" : "") +
        '">' +
        day.getDate() +
        "</span>" +
        '<span class="agenda-day-full">' +
        day.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }) +
        "</span></header>";
      if (list.length === 0) {
        html += '<p class="agenda-day-empty muted">Nada neste dia.</p>';
      } else {
        html += '<div class="agenda-day-list">';
        list.forEach(function (entry) {
          if (entry.kind === "chamado") html += chipChamadoHtml(entry.data);
          else html += chipCompromissoHtml(entry.data, entry.data.papel === "criador");
        });
        html += "</div>";
      }
      html += "</section>";
      return html;
    }

    function bindChamadoClicks(root) {
      root.querySelectorAll("[data-chamado-id]").forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute("data-chamado-id");
          if (id && deps.openChamadoById) deps.openChamadoById(id);
        };
      });
    }

    function bindDeleteComp(root) {
      root.querySelectorAll("[data-del-comp]").forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          var id = btn.getAttribute("data-del-comp");
          if (!id || !confirm("Excluir este compromisso?")) return;
          deps.auth
            .apiFetch("/api/chamados/agenda/compromissos/" + encodeURIComponent(id), { method: "DELETE" })
            .then(function (r) {
              if (!r.ok) throw new Error("del");
              return loadAgenda();
            })
            .then(render)
            .catch(function () {
              alert("Não foi possível excluir.");
            });
        };
      });
    }

    function openCompromissoSheet() {
      var viewer = (deps.getUser() && deps.getUser().email) || "";
      var defaultDate = toIsoLocal(state.anchor);
      var people = deps.getParticipants() || [];
      var peopleHtml = people
        .map(function (p) {
          if (p.email.toLowerCase() === viewer.toLowerCase()) return "";
          return (
            '<label class="person-row">' +
            '<input type="checkbox" data-comp-guest="' +
            deps.escapeHtml(p.email) +
            '" />' +
            deps.avatarHtml(p.email, p.displayName) +
            '<span class="person-name">' +
            deps.escapeHtml(p.displayName) +
            "</span></label>"
          );
        })
        .join("");

      deps.showOverlay(
        "<h2>Novo compromisso</h2>" +
          '<p class="sheet-hint">Azul = seu; âmbar = convite para outras pessoas.</p>' +
          '<form id="form-compromisso">' +
          '<label><span>Título</span><input name="titulo" required maxlength="200" /></label>' +
          '<label><span>Descrição (opcional)</span><textarea name="descricao" rows="2"></textarea></label>' +
          '<div class="agenda-comp-row">' +
          '<label><span>Data</span><input type="date" name="data" required value="' +
          deps.escapeHtml(defaultDate) +
          '" /></label>' +
          '<label><span>Hora</span><input type="time" name="hora" required value="09:00" /></label>' +
          "</div>" +
          (peopleHtml ?
            '<div class="sheet-block sheet-people"><p class="sheet-block-title">Convidar</p>' +
            peopleHtml +
            "</div>"
          : "") +
          '<div class="sheet-actions">' +
          '<button type="button" class="btn-secondary" id="cancel-sheet">Cancelar</button>' +
          '<button type="submit" class="btn-primary">Salvar</button></div></form>',
      );

      document.getElementById("cancel-sheet").onclick = deps.closeOverlay;
      document.getElementById("form-compromisso").onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var titulo = String(fd.get("titulo") || "").trim();
        var descricao = String(fd.get("descricao") || "").trim();
        var data = String(fd.get("data") || "");
        var hora = String(fd.get("hora") || "09:00");
        var guests = [];
        document.querySelectorAll("[data-comp-guest]").forEach(function (inp) {
          if (inp.checked) guests.push(inp.getAttribute("data-comp-guest"));
        });
        var inicioEm = data + "T" + hora + ":00-03:00";
        deps.auth
          .apiFetch("/api/chamados/agenda/compromissos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titulo: titulo, descricao: descricao, inicioEm: inicioEm, participantes: guests }),
          })
          .then(function (r) {
            if (!r.ok) throw new Error("create");
            deps.closeOverlay();
            return loadAgenda();
          })
          .then(render)
          .catch(function () {
            alert("Não foi possível salvar o compromisso.");
          });
      };
    }

    function render() {
      deps.setScreenHeader("Agenda");
      deps.navEl.hidden = false;
      var range = rangeForMode(state.mode, state.anchor);
      var todayKey = toIsoLocal(startOfDay(new Date()));
      var entriesByDay = groupEntriesByDay(state.items, state.compromissos);

      var html =
        '<div class="agenda-toolbar">' +
        '<div class="pill-row agenda-modes">' +
        ["dia", "Dia", "semana", "Semana", "mes", "Mês"]
          .reduce(function (acc, _v, i, arr) {
            if (i % 2 !== 0) return acc;
            var id = arr[i];
            var label = arr[i + 1];
            acc +=
              '<button type="button" class="pill' +
              (state.mode === id ? " active" : "") +
              '" data-agenda-mode="' +
              id +
              '">' +
              label +
              "</button>";
            return acc;
          }, "") +
        "</div>" +
        '<div class="agenda-nav-row">' +
        '<button type="button" class="btn-secondary agenda-nav-btn" data-agenda-shift="-1">‹</button>' +
        '<p class="agenda-range-title">' +
        deps.escapeHtml(range.title) +
        "</p>" +
        '<button type="button" class="btn-secondary agenda-nav-btn" data-agenda-shift="1">›</button>' +
        '<button type="button" class="btn-secondary agenda-nav-btn" data-agenda-today>Hoje</button>' +
        "</div></div>";

      if (state.loading) html += '<p class="loading">Carregando agenda…</p>';
      html += sequenciasHtml();

      if (state.mode === "mes") {
        var cells = monthGridCells(state.anchor);
        var pick = state.monthPickDay || todayKey;
        html += '<div class="agenda-month-grid">';
        WEEKDAY_SHORT.forEach(function (wd) {
          html += '<div class="agenda-month-wd">' + wd + "</div>";
        });
        cells.forEach(function (cell) {
          var n = (entriesByDay[cell.key] || []).length;
          var isToday = cell.key === todayKey;
          var sel = cell.key === pick;
          html +=
            '<button type="button" class="agenda-month-cell' +
            (cell.inMonth ? "" : " out") +
            (isToday ? " today" : "") +
            (sel ? " sel" : "") +
            '" data-month-day="' +
            cell.key +
            '">' +
            '<span class="agenda-month-n">' +
            cell.date.getDate() +
            "</span>" +
            (n > 0 ? '<span class="agenda-month-dot">' + (n > 9 ? "9+" : n) + "</span>" : "") +
            "</button>";
        });
        html += "</div>";
        var pickDate = parseYmdLocal(pick);
        html += daySectionHtml(pickDate, entriesByDay, todayKey);
      } else if (state.mode === "dia") {
        html += daySectionHtml(startOfDay(state.anchor), entriesByDay, todayKey);
      } else {
        weekDaysFromAnchor(state.anchor).forEach(function (day) {
          html += daySectionHtml(day, entriesByDay, todayKey);
        });
      }

      var empty =
        !state.loading &&
        state.items.length === 0 &&
        state.compromissos.length === 0 &&
        state.sequencias.length === 0;
      if (empty) html += '<p class="empty">Nada na agenda neste período.</p>';

      deps.mainEl.innerHTML = html;

      deps.mainEl.querySelectorAll("[data-agenda-mode]").forEach(function (btn) {
        btn.onclick = function () {
          state.mode = btn.getAttribute("data-agenda-mode");
          state.monthPickDay = null;
          loadAgenda().then(render);
        };
      });
      deps.mainEl.querySelectorAll("[data-agenda-shift]").forEach(function (btn) {
        btn.onclick = function () {
          var n = Number(btn.getAttribute("data-agenda-shift"));
          if (state.mode === "mes") {
            var a = state.anchor;
            state.anchor = new Date(a.getFullYear(), a.getMonth() + n, 1);
          }
          else if (state.mode === "semana") state.anchor = addDays(state.anchor, n * 7);
          else state.anchor = addDays(state.anchor, n);
          state.monthPickDay = null;
          loadAgenda().then(render);
        };
      });
      var todayBtn = deps.mainEl.querySelector("[data-agenda-today]");
      if (todayBtn) {
        todayBtn.onclick = function () {
          state.anchor = startOfDay(new Date());
          state.monthPickDay = toIsoLocal(state.anchor);
          loadAgenda().then(render);
        };
      }
      deps.mainEl.querySelectorAll("[data-month-day]").forEach(function (btn) {
        btn.onclick = function () {
          state.monthPickDay = btn.getAttribute("data-month-day");
          render();
        };
      });

      bindChamadoClicks(deps.mainEl);
      bindDeleteComp(deps.mainEl);
      deps.ensureFab("compromisso", openCompromissoSheet);
    }

    function parseYmdLocal(ymd) {
      var p = ymd.split("-").map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }

    return {
      render: function () {
        return loadAgenda().then(render);
      },
      refresh: loadAgenda,
      renderOnly: render,
    };
  }

  global.ChamadosAgendaModule = createModule;
})(typeof window !== "undefined" ? window : globalThis);
