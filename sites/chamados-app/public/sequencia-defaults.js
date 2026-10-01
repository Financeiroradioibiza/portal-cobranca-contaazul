(function (global) {
  var TZ = "America/Sao_Paulo";
  var SETOR_PESSOAS = {
    producao: ["renato@radioibiza.com.br"],
    suporte: ["anderson@radioibiza.com.br", "marize@radioibiza.com.br"],
  };

  function ymdInTz(d) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function parseYmd(ymd) {
    var p = ymd.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0));
  }

  function isBusinessDayUtc(d) {
    var w = d.getUTCDay();
    return w >= 1 && w <= 5;
  }

  function addCalendarDaysUtc(d, n) {
    var x = new Date(d);
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  }

  function nextBusinessDay(from, includeSame) {
    var cur = parseYmd(ymdInTz(from));
    if (includeSame && isBusinessDayUtc(cur)) return cur;
    do {
      cur = addCalendarDaysUtc(cur, 1);
    } while (!isBusinessDayUtc(cur));
    return cur;
  }

  function prazosDiasUteisPorEtapa(from, etapas, diasUteisPorEtapa) {
    var out = [];
    var cur = parseYmd(ymdInTz(from));
    var n = Math.max(1, Math.floor(diasUteisPorEtapa));
    for (var i = 0; i < etapas; i++) {
      for (var d = 0; d < n; d++) {
        cur = nextBusinessDay(cur, false);
      }
      out.push(new Date(cur));
    }
    return out;
  }

  function prazoToIsoDate(d) {
    return ymdInTz(d);
  }

  function normalizeStepSetorParaPessoas(step) {
    var setores = (step.setores || []).slice();
    var responsaveisExtras = (step.responsaveisExtras || []).slice();
    ["producao", "suporte"].forEach(function (setorId) {
      if (setores.indexOf(setorId) < 0) return;
      setores = setores.filter(function (s) {
        return s !== setorId;
      });
      (SETOR_PESSOAS[setorId] || []).forEach(function (e) {
        if (
          !responsaveisExtras.some(function (r) {
            return r.toLowerCase() === e.toLowerCase();
          })
        ) {
          responsaveisExtras.push(e);
        }
      });
    });
    return Object.assign({}, step, { setores: setores, responsaveisExtras: responsaveisExtras });
  }

  function applySetorPessoasOnSteps(steps) {
    return steps.map(normalizeStepSetorParaPessoas);
  }

  function attachPrazos(defs, prazos) {
    return defs.map(function (s, i) {
      return Object.assign({}, s, {
        ordem: i + 1,
        enabled: true,
        prazoEm: prazoToIsoDate(prazos[i] || prazos[prazos.length - 1]),
      });
    });
  }

  var CLIENTE_NOVO_STEPS = [
    {
      key: "financeiro",
      rotulo: "1 · Financeiro",
      descricao: "Financeiro, favor criar cliente.",
      setores: ["financeiro"],
      responsaveisExtras: [],
    },
    {
      key: "criacao",
      rotulo: "2 · Criação musical",
      descricao: "Criação, favor enviar à Produção a programação musical.",
      setores: ["criacao"],
      responsaveisExtras: [],
    },
    {
      key: "producao",
      rotulo: "3 · Produção",
      descricao: "Produção, favor preparar o cliente para instalação.",
      setores: ["producao"],
      responsaveisExtras: [],
    },
    {
      key: "instalacao",
      rotulo: "4 · Instalação",
      descricao: "Suporte, favor instalar cliente.",
      setores: ["suporte"],
      responsaveisExtras: [],
    },
  ];

  function defaultVinhetasRafaelEmail(participants) {
    var hit = null;
    for (var i = 0; i < (participants || []).length; i++) {
      var p = participants[i];
      var dn = (p.displayName || "").toLowerCase();
      var em = (p.email || "").toLowerCase();
      if (dn.indexOf("rafael") >= 0 || em.indexOf("rafael") >= 0 || em.indexOf("rafagasparian") >= 0) {
        hit = p.email;
        break;
      }
    }
    return hit || "";
  }

  function buildDefaultClienteNovoSteps(from) {
    var prazos = prazosDiasUteisPorEtapa(from || new Date(), CLIENTE_NOVO_STEPS.length, 1);
    return applySetorPessoasOnSteps(attachPrazos(CLIENTE_NOVO_STEPS, prazos));
  }

  function buildDefaultVinhetasSteps(from, rafaelEmail) {
    var defs = [
      {
        key: "criacao_vinheta",
        rotulo: "1 · Criação de vinheta",
        descricao: "Pedido de criação de vinheta.",
        setores: [],
        responsaveisExtras: rafaelEmail ? [rafaelEmail] : [],
      },
      {
        key: "subida_producao",
        rotulo: "2 · Subida em cliente (Produção)",
        descricao: "Pedido de subida de vinheta em cliente para produção.",
        setores: ["producao"],
        responsaveisExtras: [],
      },
    ];
    var prazos = prazosDiasUteisPorEtapa(from || new Date(), defs.length, 2);
    return applySetorPessoasOnSteps(attachPrazos(defs, prazos));
  }

  global.ChamadosSequenciaDefaults = {
    buildDefaultClienteNovoSteps: buildDefaultClienteNovoSteps,
    buildDefaultVinhetasSteps: buildDefaultVinhetasSteps,
    defaultVinhetasRafaelEmail: defaultVinhetasRafaelEmail,
  };
})(typeof window !== "undefined" ? window : globalThis);
