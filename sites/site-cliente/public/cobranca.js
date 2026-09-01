(function () {
  var root = document.getElementById("root");
  var auth = window.SiteClienteAuth;
  if (!root || !auth) return;

  var expanded = {};
  var pdvPanelOpen = false;
  var toastTimer = null;

  var STATUS_META = {
    online: { label: "ONLINE", cls: "badge-online" },
    hoje: { label: "HOJE", cls: "badge-hoje" },
    offline: { label: "OFFLINE", cls: "badge-offline" },
    sem_install: { label: "SEM INSTALL", cls: "badge-sem_install" },
  };

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtBRL(n) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
    } catch (e) {
      return "R$ " + Number(n || 0).toFixed(2);
    }
  }

  function fmtDate(ymd) {
    if (!ymd || ymd === "—") return "—";
    var p = ymd.split("-");
    if (p.length !== 3) return ymd;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function badgeClass(situacao) {
    if (situacao === "paga") return "badge-paga";
    if (situacao === "atrasada") return "badge-atrasada";
    if (situacao === "parcial") return "badge-parcial";
    return "badge-aberta";
  }

  function badgeLabel(situacao, statusLabel) {
    if (situacao === "paga") return "Paga";
    if (situacao === "atrasada") return "Atrasada";
    if (situacao === "parcial") return "Parcial";
    return statusLabel && statusLabel !== "—" ? statusLabel : "Em aberto";
  }

  function docUrl(parcelaId, caPersonId, tipo) {
    return (
      "/api/site-cliente/cobranca/documento?parcelaId=" +
      encodeURIComponent(parcelaId) +
      "&caPersonId=" +
      encodeURIComponent(caPersonId) +
      "&tipo=" +
      encodeURIComponent(tipo)
    );
  }

  function showToast(msg, isError) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "toast" + (isError ? " toast-err" : " toast-ok");
    el.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.style.display = "none";
    }, 5000);
  }

  function showError(msg) {
    root.innerHTML = '<div class="error-box">' + esc(msg) + "</div>";
  }

  function parseFileName(cd, fallback) {
    if (!cd) return fallback;
    var m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
    if (m) {
      try {
        return decodeURIComponent(m[1] || m[2] || fallback);
      } catch (e) {
        return m[1] || m[2] || fallback;
      }
    }
    return fallback;
  }

  function downloadDoc(parcelaId, caPersonId, tipo, btn) {
    if (btn) btn.disabled = true;
    auth
      .apiFetch(docUrl(parcelaId, caPersonId, tipo), { redirect: "manual" })
      .then(function (r) {
        if (r.status === 401) {
          auth.setToken(null);
          window.location.replace("/login.html");
          return null;
        }
        var ct = (r.headers.get("Content-Type") || "").toLowerCase();
        if (ct.indexOf("application/json") >= 0) {
          return r.json().then(function (d) {
            if (d && d.ok && d.mode === "external" && d.url) {
              window.open(d.url, "_blank", "noopener,noreferrer");
              return null;
            }
            if (d && d.error) {
              throw new Error(d.error === "forbidden" ? "Acesso negado." : "Não foi possível obter o boleto.");
            }
            throw new Error("Resposta inválida do servidor.");
          });
        }
        if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) {
          throw new Error("Use o link externo do boleto — recarregue a página e tente de novo.");
        }
        if (!r.ok) {
          return r.text().then(function (t) {
            throw new Error(t || "Não foi possível baixar o arquivo.");
          });
        }
        var cd = r.headers.get("Content-Disposition");
        return r.blob().then(function (blob) {
          return { blob: blob, name: parseFileName(cd, tipo === "nf" ? "nota.pdf" : "boleto.pdf") };
        });
      })
      .then(function (x) {
        if (!x) return;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(x.blob);
        a.download = x.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1000);
      })
      .catch(function (e) {
        showToast(e instanceof Error ? e.message : "Falha no download.", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function uploadComprovante(meta, file, btn) {
    if (btn) btn.disabled = true;
    var fd = new FormData();
    fd.append("parcelaId", meta.parcelaId);
    fd.append("caPersonId", meta.caPersonId);
    fd.append("clienteNome", meta.clienteNome);
    fd.append("cnpj", meta.cnpj);
    fd.append("parcelaDue", meta.parcelaDue);
    fd.append("parcelaSummary", meta.parcelaSummary);
    fd.append("parcelaValue", String(meta.parcelaValue));
    fd.append("file", file);

    auth
      .apiFetch("/api/site-cliente/cobranca/comprovante", { method: "POST", body: fd })
      .then(function (r) {
        return r.json().then(function (d) {
          return { status: r.status, data: d };
        });
      })
      .then(function (x) {
        if (x.status === 401) {
          auth.setToken(null);
          window.location.replace("/login.html");
          return;
        }
        if (x.status !== 200 || !x.data.ok) {
          var err =
            x.data && x.data.error === "tipo_arquivo_invalido"
              ? "Use PDF ou imagem (JPG, PNG)."
              : x.data && x.data.error === "arquivo_invalido"
                ? "Arquivo muito grande (máx. 4 MB) ou inválido."
                : "Não foi possível enviar o comprovante.";
          showToast(err, true);
          return;
        }
        showToast("Comprovante enviado ao financeiro. Obrigado!", false);
      })
      .catch(function () {
        showToast("Erro de conexão ao enviar comprovante.", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function totalAberto(parcelas) {
    var t = 0;
    for (var i = 0; i < parcelas.length; i += 1) {
      if (parcelas[i].situacao !== "paga") t += parcelas[i].saldo || parcelas[i].value || 0;
    }
    return t;
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

  function renderBrandHeader(data) {
    var grupo = data.grupoNome || "Grupo";
    var html = "";
    html += '<div class="brand-bar">';
    html += '<div class="brand-logo" aria-hidden="true">';
    html += '<span class="brand-star"></span>';
    html += '<span class="brand-wordmark"><span class="brand-name">RADIO IBIZA</span>';
    html += '<span class="brand-sub">CLIENTE</span></span>';
    html += "</div>";
    html += '<div class="brand-copy">';
    html += '<h1>Portal de cobrança <span class="grupo-nome">(' + esc(grupo) + ")</span></h1>";
    html += '<p class="meta">Olá, ' + esc(data.usuarioNome || "") + "</p>";
    html += "</div>";
    html += '<div class="header-actions">';
    html += '<button type="button" class="btn-outline" id="btn-refresh">Atualizar</button>';
    html += '<button type="button" class="btn-outline" id="btn-logout">Sair</button>';
    html += "</div>";
    html += "</div>";
    return html;
  }

  function renderPdvInstalacao(pdvs) {
    if (!pdvs || !pdvs.length) return "";
    var html = "";
    html += '<section class="pdv-panel">';
    html += '<button type="button" class="pdv-panel-toggle" id="pdv-toggle" aria-expanded="' + (pdvPanelOpen ? "true" : "false") + '">';
    html += '<span class="pdv-toggle-icon' + (pdvPanelOpen ? " open" : "") + '" aria-hidden="true">▶</span>';
    html += "<span><strong>Mostrar lojas instaladas</strong>";
    html += '<span class="pdv-panel-hint"> — status do player nas unidades do seu grupo</span></span>';
    html += '<span class="pdv-count">' + pdvs.length + " loja(s)</span>";
    html += "</button>";
    html += '<div class="pdv-panel-body' + (pdvPanelOpen ? "" : " hidden") + '" id="pdv-panel-body">';
    html += '<div class="table-wrap pdv-table-wrap"><table class="pdv-table"><thead><tr>';
    html += "<th>Loja</th><th>CNPJ</th><th>Cache</th><th>Status</th><th>1º ping</th><th>Últ. ping</th><th>Versão</th>";
    html += "</tr></thead><tbody>";
    for (var i = 0; i < pdvs.length; i += 1) {
      var p = pdvs[i];
      var meta = STATUS_META[p.status] || STATUS_META.offline;
      var cache = p.cachePercent != null ? p.cachePercent : 0;
      html += "<tr>";
      html += "<td><strong>" + esc(p.nome) + "</strong>";
      if (p.clienteNome) {
        html += '<div class="pdv-sub">' + esc(p.clienteNome) + "</div>";
      }
      html += "</td>";
      html += "<td>" + esc(p.cnpj || "—") + "</td>";
      html += '<td><span class="cache-bar"><span style="width:' + cache + '%"></span></span>' + cache + "%</td>";
      html += '<td><span class="badge ' + meta.cls + '">' + meta.label + "</span></td>";
      html += "<td>" + esc(fmtDt(p.firstPingAt)) + "</td>";
      html += "<td>" + esc(fmtDt(p.lastPingAt)) + "</td>";
      html += "<td>" + esc(p.playerVersion || "—") + "</td>";
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    html += "</div></section>";
    return html;
  }

  function render(data) {
    var perm = data.permissoes || {};
    var clientes = data.clientes || [];
    var pdvs = data.pdvsInstalacao || [];
    var period = data.period || {};

    var html = "";
    html += renderBrandHeader(data);

    html += renderPdvInstalacao(pdvs);

    html +=
      '<p class="period-note">Parcelas emitidas nos últimos 12 meses (competência ' +
      esc(fmtDate(period.start)) +
      " a " +
      esc(fmtDate(period.end)) +
      ").</p>";

    if (clientes.length === 0) {
      html += '<div class="empty-state">Nenhuma parcela encontrada no período para os CNPJs do seu grupo.</div>';
    } else {
      for (var c = 0; c < clientes.length; c += 1) {
        var cl = clientes[c];
        var open = expanded[cl.caPersonId] !== false;
        var aberto = totalAberto(cl.parcelas);
        html += '<section class="client-card" data-id="' + esc(cl.caPersonId) + '">';
        html += '<div class="client-head" data-toggle="' + esc(cl.caPersonId) + '">';
        html += "<div>";
        html += "<h2>" + esc(cl.fantasy) + "</h2>";
        html += '<div class="client-meta">CNPJ: ' + esc(cl.cnpj) + " · " + esc(cl.email) + "</div>";
        html += "</div>";
        html += '<div class="client-stats">' + cl.parcelas.length + " parcela(s)<br>Em aberto: " + fmtBRL(aberto) + "</div>";
        html += "</div>";
        html += '<div class="client-body' + (open ? "" : " hidden") + '" id="body-' + esc(cl.caPersonId) + '">';
        html += '<div class="table-wrap"><table><thead><tr>';
        html += "<th>Comp.</th><th>Venc.</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Ações</th>";
        html += "</tr></thead><tbody>";
        for (var p = 0; p < cl.parcelas.length; p += 1) {
          var row = cl.parcelas[p];
          var caId = row.caPersonId || cl.caPersonId;
          html += "<tr>";
          html += "<td>" + esc(fmtDate(row.comp)) + "</td>";
          html += "<td>" + esc(fmtDate(row.due)) + "</td>";
          html += "<td>" + esc(row.summary) + "</td>";
          html += '<td class="num">' + fmtBRL(row.value) + "</td>";
          html += '<td><span class="badge ' + badgeClass(row.situacao) + '">' + esc(badgeLabel(row.situacao, row.statusLabel)) + "</span></td>";
          html += '<td><div class="doc-btns">';
          if (perm.baixarBoleto) {
            html +=
              '<button type="button" class="btn-doc btn-dl" data-doc="' +
              esc(row.id) +
              '" data-ca="' +
              esc(caId) +
              '" data-tipo="boleto">Boleto</button>';
          }
          if (perm.baixarNota) {
            html +=
              '<button type="button" class="btn-doc btn-dl" data-doc="' +
              esc(row.id) +
              '" data-ca="' +
              esc(caId) +
              '" data-tipo="nf">Nota</button>';
          }
          if (perm.verCobrancas) {
            html +=
              '<button type="button" class="btn-doc btn-comp" data-doc="' +
              esc(row.id) +
              '" data-ca="' +
              esc(caId) +
              '" data-cliente="' +
              esc(cl.fantasy) +
              '" data-cnpj="' +
              esc(cl.cnpj) +
              '" data-due="' +
              esc(row.due) +
              '" data-summary="' +
              esc(row.summary) +
              '" data-value="' +
              esc(String(row.value)) +
              '">Comprovante</button>';
          }
          html += "</div></td>";
          html += "</tr>";
        }
        html += "</tbody></table></div>";
        html += "</div>";
        html += "</section>";
      }
    }

    root.innerHTML = html;

    var fileInput = document.getElementById("comp-file");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.id = "comp-file";
      fileInput.accept = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
    }

    var pendingComp = null;

    fileInput.addEventListener("change", function () {
      if (!pendingComp || !fileInput.files || !fileInput.files[0]) return;
      uploadComprovante(pendingComp, fileInput.files[0], pendingComp.btn);
      pendingComp = null;
      fileInput.value = "";
    });

    var btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", function () {
        auth.logout().finally(function () {
          window.location.replace("/login.html");
        });
      });
    }

    var btnRefresh = document.getElementById("btn-refresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", function () {
        load();
      });
    }

    var pdvToggle = document.getElementById("pdv-toggle");
    if (pdvToggle) {
      pdvToggle.addEventListener("click", function () {
        pdvPanelOpen = !pdvPanelOpen;
        var body = document.getElementById("pdv-panel-body");
        var icon = pdvToggle.querySelector(".pdv-toggle-icon");
        if (body) body.classList.toggle("hidden", !pdvPanelOpen);
        if (icon) icon.classList.toggle("open", pdvPanelOpen);
        pdvToggle.setAttribute("aria-expanded", pdvPanelOpen ? "true" : "false");
      });
    }

    var toggles = root.querySelectorAll("[data-toggle]");
    for (var t = 0; t < toggles.length; t += 1) {
      toggles[t].addEventListener("click", function () {
        var id = this.getAttribute("data-toggle");
        expanded[id] = expanded[id] === false;
        var body = document.getElementById("body-" + id);
        if (body) body.classList.toggle("hidden", expanded[id] === false);
      });
    }

    var dlBtns = root.querySelectorAll(".btn-dl");
    for (var d = 0; d < dlBtns.length; d += 1) {
      dlBtns[d].addEventListener("click", function () {
        downloadDoc(
          this.getAttribute("data-doc"),
          this.getAttribute("data-ca"),
          this.getAttribute("data-tipo") || "boleto",
          this,
        );
      });
    }

    var compBtns = root.querySelectorAll(".btn-comp");
    for (var i = 0; i < compBtns.length; i += 1) {
      compBtns[i].addEventListener("click", function () {
        pendingComp = {
          btn: this,
          parcelaId: this.getAttribute("data-doc"),
          caPersonId: this.getAttribute("data-ca"),
          clienteNome: this.getAttribute("data-cliente") || "",
          cnpj: this.getAttribute("data-cnpj") || "",
          parcelaDue: this.getAttribute("data-due") || "",
          parcelaSummary: this.getAttribute("data-summary") || "",
          parcelaValue: parseFloat(this.getAttribute("data-value") || "0") || 0,
        };
        fileInput.click();
      });
    }
  }

  function load() {
    root.innerHTML = '<div class="loading">Carregando cobranças…</div>';
    auth
      .apiFetch("/api/site-cliente/cobranca/dashboard")
      .then(function (r) {
        return r.json().then(function (d) {
          return { status: r.status, data: d };
        });
      })
      .then(function (x) {
        if (x.status === 401) {
          auth.setToken(null);
          window.location.replace("/login.html");
          return;
        }
        if (x.status === 403 && x.data && x.data.error === "wrong_grupo_tipo") {
          window.location.replace("/app.html");
          return;
        }
        if (x.status === 503 && x.data && x.data.error === "conta_azul_indisponivel") {
          showError("Cobranças temporariamente indisponíveis. Tente de novo em alguns minutos.");
          return;
        }
        if (x.status !== 200 || !x.data.ok) {
          showError("Não foi possível carregar as cobranças.");
          return;
        }
        render(x.data);
      })
      .catch(function () {
        showError("Erro de conexão. Verifique sua internet e tente de novo.");
      });
  }

  auth
    .apiFetch("/api/site-cliente/auth/session")
    .then(function (r) {
      if (!r.ok) {
        window.location.replace("/login.html");
        return null;
      }
      return r.json();
    })
    .then(function (s) {
      if (!s || !s.ok) return;
      if (s.grupoTipo !== "cobranca") {
        window.location.replace("/app.html");
        return;
      }
      load();
    })
    .catch(function () {
      window.location.replace("/login.html");
    });
})();
