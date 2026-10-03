(function (global) {
  var WEEKDAY_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];
  var WEEKDAY_SHORT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

  var SVG_REFRESH =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg>';
  var SVG_CHEV_L =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
  var SVG_CHEV_R =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';

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

  function parseYmdLocal(ymd) {
    var p = ymd.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
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
        title: a.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }),
      };
    }
    if (mode === "semana") {
      var dow = a.getDay();
      var mon = addDays(a, dow === 0 ? -6 : 1 - dow);
      var sun = addDays(mon, 7);
      return {
        from: mon.toISOString(),
        to: sun.toISOString(),
        title: formatWeekNavTitle(mon, addDays(sun, -1)),
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

  function formatWeekNavTitle(from, to) {
    function part(d) {
      return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(/\./g, "");
    }
    return part(from) + " – " + part(to);
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

  var AGENDA_SHOW_DONE_KEY = "chamados_agenda_show_finalizados";

  function readShowFinalizados() {
    try {
      var v = localStorage.getItem(AGENDA_SHOW_DONE_KEY);
      if (v === "0") return false;
    } catch (e) {}
    return true;
  }

  function writeShowFinalizados(on) {
    try {
      localStorage.setItem(AGENDA_SHOW_DONE_KEY, on ? "1" : "0");
    } catch (e) {}
  }

  function seqAccent(index) {
    return index % 2 === 0 ? "teal" : "yellow";
  }

  function seqKindLabel(seq) {
    if (seq.templateKind) {
      return String(seq.templateKind).replace(/_/g, " ").replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
    }
    return "Sequência";
  }

  function createModule(deps) {
    var state = {
      mode: "semana",
      anchor: startOfDay(new Date()),
      items: [],
      semPrazo: [],
      compromissos: [],
      sequencias: [],
      showFinalizados: readShowFinalizados(),
      loading: false,
      pickDayKey: null,
    };

    function loadAgenda() {
      var range = rangeForMode(state.mode, state.anchor);
      state.loading = true;
      var q =
        "from=" +
        encodeURIComponent(range.from) +
        "&to=" +
        encodeURIComponent(range.to) +
        "&includeFinalizados=" +
        (state.showFinalizados ? "1" : "0");
      return deps.auth
        .apiFetch("/api/chamados/agenda?" + q)
        .then(function (r) {
          if (!r.ok) throw new Error("agenda");
          return r.json();
        })
        .then(function (data) {
          state.items = Array.isArray(data.items) ? data.items : [];
          state.semPrazo = Array.isArray(data.semPrazo) ? data.semPrazo : [];
          state.sequencias = Array.isArray(data.sequencias) ? data.sequencias : [];
          state.compromissos = Array.isArray(data.compromissos) ? data.compromissos : [];
        })
        .catch(function () {
          state.items = [];
          state.semPrazo = [];
          state.sequencias = [];
          state.compromissos = [];
        })
        .finally(function () {
          state.loading = false;
        });
    }

    function entryTone(entry) {
      if (entry.kind === "compromisso") {
        return entry.data.papel === "criador" ? "sky" : "yellow";
      }
      var it = entry.data;
      var finalizado = Boolean(it.agendaFinalizado || (it.sequenciaGrupoId && it.status === "fechado"));
      if (finalizado) return "dim";
      if (it.sequenciaGrupoId) return "teal";
      return "lilac";
    }

    function entryTitle(entry) {
      if (entry.kind === "chamado") return entry.data.titulo || "Chamado";
      return entry.data.titulo || "Compromisso";
    }

    function entrySub(entry) {
      if (entry.kind === "chamado") {
        var it = entry.data;
        if (it.sequenciaGrupoId && it.sequenciaPasso && it.sequenciaTotal) {
          var tail = it.sequenciaRotulo || "Sequência";
          return it.sequenciaPasso + "/" + it.sequenciaTotal + " · " + tail;
        }
        if (it.sequenciaRotulo) return it.sequenciaRotulo;
        if (it.sequenciaGrupoId) return "Sequência";
        return "Chamado";
      }
      var c = entry.data;
      return c.papel === "criador" ? "Meu compromisso" : "Convite · " + (c.criadoPorNome || "");
    }

    function truncate(s, n) {
      s = String(s || "");
      if (s.length <= n) return s;
      return s.slice(0, n - 1) + "…";
    }

    function sequenciaMinTime(seq) {
      var t = Infinity;
      (seq.passos || []).forEach(function (p) {
        if (!p.prazoEntrega) return;
        var x = new Date(p.prazoEntrega).getTime();
        if (x < t) t = x;
      });
      return t === Infinity ? 0 : t;
    }

    function sortSequenciasForLanes(sequencias) {
      return (sequencias || []).slice().sort(function (a, b) {
        var d = sequenciaMinTime(a) - sequenciaMinTime(b);
        if (d !== 0) return d;
        return String(a.grupoId).localeCompare(String(b.grupoId));
      });
    }

    function entryStableId(entry) {
      if (entry.kind === "chamado") return entry.data.id;
      return "c-" + entry.data.id;
    }

    function isSequenciaEntry(entry) {
      return entry.kind === "chamado" && entry.data.sequenciaGrupoId;
    }

    function buildAgendaLanes(sequencias, entriesByDay, dayKeys) {
      var lanes = [];
      sortSequenciasForLanes(sequencias).forEach(function (seq) {
        lanes.push({ kind: "sequencia", grupoId: seq.grupoId });
      });
      var orphans = [];
      var seen = {};
      dayKeys.forEach(function (dk, di) {
        var list = entriesByDay[dk] || [];
        list.forEach(function (entry) {
          if (isSequenciaEntry(entry)) return;
          var id = entryStableId(entry);
          if (seen[id]) return;
          seen[id] = true;
          orphans.push({ id: id, firstDayIdx: di, sortAt: entry.sortAt });
        });
      });
      orphans.sort(function (a, b) {
        if (a.firstDayIdx !== b.firstDayIdx) return a.firstDayIdx - b.firstDayIdx;
        return a.sortAt.localeCompare(b.sortAt);
      });
      orphans.forEach(function (o) {
        lanes.push({ kind: "other", id: o.id });
      });
      return lanes;
    }

    function findEntryInLane(lane, dayKey, entriesByDay) {
      var list = entriesByDay[dayKey] || [];
      if (lane.kind === "sequencia") {
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (e.kind === "chamado" && e.data.sequenciaGrupoId === lane.grupoId) return e;
        }
        return null;
      }
      for (var j = 0; j < list.length; j++) {
        var e2 = list[j];
        if (entryStableId(e2) === lane.id) return e2;
      }
      return null;
    }

    function sequenciaSpanMask(lane, dayKeys, entriesByDay) {
      if (lane.kind !== "sequencia") return null;
      var mask = dayKeys.map(function (dk) {
        return Boolean(findEntryInLane(lane, dk, entriesByDay));
      });
      var first = -1;
      var last = -1;
      mask.forEach(function (v, i) {
        if (v) {
          if (first < 0) first = i;
          last = i;
        }
      });
      if (first < 0) return mask;
      var span = mask.slice();
      for (var k = first; k <= last; k++) span[k] = true;
      return span;
    }

    function barInnerHtml(entry, variant) {
      var tone = entryTone(entry);
      if (tone === "dim") tone = "lilac";
      var title = deps.escapeHtml(truncate(entryTitle(entry), variant === "week" ? 14 : 18));
      var sub = deps.escapeHtml(truncate(entrySub(entry), variant === "week" ? 22 : 16));
      var seqBar = entry.kind === "chamado" && entry.data.sequenciaGrupoId;
      if (variant === "month") {
        return (
          '<div class="agenda-bar agenda-bar--' +
          tone +
          " agenda-bar--month" +
          (seqBar ? " agenda-bar--seq" : "") +
          '">' +
          title +
          "</div>"
        );
      }
      return (
        '<div class="agenda-bar agenda-bar--' +
        tone +
        " agenda-bar--week" +
        (seqBar ? " agenda-bar--seq" : "") +
        '">' +
        '<div class="agenda-bar-t">' +
        title +
        "</div>" +
        '<div class="agenda-bar-s">' +
        sub +
        "</div></div>"
      );
    }

    function barHtml(entry, variant) {
      var inner = barInnerHtml(entry, variant);
      if (entry.kind === "chamado") {
        return (
          '<div class="agenda-bar-hit" role="button" tabindex="0" data-chamado-id="' +
          deps.escapeHtml(entry.data.id) +
          '">' +
          inner +
          "</div>"
        );
      }
      return inner;
    }

    function laneSlotHtml(entry, lane, dayIdx, spanMask, variant) {
      var inSpan = lane.kind === "sequencia" && spanMask && spanMask[dayIdx];
      if (!entry) {
        if (inSpan) {
          return (
            '<div class="agenda-bar-slot agenda-bar-slot--bridge" aria-hidden="true">' +
            '<span class="agenda-seq-line"></span></div>'
          );
        }
        return '<div class="agenda-bar-slot agenda-bar-slot--empty" aria-hidden="true"></div>';
      }
      var bridgeL = Boolean(inSpan && dayIdx > 0 && spanMask[dayIdx - 1]);
      var bridgeR = Boolean(inSpan && dayIdx < spanMask.length - 1 && spanMask[dayIdx + 1]);
      var cls = "agenda-bar-slot";
      if (lane.kind === "sequencia") cls += " agenda-bar-slot--seq";
      if (bridgeL) cls += " is-link-l";
      if (bridgeR) cls += " is-link-r";
      return '<div class="' + cls + '">' + barHtml(entry, variant) + "</div>";
    }

    function dayLanesBarsHtml(dayKey, dayIdx, dayKeys, entriesByDay, lanes, spanByLane, variant, maxLanes) {
      var barsRoot =
        variant === "month" ? "agenda-month-bars agenda-week-bars--lanes" : "agenda-week-bars agenda-week-bars--lanes";
      var html = '<div class="' + barsRoot + '">';
      var slice = maxLanes ? lanes.slice(0, maxLanes) : lanes;
      slice.forEach(function (lane, laneIdx) {
        var entry = findEntryInLane(lane, dayKey, entriesByDay);
        html += laneSlotHtml(entry, lane, dayIdx, spanByLane[laneIdx], variant);
      });
      if (maxLanes && lanes.length > maxLanes) {
        var extra = 0;
        for (var li = maxLanes; li < lanes.length; li++) {
          if (findEntryInLane(lanes[li], dayKey, entriesByDay)) extra++;
        }
        if (extra) {
          html += '<div class="agenda-month-more">+' + extra + "</div>";
        }
      }
      html += "</div>";
      return html;
    }

    function sequenciasStackHtml(dayKey) {
      var list = state.sequencias;
      if (dayKey) {
        list = list.filter(function (seq) {
          return (seq.passos || []).some(function (p) {
            return p.prazoEntrega && prazoDayKey(p.prazoEntrega) === dayKey;
          });
        });
      }
      if (!list.length) return "";

      var dayMode = Boolean(dayKey);
      var kicker = dayMode ? "Sequências do dia" : "Minhas sequências";

      var html =
        '<section class="agenda-seq-stack' +
        (dayMode ? " agenda-seq-stack--day" : "") +
        '">' +
        '<div class="agenda-seq-stack-head">' +
        '<span class="agenda-kicker">' +
        kicker +
        "</span>" +
        '<span class="agenda-seq-count">' +
        list.length +
        " ativa" +
        (list.length === 1 ? "" : "s") +
        "</span></div>" +
        '<div class="agenda-seq-stack-list">';
      list.forEach(function (seq, idx) {
        var accent = seqAccent(idx);
        var passos = seq.passos || [];
        var active = passos.find(function (p) {
          return p.status === "aberto" || p.status === "em_andamento";
        });
        var onDay =
          dayKey ?
            passos.find(function (p) {
              return p.prazoEntrega && prazoDayKey(p.prazoEntrega) === dayKey;
            })
          : null;
        var focus = onDay || active || passos[0];
        var stepLabel = active ? active.passo + "/" + active.total : passos.length ? "—" : "";
        var metaTail =
          dayMode && focus && focus.rotulo ?
            focus.rotulo
          : dayMode && focus ?
            seqKindLabel(seq)
          : seqKindLabel(seq);
        var stepsClass =
          "agenda-seq-card-steps" + (dayMode ? " agenda-seq-card-steps--timeline" : "");
        var cols = Math.max(passos.length, 1);
        html +=
          '<article class="agenda-seq-card agenda-seq-card--compact agenda-seq-card--' +
          accent +
          (dayMode ? " agenda-seq-card--day" : "") +
          '">';
        html += '<div class="agenda-seq-card-hit">';
        html +=
          '<div class="agenda-seq-card-top">' +
          '<div class="agenda-seq-card-name"><span class="agenda-dot agenda-dot--' +
          accent +
          '"></span><span class="agenda-seq-card-title">' +
          deps.escapeHtml(seq.titulo) +
          "</span></div>" +
          '<div class="agenda-seq-card-meta">' +
          deps.escapeHtml(stepLabel) +
          " · " +
          deps.escapeHtml(metaTail) +
          "</div></div>";
        html +=
          '<div class="' +
          stepsClass +
          '" style="' +
          (dayMode ? "" : "grid-template-columns:repeat(" + cols + ",minmax(0,1fr))") +
          '">';
        passos.forEach(function (p) {
          var done = p.status === "fechado";
          var isActive = p.status === "aberto" || p.status === "em_andamento";
          var isOnDay = dayKey && p.prazoEntrega && prazoDayKey(p.prazoEntrega) === dayKey;
          html +=
            '<button type="button" class="agenda-seq-mini' +
            (isActive ? " is-active" : "") +
            (done ? " is-done" : "") +
            (isOnDay ? " is-on-day" : "") +
            '" data-chamado-id="' +
            deps.escapeHtml(p.chamadoId) +
            '">' +
            '<span class="agenda-seq-mini-bar"></span>' +
            '<span class="agenda-seq-mini-date">' +
            deps.escapeHtml(p.prazoLabel || "—") +
            "</span>";
          if (p.rotulo) {
            html +=
              '<span class="agenda-seq-mini-rotulo">' + deps.escapeHtml(p.rotulo) + "</span>";
          }
          html += "</button>";
        });
        html += "</div></div></article>";
      });
      html += "</div></section>";
      return html;
    }

    function scrollSequenciaTimelineIntoView(root) {
      root.querySelectorAll(".agenda-seq-card-steps--timeline").forEach(function (track) {
        var target =
          track.querySelector(".agenda-seq-mini.is-on-day") ||
          track.querySelector(".agenda-seq-mini.is-active");
        if (!target) return;
        try {
          target.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
        } catch (e) {
          target.scrollIntoView(true);
        }
      });
    }

    function semPrazoHtml() {
      if (!state.semPrazo.length) return "";
      var html = '<div class="agenda-sem-prazo-list">';
      state.semPrazo.forEach(function (it, i) {
        html +=
          '<button type="button" class="agenda-sem-prazo-btn" data-chamado-id="' +
          deps.escapeHtml(it.id) +
          '">' +
          '<span class="agenda-sem-prazo-badge">' +
          (i + 1) +
          "</span>" +
          '<span class="agenda-sem-prazo-title">' +
          deps.escapeHtml(it.titulo) +
          "</span>" +
          '<span class="agenda-sem-prazo-cta">Definir data</span></button>';
      });
      html += "</div>";
      return html;
    }

    function dayNumClass(key, pickKey, todayKey, inMonth) {
      if (key === pickKey) return " is-pick";
      if (key === todayKey) return " is-today";
      if (inMonth === false) return " is-dim";
      return "";
    }

    function monthCalendarHtml(entriesByDay, todayKey, pickKey) {
      var cells = monthGridCells(state.anchor);
      var weeks = [];
      for (var w = 0; w < 6; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));

      var html = '<div class="agenda-cal agenda-cal--month"><div class="agenda-cal-weekdays">';
      WEEKDAY_LETTER.forEach(function (wd) {
        html += '<div class="agenda-cal-wd">' + wd + "</div>";
      });
      html += "</div>";

      weeks.forEach(function (week) {
        var weekKeys = week.map(function (c) {
          return c.key;
        });
        var lanes = buildAgendaLanes(state.sequencias, entriesByDay, weekKeys);
        var spanByLane = lanes.map(function (lane) {
          return sequenciaSpanMask(lane, weekKeys, entriesByDay);
        });
        html += '<div class="agenda-cal-week">';
        week.forEach(function (cell, dayIdx) {
          var n = cell.date.getDate();
          var numCls = dayNumClass(cell.key, pickKey, todayKey, cell.inMonth);
          html +=
            '<button type="button" class="agenda-month-cell' +
            (cell.key === pickKey ? " is-pick" : "") +
            '" data-month-day="' +
            cell.key +
            '" aria-label="' +
            deps.escapeHtml(cell.key) +
            '">' +
            '<span class="agenda-month-num' +
            numCls +
            '">' +
            n +
            "</span>";
          html += dayLanesBarsHtml(
            cell.key,
            dayIdx,
            weekKeys,
            entriesByDay,
            lanes,
            spanByLane,
            "month",
            3,
          );
          html += "</button>";
        });
        html += "</div>";
      });
      html += "</div>";
      return html;
    }

    function weekCalendarHtml(entriesByDay, todayKey, pickKey) {
      var days = weekDaysFromAnchor(state.anchor);
      var dayKeys = days.map(function (d) {
        return toIsoLocal(d);
      });
      var lanes = buildAgendaLanes(state.sequencias, entriesByDay, dayKeys);
      var spanByLane = lanes.map(function (lane) {
        return sequenciaSpanMask(lane, dayKeys, entriesByDay);
      });
      var html = '<div class="agenda-cal agenda-cal--week"><div class="agenda-week-cols">';
      days.forEach(function (day, dayIdx) {
        var key = toIsoLocal(day);
        var numCls = dayNumClass(key, pickKey, todayKey, true);
        html +=
          '<button type="button" class="agenda-week-col' +
          (key === pickKey ? " is-pick" : "") +
          '" data-month-day="' +
          key +
          '">' +
          '<span class="agenda-week-wd">' +
          WEEKDAY_LETTER[day.getDay()] +
          "</span>" +
          '<span class="agenda-month-num' +
          numCls +
          '">' +
          day.getDate() +
          "</span>";
        html += dayLanesBarsHtml(
          key,
          dayIdx,
          dayKeys,
          entriesByDay,
          lanes,
          spanByLane,
          "week",
          null,
        );
        html += "</button>";
      });
      html += "</div></div>";
      return html;
    }

    function detailItemHtml(entry) {
      var tone = entryTone(entry);
      if (tone === "dim") tone = "lilac";
      var time = "";
      if (entry.kind === "compromisso" && entry.data.horaLabel) {
        time = entry.data.horaLabel;
      }
      var body =
        '<span class="agenda-dot agenda-dot--' +
        tone +
        '"></span>' +
        '<div class="agenda-detail-body">' +
        '<div class="agenda-detail-title">' +
        deps.escapeHtml(entryTitle(entry)) +
        "</div>" +
        '<div class="agenda-detail-sub">' +
        deps.escapeHtml(entrySub(entry)) +
        "</div></div>" +
        (time ? '<div class="agenda-detail-time">' + deps.escapeHtml(time) + "</div>" : "");
      if (entry.kind === "chamado") {
        return (
          '<button type="button" class="agenda-detail-row agenda-detail-row--' +
          tone +
          '" data-chamado-id="' +
          deps.escapeHtml(entry.data.id) +
          '">' +
          body +
          "</button>"
        );
      }
      var del =
        entry.data.papel === "criador" ?
          '<button type="button" class="agenda-detail-del" data-del-comp="' +
          deps.escapeHtml(entry.data.id) +
          '" aria-label="Excluir">×</button>'
        : "";
      return (
        '<div class="agenda-detail-row agenda-detail-row--' +
        tone +
        '">' +
        del +
        body +
        "</div>"
      );
    }

    function dayDetailSectionHtml(day, entriesByDay) {
      var key = toIsoLocal(day);
      var list = entriesByDay[key] || [];
      var title = day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
      var html =
        '<section class="agenda-day-detail">' +
        '<div class="agenda-day-detail-head">' +
        '<h3 class="agenda-day-detail-title">' +
        deps.escapeHtml(title) +
        "</h3>" +
        '<span class="agenda-day-detail-count">' +
        list.length +
        " item" +
        (list.length === 1 ? "" : "s") +
        "</span></div>";
      if (list.length === 0) {
        html += '<p class="agenda-day-detail-empty">Nada neste dia.</p>';
      } else {
        list.forEach(function (entry) {
          html += detailItemHtml(entry);
        });
      }
      html += "</section>";
      return html;
    }

    function parseTimeMinutes(iso) {
      var d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    }

    function dayTimelineHtml(day, entriesByDay) {
      var key = toIsoLocal(day);
      var list = (entriesByDay[key] || []).filter(function (e) {
        return e.kind === "compromisso" || e.kind === "chamado";
      });
      var chamados = list.filter(function (e) {
        return e.kind === "chamado";
      });
      var comps = list.filter(function (e) {
        return e.kind === "compromisso";
      });

      var html = "";
      if (chamados.length) {
        html += '<section class="agenda-day-chamados"><div class="agenda-kicker">Chamados do dia</div>';
        chamados.forEach(function (entry) {
          html += detailItemHtml(entry);
        });
        html += "</section>";
      }

      html += '<section class="agenda-timeline-wrap"><div class="agenda-kicker">Horários</div>';
      html += '<div class="agenda-timeline">';
      for (var h = 7; h <= 20; h++) {
        html +=
          '<div class="agenda-timeline-hour"><span>' +
          String(h).padStart(2, "0") +
          ":00</span></div>";
      }
      var startMin = 7 * 60;
      comps.forEach(function (entry) {
        var topMin = parseTimeMinutes(entry.data.inicioEm) - startMin;
        if (topMin < 0) topMin = 0;
        var topPx = (topMin / 60) * 56;
        var tone = entryTone(entry);
        html +=
          '<div class="agenda-timeline-event agenda-timeline-event--' +
          tone +
          '" style="top:' +
          topPx +
          'px">' +
          (entry.data.papel === "criador" ?
            '<button type="button" class="agenda-timeline-del" data-del-comp="' +
            deps.escapeHtml(entry.data.id) +
            '" aria-label="Excluir">×</button>'
          : "") +
          '<div class="agenda-timeline-event-t">' +
          deps.escapeHtml(entryTitle(entry)) +
          "</div>" +
          '<div class="agenda-timeline-event-s">' +
          deps.escapeHtml((entry.data.horaLabel || "") + " · " + entrySub(entry)) +
          "</div></div>";
      });
      html += "</div></section>";
      return html;
    }

    function toolbarHtml(range) {
      return (
        '<div class="agenda-v2-toolbar">' +
        '<div class="agenda-mode-switch" role="tablist">' +
        ["dia", "Dia", "semana", "Semana", "mes", "Mês"]
          .reduce(function (acc, _v, i, arr) {
            if (i % 2 !== 0) return acc;
            var id = arr[i];
            var label = arr[i + 1];
            acc +=
              '<button type="button" role="tab" class="agenda-mode-btn' +
              (state.mode === id ? " is-active" : "") +
              '" data-agenda-mode="' +
              id +
              '">' +
              label +
              "</button>";
            return acc;
          }, "") +
        "</div>" +
        '<div class="agenda-nav">' +
        '<div class="agenda-nav-arrows">' +
        '<button type="button" class="agenda-icon-btn" data-agenda-shift="-1" aria-label="Anterior">' +
        SVG_CHEV_L +
        "</button>" +
        '<p class="agenda-nav-title">' +
        deps.escapeHtml(range.title) +
        "</p>" +
        '<button type="button" class="agenda-icon-btn" data-agenda-shift="1" aria-label="Próximo">' +
        SVG_CHEV_R +
        "</button></div>" +
        '<div class="agenda-nav-actions">' +
        '<button type="button" class="agenda-icon-btn agenda-refresh-btn" data-agenda-refresh aria-label="Atualizar">' +
        SVG_REFRESH +
        "</button>" +
        '<button type="button" class="agenda-hoje-btn" data-agenda-today>Hoje</button></div></div>' +
        '<label class="agenda-toggle-done">' +
        '<input type="checkbox" id="agenda-show-done"' +
        (state.showFinalizados ? " checked" : "") +
        " /> Mostrar finalizados</label></div>"
      );
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
      var defaultDate = toIsoLocal(state.anchor);
      var people = deps.getParticipants() || [];
      var viewer = (deps.getUser() && deps.getUser().email) || "";
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

    function resolvePickDay(todayKey) {
      if (state.pickDayKey) return state.pickDayKey;
      if (state.mode === "dia") return toIsoLocal(startOfDay(state.anchor));
      return todayKey;
    }

    function render() {
      deps.setScreenHeader("Agenda");
      deps.navEl.hidden = false;
      var range = rangeForMode(state.mode, state.anchor);
      var todayKey = toIsoLocal(startOfDay(new Date()));
      var pickKey = resolvePickDay(todayKey);
      var entriesByDay = groupEntriesByDay(state.items, state.compromissos);

      var html = '<div class="agenda-v2">';
      html += toolbarHtml(range);
      if (state.loading) html += '<p class="loading agenda-v2-loading">Carregando agenda…</p>';
      html += '<div class="agenda-v2-scroll">';

      var seqDayKey = state.mode === "dia" ? toIsoLocal(startOfDay(state.anchor)) : null;
      html += sequenciasStackHtml(seqDayKey);
      html += semPrazoHtml();

      if (state.mode === "mes") {
        html += monthCalendarHtml(entriesByDay, todayKey, pickKey);
        html += dayDetailSectionHtml(parseYmdLocal(pickKey), entriesByDay);
      } else if (state.mode === "semana") {
        html += weekCalendarHtml(entriesByDay, todayKey, pickKey);
        html += dayDetailSectionHtml(parseYmdLocal(pickKey), entriesByDay);
      } else {
        html += dayTimelineHtml(startOfDay(state.anchor), entriesByDay);
      }

      var empty =
        !state.loading &&
        state.items.length === 0 &&
        state.semPrazo.length === 0 &&
        state.compromissos.length === 0 &&
        state.sequencias.length === 0;
      if (empty) html += '<p class="empty agenda-v2-empty">Nada na agenda neste período.</p>';

      html += "</div></div>";
      deps.mainEl.innerHTML = html;

      deps.mainEl.querySelectorAll("[data-agenda-mode]").forEach(function (btn) {
        btn.onclick = function () {
          state.mode = btn.getAttribute("data-agenda-mode");
          state.pickDayKey = null;
          loadAgenda().then(render);
        };
      });
      deps.mainEl.querySelectorAll("[data-agenda-shift]").forEach(function (btn) {
        btn.onclick = function () {
          var n = Number(btn.getAttribute("data-agenda-shift"));
          if (state.mode === "mes") {
            var a = state.anchor;
            state.anchor = new Date(a.getFullYear(), a.getMonth() + n, 1);
          } else if (state.mode === "semana") state.anchor = addDays(state.anchor, n * 7);
          else state.anchor = addDays(state.anchor, n);
          state.pickDayKey = null;
          loadAgenda().then(render);
        };
      });
      var todayBtn = deps.mainEl.querySelector("[data-agenda-today]");
      if (todayBtn) {
        todayBtn.onclick = function () {
          state.anchor = startOfDay(new Date());
          state.pickDayKey = toIsoLocal(state.anchor);
          loadAgenda().then(render);
        };
      }
      var refreshBtn = deps.mainEl.querySelector("[data-agenda-refresh]");
      if (refreshBtn) {
        refreshBtn.onclick = function () {
          loadAgenda().then(render);
        };
      }
      var showDone = deps.mainEl.querySelector("#agenda-show-done");
      if (showDone) {
        showDone.onchange = function () {
          state.showFinalizados = showDone.checked;
          writeShowFinalizados(state.showFinalizados);
          loadAgenda().then(render);
        };
      }
      deps.mainEl.querySelectorAll("[data-month-day]").forEach(function (btn) {
        btn.onclick = function () {
          state.pickDayKey = btn.getAttribute("data-month-day");
          render();
        };
      });

      bindChamadoClicks(deps.mainEl);
      bindDeleteComp(deps.mainEl);
      if (state.mode === "dia") scrollSequenciaTimelineIntoView(deps.mainEl);
      deps.ensureFab("compromisso", openCompromissoSheet);
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
