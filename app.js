(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = n => Number(n).toLocaleString('fa-IR');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const KEYS = { tasks: 'medpath.v2.tasks', settings: 'medpath.v2.settings', weights: 'medpath.v2.weights' };
  const DAY = 86400000;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const parse = iso => new Date(`${iso}T00:00:00`);
  const daysUntil = iso => Math.round((parse(iso) - today()) / DAY);
  const fmtFa = iso => new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(parse(iso));
  const PRIO = { high: { label: 'حیاتی', rank: 0 }, mid: { label: 'متوسط', rank: 1 }, low: { label: 'کم', rank: 2 } };
  const KIND = { official: 'رسمی', secondary: 'ثانویه', commercial: 'تجاری' };
  const LEVEL = { yes: 'مناسب', partial: 'مشروط', no: 'دشوار/بسته', unverified: 'تأییدنشده' };

  let D = {};            // loaded data
  let tasks = null;      // { items, dismissed }
  let settings = {};
  let weights = {};
  let taskCat = 'all';
  let studyFilter = 'all';

  /* ---------- navigation ---------- */
  const links = $$('.nav-link');
  const pages = $$('.page');
  const sidebar = $('.sidebar');

  function showPage(id) {
    pages.forEach(p => p.classList.toggle('active-page', p.id === id));
    links.forEach(l => l.classList.toggle('active', l.dataset.section === id));
    sidebar.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function go(id) { history.replaceState(null, '', `#${id}`); showPage(id); }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (document.getElementById(id) && pages.some(p => p.id === id)) { e.preventDefault(); go(id); }
  });
  $('.menu-button').addEventListener('click', () => sidebar.classList.toggle('open'));
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (pages.some(p => p.id === id)) showPage(id);
  });

  /* ---------- copy buttons (CV, LinkedIn) ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }
  $$('.copy-button').forEach(button => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).innerText);
      toast('کپی شد');
    } catch { toast('کپی ممکن نشد'); }
  }));

  /* ---------- data ---------- */
  async function loadData() {
    const out = {};
    await Promise.all(['meta', 'pathways', 'study', 'tasks', 'milestones'].map(async n => {
      const r = await fetch(`data/${n}.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${n}.json`);
      out[n] = await r.json();
    }));
    try {
      const r = await fetch('data/source-status.json', { cache: 'no-cache' });
      if (r.ok) out.status = await r.json();
    } catch { /* optional */ }
    try {
      const r = await fetch('data/phd-opportunities.json', { cache: 'no-cache' });
      if (r.ok) out.phd = await r.json();
    } catch { /* optional */ }
    return out;
  }

  /* ---------- tasks state ---------- */
  function initTasks() {
    let st = store.get(KEYS.tasks, null);
    const first = !st;
    if (!st) st = { items: [], dismissed: [] };
    const legacy = first ? store.get('medpathTasks', {}) : {};
    const legacyMap = { language: 'language-mock', linkedin: 'linkedin-text', evidence: 'evidence-folder', country: 'score-destinations' };
    const doneFromLegacy = new Set(Object.entries(legacy).filter(([, v]) => v).map(([k]) => legacyMap[k]));
    const have = new Set(st.items.map(t => t.id));
    D.tasks.forEach(seed => {
      if (have.has(seed.id) || st.dismissed.includes(seed.id)) return;
      st.items.push({ ...seed, done: doneFromLegacy.has(seed.id), seed: true });
    });
    tasks = st;
    saveTasks();
  }
  const saveTasks = () => store.set(KEYS.tasks, tasks);
  const allCats = () => {
    const known = D.meta.categories.map(c => c.id);
    const extra = [...new Set(tasks.items.map(t => t.cat))].filter(c => !known.includes(c));
    return [...D.meta.categories, ...extra.map(id => ({ id, label: id }))];
  };
  const catLabel = id => (allCats().find(c => c.id === id) || { label: id }).label;
  const newId = () => `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function sortOpen(list) {
    return [...list].sort((a, b) =>
      PRIO[a.prio].rank - PRIO[b.prio].rank ||
      (a.due || '9999').localeCompare(b.due || '9999'));
  }

  /* ---------- dashboard ---------- */
  function boardDate() { return settings.boardDate || D.meta.boardDateDefault; }

  function nextEvents() {
    const t = today();
    const fromMilestones = D.milestones.map(m => ({ date: m.date, title: m.title, kind: m.kind }));
    const fromBoard = [{ date: boardDate(), title: 'بورد داخلی', kind: settings.boardDate ? 'confirmed' : 'estimate' }];
    return [...fromMilestones, ...fromBoard].filter(e => parse(e.date) >= t).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderDashboard() {
    const total = tasks.items.length;
    const done = tasks.items.filter(t => t.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    $('#readiness-ring').style.setProperty('--progress', pct);
    $('#readiness-value').innerHTML = `${fa(pct)}٪<small>پیشرفت برنامه</small>`;

    const open = sortOpen(tasks.items.filter(t => !t.done));
    $('#readiness-list').innerHTML = open.slice(0, 3).map(t => `<li>${esc(t.title)}</li>`).join('') ||
      '<li class="done">همهٔ کارها انجام شده</li>';

    const dBoard = daysUntil(boardDate());
    const ev = nextEvents().find(e => e.date !== boardDate());
    const age = Math.round((today() - parse(D.meta.lastVerified)) / DAY);
    const stale = age > D.meta.staleAfterDays;
    $('#stats').innerHTML = `
      <article><span class="stat-icon navy">✚</span><div><small>تا بورد</small><strong>${dBoard >= 0 ? `${fa(dBoard)} روز` : 'گذشته'}</strong><em>${esc(fmtFa(boardDate()))}${settings.boardDate ? '' : ' (تخمینی)'}</em></div></article>
      <article><span class="stat-icon green">✓</span><div><small>کارهای انجام‌شده</small><strong>${fa(done)} از ${fa(total)}</strong><em>${fa(open.length)} کار باز</em></div></article>
      <article><span class="stat-icon gold">◷</span><div><small>رویداد بعدی</small><strong>${ev ? `${fa(daysUntil(ev.date))} روز` : '—'}</strong><em>${ev ? esc(ev.title) : 'رویدادی ثبت نشده'}</em></div></article>
      <article class="${stale ? 'stale' : ''}"><span class="stat-icon blue">§</span><div><small>آخرین بررسی منابع</small><strong>${fa(age)} روز پیش</strong><em>${stale ? 'قدیمی است؛ منابع را دوباره بررسی کن' : esc(fmtFa(D.meta.lastVerified))}</em></div></article>`;

    $('#priority-list').innerHTML = open.slice(0, 5).map(taskLabel).join('') ||
      '<p class="note">کاری باز نیست. در تراکر کار تازه اضافه کن.</p>';

    $('#category-progress').innerHTML = allCats().map(c => {
      const list = tasks.items.filter(t => t.cat === c.id);
      if (!list.length) return '';
      const p = Math.round(list.filter(t => t.done).length / list.length * 100);
      return `<div class="signal"><div><span>${esc(c.label)}</span><strong>${fa(p)}٪</strong></div><i style="--w:${p}%"></i></div>`;
    }).join('');
  }

  function taskLabel(t) {
    const due = t.due ? daysUntil(t.due) : null;
    const dueTxt = due === null ? '' : due < 0 ? `${fa(-due)} روز تأخیر` : due === 0 ? 'امروز' : `${fa(due)} روز دیگر`;
    return `<label class="task"><input type="checkbox" data-toggle="${esc(t.id)}" ${t.done ? 'checked' : ''}><span><strong>${esc(t.title)}</strong><small>${esc(catLabel(t.cat))}${dueTxt ? ` · ${dueTxt}` : ''}${t.note ? ` — ${esc(t.note)}` : ''}</small></span><b class="${t.prio === 'high' ? '' : t.prio}">${PRIO[t.prio].label}</b></label>`;
  }

  /* ---------- sources markup ---------- */
  const sourceLinks = list => `<ul class="src-list">${list.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><i class="kind ${esc(s.kind)}">${KIND[s.kind]}</i></li>`).join('')}</ul>`;

  /* ---------- decision matrix ---------- */
  function scored() {
    return [...D.pathways, ...D.study].filter(p => p.scores);
  }
  function renderWeights() {
    $('#weights').innerHTML = D.meta.criteria.map(c => `
      <label class="weight"><span>${esc(c.label)} <b id="w-${c.id}-v">${fa(weights[c.id] ?? 0)}</b></span>
      <input type="range" min="0" max="5" step="1" value="${weights[c.id] ?? 0}" data-weight="${c.id}"></label>`).join('');
  }
  function renderRanking() {
    const rows = scored().map(p => {
      // criteria without a score for this item are left out and the item is flagged
      const used = D.meta.criteria.filter(c => Number.isFinite(p.scores[c.id]));
      const sum = used.reduce((a, c) => a + (weights[c.id] || 0), 0);
      const total = sum ? used.reduce((a, c) => a + (weights[c.id] || 0) * p.scores[c.id], 0) / (5 * sum) * 100 : 0;
      return { p, total: Math.round(total), partial: used.length < D.meta.criteria.length };
    }).sort((a, b) => b.total - a.total);
    $('#ranking').innerHTML = rows.map(({ p, total, partial }) => `
      <div class="rank-row">
        <span class="rank-name">${p.flag} ${esc(p.name)} <i class="kind ${p.type === 'work' ? 'work' : 'study'}">${p.type === 'work' ? 'کاری' : 'تحصیلی'}</i>${p.level === 'unverified' || partial ? ` <i class="kind warn" title="${partial ? 'امتیاز بعضی معیارها ثبت نشده' : 'بخشی از اطلاعات تأیید نشده'}">⚠</i>` : ''}</span>
        <span class="rank-bar"><i style="--w:${total}%"></i></span>
        <b>${fa(total)}</b>
      </div>`).join('');
  }

  /* ---------- cards ---------- */
  const kv = facts => `<dl>${facts.map(f => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join('')}</dl>`;

  function renderPathways() {
    $('#pathway-grid').innerHTML = D.pathways.map(p => `
      <article class="path-card ${p.level}">
        <header><span class="flag">${p.flag}</span><div><h3>${esc(p.name)}</h3><span class="level ${p.level}">${esc(p.status)}</span></div></header>
        <p>${esc(p.summary)}</p>
        ${kv(p.facts)}
        <details><summary>مراحل</summary><ol>${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
        ${p.caveats.length ? `<ul class="caveats">${p.caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${sourceLinks(p.sources)}
        <small class="verified">بررسی‌شده: ${esc(fmtFa(p.verified))}</small>
      </article>`).join('');
  }

  function renderStudy() {
    const countries = ['all', ...new Set(D.study.map(s => s.country))];
    $('#study-filters').innerHTML = countries.map(c =>
      `<button class="chip ${c === studyFilter ? 'on' : ''}" data-study-filter="${esc(c)}">${c === 'all' ? 'همه' : esc(c)}</button>`).join('');
    $('#study-grid').innerHTML = D.study.filter(s => studyFilter === 'all' || s.country === studyFilter).map(s => `
      <article class="path-card ${s.level}">
        <header><span class="flag">${s.flag}</span><div><h3>${esc(s.name)}</h3><span class="level ${s.level}">${LEVEL[s.level]}</span></div></header>
        <p class="verdict-line">${esc(s.verdict)}</p>
        <dl class="long">
          ${[['پوشش مالی', s.funded], ['چه کسی', s.who], ['مهلت', s.deadline], ['زبان', s.language], ['ربط به هدف تو', s.relevance]]
            .filter(([, v]) => v && v !== '—').map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
        <ul class="caveats">${s.caveats.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
        <p class="next"><b>گام بعدی:</b> ${esc(s.next)}</p>
        ${sourceLinks(s.sources)}
        <small class="verified">بررسی‌شده: ${esc(fmtFa(s.verified))}</small>
      </article>`).join('');
  }

  function renderSynergies() {
    const list = D.meta.synergies || [];
    const box = $('#synergy-panel');
    box.hidden = !list.length;
    if (!list.length) return;
    $('#synergy-list').innerHTML = list.map(x => `
      <div class="syn"><div><strong>${esc(x.action)}</strong><small>${(x.impact || []).map(esc).join(' · ')}</small></div><b class="prio-${esc(String(x.priority).toLowerCase())}">${esc(x.priority)}</b></div>`).join('');
  }

  function renderPhd() {
    const list = D.phd || [];
    $('#phd-section').hidden = !list.length;
    if (!list.length) return;
    $('#phd-grid').innerHTML = list.map(p => `
      <article class="path-card unverified">
        <header><div><h3>${esc(p.university)}</h3><span class="level unverified">${esc(p.country)}</span></div></header>
        <p class="verdict-line">${esc(p.field)}</p>
        <dl class="long">${[['تأمین مالی', p.funding], ['ربط به داخلی', p.relevance_to_im], ['مهلت', p.deadline], ['زبان', p.language], ['شرایط', p.requirements]]
          .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${p.link ? `<ul class="src-list"><li><a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">صفحهٔ برنامه</a><i class="kind commercial">تأییدنشده</i></li></ul>` : ''}
      </article>`).join('');
  }

  /* ---------- tracker ---------- */
  function renderTaskControls() {
    $('#task-cat').innerHTML = allCats().map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    renderTaskFilters();
  }
  function renderTaskFilters() {
    const cats = [{ id: 'all', label: 'همه' }, ...allCats()];
    $('#task-filters').innerHTML = cats.map(c =>
      `<button class="chip ${c.id === taskCat ? 'on' : ''}" data-task-filter="${c.id}">${esc(c.label)}</button>`).join('');
  }
  function renderTasks() {
    const showDone = $('#show-done').checked;
    let list = tasks.items.filter(t => (taskCat === 'all' || t.cat === taskCat) && (showDone || !t.done));
    list = [...sortOpen(list.filter(t => !t.done)), ...list.filter(t => t.done)];
    $('#task-list').innerHTML = list.length ? list.map(t => `
      <div class="task-row ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
        <input type="checkbox" data-toggle="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="انجام شد">
        <div class="tr-main"><input class="tr-title" data-field="title" value="${esc(t.title)}" maxlength="140" aria-label="عنوان">${t.note ? `<small>${esc(t.note)}</small>` : ''}</div>
        <span class="chip static">${esc(catLabel(t.cat))}</span>
        <select data-field="prio" aria-label="اولویت">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${t.prio === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <input type="date" data-field="due" value="${esc(t.due || '')}" aria-label="سررسید">
        <button class="icon-btn" data-delete="${esc(t.id)}" aria-label="حذف">✕</button>
      </div>`).join('') : '<p class="note">کاری با این فیلتر نیست.</p>';
  }

  function refreshTasksEverywhere() {
    saveTasks();
    renderDashboard();
    renderTasks();
    renderMilestones();
  }

  /* ---------- calendar ---------- */
  function renderMilestones() {
    const t = today();
    const items = [
      ...D.milestones.map(m => ({ ...m, type: 'ms' })),
      { id: 'board', date: boardDate(), kind: settings.boardDate ? 'confirmed' : 'estimate', title: 'بورد داخلی', note: settings.boardDate ? '' : 'تاریخ حدسی؛ تاریخ واقعی را بالا وارد کن.', type: 'board' },
      ...tasks.items.filter(x => !x.done && x.due).map(x => ({ id: x.id, date: x.due, kind: 'task', title: x.title, note: catLabel(x.cat), type: 'task' }))
    ].sort((a, b) => a.date.localeCompare(b.date));
    $('#milestones').innerHTML = items.map(m => {
      const d = daysUntil(m.date);
      const when = d < 0 ? `${fa(-d)} روز پیش` : d === 0 ? 'امروز' : `${fa(d)} روز دیگر`;
      const kindTxt = m.kind === 'task' ? 'کار' : m.kind === 'estimate' ? 'تخمینی' : 'تأییدشده';
      return `<div class="ms ${m.type} ${parse(m.date) < t ? 'past' : ''}">
        <div class="ms-date"><b>${esc(fmtFa(m.date))}</b><small dir="ltr">${esc(m.date)}</small></div>
        <div class="ms-body"><strong>${esc(m.title)}</strong>${m.note ? `<small>${esc(m.note)}</small>` : ''}${m.source ? `<a href="${esc(m.source.url)}" target="_blank" rel="noopener noreferrer">${esc(m.source.title)}</a>` : ''}</div>
        <div class="ms-meta"><i class="kind ${m.kind}">${kindTxt}</i><small>${when}</small></div>
      </div>`;
    }).join('');
  }

  /* ---------- sources ---------- */
  function renderSources() {
    const map = new Map();
    const add = (s, where) => {
      if (!map.has(s.url)) map.set(s.url, { ...s, where: new Set() });
      map.get(s.url).where.add(where);
    };
    D.pathways.forEach(p => p.sources.forEach(s => add(s, p.name)));
    D.study.forEach(p => p.sources.forEach(s => add(s, p.name)));
    D.milestones.forEach(m => add(m.source, m.title));
    const order = { official: 0, secondary: 1, commercial: 2 };
    const rows = [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));
    const st = D.status;
    const stateLabel = { ok: 'بدون تغییر', new: 'ثبت اولیه', changed: 'تغییر کرده', error: 'خطا' };
    $('#sources-list').innerHTML = rows.map(s => {
      const r = st?.sources?.[s.url];
      return `<div class="src-row">
        <div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><small>${[...s.where].map(esc).join(' · ')}</small></div>
        <i class="kind ${s.kind}">${KIND[s.kind]}</i>
        <span class="src-state ${r ? r.state : 'unknown'}">${r ? stateLabel[r.state] : 'بررسی نشده'}</span>
      </div>`;
    }).join('');
    const box = $('#sources-status');
    const flagged = st ? Object.values(st.sources).filter(r => r.state === 'changed' || r.state === 'error').length : 0;
    if (st && flagged) {
      box.hidden = false;
      box.textContent = `${fa(flagged)} منبع در آخرین بررسی خودکار تغییر کرده یا باز نشده است. اطلاعات مربوط به آن‌ها را دوباره چک کن.`;
    } else box.hidden = true;
  }

  /* ---------- events ---------- */
  function bindEvents() {
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.toggle) {
        const t = tasks.items.find(x => x.id === el.dataset.toggle);
        if (t) { t.done = el.checked; refreshTasksEverywhere(); }
      } else if (el.dataset.field) {
        const id = el.closest('.task-row')?.dataset.id;
        const t = tasks.items.find(x => x.id === id);
        if (!t) return;
        const f = el.dataset.field;
        if (f === 'title') {
          const v = el.value.trim();
          if (!v) { el.value = t.title; return; }
          t.title = v;
        } else t[f] = f === 'due' ? (el.value || null) : el.value;
        refreshTasksEverywhere();
      } else if (el.dataset.weight) {
        weights[el.dataset.weight] = Number(el.value);
        $(`#w-${el.dataset.weight}-v`).textContent = fa(el.value);
        store.set(KEYS.weights, weights);
        renderRanking();
      } else if (el.id === 'show-done') renderTasks();
      else if (el.id === 'board-date') {
        settings.boardDate = el.value || null;
        store.set(KEYS.settings, settings);
        renderDashboard(); renderMilestones(); renderBoardNote();
      } else if (el.id === 'import-file') importBackup(el.files[0]);
    });
    document.addEventListener('input', e => {
      if (e.target.dataset.weight) {
        weights[e.target.dataset.weight] = Number(e.target.value);
        $(`#w-${e.target.dataset.weight}-v`).textContent = fa(e.target.value);
        renderRanking();
      }
    });
    document.addEventListener('click', e => {
      const del = e.target.closest('[data-delete]');
      if (del) {
        const id = del.dataset.delete;
        const t = tasks.items.find(x => x.id === id);
        if (t && confirm(`«${t.title}» حذف شود؟`)) {
          tasks.items = tasks.items.filter(x => x.id !== id);
          if (t.seed) tasks.dismissed.push(id);
          refreshTasksEverywhere();
        }
        return;
      }
      const tf = e.target.closest('[data-task-filter]');
      if (tf) { taskCat = tf.dataset.taskFilter; renderTaskFilters(); renderTasks(); return; }
      const sf = e.target.closest('[data-study-filter]');
      if (sf) { studyFilter = sf.dataset.studyFilter; renderStudy(); return; }
    });
    $('#task-form').addEventListener('submit', e => {
      e.preventDefault();
      const title = $('#task-title').value.trim();
      if (!title) return;
      tasks.items.push({ id: newId(), title, cat: $('#task-cat').value, prio: $('#task-prio').value, due: $('#task-due').value || null, note: '', done: false });
      $('#task-title').value = '';
      $('#task-due').value = '';
      refreshTasksEverywhere();
    });
    $('#weights-reset').addEventListener('click', () => {
      weights = { ...D.meta.defaultWeights };
      store.del(KEYS.weights);
      renderWeights(); renderRanking();
    });
    $('#export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ app: 'medpath', version: 2, tasks, settings, weights }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `medpath-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#reset-btn').addEventListener('click', () => {
      if (!confirm('همهٔ کارها، تنظیمات و وزن‌ها به حالت اولیه برگردد؟')) return;
      Object.values(KEYS).forEach(store.del);
      location.reload();
    });
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'medpath' || !Array.isArray(data.tasks?.items)) throw new Error('bad file');
      tasks = { items: data.tasks.items, dismissed: data.tasks.dismissed || [] };
      settings = data.settings || {};
      weights = { ...D.meta.defaultWeights, ...(data.weights || {}) };
      store.set(KEYS.settings, settings);
      store.set(KEYS.weights, weights);
      saveTasks();
      renderAll();
      toast('پشتیبان بارگذاری شد');
    } catch { toast('فایل پشتیبان معتبر نیست'); }
    $('#import-file').value = '';
  }

  function renderBoardNote() {
    $('#board-date').value = boardDate();
    $('#board-note').textContent = settings.boardDate ? 'تاریخ واردشدهٔ خودت' : D.meta.boardDateNote;
  }

  function renderAll() {
    renderDashboard();
    renderWeights(); renderRanking();
    renderPathways(); renderStudy(); renderPhd(); renderSynergies();
    renderTaskControls(); renderTasks();
    renderBoardNote(); renderMilestones();
    renderSources();
  }

  /* ---------- boot ---------- */
  $('#today-pill').textContent = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(new Date());

  loadData().then(data => {
    D = data;
    settings = store.get(KEYS.settings, {});
    weights = { ...D.meta.defaultWeights, ...Object.fromEntries(Object.entries(store.get(KEYS.weights, {})).filter(([k]) => D.meta.criteria.some(c => c.id === k))) };
    initTasks();
    bindEvents();
    renderAll();
    const initial = location.hash.slice(1);
    if (initial && pages.some(p => p.id === initial)) showPage(initial);
  }).catch(err => {
    console.error(err);
    $('#load-error').hidden = false;
  });
})();
