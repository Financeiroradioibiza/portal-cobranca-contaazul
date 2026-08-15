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
  var expandedPdv = null;

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

  function renderPdvRow(pdv, showEstilo) {
    var meta = STATUS_META[pdv.status] || STATUS_META.offline;
    var cache = pdv.cachePercent != null ? pdv.cachePercent : 0;
    var expanded = expandedPdv === pdv.rioPdvKey;
    var expandHtml =
      expanded && pdv.agendamentos && pdv.agendamentos.length
        ? '<tr class="expand-row"><td colspan="9"><div class="section-title">Playlist</div>' +
          renderAgendamentos(pdv.agendamentos) +
          "</td></tr>"
        : "";

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
      "</td></tr>" +
      expandHtml
    );
  }

  function renderPdvCard(pdv, showEstilo) {
    var meta = STATUS_META[pdv.status] || STATUS_META.offline;
    var cache = pdv.cachePercent != null ? pdv.cachePercent : 0;
    var expanded = expandedPdv === pdv.rioPdvKey;
    var expandHtml =
      expanded && pdv.agendamentos && pdv.agendamentos.length
        ? '<div class="pdv-card-expand"><div class="section-title">Playlist</div>' +
          renderAgendamentos(pdv.agendamentos) +
          "</div>"
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
      pdvHtml =
        '<div class="pdv-cards">' +
        cliente.pdvs
          .map(function (p) {
            return renderPdvCard(p, showEstilo);
          })
          .join("") +
        "</div>" +
        '<div class="pdv-table-wrap"><table class="pdv-table"><thead><tr>' +
        "<th>PDV</th><th>CNPJ</th><th>Cache</th><th>Status</th><th>Programação</th><th>1ª conexão</th><th>Último ping</th><th>Versão</th><th>Estilo agora</th>" +
        "</tr></thead><tbody>" +
        cliente.pdvs
          .map(function (p) {
            return renderPdvRow(p, showEstilo);
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
      " · somente leitura</p>" +
      "</div>" +
      '<button type="button" class="btn-outline" id="btn-logout">Sair</button>' +
      "</header>" +
      clientesHtml;

    document.getElementById("btn-logout").addEventListener("click", logout);
    root.querySelectorAll("[data-pdv]").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-pdv");
        expandedPdv = expandedPdv === id ? null : id;
        renderDashboard(data);
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

  document.getElementById("mood-close").addEventListener("click", closeMood);
  moodModal.addEventListener("click", function (e) {
    if (e.target === moodModal) closeMood();
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

  loadDashboard(0);
})();
