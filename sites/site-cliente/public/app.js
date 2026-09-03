(function () {
  var DOW_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  var DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var HOURS = [];
  for (var h = 0; h < 24; h += 1) HOURS.push(h);
  var MINUTES_PER_DAY = 24 * 60;
  var COLOR_CLASS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"];

  var STATUS_META = {
    online: { label: "ONLINE", cls: "badge-online" },
    hoje: { label: "HOJE", cls: "badge-hoje" },
    offline: { label: "OFFLINE", cls: "badge-offline" },
    sem_install: { label: "SEM INSTALL", cls: "badge-sem_install" },
  };

  var root = document.getElementById("root");
  var moodModal = document.getElementById("mood-modal");
  var moodBody = document.getElementById("mood-body");
  var installModal = document.getElementById("install-modal");
  var installBody = document.getElementById("install-body");
  var expandedPdv = null;
  /** PDVs com token regerado nesta sessão do browser (habilita instalação). */
  var regeneradoTokenKeys = {};
  var installModalPdv = null;
  var installModalContext = null;

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDt(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }

  function formatDiasSemana(csv) {
    if (!csv || !String(csv).trim()) return "todos os dias";
    var dias = String(csv)
      .split(",")
      .map(function (x) {
        return parseInt(x.trim(), 10);
      })
      .filter(function (n) {
        return Number.isInteger(n) && n >= 0 && n <= 6;
      });
    if (dias.length >= 7) return "todos os dias";
    return dias
      .map(function (d) {
        return (DOW_FULL[d] || String(d)).slice(0, 3);
      })
      .join(", ");
  }

  function horaToMin(h) {
    var parts = String(h || "0:0").split(":");
    var hh = parseInt(parts[0], 10);
    var mm = parseInt(parts[1], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
    return hh * 60 + mm;
  }

  function intervalosMinutos(horaInicio, horaFim) {
    var ini = horaToMin(horaInicio);
    var fim = horaToMin(horaFim);
    if (fim <= ini) fim += MINUTES_PER_DAY;
    if (fim <= MINUTES_PER_DAY) return [[ini, fim]];
    return [
      [ini, MINUTES_PER_DAY],
      [0, fim - MINUTES_PER_DAY],
    ];
  }

  function segmentosDoDia(blocos) {
    var ranges = [];
    blocos.forEach(function (b) {
      intervalosMinutos(b.horaInicio, b.horaFim).forEach(function (pair) {
        if (pair[1] > pair[0]) ranges.push({ ini: pair[0], fim: pair[1], pasta: b.pastaNome });
      });
    });
    if (!ranges.length) return [];

    var pontos = { 0: true, 1440: true };
    ranges.forEach(function (r) {
      pontos[r.ini] = true;
      pontos[r.fim] = true;
    });
    var ordenados = Object.keys(pontos)
      .map(function (x) {
        return parseInt(x, 10);
      })
      .sort(function (a, b) {
        return a - b;
      });

    var out = [];
    for (var i = 0; i < ordenados.length - 1; i += 1) {
      var ini = ordenados[i];
      var fim = ordenados[i + 1];
      if (fim <= ini) continue;
      var meio = ini + (fim - ini) / 2;
      var activas = [];
      ranges.forEach(function (r) {
        if (meio >= r.ini && meio < r.fim && activas.indexOf(r.pasta) < 0) activas.push(r.pasta);
      });
      activas.sort(function (a, b) {
        return a.localeCompare(b, "pt-BR");
      });
      if (!activas.length) continue;
      out.push({
        topPct: (ini / MINUTES_PER_DAY) * 100,
        heightPct: ((fim - ini) / MINUTES_PER_DAY) * 100,
        pastas: activas,
      });
    }
    return out;
  }

  function uniquePastas(blocos) {
    var seen = {};
    var out = [];
    blocos.forEach(function (b) {
      if (!seen[b.pastaNome]) {
        seen[b.pastaNome] = true;
        out.push(b.pastaNome);
      }
    });
    return out;
  }

  function renderWeekChart(blocos, canExport, clienteNome) {
    if (!blocos || !blocos.length) return "";
    var pastas = uniquePastas(blocos);
    var colorBy = {};
    pastas.forEach(function (p, i) {
      colorBy[p] = COLOR_CLASS[i % COLOR_CLASS.length];
    });

    var legend = pastas
      .map(function (p) {
        return (
          '<span><i class="' +
          esc(colorBy[p]) +
          '"></i> ' +
          esc(p) +
          "</span>"
        );
      })
      .join("");

    var cols = DOW.map(function (_, dia) {
      var segs = segmentosDoDia(
        blocos.filter(function (b) {
          return b.dia === dia;
        }),
      );
      var blocks = "";
      segs.forEach(function (seg) {
        seg.pastas.forEach(function (pastaNome, col) {
          var n = seg.pastas.length;
          var gap = n > 1 ? 0.4 : 0;
          var widthPct = 100 / n - gap;
          var leftPct = col * (100 / n) + gap / 2;
          var showLabel = seg.heightPct >= 2.5;
          blocks +=
            '<div class="week-block ' +
            esc(colorBy[pastaNome]) +
            '" style="top:' +
            seg.topPct +
            "%;height:" +
            Math.max(seg.heightPct, 0.8) +
            "%;left:" +
            leftPct +
            "%;width:" +
            widthPct +
            '%" title="' +
            esc(pastaNome) +
            '">' +
            (showLabel ? "<span>" + esc(pastaNome) + "</span>" : "") +
            "</div>";
        });
      });
      return '<div class="week-col">' + blocks + "</div>";
    }).join("");

    var hourLabels = HOURS.filter(function (h) {
      return h % 4 === 0;
    })
      .map(function (h) {
        return "<span>" + String(h).padStart(2, "0") + ":00</span>";
      })
      .join("");

    var exportBtn = canExport
      ? '<button type="button" class="btn-outline chart-export" data-cliente="' +
        esc(clienteNome) +
        '">Exportar PDF</button>'
      : "";

    return (
      '<div class="chart-block">' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:0.5rem;margin-bottom:0.75rem">' +
      '<h3 class="section-title" style="margin:0">Agenda da semana</h3>' +
      exportBtn +
      "</div>" +
      '<div class="chart-legend">' +
      legend +
      "</div>" +
      '<div class="week-chart print-target" data-print-title="' +
      esc(clienteNome) +
      '">' +
      '<div class="week-grid">' +
      '<div class="week-head"><div></div>' +
      DOW.map(function (d) {
        return "<div>" + d + "</div>";
      }).join("") +
      "</div>" +
      '<div class="week-body">' +
      '<div class="week-hours">' +
      hourLabels +
      "</div>" +
      cols +
      "</div></div></div></div>"
    );
  }

  function renderAgendamentos(agendamentos) {
    if (!agendamentos || !agendamentos.length) return "";
    return agendamentos
      .map(function (a, i) {
        return (
          '<span class="agenda-tag">' +
          '<strong>' +
          esc(a.pastaNome) +
          "</strong>" +
          "<span>" +
          esc(formatDiasSemana(a.diasSemana)) +
          " · " +
          esc(a.horaInicio) +
          "–" +
          esc(a.horaFim) +
          "</span></span>"
        );
      })
      .join("");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function pdvColspan(showEstilo, perm) {
    var n = 9;
    if (perm && perm.gerenciarInstalacaoPlayer) n += 2;
    return n;
  }

  function renderPdvRow(pdv, showEstilo, perm) {
    var meta = STATUS_META[pdv.status] || STATUS_META.offline;
    var cache = pdv.cachePercent != null ? pdv.cachePercent : 0;
    var expanded = expandedPdv === pdv.rioPdvKey;
    var colspan = pdvColspan(showEstilo, perm);
    var expandHtml =
      expanded && pdv.agendamentos && pdv.agendamentos.length
        ? '<tr class="expand-row"><td colspan="' +
          colspan +
          '"><div class="section-title">Playlist</div>' +
          renderAgendamentos(pdv.agendamentos) +
          "</td></tr>"
        : "";

    var tiCols = "";
    if (perm && perm.gerenciarInstalacaoPlayer && pdv.portalPdvId) {
      tiCols =
        '<td class="pdv-actions" data-no-expand="1"><button type="button" class="btn-pdv-action btn-regen" data-regen="' +
        esc(pdv.rioPdvKey) +
        '">Regerar token</button></td>' +
        '<td class="pdv-actions" data-no-expand="1"><button type="button" class="btn-pdv-action btn-install" data-install="' +
        esc(pdv.rioPdvKey) +
        '">Instalar</button></td>';
    }

    return (
      '<tr class="clickable" data-pdv="' +
      esc(pdv.rioPdvKey) +
      '">' +
      "<td><strong>" +
      esc(pdv.nome) +
      "</strong></td>" +
      "<td>" +
      esc(pdv.cnpj || "—") +
      "</td>" +
      '<td><span class="cache-bar"><span style="width:' +
      cache +
      '%"></span></span>' +
      cache +
      "%</td>" +
      '<td><span class="badge ' +
      meta.cls +
      '">' +
      meta.label +
      "</span></td>" +
      "<td>" +
      esc(pdv.programacaoNome || "—") +
      "</td>" +
      "<td>" +
      fmtDt(pdv.firstPingAt) +
      "</td>" +
      "<td>" +
      fmtDt(pdv.lastPingAt) +
      "</td>" +
      "<td>" +
      esc(pdv.playerVersion || "—") +
      "</td>" +
      "<td>" +
      (showEstilo
        ? '<span class="estilo-pill">' + esc(pdv.estiloAgora || "—") + "</span>"
        : "—") +
      "</td>" +
      tiCols +
      "</tr>" +
      expandHtml
    );
  }

  function renderPdvCard(pdv, showEstilo, perm) {
    var meta = STATUS_META[pdv.status] || STATUS_META.offline;
    var cache = pdv.cachePercent != null ? pdv.cachePercent : 0;
    var expanded = expandedPdv === pdv.rioPdvKey;
    var expandHtml =
      expanded && pdv.agendamentos && pdv.agendamentos.length
        ? '<div class="pdv-card-expand"><div class="section-title">Playlist</div>' +
          renderAgendamentos(pdv.agendamentos) +
          "</div>"
        : "";

    var tiActions =
      perm && perm.gerenciarInstalacaoPlayer && pdv.portalPdvId
        ? '<div class="pdv-card-ti" style="display:flex;gap:0.5rem;margin-top:0.65rem;flex-wrap:wrap">' +
          '<button type="button" class="btn-pdv-action btn-regen" data-regen="' +
          esc(pdv.rioPdvKey) +
          '">Regerar token</button>' +
          '<button type="button" class="btn-pdv-action btn-install" data-install="' +
          esc(pdv.rioPdvKey) +
          '">Instalar</button></div>'
        : "";

    return (
      '<div class="pdv-card">' +
      '<button type="button" data-pdv="' +
      esc(pdv.rioPdvKey) +
      '">' +
      '<div class="pdv-card-head">' +
      "<div><strong>" +
      esc(pdv.nome) +
      "</strong>" +
      (pdv.cnpj ? '<div style="font-size:0.7rem;color:rgba(255,255,255,0.5)">' + esc(pdv.cnpj) + "</div>" : "") +
      "</div>" +
      '<span class="badge ' +
      meta.cls +
      '">' +
      meta.label +
      "</span></div>" +
      '<div class="pdv-card-grid">' +
      '<div><span style="color:rgba(255,255,255,0.4)">Cache </span>' +
      cache +
      "%</div>" +
      '<div><span style="color:rgba(255,255,255,0.4)">Versão </span>' +
      esc(pdv.playerVersion || "—") +
      "</div>" +
      (showEstilo
        ? '<div class="full"><span style="color:rgba(255,255,255,0.4)">Estilo agora </span><strong style="color:#f5d0fe">' +
          esc(pdv.estiloAgora || "—") +
          "</strong></div>"
        : "") +
      '<div class="full"><span style="color:rgba(255,255,255,0.4)">Programação </span>' +
      esc(pdv.programacaoNome || "—") +
      "</div>" +
      "<div><span style=\"color:rgba(255,255,255,0.4)\">1ª conexão </span>" +
      fmtDt(pdv.firstPingAt) +
      "</div>" +
      "<div><span style=\"color:rgba(255,255,255,0.4)\">Último ping </span>" +
      fmtDt(pdv.lastPingAt) +
      "</div></div>" +
      '<div class="cache-bar" style="width:100%;margin-top:0.5rem"><span style="width:' +
      cache +
      '%"></span></div>' +
      (pdv.agendamentos && pdv.agendamentos.length
        ? '<div style="margin-top:0.35rem;font-size:0.75rem;color:rgba(34,211,238,0.8)">' +
          (expanded ? "Ocultar playlist" : "Ver playlist e horários") +
          "</div>"
        : "") +
      "</button>" +
      tiActions +
      expandHtml +
      "</div>"
    );
  }

  var VINHETA_TIPO_LABEL = { tts: "TTS", audio: "Áudio", ia: "IA" };

  function renderHorariosList(horarios) {
    return (horarios || [])
      .map(function (h) {
        return (
          "<li><span style=\"color:rgba(255,255,255,0.5)\">" +
          esc(h.diasLabel) +
          "</span> <span class=\"" +
          (h.tocandoSempre ? "c-emerald" : "c-cyan") +
          '">' +
          esc(h.horarioLabel) +
          "</span></li>"
        );
      })
      .join("");
  }

  function renderProgramacaoResumo(prog) {
    var statsHtml =
      '<div class="stats-grid">' +
      '<div class="stat-card"><div class="label">Programação</div><div class="value sm">' +
      esc(prog.nome) +
      "</div></div>" +
      '<div class="stat-card"><div class="label">Total de faixas</div><div class="value c-cyan">' +
      prog.totalFaixas +
      "</div></div>" +
      '<div class="stat-card"><div class="label">Duração total</div><div class="value c-amber">' +
      prog.totalHoras +
      "h</div></div>" +
      '<div class="stat-card"><div class="label">Músicas novas (ATL)</div><div class="value c-emerald">' +
      (prog.percentNovasAtl != null ? prog.percentNovasAtl + "%" : "—") +
      "</div>" +
      (prog.ultimaAtualizacaoRotulo
        ? '<div class="sub">' +
          esc(prog.ultimaAtualizacaoRotulo) +
          " · " +
          fmtDt(prog.ultimaAtualizacao) +
          "</div>"
        : "") +
      "</div></div>";

    var pastasHtml = "";
    if (prog.pastas && prog.pastas.length) {
      pastasHtml =
        '<div class="pastas-block"><div class="section-title">Estilos (pastas)</div>' +
        prog.pastas
          .map(function (p) {
            return (
              '<div class="pasta-item"><div class="nome">' +
              esc(p.nome) +
              (p.selecionavel
                ? ' <span class="badge-sel">Selecionável</span>'
                : "") +
              ' <span class="meta-line">· ' +
              p.faixas +
              " faixas · " +
              p.duracaoMinutos +
              " min</span></div><ul>" +
              renderHorariosList(p.horarios) +
              "</ul></div>"
            );
          })
          .join("") +
        "</div>";
    }

    var vinhetasHtml = "";
    if (prog.vinhetas && prog.vinhetas.length) {
      vinhetasHtml =
        '<div class="pastas-block"><div class="section-title">Vinhetas</div>' +
        prog.vinhetas
          .map(function (v) {
            return (
              '<div class="pasta-item vinheta-item"><div class="nome">' +
              esc(v.nome) +
              ' <span class="meta-line">· ' +
              esc(VINHETA_TIPO_LABEL[v.tipo] || v.tipo) +
              "</span></div><ul>" +
              renderHorariosList(v.horarios) +
              "</ul></div>"
            );
          })
          .join("") +
        "</div>";
    }

    return (
      '<div class="programacao-block">' + statsHtml + pastasHtml + vinhetasHtml + "</div>"
    );
  }

  function renderCliente(cliente, perm) {
    var progsHtml = "";
    if (perm.verResumoProgramacao && cliente.programacoes && cliente.programacoes.length) {
      progsHtml = cliente.programacoes.map(renderProgramacaoResumo).join("");
    }

    var pdvHtml = "";
    if (perm.verStatusPdvs && cliente.pdvs && cliente.pdvs.length) {
      var showEstilo = perm.verEstiloAgora;
      var tiHead =
        perm.gerenciarInstalacaoPlayer
          ? "<th>Regerar token</th><th>Instalar</th>"
          : "";
      pdvHtml =
        '<div class="pdv-cards">' +
        cliente.pdvs
          .map(function (p) {
            return renderPdvCard(p, showEstilo, perm);
          })
          .join("") +
        "</div>" +
        '<div class="pdv-table-wrap"><table class="pdv-table"><thead><tr>' +
        "<th>PDV</th><th>CNPJ</th><th>Cache</th><th>Status</th><th>Programação</th><th>1ª conexão</th><th>Último ping</th><th>Versão</th><th>Estilo agora</th>" +
        tiHead +
        "</tr></thead><tbody>" +
        cliente.pdvs
          .map(function (p) {
            return renderPdvRow(p, showEstilo, perm);
          })
          .join("") +
        '</tbody></table><p class="hint">Clique na linha para ver a playlist e horários.</p></div>';
    }

    var chartHtml =
      perm.verGraficoSemana && cliente.semanaBlocos && cliente.semanaBlocos.length
        ? renderWeekChart(cliente.semanaBlocos, perm.exportarPdf, cliente.nome)
        : "";

    var logsHtml = "";
    if (perm.verAtualizacoes && cliente.atualizacoes && cliente.atualizacoes.length) {
      logsHtml =
        '<div class="logs-block"><h3>Logs de atualização</h3><ul>' +
        cliente.atualizacoes
          .map(function (a) {
            return (
              "<li><strong>" +
              esc(a.rotulo) +
              "</strong> · " +
              fmtDt(a.quando) +
              (a.detalhe ? " · " + esc(a.detalhe) : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul></div>";
    }

    var feedbackHtml = "";
    if (perm.verFeedback || perm.verLikes) {
      var parts = [];
      if (perm.verFeedback) {
        var fbItems =
          cliente.feedbacks && cliente.feedbacks.length
            ? cliente.feedbacks
                .map(function (f) {
                  return (
                    '<li><div class="when">' +
                    esc(f.pdvNome) +
                    " · " +
                    fmtDt(f.quando) +
                    "</div>" +
                    esc(f.mensagem) +
                    "</li>"
                  );
                })
                .join("")
            : '<li style="background:transparent;color:rgba(255,255,255,0.5)">Nenhum feedback ainda.</li>';
        parts.push(
          '<div class="feedback-panel amber"><h3>Feedback</h3><ul>' + fbItems + "</ul></div>",
        );
      }
      if (perm.verLikes) {
        var voteItems =
          cliente.votos && cliente.votos.length
            ? cliente.votos
                .map(function (v) {
                  return (
                    "<li><div class=\"when\">" +
                    (v.voto === "like" ? "👍" : "👎") +
                    " " +
                    esc(v.musicaTitulo) +
                    " — " +
                    esc(v.musicaArtista) +
                    "<br>" +
                    esc(v.pdvNome) +
                    " · " +
                    fmtDt(v.quando) +
                    "</div></li>"
                  );
                })
                .join("")
            : '<li style="background:transparent;color:rgba(255,255,255,0.5)">Nenhum voto ainda.</li>';
        parts.push(
          '<div class="feedback-panel green"><h3>Likes &amp; dislikes</h3><ul>' +
            voteItems +
            "</ul></div>",
        );
      }
      if (parts.length) feedbackHtml = '<div class="feedback-grid">' + parts.join("") + "</div>";
    }

    var logoHtml = cliente.logoUrl
      ? '<img src="' + esc(cliente.logoUrl) + '" alt="" />'
      : "";

    var moodBtn = perm.verMoodboard
      ? '<button type="button" class="btn-mood" data-mood="' + esc(cliente.rioLinhaId) + '">Moodboard</button>'
      : "";

    return (
      '<section class="cliente-section" data-cliente-key="' +
      esc(cliente.key) +
      '">' +
      '<div class="cliente-head"><div class="cliente-brand">' +
      logoHtml +
      "<div><h2>" +
      esc(cliente.nome) +
      "</h2>" +
      (cliente.documento ? '<div class="doc">' + esc(cliente.documento) + "</div>" : "") +
      "</div></div>" +
      moodBtn +
      "</div>" +
      progsHtml +
      pdvHtml +
      chartHtml +
      logsHtml +
      feedbackHtml +
      "</section>"
    );
  }

  function renderDashboard(data) {
    var clientesHtml = (data.clientes || [])
      .map(function (c) {
        return renderCliente(c, data.permissoes || {});
      })
      .join("");

    root.innerHTML =
      '<header class="dash-header">' +
      "<div>" +
      '<p class="grupo">' +
      esc(data.grupoNome) +
      "</p>" +
      "<h1>Olá, " +
      esc(data.usuarioNome) +
      "</h1>" +
      '<p class="meta">Atualizado ' +
      fmtDt(data.geradoEm) +
      (data.permissoes && data.permissoes.gerenciarInstalacaoPlayer
        ? " · TI pode instalar player"
        : " · somente leitura") +
      "</p>" +
      "</div>" +
      '<button type="button" class="btn-outline" id="btn-logout">Sair</button>' +
      "</header>" +
      clientesHtml;

    document.getElementById("btn-logout").addEventListener("click", logout);
    root.querySelectorAll("tr.clickable[data-pdv]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-no-expand]")) return;
        var id = el.getAttribute("data-pdv");
        expandedPdv = expandedPdv === id ? null : id;
        renderDashboard(data);
      });
    });
    root.querySelectorAll(".pdv-card > button[data-pdv]").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-pdv");
        expandedPdv = expandedPdv === id ? null : id;
        renderDashboard(data);
      });
    });
    root.querySelectorAll(".btn-regen").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        void regerarTokenPdv(btn.getAttribute("data-regen"), btn, data);
      });
    });
    root.querySelectorAll(".btn-install").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        openInstallModal(btn.getAttribute("data-install"), data);
      });
    });
    root.querySelectorAll("[data-mood]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openMoodboard(btn.getAttribute("data-mood"));
      });
    });
    root.querySelectorAll(".chart-export").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window.print();
      });
    });
  }

  function openMoodboard(rioLinhaId) {
    moodBody.innerHTML = '<p style="color:rgba(255,255,255,0.6)">Carregando…</p>';
    moodModal.classList.remove("hidden");
    moodModal.setAttribute("aria-hidden", "false");
    window.SiteClienteAuth.apiFetch("/api/site-cliente/moodboard/" + encodeURIComponent(rioLinhaId))
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        var m = json.moodboard;
        if (!m) {
          moodBody.innerHTML =
            '<p style="color:rgba(255,255,255,0.6)">Moodboard ainda não configurado.</p>';
          return;
        }
        var fields = [
          ["Perfil do público", m.perfilPublico],
          ["Posicionamento", m.posicionamentoMarca],
          ["Estilo musical", m.estiloMusicalPrincipal],
          ["Objetivo do período", m.objetivoPeriodo],
        ];
        moodBody.innerHTML =
          "<dl>" +
          fields
            .map(function (pair) {
              return "<dt>" + esc(pair[0]) + "</dt><dd>" + esc(pair[1] || "—") + "</dd>";
            })
            .join("") +
          "</dl>";
      })
      .catch(function () {
        moodBody.innerHTML = '<p style="color:#fda4af">Erro ao carregar moodboard.</p>';
      });
  }

  function closeMood() {
    moodModal.classList.add("hidden");
    moodModal.setAttribute("aria-hidden", "true");
    moodBody.innerHTML = "";
  }

  function findPdvInDashboard(data, rioPdvKey) {
    var found = null;
    (data.clientes || []).some(function (c) {
      return (c.pdvs || []).some(function (p) {
        if (p.rioPdvKey === rioPdvKey) {
          found = p;
          return true;
        }
        return false;
      });
    });
    return found;
  }

  function regerarTokenPdv(rioPdvKey, btn, data) {
    if (!rioPdvKey) return;
    var pdv = findPdvInDashboard(data, rioPdvKey);
    var aviso =
      pdv && pdv.lastPingAt
        ? "Este PDV parece conectado a um player. Regerar o token desconecta a instalação anterior. Continuar?"
        : "Regerar o token de instalação deste PDV? A instalação anterior deixa de funcionar.";
    if (!window.confirm(aviso)) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "…";
    }

    return window.SiteClienteAuth.apiFetch(
      "/api/site-cliente/pdv/" + encodeURIComponent(rioPdvKey) + "/regenerar-token",
      { method: "POST" },
    )
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, json: j };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.json.ok) {
          throw new Error((res.json && res.json.error) || "Falha ao regerar token");
        }
        regeneradoTokenKeys[rioPdvKey] = true;
        window.alert("Token regerado. Agora você pode gerar a instalação.");
        loadDashboard(0);
      })
      .catch(function (e) {
        window.alert(e instanceof Error ? e.message : "Erro ao regerar token.");
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Regerar token";
        }
      });
  }

  function renderInstallModalBody(pdv, ctx) {
    var gate = ctx.geracaoGate || {};
    var podeInstalar = Boolean(regeneradoTokenKeys[pdv.rioPdvKey]) || gate.podeGerarLink;
    var html = "";

    html +=
      '<p style="margin:0 0 0.75rem;font-size:0.85rem;color:rgba(255,255,255,0.7)">' +
      esc(ctx.contexto.pdvNome) +
      " · <strong>" +
      esc(ctx.contexto.codigoDisplay || "") +
      "</strong></p>";

    if (gate.pdvComPlayerAtivo) {
      html +=
        '<div class="install-alert install-alert-warn">' +
        "<strong>Atenção:</strong> este PDV parece conectado a outro player" +
        (gate.motivo ? " — " + esc(gate.motivo) : "") +
        ". Regerar o token antes de instalar em um novo aparelho." +
        "</div>";
    }

    if (!podeInstalar) {
      html +=
        '<div class="install-alert install-alert-warn">' +
        "Regerar o token na tabela antes de gerar o link de instalação." +
        "</div>";
    } else if (regeneradoTokenKeys[pdv.rioPdvKey]) {
      html +=
        '<div class="install-alert install-alert-ok">Token regerado nesta sessão — pode gerar a instalação.</div>';
    }

    html +=
      '<div class="install-section install-section-primary">' +
      "<h4>Windows — Microsoft Edge (recomendado)</h4>" +
      "<p>Instalação tipo 3: abra o link no <strong>Edge</strong> (ou Chrome). Use a senha temporária uma única vez na primeira entrada.</p>" +
      '<div id="install-windows-result"></div>' +
      '<button type="button" class="btn-install-generate" id="btn-gen-windows"' +
      (podeInstalar ? "" : " disabled") +
      ">Gerar link e senha (Edge)</button>" +
      "</div>";

    html +=
      '<div class="install-section install-section-secondary">' +
      "<h4>Android — tablet (Google Play)</h4>" +
      "<p>Alternativa para tablet: código de uso único na Play Store. Menos indicado que o Edge em PCs de loja.</p>" +
      '<div id="install-android-result"></div>' +
      '<button type="button" class="btn-install-generate btn-install-generate-secondary" id="btn-gen-android"' +
      (podeInstalar ? "" : " disabled") +
      ">Gerar código Android</button>" +
      "</div>";

    installBody.innerHTML = html;

    var btnWin = document.getElementById("btn-gen-windows");
    var btnAnd = document.getElementById("btn-gen-android");
    if (btnWin) {
      btnWin.addEventListener("click", function () {
        void gerarInstalacaoWindows(pdv.rioPdvKey, btnWin);
      });
    }
    if (btnAnd) {
      btnAnd.addEventListener("click", function () {
        void gerarInstalacaoAndroid(pdv.rioPdvKey, btnAnd);
      });
    }
  }

  function renderInstallResult(containerId, fields) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = fields
      .map(function (f) {
        return (
          '<div class="install-field"><label>' +
          esc(f.label) +
          '</label><div class="install-copy-row"><input readonly value="' +
          esc(f.value) +
          '" /><button type="button" data-copy="' +
          esc(f.value) +
          '">Copiar</button></div></div>'
        );
      })
      .join("");
    box.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-copy") || "")
          .then(function () {
            btn.textContent = "Copiado!";
            window.setTimeout(function () {
              btn.textContent = "Copiar";
            }, 1500);
          })
          .catch(function () {
            window.alert("Não foi possível copiar automaticamente.");
          });
      });
    });
  }

  function gerarInstalacaoWindows(rioPdvKey, btn) {
    btn.disabled = true;
    btn.textContent = "Gerando…";
    return window.SiteClienteAuth.apiFetch("/api/site-cliente/pdv/instalacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "gerar_link",
        rioPdvKey: rioPdvKey,
        tipo: "pdv_senha_temp",
        plataforma: "windows",
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, json: j };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.json.ok) {
          var detail = res.json.detail || res.json.error || "Não foi possível gerar";
          throw new Error(detail);
        }
        var fields = [{ label: "Link (abrir no Edge)", value: res.json.link || "" }];
        if (res.json.senhaTemporaria) {
          fields.push({ label: "Senha temporária (uso único)", value: res.json.senhaTemporaria });
        }
        renderInstallResult("install-windows-result", fields);
      })
      .catch(function (e) {
        window.alert(e instanceof Error ? e.message : "Erro ao gerar instalação.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Gerar link e senha (Edge)";
      });
  }

  function gerarInstalacaoAndroid(rioPdvKey, btn) {
    btn.disabled = true;
    btn.textContent = "Gerando…";
    return window.SiteClienteAuth.apiFetch("/api/site-cliente/pdv/instalacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "gerar_link",
        rioPdvKey: rioPdvKey,
        tipo: "pdv_play5",
        plataforma: "mobile",
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, json: j };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.json.ok) {
          throw new Error(res.json.detail || res.json.error || "Não foi possível gerar");
        }
        renderInstallResult("install-android-result", [
          { label: "Código Play Store", value: res.json.codigoPlay || "" },
          { label: "Link Google Play", value: res.json.playStoreUrl || "" },
        ]);
      })
      .catch(function (e) {
        window.alert(e instanceof Error ? e.message : "Erro ao gerar código Android.");
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Gerar código Android";
      });
  }

  function openInstallModal(rioPdvKey, data) {
    var pdv = findPdvInDashboard(data, rioPdvKey);
    if (!pdv) return;

    installModalPdv = pdv;
    installBody.innerHTML = '<p style="color:rgba(255,255,255,0.6)">Carregando…</p>';
    installModal.classList.remove("hidden");
    installModal.setAttribute("aria-hidden", "false");

    window.SiteClienteAuth.apiFetch("/api/site-cliente/pdv/instalacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contexto", rioPdvKey: rioPdvKey }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, json: j };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.json.ok) {
          throw new Error((res.json && res.json.error) || "Erro ao carregar PDV");
        }
        installModalContext = res.json;
        document.getElementById("install-title").textContent =
          "Instalar — " + (res.json.contexto.pdvNome || "PDV");
        renderInstallModalBody(pdv, res.json);
      })
      .catch(function (e) {
        installBody.innerHTML =
          '<p style="color:#fda4af">' +
          esc(e instanceof Error ? e.message : "Erro") +
          "</p>";
      });
  }

  function closeInstallModal() {
    installModal.classList.add("hidden");
    installModal.setAttribute("aria-hidden", "true");
    installBody.innerHTML = "";
    installModalPdv = null;
    installModalContext = null;
  }

  document.getElementById("mood-close").addEventListener("click", closeMood);
  moodModal.addEventListener("click", function (e) {
    if (e.target === moodModal) closeMood();
  });

  document.getElementById("install-close").addEventListener("click", closeInstallModal);
  installModal.addEventListener("click", function (e) {
    if (e.target === installModal) closeInstallModal();
  });

  function logout() {
    window.SiteClienteAuth.logout().finally(function () {
      window.location.href = "/login.html";
    });
  }

  function showError(msg) {
    root.innerHTML = '<div class="error-box">' + esc(msg) + ' <a href="/login.html">Voltar ao login</a></div>';
  }

  function loadDashboard(attempt) {
    window.SiteClienteAuth.apiFetch("/api/site-cliente/dashboard")
      .then(function (r) {
        return r.json().then(function (d) {
          return { status: r.status, data: d };
        });
      })
      .then(function (x) {
        if (x.status === 401 && attempt < 1) {
          setTimeout(function () {
            loadDashboard(attempt + 1);
          }, 300);
          return;
        }
        if (x.status === 403 && x.data && x.data.error === "wrong_grupo_tipo") {
          window.location.replace("/cobranca.html");
          return;
        }
        if (x.status === 401 || !x.data.ok) {
          window.SiteClienteAuth.setToken(null);
          window.location.href = "/login.html";
          return;
        }
        renderDashboard(x.data);
      })
      .catch(function () {
        showError("Erro ao carregar o painel.");
      });
  }

  window.SiteClienteAuth.apiFetch("/api/site-cliente/auth/session")
    .then(function (r) {
      return r.json().then(function (d) {
        return { status: r.status, data: d };
      });
    })
    .then(function (x) {
      if (x.status === 200 && x.data.ok && x.data.grupoTipo === "cobranca") {
        window.location.replace("/cobranca.html");
        return;
      }
      loadDashboard(0);
    })
    .catch(function () {
      loadDashboard(0);
    });
})();
