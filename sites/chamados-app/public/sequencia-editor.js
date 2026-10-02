(function (global) {
  var SETOR_IDS = {
    cliente_novo: ["financeiro", "criacao", "producao", "suporte"],
    vinhetas: ["producao"],
  };

  function setorMarcadoNoStep(step, setorId, setorEmails) {
    var emails = setorEmails[setorId] || [];
    if (emails.length > 0) {
      return emails.every(function (e) {
        return (step.responsaveisExtras || []).some(function (r) {
          return r.toLowerCase() === e.toLowerCase();
        });
      });
    }
    return (step.setores || []).indexOf(setorId) >= 0;
  }

  function toggleSetorNoStep(step, setorId, setorEmails) {
    var emails = setorEmails[setorId] || [];
    if (emails.length === 0) {
      var has = (step.setores || []).indexOf(setorId) >= 0;
      var setores = (step.setores || []).slice();
      return Object.assign({}, step, {
        setores: has ? setores.filter(function (x) {
          return x !== setorId;
        }) : setores.concat([setorId]),
      });
    }
    var enabled = setorMarcadoNoStep(step, setorId, setorEmails);
    var responsaveisExtras = (step.responsaveisExtras || []).slice();
    var setores = (step.setores || []).filter(function (s) {
      return s !== setorId;
    });
    if (enabled) {
      responsaveisExtras = responsaveisExtras.filter(function (r) {
        return !emails.some(function (e) {
          return e.toLowerCase() === r.toLowerCase();
        });
      });
    } else {
      emails.forEach(function (e) {
        if (
          !responsaveisExtras.some(function (r) {
            return r.toLowerCase() === e.toLowerCase();
          })
        ) {
          responsaveisExtras.push(e);
        }
      });
    }
    return Object.assign({}, step, { setores: setores, responsaveisExtras: responsaveisExtras });
  }

  function mergePrazosFromServer(prevSteps, nextSteps) {
    return prevSteps.map(function (s) {
      var hit = null;
      for (var i = 0; i < nextSteps.length; i++) {
        if (nextSteps[i].key === s.key) {
          hit = nextSteps[i];
          break;
        }
      }
      if (!hit) return s;
      return Object.assign({}, s, {
        prazoEm: hit.prazoEm,
        responsaveisExtras: hit.responsaveisExtras || s.responsaveisExtras,
      });
    });
  }

  function fetchTemplateSteps(auth, template, prazoModo, dataInstalacao) {
    var q =
      "template=" +
      encodeURIComponent(template) +
      "&prazoModo=" +
      encodeURIComponent(prazoModo || "um_dia_util");
    if (dataInstalacao) q += "&dataInstalacao=" + encodeURIComponent(dataInstalacao);
    return auth.apiFetch("/api/chamados/template-defaults?" + q).then(function (r) {
      if (!r.ok) throw new Error("template");
      return r.json();
    });
  }

  function renderEditorHtml(d, participants, escapeHtml) {
    if (d.template !== "cliente_novo" && d.template !== "vinhetas") return "";
    var variant = d.template;
    var steps = d.sequenciaSteps || [];
    var setorEmails = d.setorEmails || {};
    var setorIds = SETOR_IDS[variant] || [];

    var html =
      '<div class="seq-editor seq-editor-' +
      escapeHtml(variant) +
      '">' +
      '<p class="seq-editor-title">' +
      (variant === "vinhetas" ?
        "Vinhetas — 2 etapas (2 dias úteis cada). Quem abre o fluxo acompanha todas."
      : "Cliente novo — 4 etapas em série (você acompanha todas; cada setor só na sua fase)") +
      "</p>";

    if (variant === "cliente_novo") {
      html +=
        '<div class="seq-prazo-row">' +
        '<label class="seq-prazo-opt"><input type="radio" name="seq-prazo" data-prazo-modo="um_dia_util"' +
        (d.prazoModo === "um_dia_util" ? " checked" : "") +
        " /> 1 dia útil por etapa</label>" +
        '<label class="seq-prazo-opt"><input type="radio" name="seq-prazo" data-prazo-modo="data_instalacao"' +
        (d.prazoModo === "data_instalacao" ? " checked" : "") +
        ' /> Prazo final instalação <input type="date" id="seq-data-instalacao" value="' +
        escapeHtml(d.dataInstalacao || "") +
        '"' +
        (d.prazoModo !== "data_instalacao" ? " disabled" : "") +
        " /></label></div>";
    } else {
      html +=
        '<div class="seq-prazo-row">' +
        '<button type="button" class="btn-secondary seq-recalc-vinhetas" style="flex:0 0 auto;padding:0.45rem 0.75rem;font-size:0.82rem">Recalcular 2 dias úteis / etapa</button>' +
        '<span class="sheet-hint" style="margin:0">Prazos entram na agenda.</span></div>';
    }

    steps.forEach(function (step) {
      var disabled = variant === "cliente_novo" && !step.enabled;
      html +=
        '<div class="seq-step' +
        (disabled ? " seq-step-off" : "") +
        '" data-step-key="' +
        escapeHtml(step.key) +
        '">';
      html += '<div class="seq-step-head">';
      if (variant === "cliente_novo") {
        html +=
          '<label class="seq-step-label"><input type="checkbox" data-step-enabled="' +
          escapeHtml(step.key) +
          '"' +
          (step.enabled !== false ? " checked" : "") +
          " /> " +
          escapeHtml(step.rotulo || step.key) +
          "</label>";
      } else {
        html += '<span class="seq-step-label">' + escapeHtml(step.rotulo || step.key) + "</span>";
      }
      html +=
        '<label class="seq-step-prazo">Prazo <input type="date" data-step-prazo="' +
        escapeHtml(step.key) +
        '" value="' +
        escapeHtml(step.prazoEm || "") +
        '" /></label></div>';

      if (step.enabled !== false || variant === "vinhetas") {
        html +=
          '<input class="seq-step-input" data-step-rotulo="' +
          escapeHtml(step.key) +
          '" value="' +
          escapeHtml(step.rotulo || "") +
          '" />' +
          '<textarea class="seq-step-textarea" rows="2" data-step-desc="' +
          escapeHtml(step.key) +
          '">' +
          escapeHtml(step.descricao || "") +
          "</textarea>";

        if (setorIds.length > 0 && (variant !== "vinhetas" || step.key === "subida_producao")) {
          html += '<div class="setor-row seq-step-setores">';
          setorIds.forEach(function (sid) {
            var label = sid;
            if (d.setoresMeta) {
              for (var i = 0; i < d.setoresMeta.length; i++) {
                if (d.setoresMeta[i].id === sid) label = d.setoresMeta[i].label;
              }
            }
            var on = setorMarcadoNoStep(step, sid, setorEmails);
            var pessoas = setorEmails[sid] || [];
            var suffix = pessoas.length === 1 ? " · pessoa" : pessoas.length > 1 ? " · equipe" : "";
            html +=
              '<button type="button" class="setor-chip' +
              (on ? " on" : "") +
              '" data-step-setor="' +
              escapeHtml(step.key) +
              '" data-setor-id="' +
              escapeHtml(sid) +
              '">' +
              escapeHtml(label) +
              suffix +
              "</button>";
          });
          html += "</div>";
        }

        if (participants.length > 0) {
          var openDetails = variant === "vinhetas" && step.key === "criacao_vinheta";
          html +=
            '<details class="seq-step-people"' +
            (openDetails ? " open" : "") +
            "><summary>Pessoas nesta etapa</summary><div>";
          participants.forEach(function (p) {
            var checked = (step.responsaveisExtras || []).some(function (e) {
              return e.toLowerCase() === p.email.toLowerCase();
            });
            html +=
              '<label class="person-row"><input type="checkbox" data-step-resp="' +
              escapeHtml(step.key) +
              '" data-resp-email="' +
              escapeHtml(p.email) +
              '"' +
              (checked ? " checked" : "") +
              " />" +
              escapeHtml(p.displayName) +
              "</label>";
          });
          html += "</div></details>";
        }
      }
      html += "</div>";
    });

    html += "</div>";
    return html;
  }

  function bindEditor(root, d, deps) {
    if (!root || !d) return;

    root.querySelectorAll("[data-prazo-modo]").forEach(function (inp) {
      inp.onchange = function () {
        d.prazoModo = inp.getAttribute("data-prazo-modo");
        var dateEl = document.getElementById("seq-data-instalacao");
        if (dateEl) dateEl.disabled = d.prazoModo !== "data_instalacao";
        deps
          .loadTemplateSteps(d.template, d.prazoModo, d.dataInstalacao)
          .then(function () {
            deps.rerenderSheet();
          })
          .catch(function () {
            alert("Não foi possível recalcular prazos.");
          });
      };
    });

    var dateInst = document.getElementById("seq-data-instalacao");
    if (dateInst) {
      dateInst.onchange = function () {
        d.dataInstalacao = dateInst.value;
        if (d.prazoModo === "data_instalacao") {
          deps
            .loadTemplateSteps(d.template, d.prazoModo, d.dataInstalacao)
            .then(deps.rerenderSheet)
            .catch(function () {
              alert("Não foi possível recalcular prazos.");
            });
        }
      };
    }

    var recalcBtn = root.querySelector(".seq-recalc-vinhetas");
    if (recalcBtn) {
      recalcBtn.onclick = function () {
        d.prazoModo = "dois_dias_uteis";
        deps
          .loadTemplateSteps("vinhetas", d.prazoModo, "")
          .then(deps.rerenderSheet)
          .catch(function () {
            alert("Não foi possível recalcular.");
          });
      };
    }

    root.querySelectorAll("[data-step-enabled]").forEach(function (inp) {
      inp.onchange = function () {
        var key = inp.getAttribute("data-step-enabled");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          return s.key === key ? Object.assign({}, s, { enabled: inp.checked }) : s;
        });
        deps.rerenderSheet();
      };
    });

    root.querySelectorAll("[data-step-prazo]").forEach(function (inp) {
      inp.onchange = inp.oninput = function () {
        var key = inp.getAttribute("data-step-prazo");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          return s.key === key ? Object.assign({}, s, { prazoEm: inp.value }) : s;
        });
      };
    });

    root.querySelectorAll("[data-step-rotulo]").forEach(function (inp) {
      inp.oninput = function () {
        var key = inp.getAttribute("data-step-rotulo");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          return s.key === key ? Object.assign({}, s, { rotulo: inp.value }) : s;
        });
      };
    });

    root.querySelectorAll("[data-step-desc]").forEach(function (inp) {
      inp.oninput = function () {
        var key = inp.getAttribute("data-step-desc");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          return s.key === key ? Object.assign({}, s, { descricao: inp.value }) : s;
        });
      };
    });

    root.querySelectorAll("[data-step-setor]").forEach(function (btn) {
      btn.onclick = function () {
        var key = btn.getAttribute("data-step-setor");
        var setorId = btn.getAttribute("data-setor-id");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          return s.key === key ? toggleSetorNoStep(s, setorId, d.setorEmails || {}) : s;
        });
        deps.rerenderSheet();
      };
    });

    root.querySelectorAll("[data-step-resp]").forEach(function (inp) {
      inp.onchange = function () {
        var key = inp.getAttribute("data-step-resp");
        var email = inp.getAttribute("data-resp-email");
        d.sequenciaSteps = (d.sequenciaSteps || []).map(function (s) {
          if (s.key !== key) return s;
          var list = (s.responsaveisExtras || []).slice();
          var idx = -1;
          for (var i = 0; i < list.length; i++) {
            if (list[i].toLowerCase() === email.toLowerCase()) {
              idx = i;
              break;
            }
          }
          if (inp.checked && idx < 0) list.push(email);
          if (!inp.checked && idx >= 0) list.splice(idx, 1);
          return Object.assign({}, s, { responsaveisExtras: list });
        });
      };
    });
  }

  global.ChamadosSequenciaEditor = {
    renderEditorHtml: renderEditorHtml,
    bindEditor: bindEditor,
    fetchTemplateSteps: fetchTemplateSteps,
    mergePrazosFromServer: mergePrazosFromServer,
  };
})(typeof window !== "undefined" ? window : globalThis);
