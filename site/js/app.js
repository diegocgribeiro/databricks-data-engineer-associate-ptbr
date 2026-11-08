/* DE Associate PT-BR — site de estudos (HTML + CSS + JS puro, sem build).
 * Todo o progresso fica no localStorage do seu navegador (exporte em "Dados e ajustes").
 */
(function () {
  "use strict";

  // ======================================================================
  // Dados
  // ======================================================================
  const QD = window.QDATA || { domains: [], banks: [], questions: [] };
  const LESSONS = window.LESSONS || [];
  const DOMAINS = QD.domains;
  const DOMAIN = Object.fromEntries(DOMAINS.map(d => [d.id, d]));
  const QUESTIONS = QD.questions;
  const Q = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  const LESSON = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const BANKS = Object.fromEntries(QD.banks.map(b => [b.id, b]));
  const EXAM_DIST = { // questões por domínio num simulado de 45 (pesos oficiais)
    "databricks-intelligence-platform": 3, "data-ingestion-and-loading": 9, "data-transformation-and-modeling": 10,
    "working-with-lakeflow-jobs": 7, "implementing-cicd": 5, "troubleshooting-monitoring-and-optimization": 4,
    "governance-and-security": 7,
  };
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 16, 35]; // dias por "caixa" da repetição espaçada
  const TARGET = 0.7;
  const DIFF_PT = { easy: "Fácil", medium: "Média", hard: "Difícil" };

  // ======================================================================
  // Estado persistente
  // ======================================================================
  const STORE_KEY = "dea-ptbr-v1";
  const SESSION_KEY = "dea-ptbr-session";
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* armazenamento indisponível */ }
  }
  const S = Object.assign({ q: {}, read: {}, exams: [], days: {}, created: Date.now() }, load(STORE_KEY, {}));
  let session = load(SESSION_KEY, null);
  const persist = () => save(STORE_KEY, S);
  const persistSession = () => save(SESSION_KEY, session);

  // ======================================================================
  // Utilidades
  // ======================================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = MD.esc;
  const pct = x => (x == null || isNaN(x)) ? "—" : Math.round(x * 100) + "%";
  const now = () => Date.now();
  const todayKey = (t) => { const d = new Date(t || now()); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function fmtDate(t) { return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
  function fmtDateTime(t) { return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function fmtDur(ms) { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); }
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); }
  function barClass(acc) { return acc == null ? "" : acc >= TARGET ? "ok" : acc >= 0.5 ? "warn" : "bad"; }
  function domainName(id) { return DOMAIN[id] ? DOMAIN[id].namePt : id; }
  function cleanTitle(t) { return String(t || "").replace(/\s*\*?\(2026 blueprint\)\*?/i, "").trim(); }
  function isBlueprint(q) { return /2026 blueprint/i.test(q.title || ""); }
  function domainShort(id) { const d = DOMAIN[id]; return d ? d.folder.slice(0, 2) + " · " + d.namePt : id; }

  // ======================================================================
  // Motor de aprendizado
  // ======================================================================
  function qs(id) { return S.q[id]; }
  function attempts(id) { return (S.q[id] && S.q[id].att) || []; }
  function lastAttempt(id) { const a = attempts(id); return a[a.length - 1]; }
  function wrongCount(id) { return attempts(id).filter(a => !a.ok).length; }

  /** status: nova | errada | aprendendo | dominada */
  function status(id) {
    const st = S.q[id];
    if (!st || !st.att.length) return "nova";
    const last = st.att[st.att.length - 1];
    if (!last.ok) return "errada";
    if (st.box >= 3) return "dominada";
    return "aprendendo";
  }
  /** Pontuação de domínio de uma questão (0..1) baseada na última tentativa */
  function mastery(id) {
    const last = lastAttempt(id);
    if (!last) return null;
    if (!last.ok) return 0;
    return last.conf === "chute" ? 0.5 : 1;
  }
  function isDue(id, t) {
    const st = S.q[id];
    return !!(st && st.att.length && st.due <= (t || now()));
  }

  function recordAttempt(id, chosen, conf, mode) {
    const q = Q[id]; if (!q) return null;
    const ok = chosen === q.answer;
    const st = S.q[id] || (S.q[id] = { att: [], box: 0, due: 0, flag: false, note: "" });
    st.att.push({ t: now(), c: chosen, ok, conf: conf || "certeza", m: mode });
    if (st.att.length > 30) st.att = st.att.slice(-30);
    if (ok && conf !== "chute") { st.box = Math.min((st.box || 0) + 1, 5); st.due = now() + INTERVALS[st.box] * DAY; }
    else if (ok) { st.box = Math.min(st.box || 0, 1) || 1; st.due = now() + DAY; }
    else { st.box = 0; st.due = now() + 10 * 60000; }
    const k = todayKey();
    S.days[k] = S.days[k] || { n: 0, ok: 0 };
    S.days[k].n++; if (ok) S.days[k].ok++;
    persist();
    return ok;
  }

  function streak() {
    let n = 0; let t = now();
    if (!S.days[todayKey(t)]) t -= DAY; // ainda pode estudar hoje sem quebrar a sequência
    while (S.days[todayKey(t)]) { n++; t -= DAY; }
    return n;
  }

  function statsFor(ids) {
    let answered = 0, sum = 0, attemptsN = 0, okN = 0;
    for (const id of ids) {
      const m = mastery(id);
      if (m != null) { answered++; sum += m; }
      for (const a of attempts(id)) { attemptsN++; if (a.ok) okN++; }
    }
    return { total: ids.length, answered, acc: answered ? sum / answered : null, coverage: ids.length ? answered / ids.length : 0, attemptsN, rawAcc: attemptsN ? okN / attemptsN : null };
  }
  const idsByDomain = d => QUESTIONS.filter(q => q.domain === d).map(q => q.id);
  const idsByLesson = l => QUESTIONS.filter(q => q.lesson === l || q.related === l).map(q => q.id);

  function domainStats() {
    return DOMAINS.map(d => Object.assign({ domain: d }, statsFor(idsByDomain(d.id))));
  }

  /** Estimativa ponderada pelos pesos oficiais da prova */
  function readiness() {
    const ds = domainStats();
    let w = 0, s = 0, conf = 0;
    for (const x of ds) {
      if (x.acc == null) continue;
      w += x.domain.weight; s += x.domain.weight * x.acc;
      conf += x.domain.weight * Math.min(1, x.answered / 10);
    }
    return { estimate: w ? s / w : null, confidence: conf / 100, coveredWeight: w };
  }

  function weakDomains() {
    return domainStats()
      .filter(x => x.answered >= 3 && x.acc < TARGET)
      .map(x => Object.assign(x, { impact: x.domain.weight * (TARGET - x.acc) }))
      .sort((a, b) => b.impact - a.impact);
  }

  function weakLessons() {
    const map = {};
    for (const q of QUESTIONS) {
      const s = status(q.id);
      if (s === "nova") continue;
      const m = map[q.lesson] || (map[q.lesson] = { lesson: q.lesson, wrong: 0, answered: 0, sum: 0 });
      m.answered++; m.sum += mastery(q.id) || 0;
      if (s === "errada") m.wrong++;
    }
    return Object.values(map)
      .map(m => Object.assign(m, { acc: m.sum / m.answered }))
      .filter(m => m.wrong >= 1 && m.acc < 0.75)
      .sort((a, b) => (b.wrong - a.wrong) || (a.acc - b.acc));
  }

  function dueIds() { const t = now(); return QUESTIONS.filter(q => isDue(q.id, t)).map(q => q.id); }
  function pendingErrorIds() { return QUESTIONS.filter(q => status(q.id) === "errada").map(q => q.id); }
  function recoveredIds() { return QUESTIONS.filter(q => wrongCount(q.id) > 0 && status(q.id) !== "errada").map(q => q.id); }

  /** Lista de revisão inteligente: erradas vencidas primeiro, depois vencidas por caixa,
   *  depois questões de domínios fracos ainda não dominadas. */
  function smartReviewIds(limit) {
    const t = now();
    const due = QUESTIONS.filter(q => isDue(q.id, t));
    const weakSet = new Set(weakDomains().map(w => w.domain.id));
    due.sort((a, b) => {
      const sa = status(a.id) === "errada" ? 0 : 1, sb = status(b.id) === "errada" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const wa = weakSet.has(a.domain) ? 0 : 1, wb = weakSet.has(b.domain) ? 0 : 1;
      if (wa !== wb) return wa - wb;
      return (S.q[a.id].box - S.q[b.id].box) || (S.q[a.id].due - S.q[b.id].due);
    });
    let ids = due.map(q => q.id);
    if (ids.length < limit && weakSet.size) {
      const extra = shuffle(QUESTIONS.filter(q => weakSet.has(q.domain) && !ids.includes(q.id) && status(q.id) !== "dominada")).map(q => q.id);
      ids = ids.concat(extra);
    }
    return ids.slice(0, limit);
  }

  function nextStep() {
    const due = dueIds().length;
    const pend = pendingErrorIds().length;
    const weak = weakDomains();
    const answered = QUESTIONS.filter(q => status(q.id) !== "nova").length;
    if (!answered) return { title: "Comece pelo diagnóstico", text: "Faça 20 questões variadas para o painel descobrir seus pontos fortes e fracos.", action: "Fazer diagnóstico (20)", go: () => startPractice({ ids: diagnosticIds(20), mode: "pratica", label: "Diagnóstico inicial" }) };
    if (due >= 5 || (due && pend)) return { title: `Você tem ${due} revisões para hoje`, text: "A revisão espaçada traz de volta as questões no momento certo — principalmente as que você errou.", action: "Fazer revisão agora", go: () => startPractice({ ids: smartReviewIds(25), mode: "revisao", label: "Revisão inteligente" }) };
    if (weak.length) {
      const w = weak[0]; const lessons = weakLessons().filter(l => (LESSON[l.lesson] || {}).domain === w.domain.id);
      return { title: `Ponto fraco: ${w.domain.namePt} (${pct(w.acc)})`, text: lessons.length ? `Releia a aula “${(LESSON[lessons[0].lesson] || {}).title}” e depois pratique este domínio.` : "Reestude as aulas deste domínio e pratique novamente.", action: "Praticar este domínio", go: () => startPractice({ ids: pickIds({ domains: [w.domain.id], statuses: ["nova", "errada", "aprendendo"], count: 15 }), mode: "pratica", label: "Foco: " + w.domain.namePt }), secondary: lessons.length ? { label: "Abrir a aula", href: "#/aula/" + encodeURIComponent(lessons[0].lesson) } : null };
    }
    const cov = domainStats().filter(x => x.coverage < 0.9).sort((a, b) => b.domain.weight * (1 - b.coverage) - a.domain.weight * (1 - a.coverage));
    if (cov.length) return { title: `Avance em ${cov[0].domain.namePt}`, text: `Você viu ${pct(cov[0].coverage)} das questões deste domínio, que vale ${cov[0].domain.weight}% da prova.`, action: "Praticar questões novas", go: () => startPractice({ ids: pickIds({ domains: [cov[0].domain.id], statuses: ["nova"], count: 15 }), mode: "pratica", label: "Novas: " + cov[0].domain.namePt }) };
    return { title: "Hora do simulado", text: "Você cobriu o banco de questões. Teste-se em condições reais: 45 questões em 90 minutos.", action: "Ir para simulados", go: () => { location.hash = "#/simulados"; } };
  }

  function diagnosticIds(n) {
    const out = [];
    for (const d of DOMAINS) {
      const k = Math.max(1, Math.round(n * d.weight / 100));
      out.push(...shuffle(idsByDomain(d.id).filter(id => Q[id].bank === "praticas")).slice(0, k));
    }
    if (out.length < n) out.push(...shuffle(QUESTIONS.filter(q => q.bank === "praticas" && !out.includes(q.id)).map(q => q.id)).slice(0, n - out.length));
    return shuffle(out).slice(0, n);
  }

  function pickIds(f) {
    let pool = QUESTIONS;
    if (f.banks && f.banks.length) pool = pool.filter(q => f.banks.includes(q.bank));
    if (f.domains && f.domains.length) pool = pool.filter(q => f.domains.includes(q.domain));
    if (f.difficulties && f.difficulties.length) pool = pool.filter(q => f.difficulties.includes(q.difficulty));
    if (f.statuses && f.statuses.length) pool = pool.filter(q => f.statuses.includes(status(q.id)) || (f.statuses.includes("marcada") && S.q[q.id] && S.q[q.id].flag));
    if (f.lesson) pool = pool.filter(q => q.lesson === f.lesson || q.related === f.lesson);
    let ids = pool.map(q => q.id);
    ids = f.order === "seq" ? ids : shuffle(ids);
    return f.count ? ids.slice(0, f.count) : ids;
  }

  function examIds(kind) {
    if (kind === "simulado-1" || kind === "simulado-2") return QUESTIONS.filter(q => q.bank === kind).map(q => q.id);
    // Aleatório ponderado: prioriza não dominadas
    const out = [];
    for (const [d, k] of Object.entries(EXAM_DIST)) {
      const pool = idsByDomain(d);
      const pri = shuffle(pool.filter(id => status(id) !== "dominada"));
      const rest = shuffle(pool.filter(id => status(id) === "dominada"));
      out.push(...pri.concat(rest).slice(0, k));
    }
    return shuffle(out);
  }

  // ======================================================================
  // Sessões (prática / revisão / simulado)
  // ======================================================================
  function startPractice(opts) {
    if (!opts.ids || !opts.ids.length) { toast("Nenhuma questão encontrada com esses filtros."); return; }
    session = { kind: "practice", mode: opts.mode || "pratica", label: opts.label || "Prática", ids: opts.ids, idx: 0, answers: {}, started: now() };
    persistSession();
    location.hash = "#/sessao";
    if (location.hash === "#/sessao") route();
  }
  function startExam(kind) {
    const ids = examIds(kind);
    const label = kind === "simulado-1" ? "Simulado 1" : kind === "simulado-2" ? "Simulado 2" : "Simulado aleatório ponderado";
    session = { kind: "exam", bank: kind, label, ids, idx: 0, answers: {}, flags: {}, started: now(), limit: 90 * 60000 };
    persistSession();
    location.hash = "#/sessao";
    if (location.hash === "#/sessao") route();
  }

  // ======================================================================
  // Roteamento
  // ======================================================================
  const main = () => $("#main");
  let timerHandle = null;

  function route() {
    clearInterval(timerHandle); timerHandle = null;
    $("#topbar-timer").hidden = true;
    const h = location.hash.replace(/^#\/?/, "");
    const [name, ...rest] = h.split("/");
    const arg = decodeURIComponent(rest.join("/"));
    const r = name || "painel";
    $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === r || (r === "aula" && a.dataset.route === "estudar") || (r === "sessao" && session && a.dataset.route === (session.kind === "exam" ? "simulados" : session.mode === "revisao" ? "revisao" : session.mode === "erros" ? "erros" : "praticar")) || (r === "resultado" && a.dataset.route === "simulados")));
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    const views = { painel: viewDashboard, estudar: viewStudy, aula: () => viewLesson(arg), praticar: viewPracticeSetup, revisao: viewReview, erros: viewErrors, simulados: viewExams, sessao: viewSession, resultado: () => viewExamResult(arg), estatisticas: viewStats, config: viewConfig, questao: () => viewSingleQuestion(arg) };
    (views[r] || viewDashboard)();
    updateBadges();
    if (r !== "aula") window.scrollTo(0, 0);
    main().focus({ preventScroll: true });
  }

  function updateBadges() {
    const due = dueIds().length, err = pendingErrorIds().length;
    const bd = $("#badge-due"), be = $("#badge-errors");
    bd.hidden = !due; bd.textContent = due;
    be.hidden = !err; be.textContent = err;
  }

  // ======================================================================
  // Views
  // ======================================================================
  function kpi(label, value, sub) {
    return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  }

  function domainRows(ds, opts) {
    opts = opts || {};
    return ds.map(x => `
      <div class="domain-row">
        <div class="name">${esc(x.domain.namePt)}<small>${x.domain.weight}% da prova · ${x.answered}/${x.total} vistas</small></div>
        <div class="bars">
          <div class="bar" title="Acerto: ${pct(x.acc)}"><i class="${barClass(x.acc)}" style="width:${Math.round((x.acc || 0) * 100)}%"></i><span class="target"></span></div>
          <div class="bar" style="height:5px;margin-top:5px" title="Cobertura: ${pct(x.coverage)}"><i style="width:${Math.round(x.coverage * 100)}%;opacity:.45"></i></div>
        </div>
        <div class="pct">${pct(x.acc)}</div>
      </div>`).join("") + (opts.legend !== false ? `<p class="small muted" style="margin-bottom:0">Barra grossa = acerto (linha marca a meta de 70%). Barra fina = quanto do banco você já viu.</p>` : "");
  }

  function viewDashboard() {
    const total = QUESTIONS.length;
    const answered = QUESTIONS.filter(q => status(q.id) !== "nova").length;
    const mastered = QUESTIONS.filter(q => status(q.id) === "dominada").length;
    const r = readiness();
    const ns = nextStep();
    const weak = weakDomains();
    const wl = weakLessons().slice(0, 5);
    const lastExams = S.exams.slice(-3).reverse();
    const readLessons = LESSONS.filter(l => l.group === "dominio" && !l.isIndex);
    const readCount = readLessons.filter(l => S.read[l.id]).length;

    main().innerHTML = `
      <div class="page-head"><div><h1>Painel</h1><p>Databricks Certified Data Engineer Associate · blueprint de agosto de 2026</p></div></div>
      <div class="card next-step">
        <div class="small muted">Próximo passo recomendado</div>
        <div class="title">${esc(ns.title)}</div>
        <p>${esc(ns.text)}</p>
        <div class="btn-row"><button class="btn" id="ns-go">${esc(ns.action)}</button>${ns.secondary ? `<a class="btn secondary" href="${ns.secondary.href}">${esc(ns.secondary.label)}</a>` : ""}</div>
      </div>
      <div class="grid kpis section">
        ${kpi("Estimativa de acerto na prova", pct(r.estimate), r.estimate == null ? "responda questões para calcular" : r.confidence < 0.6 ? "baixa confiança: pratique mais domínios" : "ponderada pelos pesos oficiais")}
        ${kpi("Questões vistas", `${answered}<span class="muted" style="font-size:16px">/${total}</span>`, `${mastered} dominadas`)}
        ${kpi("Revisões para hoje", dueIds().length, "repetição espaçada")}
        ${kpi("Caderno de erros", pendingErrorIds().length, `${recoveredIds().length} já recuperadas`)}
        ${kpi("Aulas lidas", `${readCount}<span class="muted" style="font-size:16px">/${readLessons.length}</span>`, "conteúdo em PT-BR")}
        ${kpi("Sequência", `${streak()} 🔥`, "dias seguidos estudando")}
      </div>
      <div class="grid cols-2 section">
        <div class="card"><h2>Desempenho por domínio</h2>${domainRows(domainStats())}</div>
        <div class="card">
          <h2>Pontos fracos</h2>
          ${weak.length ? `<div class="list">${weak.map(w => `
            <div class="list-item">
              <div class="grow"><div class="title">${esc(w.domain.namePt)}</div><small>Acerto ${pct(w.acc)} · peso ${w.domain.weight}% · impacto na nota ≈ ${(w.impact).toFixed(1)} pts</small></div>
              <button class="btn small" data-practice-domain="${w.domain.id}">Praticar</button>
            </div>`).join("")}</div>` : `<div class="empty"><div class="big">🎯</div>${answered < 10 ? "Responda pelo menos 3 questões por domínio para identificar pontos fracos." : "Nenhum domínio abaixo de 70%. Continue revisando!"}</div>`}
          ${wl.length ? `<h3 style="margin-top:18px">Aulas para reestudar</h3><div class="list">${wl.map(l => `
            <a class="list-item" href="#/aula/${encodeURIComponent(l.lesson)}">
              <div class="grow"><div class="title">${esc((LESSON[l.lesson] || {}).title || l.lesson)}</div><small>${l.wrong} questão(ões) errada(s) pendente(s) · acerto ${pct(l.acc)}</small></div><span>📖</span>
            </a>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="section card">
        <h2>Últimos simulados</h2>
        ${lastExams.length ? `<div class="list">${lastExams.map(examListItem).join("")}</div>` : `<div class="empty">Nenhum simulado feito ainda. <a href="#/simulados">Fazer o primeiro</a>.</div>`}
      </div>`;
    $("#ns-go").onclick = ns.go;
    $$("[data-practice-domain]").forEach(b => b.onclick = () => {
      const d = b.dataset.practiceDomain;
      startPractice({ ids: pickIds({ domains: [d], statuses: ["errada", "nova", "aprendendo"], count: 15 }), mode: "pratica", label: "Foco: " + domainName(d) });
    });
  }

  function examListItem(e) {
    const p = e.correct / e.total;
    return `<a class="list-item" href="#/resultado/${e.id}">
      <div class="grow"><div class="title">${esc(e.label)}</div><small>${fmtDateTime(e.end)} · ${fmtDur(e.end - e.start)}</small></div>
      <span class="pill ${p >= 0.8 ? "ok" : p >= TARGET ? "info" : "bad"}">${e.correct}/${e.total} · ${pct(p)}</span>
    </a>`;
  }

  // ---------- Estudar ----------
  function viewStudy() {
    const extras = LESSONS.filter(l => l.group !== "dominio");
    main().innerHTML = `
      <div class="page-head"><div><h1>Estudar</h1><p>Conteúdo completo em português, organizado pelos 7 domínios oficiais. Leia na ordem e marque as aulas lidas.</p></div></div>
      <div class="grid cols-3">${extras.map(l => `<a class="list-item" href="#/aula/${encodeURIComponent(l.id)}"><div class="grow"><div class="title">${esc(l.title)}</div><small>${l.id === "README" ? "Visão geral da prova" : "Recurso"}</small></div><span>${l.id === "README" ? "🧭" : "📎"}</span></a>`).join("")}</div>
      ${DOMAINS.map(d => {
        const ls = LESSONS.filter(l => l.domain === d.id).sort((a, b) => a.order - b.order);
        const st = statsFor(idsByDomain(d.id));
        return `<div class="section card">
          <div class="page-head" style="margin-bottom:8px"><div><h2 style="margin:0">${d.folder.slice(0, 2)} — ${esc(d.namePt)}</h2><p>${esc(d.name)} · <strong>${d.weight}%</strong> da prova</p></div>
          <div class="inline-flex"><span class="pill ${barClass(st.acc) === "ok" ? "ok" : st.acc == null ? "" : barClass(st.acc) === "warn" ? "warn" : "bad"}">Acerto ${pct(st.acc)}</span><button class="btn small secondary" data-pd="${d.id}">Praticar domínio</button></div></div>
          <div class="list">${ls.map(l => {
            const qids = idsByLesson(l.id); const ls2 = statsFor(qids);
            return `<a class="list-item" href="#/aula/${encodeURIComponent(l.id)}">
              <span>${S.read[l.id] ? "✅" : l.isIndex ? "🧭" : "📄"}</span>
              <div class="grow"><div class="title">${esc(l.title)}</div><small>${l.isIndex ? "Visão geral do domínio" : `${qids.length} questões relacionadas${ls2.answered ? " · acerto " + pct(ls2.acc) : ""}`}</small></div>
            </a>`;
          }).join("")}</div></div>`;
      }).join("")}`;
    $$("[data-pd]").forEach(b => b.onclick = () => startPractice({ ids: pickIds({ domains: [b.dataset.pd], count: 15 }), label: "Domínio: " + domainName(b.dataset.pd) }));
  }

  function resolveLessonLink(fromId, href) {
    if (/^(https?:|mailto:)/i.test(href)) return null;
    const [pathPart, anchor] = href.split("#");
    if (!pathPart) return null;
    const baseParts = fromId.includes("/") ? ["conteudo", ...fromId.split("/").slice(0, -1)] : ["conteudo"];
    const parts = baseParts.slice();
    for (const seg of pathPart.split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") parts.pop(); else parts.push(seg);
    }
    const full = parts.join("/");
    if (full.startsWith("conteudo/")) {
      const id = full.slice(9).replace(/\.md$/, "");
      if (LESSON[id]) return "#/aula/" + encodeURIComponent(id) + (anchor ? "?a=" + anchor : "");
    }
    if (full.startsWith("questoes")) return "#/praticar";
    if (full.startsWith("site")) return "#/";
    return "https://github.com/kengio/databricks-certification-study-guide";
  }

  let mermaidLoading = null;
  function renderMermaid(root) {
    const blocks = $$("pre.mermaid", root);
    if (!blocks.length) return;
    const go = () => {
      try {
        const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
        window.mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
        window.mermaid.run({ nodes: blocks }).catch(() => {});
      } catch (e) { /* mantém o código visível */ }
    };
    if (window.mermaid) return go();
    if (!mermaidLoading) {
      mermaidLoading = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
    }
    mermaidLoading.then(go).catch(() => {});
  }

  function viewLesson(argRaw) {
    const [id, query] = argRaw.split("?a=");
    const l = LESSON[id];
    if (!l) { main().innerHTML = `<div class="empty"><div class="big">🤷</div>Aula não encontrada. <a href="#/estudar">Voltar</a></div>`; return; }
    const html = MD.render(l.md, { resolveLink: href => resolveLessonLink(id, href) });
    const qids = idsByLesson(id);
    const sameDomain = LESSONS.filter(x => x.domain === l.domain && l.domain).sort((a, b) => a.order - b.order);
    const pos = sameDomain.findIndex(x => x.id === id);
    const prev = pos > 0 ? sameDomain[pos - 1] : null, next = pos >= 0 && pos < sameDomain.length - 1 ? sameDomain[pos + 1] : null;
    const st = statsFor(qids);
    main().innerHTML = `
      <div class="lesson-actions">
        <a class="btn ghost small" href="#/estudar">← Estudar</a>
        ${l.domain ? `<span class="pill accent">${esc(domainShort(l.domain))}</span>` : ""}
        <span style="flex:1"></span>
        ${l.group === "dominio" ? `<button class="btn small ${S.read[id] ? "secondary" : ""}" id="mark-read">${S.read[id] ? "✅ Lida" : "Marcar como lida"}</button>` : ""}
        ${qids.length ? `<button class="btn small secondary" id="practice-lesson">🎯 Praticar ${qids.length} questões${st.answered ? " · " + pct(st.acc) : ""}</button>` : ""}
      </div>
      <div class="lesson-layout">
        <article class="prose" id="lesson-body">${html}</article>
        <nav class="toc" aria-label="Nesta página"><div class="small muted" style="margin-bottom:6px;font-weight:600">Nesta página</div>${
          $$("h2, h3", Object.assign(document.createElement("div"), { innerHTML: html })).map(h => `<a class="${h.tagName === "H3" ? "lvl3" : ""}" href="javascript:void(0)" data-anchor="${h.id}">${h.textContent}</a>`).join("")
        }</nav>
      </div>
      <div class="lesson-foot">
        ${prev ? `<a class="btn ghost" href="#/aula/${encodeURIComponent(prev.id)}">← ${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a class="btn ghost" href="#/aula/${encodeURIComponent(next.id)}">${esc(next.title)} →</a>` : ""}
      </div>`;
    const body = $("#lesson-body");
    renderMermaid(body);
    $$("[data-anchor]").forEach(a => a.onclick = (ev) => { ev.preventDefault(); const t = document.getElementById(a.dataset.anchor); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    const mr = $("#mark-read");
    if (mr) mr.onclick = () => { if (S.read[id]) delete S.read[id]; else S.read[id] = now(); persist(); viewLesson(argRaw); toast(S.read[id] ? "Aula marcada como lida" : "Marcação removida"); };
    const pl = $("#practice-lesson");
    if (pl) pl.onclick = () => startPractice({ ids: shuffle(qids), label: "Aula: " + l.title });
    if (query) { const t = document.getElementById(query); if (t) setTimeout(() => t.scrollIntoView({ block: "start" }), 50); }
    else window.scrollTo(0, 0);
  }

  // ---------- Praticar ----------
  function chip(name, value, label, checked, type) {
    return `<label class="chip"><input type="${type || "checkbox"}" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}><span>${label}</span></label>`;
  }
  function viewPracticeSetup() {
    const last = load("dea-ptbr-filters", {});
    const has = (k, v, def) => last[k] ? last[k].includes(v) : def;
    main().innerHTML = `
      <div class="page-head"><div><h1>Praticar</h1><p>Monte uma sessão com correção imediata e explicação. As questões estão em inglês, como na prova.</p></div></div>
      <div class="grid cols-3">
        <button class="card list-item" id="quick-diag" style="cursor:pointer;text-align:left"><div class="grow"><div class="title">🧪 Diagnóstico (20)</div><small>Mistura proporcional aos pesos da prova</small></div></button>
        <button class="card list-item" id="quick-new" style="cursor:pointer;text-align:left"><div class="grow"><div class="title">✨ 15 questões novas</div><small>Só questões que você nunca viu</small></div></button>
        <button class="card list-item" id="quick-weak" style="cursor:pointer;text-align:left"><div class="grow"><div class="title">🎯 Foco nos pontos fracos</div><small>Domínios abaixo de 70%</small></div></button>
      </div>
      <form class="card section" id="practice-form">
        <h2>Sessão personalizada</h2>
        <fieldset><legend>Banco</legend><div class="chips">
          ${QD.banks.map(b => chip("bank", b.id, `${esc(b.label)} <span class="muted">(${b.count})</span>`, has("bank", b.id, b.id === "praticas"))).join("")}
        </div></fieldset>
        <fieldset><legend>Domínios</legend><div class="chips">
          ${DOMAINS.map(d => chip("domain", d.id, `${d.folder.slice(0, 2)} · ${esc(d.namePt)} <span class="muted">${d.weight}%</span>`, has("domain", d.id, true))).join("")}
        </div></fieldset>
        <fieldset><legend>Situação da questão</legend><div class="chips">
          ${[["nova", "Nunca vistas"], ["errada", "Errei por último"], ["aprendendo", "Aprendendo"], ["dominada", "Dominadas"], ["marcada", "⭐ Marcadas"]].map(([v, l]) => chip("status", v, l, has("status", v, v !== "dominada" && v !== "marcada"))).join("")}
        </div></fieldset>
        <fieldset><legend>Dificuldade</legend><div class="chips">
          ${["easy", "medium", "hard"].map(v => chip("diff", v, DIFF_PT[v], has("diff", v, true))).join("")}
        </div></fieldset>
        <div class="btn-row">
          <label>Quantidade <select name="count">${[10, 15, 20, 30, 45, 0].map(n => `<option value="${n}" ${String(last.count || 15) === String(n) ? "selected" : ""}>${n || "Todas"}</option>`).join("")}</select></label>
          <span class="muted small" id="pool-count"></span>
          <span style="flex:1"></span>
          <button class="btn" type="submit">Começar</button>
        </div>
      </form>`;
    const form = $("#practice-form");
    const read = () => ({
      banks: $$('input[name="bank"]:checked', form).map(i => i.value),
      domains: $$('input[name="domain"]:checked', form).map(i => i.value),
      statuses: $$('input[name="status"]:checked', form).map(i => i.value),
      difficulties: $$('input[name="diff"]:checked', form).map(i => i.value),
      count: +form.count.value,
    });
    const upd = () => { const f = read(); const n = pickIds(Object.assign({}, f, { count: 0 })).length; $("#pool-count").textContent = `${n} questões disponíveis com esses filtros`; };
    form.addEventListener("change", upd); upd();
    form.onsubmit = (e) => {
      e.preventDefault(); const f = read();
      save("dea-ptbr-filters", { bank: f.banks, domain: f.domains, status: f.statuses, diff: f.difficulties, count: f.count });
      startPractice({ ids: pickIds(f), mode: "pratica", label: "Prática personalizada" });
    };
    $("#quick-diag").onclick = () => startPractice({ ids: diagnosticIds(20), label: "Diagnóstico" });
    $("#quick-new").onclick = () => startPractice({ ids: pickIds({ statuses: ["nova"], count: 15 }), label: "Questões novas" });
    $("#quick-weak").onclick = () => {
      const w = weakDomains().map(x => x.domain.id);
      if (!w.length) { toast("Ainda não há pontos fracos identificados — faça o diagnóstico."); return; }
      startPractice({ ids: pickIds({ domains: w, statuses: ["nova", "errada", "aprendendo"], count: 20 }), label: "Pontos fracos" });
    };
  }

  // ---------- Revisão inteligente ----------
  function viewReview() {
    const due = dueIds();
    const errs = due.filter(id => status(id) === "errada").length;
    const upcoming = QUESTIONS.filter(q => S.q[q.id] && S.q[q.id].att.length && !isDue(q.id)).map(q => S.q[q.id].due).sort((a, b) => a - b);
    const boxes = [0, 1, 2, 3, 4, 5].map(b => QUESTIONS.filter(q => S.q[q.id] && S.q[q.id].att.length && S.q[q.id].box === b).length);
    main().innerHTML = `
      <div class="page-head"><div><h1>Revisão inteligente</h1><p>Repetição espaçada: cada acerto com certeza empurra a questão para mais longe (1, 3, 7, 16, 35 dias). Errou? Ela volta hoje. Acertou no chute? Volta amanhã.</p></div></div>
      <div class="grid kpis">
        ${kpi("Para revisar agora", due.length, errs ? `${errs} erradas` : "")}
        ${kpi("Próxima revisão", upcoming.length ? fmtDateTime(upcoming[0]) : "—", "")}
        ${kpi("Dominadas (caixa 3+)", boxes[3] + boxes[4] + boxes[5], "")}
      </div>
      <div class="card section">
        <h2>Fila de revisão</h2>
        ${due.length ? `<p>A ordem prioriza: questões que você errou → domínios fracos → caixas mais baixas.</p>
          <div class="btn-row"><button class="btn" id="rev-go">Revisar ${Math.min(due.length, 25)} agora</button>${due.length > 25 ? `<button class="btn secondary" id="rev-all">Revisar todas (${due.length})</button>` : ""}</div>`
        : `<div class="empty"><div class="big">🌿</div>Nada para revisar agora. ${weakDomains().length ? `<br><button class="btn secondary" id="rev-weak" style="margin-top:12px">Praticar pontos fracos mesmo assim</button>` : "Volte mais tarde ou pratique questões novas."}</div>`}
      </div>
      <div class="card section">
        <h2>Caixas da repetição espaçada</h2>
        ${boxes.map((n, b) => `<div class="domain-row"><div class="name">Caixa ${b}<small>${b === 0 ? "errada / reaprender" : `revisa em ${INTERVALS[b]} dia(s)`}</small></div><div class="bars"><div class="bar"><i class="${b === 0 ? "bad" : b >= 3 ? "ok" : "warn"}" style="width:${Math.round(100 * n / Math.max(1, Math.max(...boxes)))}%"></i></div></div><div class="pct">${n}</div></div>`).join("")}
      </div>`;
    const go = $("#rev-go"); if (go) go.onclick = () => startPractice({ ids: smartReviewIds(25), mode: "revisao", label: "Revisão inteligente" });
    const all = $("#rev-all"); if (all) all.onclick = () => startPractice({ ids: smartReviewIds(9999), mode: "revisao", label: "Revisão completa" });
    const wk = $("#rev-weak"); if (wk) wk.onclick = () => startPractice({ ids: smartReviewIds(20), mode: "revisao", label: "Revisão: pontos fracos" });
  }

  // ---------- Caderno de erros ----------
  let errorsTab = "pendentes";
  function viewErrors() {
    const pend = pendingErrorIds().sort((a, b) => wrongCount(b) - wrongCount(a));
    const rec = recoveredIds().sort((a, b) => wrongCount(b) - wrongCount(a));
    const list = errorsTab === "pendentes" ? pend : rec;
    const byDomain = {};
    for (const id of pend) byDomain[Q[id].domain] = (byDomain[Q[id].domain] || 0) + 1;
    main().innerHTML = `
      <div class="page-head"><div><h1>Caderno de erros</h1><p>Toda questão errada vem para cá com a explicação. Refaça até acertar — ela só sai dos pendentes quando você acertar.</p></div>
        <div class="btn-row">${pend.length ? `<button class="btn" id="err-retry">Refazer pendentes (${pend.length})</button>` : ""}</div></div>
      ${pend.length ? `<div class="card"><h3>Erros pendentes por domínio</h3><div class="chips">${Object.entries(byDomain).sort((a, b) => b[1] - a[1]).map(([d, n]) => `<button class="btn small ghost" data-err-domain="${d}">${esc(domainName(d))} · ${n}</button>`).join("")}</div></div>` : ""}
      <div class="section">
        <div class="tabs"><button data-tab="pendentes" class="${errorsTab === "pendentes" ? "active" : ""}">Pendentes (${pend.length})</button><button data-tab="recuperadas" class="${errorsTab === "recuperadas" ? "active" : ""}">Recuperadas (${rec.length})</button></div>
        ${list.length ? list.map(id => reviewItem(id, null, true)).join("") : `<div class="empty card"><div class="big">${errorsTab === "pendentes" ? "🎉" : "📭"}</div>${errorsTab === "pendentes" ? "Nenhum erro pendente." : "Nenhuma questão recuperada ainda."}</div>`}
      </div>`;
    $$("[data-tab]").forEach(b => b.onclick = () => { errorsTab = b.dataset.tab; viewErrors(); });
    const rt = $("#err-retry"); if (rt) rt.onclick = () => startPractice({ ids: shuffle(pend), mode: "erros", label: "Caderno de erros" });
    $$("[data-err-domain]").forEach(b => b.onclick = () => startPractice({ ids: shuffle(pend.filter(id => Q[id].domain === b.dataset.errDomain)), mode: "erros", label: "Erros: " + domainName(b.dataset.errDomain) }));
    bindReviewItems();
  }

  function reviewItem(id, chosen, showHistory) {
    const q = Q[id]; const att = attempts(id); const wc = wrongCount(id);
    const lastWrong = [...att].reverse().find(a => !a.ok);
    const ch = chosen != null ? chosen : (lastWrong ? lastWrong.c : null);
    const ok = chosen != null ? chosen === q.answer : null;
    return `<details class="review" data-qid="${id}">
      <summary>
        <span class="pill ${ok === true ? "ok" : ok === false || (ok === null && status(id) === "errada") ? "bad" : "ok"}">${ok === true ? "✔" : ok === false ? "✘" : status(id) === "errada" ? "✘" : "✔"}</span>
        <span class="grow" style="flex:1;min-width:0"><strong>${esc(cleanTitle(q.title))}</strong><br><small class="muted">${esc(domainShort(q.domain))}${showHistory && wc ? ` · errou ${wc}x` : ""}</small></span>
        ${S.q[id] && S.q[id].flag ? "⭐" : ""}
      </summary>
      <div class="body">${questionReviewBody(q, ch)}</div>
    </details>`;
  }

  function questionReviewBody(q, chosen) {
    return `<div class="q-text">${MD.render(q.question)}</div>
      <div class="choices">${Object.entries(q.choices).map(([k, v]) => `
        <div class="choice ${k === q.answer ? "correct" : k === chosen ? "wrong" : ""}" style="cursor:default"><span class="letter">${k}</span><span class="ctext">${MD.inline(v)}</span></div>`).join("")}</div>
      ${explainBlock(q, chosen)}`;
  }

  function translateUrl(q) {
    const text = [q.question, ...Object.entries(q.choices).map(([k, v]) => `${k}) ${v}`), "", "Answer: " + q.answer, q.short, q.explanation].join("\n");
    return "https://translate.google.com/?sl=en&tl=pt&op=translate&text=" + encodeURIComponent(text.slice(0, 4800));
  }

  function explainBlock(q, chosen) {
    const lesson = LESSON[q.lesson]; const related = q.related && LESSON[q.related];
    const att = attempts(q.id);
    const wc = att.filter(a => !a.ok).length;
    const pickedBefore = att.filter(a => !a.ok).map(a => a.c);
    const common = pickedBefore.length ? Object.entries(pickedBefore.reduce((m, c) => (m[c] = (m[c] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0] : null;
    const note = (S.q[q.id] && S.q[q.id].note) || "";
    return `<div class="explain-wrap">
      <div class="feedback ${chosen == null ? "" : chosen === q.answer ? "ok" : "bad"}">
        <div class="verdict">Resposta correta: ${q.answer}</div>
        <div class="explain">${MD.render(q.short || "")}${q.explanation ? MD.render(q.explanation) : ""}</div>
        ${att.length ? `<div class="history-line">Histórico: ${att.length} tentativa(s), ${wc} erro(s)${common ? ` · alternativa errada que você mais escolhe: <strong>${common[0]}</strong>` : ""}.</div>` : ""}
        <div class="btn-row" style="margin-top:12px">
          ${lesson ? `<a class="btn small secondary" href="#/aula/${encodeURIComponent(lesson.id)}">📖 Estudar: ${esc(lesson.title)}</a>` : ""}
          ${related ? `<a class="btn small ghost" href="#/aula/${encodeURIComponent(related.id)}">📖 Ver também: ${esc(related.title)}</a>` : ""}
          <a class="btn small ghost" href="${translateUrl(q)}" target="_blank" rel="noopener">🌐 Traduzir no Google</a>
          <button class="btn small ghost" type="button" data-flag="${q.id}">${S.q[q.id] && S.q[q.id].flag ? "⭐ Marcada" : "☆ Marcar"}</button>
        </div>
        <div class="note-box"><label class="small muted" for="note-${q.id}">Minha anotação (fica salva):</label><textarea id="note-${q.id}" data-note="${q.id}" placeholder="Ex.: confundi addNewColumns com rescue — addNewColumns PARA o stream.">${esc(note)}</textarea></div>
      </div></div>`;
  }

  function bindReviewItems(root) {
    $$("[data-flag]", root).forEach(b => b.onclick = () => {
      const id = b.dataset.flag; const st = S.q[id] || (S.q[id] = { att: [], box: 0, due: 0, flag: false, note: "" });
      st.flag = !st.flag; persist();
      b.textContent = st.flag ? "⭐ Marcada" : "☆ Marcar";
      toast(st.flag ? "Questão marcada para revisar" : "Marcação removida");
    });
    $$("[data-note]", root).forEach(t => t.oninput = () => {
      const id = t.dataset.note; const st = S.q[id] || (S.q[id] = { att: [], box: 0, due: 0, flag: false, note: "" });
      st.note = t.value; persist();
    });
  }

  // ---------- Sessão ativa ----------
  let pendingChoice = null, pendingConf = "certeza";
  function viewSession() {
    if (!session) { main().innerHTML = `<div class="empty card"><div class="big">🎯</div>Nenhuma sessão em andamento. <a href="#/praticar">Começar uma prática</a> ou <a href="#/simulados">um simulado</a>.</div>`; return; }
    if (session.kind === "exam") return renderExamQuestion();
    if (session.idx >= session.ids.length) return renderPracticeSummary();
    renderPracticeQuestion();
  }

  function sessionHeader(extra) {
    const answered = Object.keys(session.answers).length;
    return `<div class="quiz-head">
      <div><div class="small muted">${esc(session.label)}</div><strong>Questão ${session.idx + 1} de ${session.ids.length}</strong> <span class="muted small">· ${answered} respondidas</span></div>
      <div class="btn-row">${extra || ""}<button class="btn ghost small" id="quit">Encerrar</button></div>
    </div>`;
  }

  function dots(kind) {
    return `<div class="progress-dots" aria-label="Navegação entre questões">${session.ids.map((id, i) => {
      const a = session.answers[id]; let cls = "";
      if (a) cls = kind === "exam" ? "answered" : (a.ok ? "ok" : "bad");
      if (kind === "exam" && session.flags[id]) cls += " flagged";
      if (i === session.idx) cls += " current";
      return `<button type="button" class="${cls}" data-go="${i}" aria-label="Questão ${i + 1}">${i + 1}</button>`;
    }).join("")}</div>`;
  }

  function choicesHtml(q, chosen, revealed) {
    return `<div class="choices" role="radiogroup">${Object.entries(q.choices).map(([k, v]) => {
      let cls = "";
      if (revealed) { if (k === q.answer) cls = "correct"; else if (k === chosen) cls = "wrong"; }
      else if (k === chosen) cls = "selected";
      return `<button type="button" class="choice ${cls}" data-choice="${k}" role="radio" aria-checked="${k === chosen}" ${revealed ? "disabled" : ""}><span class="letter">${k}</span><span class="ctext">${MD.inline(v)}</span></button>`;
    }).join("")}</div>`;
  }

  function qMeta(q) {
    const st = status(q.id); const wc = wrongCount(q.id);
    return `<div class="q-meta">
      <span class="pill accent">${esc(domainShort(q.domain))}</span>
      <span class="pill">${DIFF_PT[q.difficulty] || q.difficulty}</span>
      <span class="pill">${esc(BANKS[q.bank] ? BANKS[q.bank].label : q.bank)} #${q.n}</span>
      ${isBlueprint(q) ? `<span class="pill accent" title="Habilidade nova ou reescrita no exam guide de 2026">Blueprint 2026</span>` : ""}
      ${st === "nova" ? `<span class="pill info">Nova</span>` : st === "errada" ? `<span class="pill bad">Você errou da última vez${wc > 1 ? ` (${wc}x)` : ""}</span>` : st === "dominada" ? `<span class="pill ok">Dominada</span>` : `<span class="pill warn">Aprendendo</span>`}
    </div>`;
  }

  function renderPracticeQuestion() {
    const id = session.ids[session.idx]; const q = Q[id];
    const ans = session.answers[id];
    if (!ans) { pendingChoice = null; pendingConf = "certeza"; }
    main().innerHTML = `
      ${sessionHeader()}
      ${dots("practice")}
      <div class="card question-card">
        ${qMeta(q)}
        <h2 style="margin:4px 0 12px;font-size:1.05rem">${esc(cleanTitle(q.title))}</h2>
        <div class="q-text">${MD.render(q.question)}</div>
        ${choicesHtml(q, ans ? ans.c : pendingChoice, !!ans)}
        ${ans ? "" : `<div class="confidence"><span class="small muted">Sua confiança:</span>
            ${chip("conf", "certeza", "😎 Tenho certeza", pendingConf === "certeza", "radio")}
            ${chip("conf", "chute", "🤔 Estou chutando", pendingConf === "chute", "radio")}
            <span class="small muted">— acertos no chute voltam para revisão</span></div>`}
        <div id="fb">${ans ? feedbackHtml(q, ans) : ""}</div>
        <div class="quiz-actions">
          <div class="btn-row">
            ${session.idx > 0 ? `<button class="btn ghost" id="prev">← Anterior</button>` : ""}
            <a class="btn ghost small" href="${translateUrl(q)}" target="_blank" rel="noopener">🌐 Traduzir</a>
          </div>
          <div class="btn-row">
            <span class="small muted"><span class="kbd">1-4</span> escolher · <span class="kbd">Enter</span> ${ans ? "próxima" : "responder"}</span>
            ${ans ? `<button class="btn" id="next">${session.idx + 1 < session.ids.length ? "Próxima →" : "Ver resultado"}</button>` : `<button class="btn" id="submit" ${pendingChoice ? "" : "disabled"}>Responder</button>`}
          </div>
        </div>
      </div>`;
    bindPractice(q);
  }

  function feedbackHtml(q, ans) {
    const ok = ans.ok;
    return `<div class="feedback ${ok ? "ok" : "bad"}"><div class="verdict">${ok ? (ans.conf === "chute" ? "✔ Acertou — mas foi no chute, vai voltar amanhã" : "✔ Correto!") : `✘ Incorreto — você marcou ${ans.c}, a correta é ${q.answer}`}</div></div>${explainBlock(q, ans.c).replace('<div class="feedback ' + (ans.c === q.answer ? "ok" : "bad") + '">', '<div class="feedback" style="margin-top:10px">')}`;
  }

  function bindPractice(q) {
    $("#quit").onclick = () => { if (Object.keys(session.answers).length) { session.idx = session.ids.length; persistSession(); viewSession(); } else { session = null; persistSession(); location.hash = "#/praticar"; } };
    $$("[data-go]").forEach(b => b.onclick = () => { session.idx = +b.dataset.go; persistSession(); viewSession(); });
    $$("[data-choice]").forEach(b => b.onclick = () => { pendingChoice = b.dataset.choice; $$("[data-choice]").forEach(x => { x.classList.toggle("selected", x === b); x.setAttribute("aria-checked", x === b); }); const s = $("#submit"); if (s) s.disabled = false; });
    $$('input[name="conf"]').forEach(i => i.onchange = () => { pendingConf = i.value; });
    const submit = $("#submit"); if (submit) submit.onclick = () => answerPractice(q);
    const next = $("#next"); if (next) next.onclick = () => { session.idx++; persistSession(); viewSession(); };
    const prev = $("#prev"); if (prev) prev.onclick = () => { session.idx--; persistSession(); viewSession(); };
    bindReviewItems(main());
  }

  function answerPractice(q) {
    if (!pendingChoice || session.answers[q.id]) return;
    const ok = recordAttempt(q.id, pendingChoice, pendingConf, session.mode);
    session.answers[q.id] = { c: pendingChoice, ok, conf: pendingConf };
    persistSession(); updateBadges();
    renderPracticeQuestion();
    const fb = $("#fb"); if (fb) fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPracticeSummary() {
    const ids = session.ids.filter(id => session.answers[id]);
    const ok = ids.filter(id => session.answers[id].ok).length;
    const guesses = ids.filter(id => session.answers[id].ok && session.answers[id].conf === "chute").length;
    const wrong = ids.filter(id => !session.answers[id].ok);
    const byD = {};
    for (const id of ids) { const d = Q[id].domain; byD[d] = byD[d] || { ok: 0, n: 0 }; byD[d].n++; if (session.answers[id].ok) byD[d].ok++; }
    const lessonsToStudy = {};
    for (const id of wrong) { lessonsToStudy[Q[id].lesson] = (lessonsToStudy[Q[id].lesson] || 0) + 1; }
    const p = ids.length ? ok / ids.length : 0;
    main().innerHTML = `
      <div class="page-head"><div><h1>Resultado da sessão</h1><p>${esc(session.label)}</p></div><div class="btn-row"><a class="btn ghost" href="#/">Painel</a></div></div>
      <div class="grid kpis">
        ${kpi("Acerto", pct(p), `${ok} de ${ids.length}`)}
        ${kpi("Erros", wrong.length, "foram para o caderno de erros")}
        ${kpi("Acertos no chute", guesses, "voltam amanhã para revisão")}
      </div>
      <div class="grid cols-2 section">
        <div class="card"><h2>Por domínio</h2>${Object.entries(byD).map(([d, v]) => { const a = v.ok / v.n; return `<div class="domain-row"><div class="name">${esc(domainName(d))}<small>${v.ok}/${v.n}</small></div><div class="bars"><div class="bar"><i class="${barClass(a)}" style="width:${Math.round(a * 100)}%"></i><span class="target"></span></div></div><div class="pct">${pct(a)}</div></div>`; }).join("") || "<p class='muted'>Nenhuma resposta.</p>"}</div>
        <div class="card"><h2>O que estudar agora</h2>${Object.keys(lessonsToStudy).length ? `<div class="list">${Object.entries(lessonsToStudy).sort((a, b) => b[1] - a[1]).map(([l, n]) => `<a class="list-item" href="#/aula/${encodeURIComponent(l)}"><div class="grow"><div class="title">${esc((LESSON[l] || {}).title || l)}</div><small>${n} erro(s) nesta sessão</small></div><span>📖</span></a>`).join("")}</div>` : `<div class="empty"><div class="big">🏆</div>Sem erros nesta sessão!</div>`}</div>
      </div>
      <div class="btn-row section">
        ${wrong.length ? `<button class="btn" id="retry-wrong">🔁 Tentar de novo as ${wrong.length} erradas</button>` : ""}
        <button class="btn secondary" id="again">Nova sessão parecida</button>
        <a class="btn ghost" href="#/revisao">Revisão inteligente</a>
      </div>
      ${wrong.length ? `<div class="section"><h2>Revise seus erros</h2>${wrong.map(id => reviewItem(id, session.answers[id].c)).join("")}</div>` : ""}`;
    const rw = $("#retry-wrong"); if (rw) rw.onclick = () => startPractice({ ids: shuffle(wrong), mode: "erros", label: "Refazendo erros da sessão" });
    $("#again").onclick = () => { location.hash = "#/praticar"; };
    bindReviewItems();
  }

  // ---------- Simulado ----------
  function renderExamQuestion() {
    const remaining = session.started + session.limit - now();
    if (remaining <= 0) return finishExam(true);
    const id = session.ids[session.idx]; const q = Q[id];
    const a = session.answers[id];
    main().innerHTML = `
      ${sessionHeader(`<span class="timer" id="timer">${fmtDur(remaining)}</span><button class="btn small" id="finish">Entregar simulado</button>`)}
      ${dots("exam")}
      <div class="card question-card">
        <div class="q-meta"><span class="pill">${DIFF_PT[q.difficulty] || ""}</span>${session.flags[id] ? `<span class="pill warn">⚑ Marcada para revisar</span>` : ""}</div>
        <div class="q-text">${MD.render(q.question)}</div>
        ${choicesHtml(q, a ? a.c : null, false)}
        <div class="quiz-actions">
          <div class="btn-row">
            <button class="btn ghost" id="prev" ${session.idx ? "" : "disabled"}>← Anterior</button>
            <button class="btn ghost" id="flag">${session.flags[id] ? "⚑ Desmarcar" : "⚐ Marcar para revisar"}</button>
          </div>
          <div class="btn-row"><span class="small muted"><span class="kbd">1-4</span> escolher · <span class="kbd">Enter</span> próxima · <span class="kbd">F</span> marcar</span>
            <button class="btn" id="next">${session.idx + 1 < session.ids.length ? "Próxima →" : "Revisar e entregar"}</button></div>
        </div>
      </div>
      <p class="small muted">No simulado não há correção imediata — igual à prova. O resultado detalhado aparece quando você entregar (ou quando o tempo acabar).</p>`;
    const tick = () => {
      const r = session.started + session.limit - now();
      const t = $("#timer"); const tt = $("#topbar-timer");
      if (r <= 0) { clearInterval(timerHandle); finishExam(true); return; }
      if (t) { t.textContent = fmtDur(r); t.classList.toggle("low", r < 10 * 60000); }
      tt.hidden = false; tt.textContent = "⏱ " + fmtDur(r);
    };
    tick(); timerHandle = setInterval(tick, 1000);
    $("#quit").onclick = () => { if (confirm("Abandonar o simulado? As respostas não serão contabilizadas.")) { session = null; persistSession(); location.hash = "#/simulados"; } };
    $("#finish").onclick = () => confirmFinish();
    $$("[data-go]").forEach(b => b.onclick = () => { session.idx = +b.dataset.go; persistSession(); renderExamQuestion(); });
    $$("[data-choice]").forEach(b => b.onclick = () => { session.answers[id] = { c: b.dataset.choice }; persistSession(); $$("[data-choice]").forEach(x => { x.classList.toggle("selected", x === b); x.setAttribute("aria-checked", x === b); }); const dot = $(`[data-go="${session.idx}"]`); if (dot) dot.classList.add("answered"); });
    $("#prev").onclick = () => { if (session.idx) { session.idx--; persistSession(); renderExamQuestion(); } };
    $("#next").onclick = () => { if (session.idx + 1 < session.ids.length) { session.idx++; persistSession(); renderExamQuestion(); } else confirmFinish(); };
    $("#flag").onclick = () => { session.flags[id] = !session.flags[id]; persistSession(); renderExamQuestion(); };
  }

  function confirmFinish() {
    const blank = session.ids.filter(id => !session.answers[id]).length;
    const flagged = Object.values(session.flags).filter(Boolean).length;
    if (confirm(`Entregar o simulado?\n\n${blank ? `⚠ ${blank} questão(ões) em branco.\n` : ""}${flagged ? `⚑ ${flagged} marcada(s) para revisar.\n` : ""}`)) finishExam(false);
  }

  function finishExam(timeout) {
    clearInterval(timerHandle);
    const end = Math.min(now(), session.started + session.limit);
    const byDomain = {}; let correct = 0; const answers = {};
    for (const id of session.ids) {
      const a = session.answers[id]; const q = Q[id];
      const ok = !!a && a.c === q.answer;
      if (a) recordAttempt(id, a.c, session.flags[id] ? "chute" : "certeza", "simulado");
      if (ok) correct++;
      answers[id] = a ? a.c : null;
      byDomain[q.domain] = byDomain[q.domain] || { ok: 0, n: 0 }; byDomain[q.domain].n++; if (ok) byDomain[q.domain].ok++;
    }
    const rec = { id: "e" + now().toString(36), bank: session.bank, label: session.label, start: session.started, end, total: session.ids.length, correct, byDomain, answers, flags: session.flags, timeout };
    S.exams.push(rec); persist();
    session = null; persistSession();
    if (timeout) toast("Tempo esgotado! Simulado entregue automaticamente.");
    location.hash = "#/resultado/" + rec.id;
  }

  function viewExamResult(id) {
    const e = S.exams.find(x => x.id === id);
    if (!e) { main().innerHTML = `<div class="empty card">Simulado não encontrado. <a href="#/simulados">Voltar</a></div>`; return; }
    const p = e.correct / e.total;
    const ids = Object.keys(e.answers);
    const wrong = ids.filter(qid => e.answers[qid] !== Q[qid].answer);
    const blanks = ids.filter(qid => e.answers[qid] == null).length;
    const lessonsToStudy = {};
    for (const qid of wrong) lessonsToStudy[Q[qid].lesson] = (lessonsToStudy[Q[qid].lesson] || 0) + 1;
    const verdict = p >= 0.8 ? ["ok", "Excelente — pronto para a prova"] : p >= TARGET ? ["info", "Passando — revise os pontos fracos"] : p >= 0.62 ? ["warn", "Perto — estudo focado necessário"] : ["bad", "Ainda não — revisão geral recomendada"];
    let filter = "erradas";
    main().innerHTML = `
      <div class="page-head"><div><h1>${esc(e.label)}</h1><p>${fmtDateTime(e.end)} · duração ${fmtDur(e.end - e.start)}${e.timeout ? " · tempo esgotado" : ""}</p></div><div class="btn-row"><a class="btn ghost" href="#/simulados">← Simulados</a></div></div>
      <div class="grid kpis">
        ${kpi("Nota", `${e.correct}/${e.total}`, pct(p))}
        <div class="kpi"><div class="label">Avaliação</div><div style="margin-top:8px"><span class="pill ${verdict[0]}">${verdict[1]}</span></div><div class="sub" style="margin-top:6px">Meta sugerida: ≥ 32/45 (71%)</div></div>
        ${kpi("Erradas", wrong.length - blanks, blanks ? `+ ${blanks} em branco` : "")}
      </div>
      <div class="grid cols-2 section">
        <div class="card"><h2>Por domínio</h2>${DOMAINS.filter(d => e.byDomain[d.id]).map(d => { const v = e.byDomain[d.id]; const a = v.ok / v.n; return `<div class="domain-row"><div class="name">${esc(d.namePt)}<small>${v.ok}/${v.n} · peso ${d.weight}%</small></div><div class="bars"><div class="bar"><i class="${barClass(a)}" style="width:${Math.round(a * 100)}%"></i><span class="target"></span></div></div><div class="pct">${pct(a)}</div></div>`; }).join("")}</div>
        <div class="card"><h2>Plano de estudo</h2>${Object.keys(lessonsToStudy).length ? `<p class="small muted">Aulas ligadas às questões que você errou, da mais para a menos crítica:</p><div class="list">${Object.entries(lessonsToStudy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, n]) => `<a class="list-item" href="#/aula/${encodeURIComponent(l)}"><div class="grow"><div class="title">${esc((LESSON[l] || {}).title || l)}</div><small>${n} erro(s)</small></div><span>📖</span></a>`).join("")}</div>` : `<div class="empty"><div class="big">🏆</div>Gabaritou!</div>`}
          ${wrong.length ? `<div class="btn-row" style="margin-top:14px"><button class="btn" id="retry-wrong">🔁 Refazer as ${wrong.length} erradas/em branco (com explicação)</button></div>` : ""}</div>
      </div>
      <div class="section">
        <div class="tabs"><button data-f="erradas" class="active">Erradas/em branco (${wrong.length})</button><button data-f="todas">Todas (${ids.length})</button></div>
        <div id="review-list"></div>
      </div>`;
    const renderList = () => {
      const list = filter === "erradas" ? wrong : ids;
      $("#review-list").innerHTML = list.map(qid => reviewItem(qid, e.answers[qid] == null ? "" : e.answers[qid])).join("") || `<div class="empty card">Nada aqui.</div>`;
      bindReviewItems($("#review-list"));
    };
    renderList();
    $$("[data-f]").forEach(b => b.onclick = () => { filter = b.dataset.f; $$("[data-f]").forEach(x => x.classList.toggle("active", x === b)); renderList(); });
    const rw = $("#retry-wrong"); if (rw) rw.onclick = () => startPractice({ ids: shuffle(wrong), mode: "erros", label: "Erros do " + e.label });
  }

  function viewExams() {
    const hist = S.exams.slice().reverse();
    const best = (bank) => { const xs = S.exams.filter(e => e.bank === bank); return xs.length ? Math.max(...xs.map(e => e.correct / e.total)) : null; };
    const card = (kind, title, desc) => `<div class="card"><h3>${title}</h3><p class="muted small">${desc}</p>
      <p class="small">Melhor nota: <strong>${pct(best(kind))}</strong> · Tentativas: ${S.exams.filter(e => e.bank === kind).length}</p>
      <button class="btn" data-exam="${kind}">Começar (90 min)</button></div>`;
    main().innerHTML = `
      <div class="page-head"><div><h1>Simulados</h1><p>45 questões, 90 minutos, sem correção imediata — igual à prova. Ao final: nota por domínio, plano de estudo e revisão com explicações.</p></div></div>
      ${session && session.kind === "exam" ? `<div class="card next-step"><div class="title">Simulado em andamento: ${esc(session.label)}</div><a class="btn" href="#/sessao">Continuar</a></div>` : ""}
      <div class="grid cols-3 section">
        ${card("simulado-1", "Simulado 1", "Prova completa fixa, distribuída pelos pesos oficiais.")}
        ${card("simulado-2", "Simulado 2", "Segunda prova completa fixa.")}
        ${card("aleatorio", "Aleatório ponderado", "45 questões sorteadas de todo o banco (235), respeitando os pesos e priorizando o que você ainda não domina.")}
      </div>
      <div class="card section"><h2>Histórico</h2>${hist.length ? `<div class="list">${hist.map(examListItem).join("")}</div>${hist.length > 1 ? examChart() : ""}` : `<div class="empty">Nenhum simulado ainda.</div>`}</div>`;
    $$("[data-exam]").forEach(b => b.onclick = () => {
      if (session && session.kind === "exam" && !confirm("Já existe um simulado em andamento. Descartar e começar outro?")) return;
      startExam(b.dataset.exam);
    });
  }

  function examChart() {
    const xs = S.exams.slice(-12); const W = 600, H = 180, P = 30;
    const x = i => P + (xs.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (xs.length - 1));
    const y = v => H - P - v * (H - 2 * P);
    const pts = xs.map((e, i) => `${x(i)},${y(e.correct / e.total)}`).join(" ");
    return `<div class="chart section"><h3>Evolução das notas</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de notas dos simulados">
      <line class="axis" x1="${P}" y1="${y(0)}" x2="${W - P}" y2="${y(0)}"/><line class="axis" x1="${P}" y1="${y(1)}" x2="${W - P}" y2="${y(1)}"/>
      <line x1="${P}" y1="${y(TARGET)}" x2="${W - P}" y2="${y(TARGET)}" stroke="var(--ok)" stroke-dasharray="4 4"/><text x="${W - P}" y="${y(TARGET) - 4}" text-anchor="end">meta 70%</text>
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      ${xs.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.correct / e.total)}" r="4" fill="var(--accent)"><title>${esc(e.label)}: ${e.correct}/${e.total}</title></circle><text x="${x(i)}" y="${y(e.correct / e.total) - 9}" text-anchor="middle">${Math.round(100 * e.correct / e.total)}</text>`).join("")}
    </svg></div>`;
  }

  // ---------- Estatísticas ----------
  function viewStats() {
    const ds = domainStats();
    const diff = ["easy", "medium", "hard"].map(d => Object.assign({ d }, statsFor(QUESTIONS.filter(q => q.difficulty === d).map(q => q.id))));
    const days = Object.entries(S.days).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30);
    const lessonRows = LESSONS.filter(l => l.group === "dominio" && !l.isIndex).map(l => Object.assign({ l }, statsFor(idsByLesson(l.id)))).filter(r => r.total);
    const totalAtt = QUESTIONS.reduce((s, q) => s + attempts(q.id).length, 0);
    const W = 600, H = 160, P = 24;
    const maxN = Math.max(1, ...days.map(([, v]) => v.n));
    const bw = days.length ? (W - 2 * P) / days.length : 0;
    main().innerHTML = `
      <div class="page-head"><div><h1>Estatísticas</h1><p>${totalAtt} respostas registradas desde ${fmtDate(S.created)}.</p></div></div>
      <div class="card"><h2>Domínios (acerto atual e cobertura)</h2>${domainRows(ds)}</div>
      <div class="grid cols-2 section">
        <div class="card"><h2>Por dificuldade</h2>${diff.map(x => `<div class="domain-row"><div class="name">${DIFF_PT[x.d]}<small>${x.answered}/${x.total} vistas</small></div><div class="bars"><div class="bar"><i class="${barClass(x.acc)}" style="width:${Math.round((x.acc || 0) * 100)}%"></i><span class="target"></span></div></div><div class="pct">${pct(x.acc)}</div></div>`).join("")}</div>
        <div class="card chart"><h2>Atividade (últimos 30 dias)</h2>${days.length ? `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Questões respondidas por dia">
          <line class="axis" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/>
          ${days.map(([k, v], i) => { const h = (H - 2 * P) * v.n / maxN, ho = (H - 2 * P) * v.ok / maxN; const x = P + i * bw + 2; return `<rect x="${x}" y="${H - P - h}" width="${Math.max(2, bw - 4)}" height="${h}" fill="var(--bad)" opacity=".55" rx="2"><title>${k}: ${v.n} respostas, ${v.ok} certas</title></rect><rect x="${x}" y="${H - P - ho}" width="${Math.max(2, bw - 4)}" height="${ho}" fill="var(--ok)" rx="2"/>`; }).join("")}
          <text x="${P}" y="${H - 6}">${days[0][0].slice(5)}</text><text x="${W - P}" y="${H - 6}" text-anchor="end">${days[days.length - 1][0].slice(5)}</text>
        </svg><p class="small muted">Verde = acertos · vermelho = erros</p>` : `<div class="empty">Sem atividade ainda.</div>`}</div>
      </div>
      <div class="card section"><h2>Por aula</h2><div class="table-wrap"><table><thead><tr><th>Aula</th><th>Domínio</th><th style="text-align:right">Vistas</th><th style="text-align:right">Acerto</th><th></th></tr></thead><tbody>
        ${lessonRows.sort((a, b) => (a.acc == null) - (b.acc == null) || (a.acc - b.acc)).map(r => `<tr><td><a href="#/aula/${encodeURIComponent(r.l.id)}">${esc(r.l.title)}</a></td><td class="small">${esc(domainShort(r.l.domain))}</td><td style="text-align:right">${r.answered}/${r.total}</td><td style="text-align:right"><span class="pill ${r.acc == null ? "" : barClass(r.acc) === "ok" ? "ok" : barClass(r.acc) === "warn" ? "warn" : "bad"}">${pct(r.acc)}</span></td><td><button class="btn small ghost" data-pl="${esc(r.l.id)}">Praticar</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
    $$("[data-pl]").forEach(b => b.onclick = () => startPractice({ ids: shuffle(idsByLesson(b.dataset.pl)), label: "Aula: " + LESSON[b.dataset.pl].title }));
  }

  // ---------- Questão avulsa ----------
  function viewSingleQuestion(id) {
    const q = Q[id];
    if (!q) { main().innerHTML = `<div class="empty card">Questão não encontrada.</div>`; return; }
    main().innerHTML = `<div class="page-head"><div><h1>${esc(cleanTitle(q.title))}</h1></div></div><div class="card">${qMeta(q)}${questionReviewBody(q, null)}</div>`;
    bindReviewItems();
  }

  // ---------- Config ----------
  function viewConfig() {
    main().innerHTML = `
      <div class="page-head"><div><h1>Dados e ajustes</h1><p>Seu progresso fica salvo apenas neste navegador. Exporte para fazer backup ou levar para outro computador.</p></div></div>
      <div class="grid cols-2">
        <div class="card"><h2>Backup</h2><p class="small muted">Gera um arquivo .json com respostas, anotações, simulados e aulas lidas.</p>
          <div class="btn-row"><button class="btn" id="exp">⬇ Exportar progresso</button><label class="btn secondary" style="cursor:pointer">⬆ Importar<input type="file" id="imp" accept="application/json" hidden></label></div></div>
        <div class="card"><h2>Zerar</h2><p class="small muted">Apaga todo o progresso deste navegador. Não dá para desfazer (exporte antes).</p><button class="btn danger" id="reset">Apagar tudo</button></div>
        <div class="card"><h2>Como o site decide o que você deve estudar</h2>
          <ul class="small">
            <li><strong>Repetição espaçada</strong>: acerto com certeza sobe a questão de caixa (revisões em 1, 3, 7, 16 e 35 dias). Erro volta para a caixa 0 (revisa hoje). Acerto no chute revisa amanhã.</li>
            <li><strong>Dominada</strong> = última resposta certa e caixa ≥ 3.</li>
            <li><strong>Pontos fracos</strong> = domínios com ≥ 3 questões vistas e acerto abaixo de 70%, ordenados pelo impacto na nota (peso oficial × distância da meta).</li>
            <li><strong>Estimativa de acerto</strong> = média do acerto atual por domínio, ponderada pelos pesos oficiais.</li>
            <li>Cada questão é ligada à aula em PT-BR mais relacionada, para você reestudar o ponto exato que errou.</li>
          </ul></div>
        <div class="card"><h2>Créditos</h2><p class="small">Questões (em inglês) e estrutura do conteúdo baseadas no <a href="https://github.com/kengio/databricks-certification-study-guide" target="_blank" rel="noopener">Databricks Certification Study Guide</a> de Suppaseth Charoenkarnka, licença MIT. Tradução, adaptação e este site: projeto de estudos pessoal. Este material não é oficial nem afiliado à Databricks.</p></div>
      </div>`;
    $("#exp").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "dea-ptbr", version: 1, exported: new Date().toISOString(), state: S }, null, 1)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `progresso-de-associate-${todayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("#imp").onchange = (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result); const st = data.state || data;
          if (!st || typeof st.q !== "object") throw new Error("formato");
          if (!confirm("Substituir o progresso atual pelo arquivo importado?")) return;
          Object.keys(S).forEach(k => delete S[k]); Object.assign(S, { q: {}, read: {}, exams: [], days: {}, created: Date.now() }, st); persist();
          toast("Progresso importado!"); route();
        } catch (e) { toast("Arquivo inválido."); }
      };
      r.readAsText(f);
    };
    $("#reset").onclick = () => {
      if (!confirm("Apagar TODO o progresso? Isso não pode ser desfeito.")) return;
      Object.keys(S).forEach(k => delete S[k]); Object.assign(S, { q: {}, read: {}, exams: [], days: {}, created: Date.now() }); persist();
      session = null; persistSession(); toast("Progresso apagado."); route();
    };
  }

  // ======================================================================
  // Teclado, tema, menu
  // ======================================================================
  document.addEventListener("keydown", (e) => {
    if (!session || !location.hash.startsWith("#/sessao")) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { "1": "A", "2": "B", "3": "C", "4": "D", a: "A", b: "B", c: "C", d: "D" };
    if (map[k]) { const btn = $(`[data-choice="${map[k]}"]`); if (btn && !btn.disabled) { btn.click(); e.preventDefault(); } }
    else if (k === "enter") { const b = $("#submit:not(:disabled)") || $("#next"); if (b) { b.click(); e.preventDefault(); } }
    else if (k === "f" && session.kind === "exam") { const b = $("#flag"); if (b) b.click(); }
    else if (k === "arrowright" && session.kind === "exam") { const b = $("#next"); if (b) b.click(); }
    else if (k === "arrowleft") { const b = $("#prev"); if (b && !b.disabled) b.click(); }
  });

  function applyTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  }
  let theme = null; try { theme = localStorage.getItem("dea-ptbr-theme"); } catch (e) { }
  applyTheme(theme);
  $("#theme-toggle").onclick = () => {
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
    theme = dark ? "light" : "dark"; applyTheme(theme);
    try { localStorage.setItem("dea-ptbr-theme", theme); } catch (e) { }
    if (location.hash.startsWith("#/aula")) route();
  };
  $("#menu-toggle").onclick = () => { const sb = $("#sidebar"); sb.classList.toggle("open"); $("#menu-toggle").setAttribute("aria-expanded", sb.classList.contains("open")); };

  window.addEventListener("hashchange", route);
  route();
})();
