/* noema-lite — 🧭 Curricula UI: library · new curriculum (agents' progress) · the map (DAG in three parts) ·
   node panel (learning goals, chapters, prerequisites, study / prepare / "I already know this").
   Logic lives in engine/curriculum.js; this file only draws. Works before the engine starts (subject picker)
   and inside it (topbar 🧭), on computers and phones. docs/CURRICULUM.md */
window.NoemaCurMap = (() => {
  const C = () => window.NoemaCurriculum, G = () => window.NoemaCurriculum.Gen, LLM = () => window.NoemaLLM;
  const el = (...a) => window.Noema.el(...a);
  const overlay = (b, o) => window.Noema.overlay(b, o);
  const toast = (m, ms) => window.Noema.toast?.(m, ms);
  const head = (t, sub) => el('div', { class: 'noema-ovhead' }, el('div', { class: 'logo' }, '◆'), el('div', {}, el('h1', {}, t), sub ? el('p', { class: 'muted' }, sub) : null));
  const tip = (...t) => el('details', { class: 'cg-tip' }, el('summary', { title: 'More info', 'aria-label': 'More info' }, 'i'), el('div', { class: 'cg-tipbody' }, ...t));
  const ICON = { foundation: '🧱', intro: '🚪', aspect: '🎯', subtopic: '🔹', related: '🔗', synthesis: '🏁', application: '🚀', goal: '🎯' };
  const ROLE = { foundation: 'Prerequisite', intro: 'Introduction to the goal', aspect: 'Major aspect of the goal', subtopic: 'Sub-topic', related: 'Related topic', synthesis: 'Synthesis & mastery', application: 'Application', goal: 'Goal' };
  const fmtPct = x => Math.round((x || 0) * 100) + '%';

  /* ======================= library ======================= */
  function library(acc, { onStudy } = {}) {
    return overlay((box, close) => {
      box.classList.add('cm-lib');
      const draw = () => {
        box.innerHTML = '';
        const list = C().list(acc);
        box.append(head('🧭 Curricula', 'Type a goal; Claude or Gemini maps everything you need — prerequisites → the goal → applications — and prepares each step as a full subject.'),
          el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => { close(); create(acc, { onStudy }); } }, '➕ New curriculum'), el('button', { class: 'btn', onclick: () => { close(); importMap(acc, { onStudy }); } }, '📥 Import a map'), el('span', { class: 'tiny' }, 'Each step (node) becomes a subject with theory, exercises, flashcards, drills and the tutor.')),
          list.length ? el('div', { class: 'cm-cards' }, ...list.map(c => {
            const s = c.status === 'ready' ? C().summary(acc, c) : null;
            return el('button', { class: 'cm-card', onclick: () => { close(); c.status === 'ready' ? map(acc, c.id, { onStudy }) : progress(acc, c, { onStudy }); } },
              el('div', { class: 'cm-cardtop' }, el('span', { class: 'cm-emo' }, '🧭'), el('b', {}, c.title || c.goal)),
              s ? el('div', { class: 'cm-bar' }, el('i', { style: { width: fmtPct(s.pct) } })) : null,
              el('div', { class: 'tiny' }, s ? `${s.mastered}/${s.total} mastered · ${s.open} open · ${s.ready} prepared` : c.status === 'building' ? '⏳ being built…' : c.status === 'paused' ? '⏸️ paused — tap to continue' : '⚠️ stopped — tap to continue'));
          })) : el('div', { class: 'empty' }, el('div', { class: 'e' }, '🧭'), el('p', {}, 'No curriculum yet. Tap ➕ New curriculum and type what you want to master.')),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      };
      draw(); const off = C().onChange(() => { if (box.isConnected) draw(); else off(); });
    });
  }

  /* ======================= new curriculum ======================= */
  function keysBox(acc, onChange) {
    const wrap = el('div', { class: 'cm-keys' });
    const draw = () => {
      wrap.innerHTML = ''; const a = LLM().available(acc);
      const keyIn = el('input', { class: 'noema-input', type: 'password', placeholder: 'sk-ant-… (Claude API key)', autocomplete: 'off' });
      const st = el('span', { class: 'tiny' });
      wrap.append(
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.claude ? '✅ Claude' : '➖ Claude'), el('span', { class: 'tiny' }, a.claude ? 'API key on this device — best quality (skill, web research, pictures)' : 'no API key on this device'),
          tip('Claude builds the best curricula and subjects (it researches official sources and adds pictures). It uses your Claude API key and costs a few dollars per prepared step; you set a limit per step. Get a key: ✨ Create with Claude → “Here in noema-lite” (steps 1–3).')),
        a.claude ? null : el('div', { class: 'row' }, keyIn, el('button', { class: 'btn small', onclick: async () => { const k = keyIn.value.trim(); if (!window.NoemaClaude.Key.looksValid(k)) { st.textContent = '⚠️ That is not a Claude API key (sk-ant-…).'; return; } st.textContent = '⏳'; try { await window.NoemaClaude.models(k); window.NoemaClaude.Key.set(acc, k, true); draw(); onChange?.(); } catch (e) { st.textContent = '❌ ' + e.message; } } }, 'Use this key'), st),
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.gemini ? '✅ Gemini' : '➖ Gemini'), el('span', { class: 'tiny' }, a.gemini ? 'free key — used when there is no Claude key' : 'no key (⚙️ Settings → Gemini key)'),
          tip('Gemini (free key) builds the map and the subjects inside the app with Google Search; its subjects have drawn diagrams but no web photos, and the free quota is limited.')));
    };
    draw(); return wrap;
  }
  function create(acc, { onStudy } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      const goal = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'e.g. “Bayesian statistics”, “Cardiac physiology”, “Databricks Lakehouse”, “Ancient Greek tragedy”' });
      const lang = el('select', { class: 'noema-input' }, ...Object.entries(C().LANG).map(([v, t]) => el('option', { value: v }, t))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: 'Optional: what you already know, e.g. “high-school maths, some Python”' });
      const depth = el('select', { class: 'noema-input' }, el('option', { value: 'standard' }, 'Standard — 12–20 steps for the goal'), el('option', { value: 'deep' }, 'Deep — 20–40 steps for the goal (recommended)'), el('option', { value: 'exhaustive' }, 'Exhaustive — 40+ steps for the goal')); depth.value = 'deep';
      const apps = el('select', { class: 'noema-input' }, el('option', { value: '2-4' }, '2–4 applications'), el('option', { value: '3-6' }, '3–6 applications'), el('option', { value: '5-8' }, '5–8 applications')); apps.value = '3-6';
      const scope = el('input', { class: 'noema-input', placeholder: 'Optional: scope, e.g. “for clinicians”, “exam: AWS SAA”, “focus on the mathematics”' });
      const constraints = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'Optional: anything else the agents must respect' });
      const provider = el('select', { class: 'noema-input' }, el('option', { value: 'auto' }, 'Automatic (Claude if its key is here, else Gemini)'), el('option', { value: 'claude' }, 'Claude'), el('option', { value: 'gemini' }, 'Gemini'));
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} step${n > 1 ? 's' : ''} ahead` : 'only when I open a step'))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: '8' });
      const err = el('div', { class: 'tiny cg-kstat bad' });
      const go = el('button', { class: 'btn primary cg-go', onclick: () => {
        err.textContent = '';
        if (goal.value.trim().length < 3) { err.textContent = '👆 Type the goal topic first.'; goal.focus(); return; }
        if (!LLM().pick(acc, provider.value)) { err.textContent = '👆 Add a Claude API key or a Gemini key first (above).'; return; }
        const [a1, a2] = apps.value.split('-').map(Number);
        const c = C().blank({ goal: goal.value, language: lang.value, learner: learner.value, depth: depth.value, apps: [a1, a2], scope: scope.value, constraints: constraints.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8) });
        C().save(acc, c); close(); progress(acc, c, { onStudy, start: true });
      } }, '🧭 Build my curriculum');
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); library(acc, { onStudy }); } }, '← Curricula'),
        head('➕ New curriculum', 'Four AI agents map what you need to learn: every prerequisite, the whole goal, and its applications.'),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Which AI builds it?'), tip('The keys stay on this device. Building the map costs cents to about a dollar with Claude; each step is prepared later, a few at a time.')), keysBox(acc), el('label', { class: 'cg-field' }, 'Use', provider)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'What do you want to master?'), tip('One topic, as specific or as broad as you like. The agents find what you need before it (prerequisites) and where it is used (applications).')), goal,
            el('label', { class: 'cg-field' }, 'Language of the course', lang), el('label', { class: 'cg-field' }, 'Your starting point', learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'How big?'), tip('Depth decides how finely the goal itself is split. The prerequisites are always as complete as needed for your starting point.')),
            el('label', { class: 'cg-field' }, 'Depth', depth), el('label', { class: 'cg-field' }, 'Applications', apps),
            el('details', { class: 'cg-faq' }, el('summary', {}, 'More options'), el('label', { class: 'cg-field' }, 'Scope', scope), el('label', { class: 'cg-field' }, 'Requirements', constraints))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Preparing the steps'), tip('Every step becomes a full subject, made from official sources. noema-lite prepares the next open steps in the background while the app is open, so they are ready when you get there.')),
            el('label', { class: 'cg-field' }, 'Prepare ahead', prefetch), el('label', { class: 'cg-field' }, 'Claude: stop and ask me when one step costs more than $', budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Build')), go, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      setTimeout(() => goal.focus(), 200);
    });
  }

  /* ======================= building progress ======================= */
  const STAGES = [['dag', '🧭 Agent 1 · all prerequisites + applications'], ['audit', '🔍 Agent 1b · are the prerequisites complete?'], ['expand', '🎯 Agent 2 · the whole goal, in depth'], ['plan', '📚 Agent 3 · chapters, learning goals, outcomes']];
  const stagesOf = c => c.imported ? [['import', '📥 Your map — imported as it is (no AI mapping)'], STAGES[3]] : STAGES;
  function progress(acc, c, { onStudy, start = false } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      let ctl = null;
      const stages = el('ol', { class: 'cm-stages' }); const log = el('ol', { class: 'cg-log', 'aria-live': 'polite' }); const status = el('div', { class: 'cg-status' }); const actions = el('div', { class: 'row' }); const bar = el('div', { class: 'cm-bar' }, el('i', {}));
      const paint = () => {
        const SG = stagesOf(c); const i = SG.findIndex(s => s[0] === c.stage);
        stages.innerHTML = ''; SG.forEach(([k, t], j) => stages.append(el('li', { class: c.stage === 'done' || j < i ? 'done' : j === i ? (ctl ? 'now' : 'wait') : '' }, (c.stage === 'done' || j < i ? '✅ ' : j === i && ctl ? '⏳ ' : '◻️ ') + t)));
        status.className = 'cg-status ' + c.status;
        status.textContent = ctl ? '🧠 The agents are working — keep this page open (other tabs are fine).' : c.status === 'ready' ? '✅ Your curriculum is ready.' : c.status === 'failed' ? '⚠️ ' + (c.error || 'Stopped') : c.status === 'paused' ? '⏸️ Paused.' : '';
        actions.innerHTML = '';
        if (ctl) actions.append(el('button', { class: 'btn', onclick: () => ctl.abort() }, '⏹ Stop'));
        else if (c.status === 'ready') actions.append(el('button', { class: 'btn primary', onclick: () => { close(); map(acc, c.id, { onStudy }); } }, '🗺️ Open the map'));
        else actions.append(el('button', { class: 'btn primary', onclick: run }, '▶ Continue'), el('button', { class: 'btn small ghost', onclick: () => { if (confirm('Delete this curriculum?')) { C().remove(acc, c.id); close(); library(acc, { onStudy }); } } }, '🗑 Delete'));
      };
      const add = m => { log.append(el('li', {}, m)); while (log.children.length > 120) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
      (c.log || []).slice(-30).forEach(x => add(x.m));
      async function run() {
        ctl = new AbortController(); paint();
        const wl = await navigator.wakeLock?.request('screen').catch(() => null);
        try { c = await C().build(acc, c, { signal: ctl.signal, onLog: (m, cur, extra) => { c = cur; add(m); if (extra?.progress) bar.firstChild.style.width = fmtPct(extra.progress); paint(); } }); }
        finally { wl?.release?.(); ctl = null; paint(); }
        if (c.status === 'ready') { G().kick(); }
      }
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { if (ctl && !confirm('The agents work only while this window is open. Stop?')) return; ctl?.abort(); close(); library(acc, { onStudy }); } }, '← Curricula'),
        head(`🧭 “${c.title || c.goal}”`, c.imported ? `${C().LANG[c.language] || c.language} · your map, ${Object.keys(c.nodes).length} steps · ${c.learner || 'from the basics'}` : `${C().LANG[c.language] || c.language} · ${c.depth} · ${c.learner || 'from the basics'}`), stages, bar, status, actions,
        el('details', { class: 'cg-logbox', open: true }, el('summary', {}, 'What the agents are doing'), log));
      paint(); if (start || c.status === 'building') run();
    }, { closable: false });
  }


  /* ======================= ✏️ editing a step / 📝 reviewing it before it is prepared ======================= */
  const RLABEL = { foundation: '🧱 Prerequisite', intro: '🚪 Introduction to the goal', aspect: '🎯 Aspect of the goal', subtopic: '🔹 Sub-topic of the goal', related: '🔗 Related topic', synthesis: '🏁 Synthesis', application: '🚀 Application' };
  function editStep(acc, cid, id, { mode = 'edit', onDone = () => { } } = {}) {
    const E = C().Edit; let c = C().get(acc, cid); const n = id ? c.nodes[id] : null; const locked = n && E.generated(n);
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-editor');
      const T = x => c.nodes[x]?.title || x;
      const title = el('input', { class: 'noema-input', value: n?.title || '', placeholder: 'Name of the step', maxlength: '120' });
      const summary = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'What this step teaches (one or two sentences)' }); summary.value = n?.summary || '';
      const role = el('select', { class: 'noema-input' }, ...E.ROLES.map(r => el('option', { value: r }, RLABEL[r]))); role.value = n?.role === 'goal' ? 'intro' : (n?.role || 'foundation');
      let parents = n ? c.edges.filter(e => e.to === id).map(e => e.from) : [], children = n ? c.edges.filter(e => e.from === id).map(e => e.to) : [];
      const links = (label, get, set, possible) => { const wrap = el('div', { class: 'cm-links' }); const draw = () => { wrap.innerHTML = ''; const cur = get(); const opts = possible().filter(x => !cur.includes(x)).sort((a, b) => T(a).localeCompare(T(b)));
        const sel = el('select', { class: 'noema-input', 'aria-label': 'Add ' + label }, el('option', { value: '' }, `➕ Add a ${label}…`), ...opts.map(x => el('option', { value: x }, T(x))));
        sel.addEventListener('change', () => { if (sel.value) { set([...cur, sel.value]); draw(); } });
        wrap.append(el('div', { class: 'cm-linkchips' }, ...cur.map(x => el('span', { class: 'cm-linkchip' }, T(x), el('button', { 'aria-label': 'Remove ' + T(x), onclick: () => { set(cur.filter(y => y !== x)); draw(); } }, '✕'))), cur.length ? null : el('span', { class: 'tiny' }, 'none')), sel); };
        draw(); return wrap; };
      const possibleP = () => n ? E.possibleParents(c, id).filter(x => !children.includes(x)) : Object.keys(c.nodes).filter(x => !children.includes(x));
      const possibleK = () => n ? E.possibleChildren(c, id).filter(x => !parents.includes(x)) : Object.keys(c.nodes).filter(x => !parents.includes(x));
      const goals = el('textarea', { class: 'noema-input', rows: 3, placeholder: 'One per line: “You can explain …”', disabled: locked }); goals.value = (n?.learningGoals || []).join('\n');
      let chapters = (n?.chapters || []).map(ch => ({ ...ch }));
      const chBox = el('ol', { class: 'cm-chedit' });
      const drawCh = () => {
        chBox.innerHTML = '';
        chapters.forEach((ch, i) => {
          const t = el('input', { class: 'noema-input', value: ch.title, 'aria-label': `Chapter ${i + 1} title`, disabled: locked, oninput: e => { ch.title = e.target.value; } });
          const g = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: 'Teaching goals — one per line', oninput: e => { ch.goals = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); g.value = (ch.goals || []).join('\n');
          const cv = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: 'Must cover — one per line', oninput: e => { ch.coverage = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); cv.value = (ch.coverage || []).join('\n');
          chBox.append(el('li', { class: 'cm-chrow' }, el('div', { class: 'cm-chline' }, t, locked ? null : [
            el('button', { class: 'btn small ghost', title: 'Move up', 'aria-label': 'Move chapter up', disabled: !i, onclick: () => { [chapters[i - 1], chapters[i]] = [chapters[i], chapters[i - 1]]; drawCh(); } }, '▲'),
            el('button', { class: 'btn small ghost', title: 'Move down', 'aria-label': 'Move chapter down', disabled: i === chapters.length - 1, onclick: () => { [chapters[i + 1], chapters[i]] = [chapters[i], chapters[i + 1]]; drawCh(); } }, '▼'),
            el('button', { class: 'btn small ghost', title: 'Remove', 'aria-label': 'Remove chapter', onclick: () => { chapters.splice(i, 1); drawCh(); } }, '✕')]),
            el('details', {}, el('summary', { class: 'tiny' }, 'Goals and coverage'), g, cv)));
        });
        if (!chapters.length) chBox.append(el('li', { class: 'tiny cm-empty' }, 'No chapters yet — add them, or let the AI plan them.'));
      };
      drawCh();
      const instr = el('input', { class: 'noema-input', placeholder: 'Optional wish for the AI, e.g. “more clinical examples”, “skip the history”' });
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('span', { class: 'tiny' });
      // 📎 the learner's own files for this step: the step is planned and built from them (no web research of the theory)
      const matBox = el('div', { class: 'cm-mat' });
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const drawMat = () => {
        matBox.innerHTML = ''; if (!n) return; const cc = C().get(acc, cid); const cur = cc?.nodes[id]?.material?.files || [];
        matBox.append(cur.length ? el('ul', { class: 'cm-matlist' }, ...cur.map(f => {
          const shared = f.fileId ? Object.values(cc.nodes).filter(x => x.id !== id && (x.material?.files || []).some(f2 => f2.fileId === f.fileId)) : [];
          const rg = el('input', { class: 'noema-input cm-range', placeholder: 'all pages', value: f.range ? `${f.range[0]}–${f.range[1]}` : '', disabled: locked, 'aria-label': 'Pages of ' + f.name + ' for this step', title: 'Only these pages of the file belong to this step (empty = the whole file)',
            onchange: e => { const r = E.setMaterialRange(acc, cid, id, f.srcId, parseRange(e.target.value)); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ pages saved — ✨ re-plan the chapters to follow them'; } });
          return el('li', {}, el('button', { class: 'linklike', title: '👁 Open', onclick: () => openMaterial(acc, cid, id, f) }, '📄 ' + f.name), el('span', { class: 'tiny' }, f.pages ? ` · ${f.pages} p.` : ''),
            f.pages || f.range ? el('label', { class: 'tiny cm-rangel' }, 'pages ', rg) : null,
            shared.length ? el('span', { class: 'tiny', title: 'The same file, stored once' }, ` · also for ${shared.map(x => '“' + x.title + '”').join(', ')}`) : null,
            locked ? null : el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name, onclick: async () => { await E.removeMaterial(acc, cid, id, f.srcId); drawMat(); } }, '✕'));
        })) : el('div', { class: 'tiny' }, 'None — the AI researches this step from authoritative sources.'));
        if (locked) return;
        const pg = el('input', { class: 'noema-input cm-range', placeholder: 'pages, e.g. 40–62 (optional)', 'aria-label': 'Pages for the next file' });
        const known = Object.entries(cc.files || {});
        const reuse = known.length ? el('select', { class: 'noema-input', 'aria-label': 'Use a file of this curriculum', onchange: async e => { const fid = e.target.value; if (!fid) return; busy.textContent = '⏳ …'; const r = await E.addMaterial(acc, cid, id, [{ fileId: fid, range: parseRange(pg.value) }]); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ added — ✨ re-plan the chapters to follow it'; drawMat(); } },
          el('option', { value: '' }, '📚 Use a file of this curriculum…'), ...known.map(([fid, x]) => el('option', { value: fid }, `${x.name}${x.pages ? ' (' + x.pages + ' p.)' : ''}`))) : null;
        matBox.append(el('div', { class: 'row cm-matadd' },
          el('label', { class: 'btn small' }, '📎 Add files', el('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async e => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; busy.textContent = '⏳ Reading the files…'; const r = await E.addMaterial(acc, cid, id, fs.map(file => ({ file, range: parseRange(pg.value) }))); busy.textContent = r.error ? '⚠️ ' + r.error : `✓ ${r.added.length} file(s) added — ✨ re-plan the chapters to follow them`; drawMat(); } })),
          reuse, pg));
      };
      drawMat();
      const collect = () => ({ title: title.value, summary: summary.value, role: role.value, parents, children, ...(locked ? {} : { learningGoals: goals.value.split('\n'), chapters }) });
      const save = () => { err.textContent = ''; const r = n ? E.update(acc, cid, id, collect()) : null; if (r?.error) { err.textContent = '⚠️ ' + r.error; return false; } return true; };
      const replan = el('button', { class: 'btn small', disabled: locked, onclick: async () => {
        if (n && !save()) return; busy.textContent = '⏳ The AI is planning the chapters…'; replan.disabled = true;
        try { await E.plan(acc, cid, [id], { instruction: instr.value.trim() }); c = C().get(acc, cid); chapters = c.nodes[id].chapters.map(ch => ({ ...ch })); goals.value = c.nodes[id].learningGoals.join('\n'); drawCh(); busy.textContent = '✓ New plan — check it, change what you like, then save.'; }
        catch (e) { busy.textContent = '⚠️ ' + e.message; } replan.disabled = false;
      } }, '✨ Re-plan the chapters with AI');
      const head2 = mode === 'review' ? head('📝 Review this step before it is prepared', 'Change anything you like — the name, the goals, the chapters. When you confirm, the material is generated; after that the chapters can no longer change.')
        : mode === 'add' ? head('➕ Add a step', 'Name it, place it with its prerequisites and dependents; the AI can plan its chapters.')
          : head('✏️ Edit the step', locked ? 'Already prepared: you can rename it, move it and change its links; its chapters are fixed.' : 'Everything can change until the step is prepared.');
      const buttons = mode === 'review'
        ? [el('button', { class: 'btn primary', onclick: () => { if (!save()) return; close(); G().request(C().get(acc, cid), id, { resume: true }); toast('⏳ Preparing “' + title.value + '” — 5–30 minutes; study something else meanwhile.', 5000); onDone(); } }, '✅ Looks good — prepare it'),
          el('button', { class: 'btn small', onclick: () => { if (save()) { close(); onDone(); } } }, 'Save changes only')]
        : mode === 'add'
          ? [el('button', { class: 'btn primary', onclick: async () => {
              err.textContent = ''; if (!title.value.trim()) { err.textContent = '👆 Give the step a name.'; return; }
              const r = E.add(acc, cid, { title: title.value, summary: summary.value, role: role.value, parents, children }); if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
              if (chapters.length || goals.value.trim()) E.update(acc, cid, r.id, { chapters, learningGoals: goals.value.split('\n') });
              else { busy.textContent = '⏳ The AI is planning its chapters…'; try { await E.plan(acc, cid, [r.id], { instruction: instr.value.trim() }); } catch (e) { toast('⚠️ Chapters not planned: ' + e.message, 5000); } }
              close(); onDone(r.id); } }, '➕ Add the step')]
          : [el('button', { class: 'btn primary', onclick: () => { if (save()) { close(); onDone(); toast('✔ Saved'); } } }, 'Save'),
            el('button', { class: 'btn small danger', onclick: async () => {
              const bridge = confirm(`Remove “${n.title}” from the map?\n\nOK = its prerequisites become prerequisites of the steps after it (keeps the order).\nCancel = do not remove.`); if (!bridge) return;
              const delMat = n.pack?.id ? confirm('Also delete the material already prepared for this step?\nOK = delete it · Cancel = keep it as a normal subject') : false;
              await E.remove(acc, cid, id, { bridge: true, deleteMaterial: delMat }); close(); onDone(null); toast('🗑 Step removed'); } }, '🗑 Remove the step')];
      box.append(head2,
        el('div', { class: 'noema-form' },
          el('label', { class: 'cg-field' }, 'Name', title), el('label', { class: 'cg-field' }, 'What it teaches', summary), el('label', { class: 'cg-field' }, 'Place in the curriculum', role),
          el('div', { class: 'cg-field' }, el('b', {}, '⬅️ Prerequisites (must be mastered first)'), links('prerequisite', () => parents, v => { parents = v; }, possibleP)),
          el('div', { class: 'cg-field' }, el('b', {}, '➡️ Opens these steps'), links('dependent step', () => children, v => { children = v; }, possibleK)),
          n ? el('div', { class: 'cg-field' }, el('b', {}, '📎 Your material for this step'), tip('Files you give a step are its sources: its chapters are planned from them and its subject is built from them (with Claude: inside its sandbox; with Gemini: from their text) — no web research of the theory. Steps without files are researched as usual.'), matBox) : null,
          el('label', { class: 'cg-field' }, 'Learning goals' + (locked ? ' (fixed — already prepared)' : ''), goals),
          el('div', { class: 'cg-field' }, el('b', {}, `📖 Chapters${locked ? ' (fixed — already prepared)' : ''}`), chBox,
            locked ? null : el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { chapters.push({ title: '', goals: [], coverage: [] }); drawCh(); chBox.querySelector('li:last-child input')?.focus(); } }, '➕ Add a chapter'), replan),
            locked ? null : instr, busy)),
        err, el('div', { class: 'row noema-ovfoot' }, ...buttons, el('button', { class: 'btn small', onclick: close }, 'Cancel')));
      setTimeout(() => (mode === 'review' ? box.querySelector('.cm-chedit input') : title)?.focus(), 150);
    });
  }
  async function openMaterial(acc, cid, id, f) {
    const c = C().get(acc, cid); const rec = await C().materialFile(acc, c, id, f).catch(() => null);
    if (!rec?.blob) { toast('⚠️ This file is not on this device and could not be downloaded.', 4000); return; }
    window.NoemaViewer.open({ blob: rec.blob, name: f.name, type: rec.type, title: f.name, subtitle: c.nodes[id]?.title + (f.range ? ` · pages ${f.range[0]}–${f.range[1]}` : ''), page: f.range ? f.range[0] : undefined });
  }

  /* ======================= 📥 import a map you already have ======================= */
  function importMap(acc, { onStudy } = {}) {
    const I = window.NoemaCurImport;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-import');
      let parsed = null, aiParsed = null, files = [], sel = null, filter = 'all', dragging = null;
      const A = new Map();   // file → { targets: [{ id, range }], how, confidence, alts, manual }
      const text = el('textarea', { class: 'noema-input cm-maptext', rows: 12, spellcheck: 'false', placeholder: 'Paste your map — a tree like\nCell biology\n├── Prerequisites\n├── Membranes\n│   └── Transport\n└── Applications\n\n…arrows (Algebra → Calculus), a Mermaid graph or JSON.' });
      const fileIn = el('input', { type: 'file', accept: '.txt,.md,.markdown,.json,.mmd,.mermaid', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (f) { text.value = await f.text(); aiParsed = null; reparse(); } } });
      const mode = el('select', { class: 'noema-input', onchange: () => reparse() }, el('option', { value: 'sequence' }, 'in the order written (each after the previous one)'), el('option', { value: 'parallel' }, 'in any order (each after its parent topic)'));
      const reverse = el('input', { type: 'checkbox', onchange: () => reparse() }), keepCaps = el('input', { type: 'checkbox', onchange: () => reparse() });
      const info = el('div', { class: 'tiny cm-detect' }), perr = el('div', { class: 'tiny cg-kstat bad' }), warnBox = el('div', { class: 'tiny cm-warns' });
      const graph = el('div', { class: 'cm-miniscroll', 'aria-label': 'Preview of the map' }), nodeBox = el('div', { class: 'cm-nodebox' }), prev = el('ol', { class: 'cm-preview' });
      const title = el('input', { class: 'noema-input', placeholder: 'Name of the curriculum' });
      const lang = el('select', { class: 'noema-input' }, ...Object.entries(C().LANG).map(([v, t]) => el('option', { value: v }, t))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: 'Optional: what you already know' });
      const provider = el('select', { class: 'noema-input' }, el('option', { value: 'auto' }, 'Automatic (Claude if its key is here, else Gemini)'), el('option', { value: 'claude' }, 'Claude'), el('option', { value: 'gemini' }, 'Gemini'));
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} step${n > 1 ? 's' : ''} ahead` : 'only when I open a step'))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: '8' });
      const fileBox = el('div', { class: 'cm-files' }), fileSum = el('div', { class: 'tiny cm-filesum' });
      const drop = el('label', { class: 'cg-drop' }, '📎 Add the material (PDF, Word, slides, notes… or a .zip)', el('input', { type: 'file', multiple: true, onchange: e => { addFiles([...e.target.files]); e.target.value = ''; } }));
      const folder = el('label', { class: 'btn small' }, '📁 Add a folder', el('input', { type: 'file', multiple: true, webkitdirectory: true, style: { display: 'none' }, onchange: e => { addFiles([...e.target.files].filter(f => !/(^|\/)\./.test(f.webkitRelativePath || f.name))); e.target.value = ''; } }));
      ['dragover', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); }));
      const aiBtn = el('button', { class: 'btn small ai', onclick: async () => {
        perr.textContent = ''; if (!text.value.trim()) { perr.textContent = '👆 Paste your map first.'; return; }
        if (!LLM().pick(acc, provider.value)) { perr.textContent = '👆 The AI needs a Claude or Gemini key (step 4).'; return; }
        aiBtn.disabled = true; info.textContent = '✨ The AI is reading your map…';
        try { aiParsed = await I.aiRead(acc, text.value, { provider: provider.value, onLog: m => { info.textContent = m; } }); show(aiParsed); } catch (e) { perr.textContent = '⚠️ ' + e.message; info.textContent = ''; }
        aiBtn.disabled = false;
      } }, '✨ Let the AI read it');
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('div', { class: 'tiny' });
      const FMT = { outline: 'tree / outline', arrows: 'arrows', mermaid: 'Mermaid graph', json: 'JSON', ai: 'read by the AI' };
      const T = id => parsed?.nodes[id]?.title || id;
      const nFiles = id => [...A.values()].filter(a => a.targets.some(t => t.id === id)).length;
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const fmtRange = r => r ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : '';
      const addTarget = (f, id) => { const a = A.get(f); if (!a || a.targets.some(t => t.id === id)) return; a.targets.push({ id, range: null }); a.manual = true; a.confidence = 'high'; a.how = a.how || 'you'; redraw(); };

      /* ---- the map as a picture: branches and joins are visible; drop a file on a step ---- */
      function drawGraph() {
        graph.innerHTML = ''; if (!parsed) return;
        const Lt = C().layout({ nodes: parsed.nodes, edges: parsed.edges }); const NW = 158, NH = 44, GX = 30, GY = 10;
        const rows = Math.max(1, ...Lt.cols.map(c => c.length)); const Wd = Lt.cols.length * (NW + GX) + 8, Hd = rows * (NH + GY) + 8;
        const P = {}; Lt.cols.forEach((col, x) => { const off = (rows - col.length) * (NH + GY) / 2; col.forEach((id, y) => { P[id] = { x: 4 + x * (NW + GX), y: 4 + off + y * (NH + GY) }; }); });
        const inner = el('div', { class: 'cm-mini', style: { width: Wd + 'px', height: Hd + 'px' } });
        const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd); svg.setAttribute('class', 'cm-edges');
        for (const e of parsed.edges) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; const p = document.createElementNS(NS, 'path'); const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2; p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); if (sel && (e.from === sel || e.to === sel)) p.setAttribute('class', 'hl'); svg.append(p); }
        inner.append(svg);
        for (const id of parsed.order) {
          const n = parsed.nodes[id], k = nFiles(id), ins = parsed.edges.filter(e => e.to === id).length, outs = parsed.edges.filter(e => e.from === id).length;
          const b = el('button', { class: 'cm-mnode cm-r-' + n.role + (sel === id ? ' sel' : '') + (k ? ' has' : ''), 'data-id': id, style: { left: P[id].x + 'px', top: P[id].y + 'px', width: NW + 'px', height: NH + 'px' }, title: `${n.title}${ins > 1 ? ' · needs ' + ins + ' steps (join)' : ''}${outs > 1 ? ' · opens ' + outs + ' steps (branch)' : ''}\n${k ? '📎 ' + k + ' file(s)' : 'no files — researched by the AI'}\nDrop a file here to give it to this step`,
            onclick: () => { sel = sel === id ? null : id; drawGraph(); drawNode(); },
            ondragover: e => { e.preventDefault(); b.classList.add('over'); }, ondragleave: () => b.classList.remove('over'),
            ondrop: e => { e.preventDefault(); b.classList.remove('over'); const raw = e.dataTransfer.getData('text/noema-file') || e.dataTransfer.getData('text/plain'); const i = /^\d+$/.test(raw) ? +raw : (dragging ?? -1); dragging = null; if (files[i]) addTarget(files[i], id); else if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], id); } },
            el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, n.title), k ? el('span', { class: 'cm-mbadge' }, '📎' + k) : null);
          inner.append(b);
        }
        graph.append(inner);
      }
      /* ---- the selected step: its files (pages per step), add one ---- */
      function drawNode() {
        nodeBox.innerHTML = ''; if (!parsed || !sel || !parsed.nodes[sel]) return;
        const mine = [...A.entries()].filter(([, a]) => a.targets.some(t => t.id === sel));
        const add = el('select', { class: 'noema-input', 'aria-label': 'Give a file to this step', onchange: e => { const f = files[+e.target.value]; if (f) addTarget(f, sel); } }, el('option', { value: '' }, files.length ? '＋ Give it a file…' : 'Add files below first'), ...files.map((f, i) => el('option', { value: i }, relPath(f))));
        nodeBox.append(el('div', { class: 'cm-nodehead' }, el('b', {}, '📎 ' + T(sel)), el('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => { sel = null; redraw(); } }, '✕')),
          mine.length ? el('ul', { class: 'cm-matlist' }, ...mine.map(([f, a]) => { const t = a.targets.find(x => x.id === sel); return el('li', {}, '📄 ' + relPath(f), rangeInput(f, t), el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name + ' from this step', onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕')); }))
            : el('div', { class: 'tiny' }, 'No files — the AI will research this step (or drop a file on it).'), add);
      }
      const rangeInput = (f, t) => el('label', { class: 'tiny cm-rangel' }, ' pages ', el('input', { class: 'noema-input cm-range', value: fmtRange(t.range), placeholder: 'all', 'aria-label': `Pages of ${f.name} for “${T(t.id)}”`, onchange: e => { t.range = parseRange(e.target.value); A.get(f).manual = true; } }));
      const relPath = f => String(f.hint || f.webkitRelativePath || f.name);

      function show(g) {
        parsed = g; prev.innerHTML = ''; perr.textContent = ''; warnBox.innerHTML = '';
        if (sel && !(g && g.nodes[sel])) sel = null;
        if (!g) { info.textContent = ''; redraw(); return; }
        const s = g.stats || {}; const planned = Object.values(g.nodes).filter(n => n.chapters?.length).length;
        info.textContent = `✓ ${FMT[g.format] || g.format}: ${s.steps} steps · ${s.links} links` + (s.branches ? ` · ${s.branches} branch${s.branches > 1 ? 'es' : ''}` : '') + (s.joins ? ` · ${s.joins} join${s.joins > 1 ? 's' : ''}` : '') + (s.starts > 1 ? ` · ${s.starts} starting points` : '') + (planned ? ` · ${planned} with their chapters` : '') + (s.named ? ` · files named for ${s.named} step(s)` : '');
        if (g.warnings.length) warnBox.append(...g.warnings.slice(0, 6).map(w => el('div', {}, '⚠️ ' + w)));
        if (!title.value.trim() || title.dataset.auto) { title.value = g.title || ''; title.dataset.auto = '1'; }
        if (g.language && C().LANG[g.language]) lang.value = g.language;
        g.order.forEach(id => { const ps = g.edges.filter(e => e.to === id).map(e => T(e.from)); prev.append(el('li', {}, el('span', { class: 'cm-ic' }, ICON[g.nodes[id].role] || '•'), ' ', el('b', {}, T(id)), ps.length ? el('span', { class: 'tiny' }, '  ← ' + ps.join(', ')) : el('span', { class: 'tiny' }, '  (starts here)'))); });
        rematch(); redraw();
      }
      let t0 = null;
      function reparse() {
        clearTimeout(t0); t0 = setTimeout(() => {
          if (!text.value.trim()) { show(null); return; }
          if (aiParsed) { show(aiParsed); return; }
          try { show(I.parse(text.value, { mode: mode.value, reverse: reverse.checked, keepCaps: keepCaps.checked })); }
          catch (e) { parsed = null; prev.innerHTML = ''; info.textContent = ''; perr.textContent = '⚠️ ' + e.message + (LLM().pick(acc, provider.value) ? ' — or tap ✨ Let the AI read it.' : ''); redraw(); }
        }, 250);
      }
      text.addEventListener('input', () => { aiParsed = null; reparse(); }); title.addEventListener('input', () => { delete title.dataset.auto; });
      /** automatic matches for the files the learner has not touched (their own choices stay) */
      function rematch() {
        if (!files.length) return;
        const auto = parsed ? I.matchFiles(parsed, files) : files.map(f => ({ file: f, targets: [], confidence: 'none', alts: [] }));
        for (const m of auto) { const a = A.get(m.file); if (a?.manual) { if (parsed) a.targets = a.targets.filter(t => parsed.nodes[t.id]); continue; } A.set(m.file, { targets: m.targets.map(t => ({ ...t })), how: m.targets[0]?.how || '', confidence: m.confidence, alts: m.alts || [], manual: false }); }
      }
      async function addFiles(fs, toStep) {
        const added = [];
        for (const f of fs) {
          if (/\.zip$/i.test(f.name)) { try { const inner = await I.unzipMaterial(f); for (const g of inner) if (!files.some(x => relPath(x) === relPath(g) && x.size === g.size)) { files.push(g); added.push(g); } } catch (e) { toast('⚠️ ' + f.name + ': ' + e.message, 4000); } continue; }
          if (!files.some(x => relPath(x) === relPath(f) && x.size === f.size)) { files.push(f); added.push(f); }
        }
        rematch();
        if (toStep) for (const f of added) addTarget(f, toStep);
        redraw();
      }
      const BADGE = { high: ['✓', 'sure'], medium: ['≈', 'likely'], low: ['?', 'guess — check'], check: ['⚠️', 'check: more than one step fits'], none: ['—', 'not used'] };
      const HOW = { map: 'named in your map', folder: 'by its folder', number: 'by its number', name: 'by its name', you: 'by you' };
      function drawFiles() {
        fileBox.innerHTML = ''; fileSum.textContent = '';
        if (!files.length) return;
        const all = files.map((f, i) => ({ f, i, a: A.get(f) || { targets: [], confidence: 'none', alts: [] } }));
        const unused = all.filter(x => !x.a.targets.length), check = all.filter(x => x.a.targets.length && (x.a.confidence === 'check' || x.a.confidence === 'low') && !x.a.manual);
        const stepsWith = parsed ? parsed.order.filter(id => nFiles(id)).length : 0;
        fileSum.textContent = `${files.length} file(s) · ${stepsWith}/${parsed ? parsed.order.length : 0} steps have files` + (check.length ? ` · ⚠️ ${check.length} to check` : '') + (unused.length ? ` · ${unused.length} not used` : '');
        const tabs = el('div', { class: 'cm-filetabs', role: 'tablist' }, ...[['all', `All ${all.length}`], ['check', `⚠️ To check ${check.length}`], ['unused', `Not used ${unused.length}`]].map(([k, l]) => el('button', { class: 'fchip' + (filter === k ? ' on' : ''), role: 'tab', onclick: () => { filter = k; drawFiles(); } }, l)));
        const rows = (filter === 'check' ? check : filter === 'unused' ? unused : all);
        fileBox.append(tabs, el('table', { class: 'cm-filetable' }, el('tbody', {}, ...rows.map(({ f, i, a }) => {
          const conf = a.manual ? ['✓', 'set by you'] : BADGE[a.confidence] || BADGE.none;
          const chips = el('div', { class: 'cm-chips' }, ...a.targets.map(t => el('span', { class: 'cm-tchip' }, el('button', { class: 'linklike', onclick: () => { sel = t.id; redraw(); graph.querySelector(`[data-id="${CSS.escape(t.id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); } }, T(t.id)), rangeInput(f, t),
            el('button', { class: 'btn small ghost', 'aria-label': `Remove ${f.name} from “${T(t.id)}”`, onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕'))));
          const addSel = el('select', { class: 'noema-input cm-addstep', 'aria-label': (a.targets.length ? 'Another step for ' : 'Step for ') + f.name, onchange: e => { if (e.target.value) addTarget(f, e.target.value); } },
            el('option', { value: '' }, a.targets.length ? '＋ also for…' : '— choose a step —'), ...(parsed ? parsed.order.filter(id => !a.targets.some(t => t.id === id)).map(id => el('option', { value: id }, T(id))) : []));
          const alts = !a.manual && a.alts?.length ? el('div', { class: 'tiny' }, 'or: ', ...a.alts.map((id, k) => [k ? ', ' : '', el('button', { class: 'linklike', onclick: () => { a.targets = [{ id, range: null }]; a.manual = true; redraw(); } }, T(id))])) : null;
          return el('tr', { draggable: 'true', ondragstart: e => { dragging = i; e.dataTransfer.setData('text/noema-file', String(i)); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'copy'; }, ondragend: () => { setTimeout(() => { dragging = null; }, 0); } },
            el('td', {}, el('span', { class: 'cm-conf c-' + (a.manual ? 'high' : a.confidence), title: conf[1] }, conf[0]), ' 📄 ', el('b', {}, f.name), el('div', { class: 'tiny' }, relPath(f) !== f.name ? relPath(f).replace(/[^/]+$/, '') + ' · ' : '', (f.size / 1048576).toFixed(1) + ' MB' + (a.targets.length ? ' · ' + (a.manual ? HOW.you : HOW[a.how] || '') : ''))),
            el('td', {}, chips, alts, addSel),
            el('td', {}, el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name, onclick: () => { files = files.filter(x => x !== f); A.delete(f); redraw(); } }, '✕')));
        }))));
      }
      function redraw() { drawGraph(); drawNode(); drawFiles(); }
      const go = el('button', { class: 'btn primary cg-go', onclick: async () => {
        err.textContent = '';
        if (!parsed) { err.textContent = '👆 Paste a map that can be read (step 1).'; return; }
        const needPlan = Object.values(parsed.nodes).some(n => !n.chapters?.length);
        if (needPlan && !LLM().pick(acc, provider.value)) { err.textContent = '👆 Planning the chapters needs a Claude API key or a Gemini key (step 4).'; return; }
        const big = files.find(f => f.size > (window.NoemaSrcFiles?.MAX || 2147483648)); if (big) { err.textContent = `⚠️ ${big.name} is too big for a browser to keep (over 2 GB).`; return; }
        go.disabled = true;
        try {
          const assignments = files.map(f => ({ file: f, targets: (A.get(f)?.targets || []).filter(t => parsed.nodes[t.id]) })).filter(a => a.targets.length);
          const c = await I.create(acc, parsed, { title: title.value.trim(), language: lang.value, learner: learner.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8), assignments, source: text.value, onLog: m => { busy.textContent = m; } });
          close(); if (c.status === 'ready') { G().kick(); map(acc, c.id, { onStudy }); } else progress(acc, c, { onStudy, start: true });
        } catch (e) { err.textContent = '⚠️ ' + e.message; go.disabled = false; }
      } }, '📥 Import my map');
      const ex = (h1, code) => el('div', { class: 'cm-ex' }, el('b', {}, h1), el('pre', {}, code));
      const syntax = el('details', { class: 'cg-faq' }, el('summary', {}, '✍️ How to write a map (and name its files)'),
        el('p', { class: 'tiny' }, 'Any shape works: a step may open several steps (a branch) and need several (a join). Only a circle of “needs” is refused.'),
        ex('Tree / outline — numbered levels follow each other; “(any order)” makes a level independent; “(after: …)” adds links', 'Molecular biology\n├── Prerequisites\n├── DNA (any order)\n│   ├── Structure 📎 dna/structure.pdf\n│   └── Replication\n├── Transcription (after: Structure)\n└── Applications'),
        ex('Arrows — one chain per line; “A, B → C” is a join, “A → B, C” a branch', 'Algebra → Calculus → Probability\nCalculus → Linear algebra\nProbability, Linear algebra → Bayesian inference'),
        ex('Mermaid', 'flowchart LR\n  A[Algebra] --> B[Calculus 📎 calc.pdf pp. 3–9]\n  A --> C[Logic]\n  B & C --> D[Proofs]\n%% 📎 Files\n%% D: proofs/'),
        ex('JSON', '{ "title": "Bayes", "nodes": [\n  { "id": "prob", "title": "Probability", "files": ["book.pdf pp. 1-40"] },\n  { "id": "bayes", "title": "Bayes", "after": ["prob"], "folder": "bayes/" } ] }'),
        ex('📎 A files section at the end (any text format) — keys: a step’s title, its number (2.1) or its Mermaid / JSON id', '📎 Files\nDNA replication: dna/*.pdf, notes/dna.md\n2.1: lab/\nTranscription: book.pdf pp. 40–62'),
        el('p', { class: 'tiny' }, 'Paths are matched against the files you add (with their folders). A folder (ending in /) gives every file in it; * matches any name; “pp. 40–62” or “#40-62” gives only those pages of a file to that step — one textbook can serve many steps and is stored once. Files the map does not name are matched by their folders (a sub-folder per step, “03 Transcription” too), their number or their name — check the ones marked ⚠️ or ?.'));
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); library(acc, { onStudy }); } }, '← Curricula'),
        head('📥 Import a map', 'Your own map of steps becomes the curriculum as it is — no AI redraws it. Give steps their files and they are taught from them.'),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Your map'), tip('A tree (├── └── │), an outline (bullets, numbers, indentation, # headings), arrows (A → B), a Mermaid graph (A --> B: A comes first) or JSON (nodes + prerequisites / edges, nested children, or a curriculum exported from noema-lite).')),
            text, el('div', { class: 'row' }, el('label', { class: 'btn small' }, '📄 Open a file', fileIn), aiBtn), syntax,
            el('details', { class: 'cg-faq' }, el('summary', {}, 'How to read it'), el('label', { class: 'cg-field' }, 'Topics at the same level (when not numbered and not marked)', mode), el('label', { class: 'tiny' }, reverse, ' ⇄ my arrows point from a step to what it needs (reverse them)'), el('label', { class: 'tiny' }, keepCaps, ' Keep CAPITALS as written')),
            info, perr, warnBox, graph, nodeBox, el('details', { class: 'cg-faq' }, el('summary', {}, 'The steps as a list'), prev)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Name and language')), el('label', { class: 'cg-field' }, 'Name', title), el('label', { class: 'cg-field' }, 'Language of the course', lang), el('label', { class: 'cg-field' }, 'Your starting point', learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Material of the steps (optional)'), tip('A step with files is planned and built FROM them (no web research of its theory); steps without files are researched by the AI as usual. Files are matched to steps by your map, their folders, numbers or names — change any match, give one file to several steps (with pages each), or drag a file onto a step in the map above. You can also add files later (✏️ Edit step → 📎), until the step is prepared.')), drop, el('div', { class: 'row' }, folder), fileSum, fileBox),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Which AI plans and prepares the steps?'), tip('The map is used as it is. The AI only plans the chapters of each step (from its files, when it has some) and later prepares each step as a subject.')), keysBox(acc), el('label', { class: 'cg-field' }, 'Use', provider),
            el('label', { class: 'cg-field' }, 'Prepare ahead', prefetch), el('label', { class: 'cg-field' }, 'Claude: stop and ask me when one step costs more than $', budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Import')), go, busy, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      setTimeout(() => text.focus(), 200);
    });
  }

  /* ======================= the map ======================= */
  const NW = 196, NH = 76, GX = 74, GY = 18, TOP = 64;
  function map(acc, cid, { focus, onStudy } = {}) {
    let c = C().get(acc, cid); if (!c) { toast?.('That curriculum is not on this device yet.'); return; }
    G().start(acc);
    overlay((box, close) => {
      box.classList.add('cm-full'); box.parentElement.classList.add('cm-ov');
      const phone = matchMedia('(max-width: 720px)').matches;
      let zoom = phone ? 0.78 : 1, sel = focus || null;
      const sum = el('div', { class: 'cm-sum' }); const scroller = el('div', { class: 'cm-scroll' }); const canvas = el('div', { class: 'cm-canvas' }); scroller.append(canvas);
      const panel = el('aside', { class: 'cm-panel', 'aria-live': 'polite' });
      const study = s => { close(); if (onStudy) onStudy(s); else window.Noema.switchTo(acc, s); };
      const zoomTo = z => { const r = scroller.getBoundingClientRect(); const cx = (scroller.scrollLeft + r.width / 2) / zoom, cy = (scroller.scrollTop + r.height / 2) / zoom; zoom = Math.max(0.35, Math.min(1.6, z)); drawMap(); scroller.scrollLeft = cx * zoom - r.width / 2; scroller.scrollTop = cy * zoom - r.height / 2; };
      const tools = el('div', { class: 'cm-tools' },
        el('button', { class: 'btn small', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomTo(zoom / 1.2) }, '−'), el('button', { class: 'btn small', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomTo(zoom * 1.2) }, '+'),
        el('button', { class: 'btn small', title: 'See the whole map', onclick: () => { const r = scroller.getBoundingClientRect(); zoomTo(Math.min(r.width / (+canvas.dataset.w || 1), r.height / (+canvas.dataset.h || 1))); } }, '⤢ Fit'),
        el('button', { class: 'btn small primary', onclick: () => showNext() }, '▶ Next up'),
        el('button', { class: 'btn small', title: 'Add a step', onclick: () => editStep(acc, cid, null, { mode: 'add', onDone: nid => { drawMap(); if (nid) { sel = nid; drawMap(); showPanel(nid); scrollToNode(nid); } } }) }, '➕ Step'),
        el('button', { class: 'btn small', title: 'Settings of this curriculum', onclick: () => settings() }, '⚙️'));
      box.append(el('div', { class: 'cm-top' }, el('button', { class: 'btn small ghost', onclick: () => { close(); library(acc, { onStudy }); } }, '← Curricula'), el('div', { class: 'cm-title' }, el('b', {}, '🧭 ' + (c.title || c.goal)), sum), tools, el('button', { class: 'btn small', 'aria-label': 'Close', onclick: close }, '✕')),
        el('div', { class: 'cm-body' }, scroller, panel),
        el('div', { class: 'cm-legend tiny' }, '✅ mastered · 🔓 open · 🔒 locked — master its prerequisites first · 📝 review it, then it is prepared · ⚡ prepared · ⏳ being prepared', tip('A step opens when every step before it (its prerequisites) is mastered: all its sections read and at least 80 % of its exercises solved — or the short “I already know this” test passed.')));

      function drawMap() {
        c = C().get(acc, cid) || c; const st = C().statuses(acc, c); const L = C().layout(c); const s = C().summary(acc, c);
        sum.textContent = `${s.mastered}/${s.total} mastered · ${s.open} open · ${s.ready} prepared` + (G().paused() ? ' · ⏸ preparing paused' : '');
        const rows = Math.max(...L.cols.map(col => col.length)); const W = L.cols.length * (NW + GX) + GX, H = TOP + rows * (NH + GY) + 30;
        canvas.dataset.w = W; canvas.dataset.h = H; canvas.style.width = W * zoom + 'px'; canvas.style.height = H * zoom + 'px'; canvas.innerHTML = '';
        const inner = el('div', { class: 'cm-inner', style: { width: W + 'px', height: H + 'px', transform: `scale(${zoom})` } }); canvas.append(inner);
        const P = {}; L.cols.forEach((col, x) => { const off = (rows - col.length) * (NH + GY) / 2; col.forEach((id, y) => P[id] = { x: GX / 2 + x * (NW + GX), y: TOP + off + y * (NH + GY) }); });
        // the three parts
        const goalT = c.title || c.goal;
        for (const [k, label] of [['prereq', '1 · Prerequisites'], ['core', '2 · ' + goalT], ['apps', '3 · Applications']]) { const [a, b] = L.parts[k]; if (b < a) continue; inner.append(el('div', { class: 'cm-band cm-' + k, style: { left: (a * (NW + GX) + 8) + 'px', width: ((b - a + 1) * (NW + GX) - 16) + 'px', height: (H - 8) + 'px' } }, el('span', {}, label))); }
        // edges
        const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'cm-edges');
        const rel = sel ? new Set([sel, ...c.edges.filter(e => e.to === sel).map(e => e.from), ...c.edges.filter(e => e.from === sel).map(e => e.to)]) : null;
        for (const e of c.edges) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; const p = document.createElementNS(NS, 'path'); const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2; p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); p.setAttribute('class', (st[e.from].mastered ? 'ok' : '') + (rel && (e.from === sel || e.to === sel) ? ' hl' : '') + (rel && !(e.from === sel || e.to === sel) ? ' dim' : '')); svg.append(p); }
        inner.append(svg);
        for (const [id, n] of Object.entries(c.nodes)) {
          const s2 = st[id], pk = n.pack?.status, key = c.id + '/' + id;
          const state = s2.mastered ? 'mastered' : s2.open ? 'open' : 'locked';
          const badge = s2.mastered ? '✅' : s2.locked ? '🔒' : '🔓';
          const prep = pk === 'ready' ? '⚡' : pk === 'generating' || G().busy() === key ? '⏳' : pk === 'failed' ? '⚠️' : pk === 'paused' ? '⏸️' : s2.open && !s2.mastered && !n.reviewed && !c.autoApprove ? '📝' : '';
          const b = el('button', { class: `cm-node cm-${state} cm-r-${n.role}` + (sel === id ? ' sel' : '') + (rel && !rel.has(id) ? ' dim' : ''), style: { left: P[id].x + 'px', top: P[id].y + 'px', width: NW + 'px', height: NH + 'px' }, 'data-id': id,
            'aria-label': `${n.title} — ${ROLE[n.role]} — ${state}${pk === 'ready' ? ', prepared' : ''}`, onclick: () => { sel = id; drawMap(); showPanel(id); } },
            el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, n.title), el('span', { class: 'cm-badges' }, badge, prep, n.material?.files?.length ? el('span', { title: 'Your material: ' + n.material.files.map(f => f.name).join(', ') }, '📎') : null),
            s2.score && !s2.mastered ? el('i', { class: 'cm-prog', style: { width: fmtPct(s2.score) } }) : null);
          inner.append(b);
        }
      }
      function showPanel(id) {
        c = C().get(acc, cid) || c; const n = c.nodes[id]; if (!n) return; const st = C().statuses(acc, c)[id]; const pk = n.pack || {}; const key = c.id + '/' + id;
        const T = x => c.nodes[x]?.title || x;
        const missing = st.parents.filter(p => !C().statuses(acc, c)[p].mastered);
        const live = G().live[key];
        panel.innerHTML = ''; panel.classList.add('on');
        const act = el('div', { class: 'cm-actions' });
        if (st.open || st.mastered) {
          if (pk.status === 'ready') act.append(el('button', { class: 'btn primary', onclick: () => study(pk.id) }, st.mastered ? '📖 Review' : '📖 Study this step'));
          else if (pk.status === 'generating' || G().busy() === key) act.append(el('div', { class: 'cm-live' }, '⏳ Preparing… ', el('span', { class: 'tiny' }, live?.msg || '')), el('button', { class: 'btn small', onclick: () => { G().stop(); } }, '⏸ Pause'));
          else if (pk.status === 'paused' && pk.budgetHit) { const nb = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(Math.ceil((c.nodeBudget || 8) * 1.5)) }); act.append(el('p', { class: 'tiny' }, '💰 ' + (pk.error || 'The spending limit for this step was reached.')), el('label', { class: 'tiny' }, 'New limit $ ', nb), el('button', { class: 'btn primary', onclick: () => { G().request(c, id, { resume: true, raiseBudget: +nb.value || 0 }); showPanel(id); } }, '▶ Continue')); }
          else if (!n.reviewed && !c.autoApprove && pk.status !== 'failed') act.append(el('button', { class: 'btn primary', onclick: () => editStep(acc, cid, id, { mode: 'review', onDone: () => { drawMap(); showPanel(id); } }) }, '📝 Review & prepare this step'), tip('Before the material is generated you can check and change its chapters and goals. After that the chapters are fixed.'));
          else act.append(el('button', { class: 'btn primary', onclick: () => { G().request(c, id, { resume: true }); toast?.('⏳ Preparing “' + n.title + '” — it usually takes 5–30 minutes; you can study something else meanwhile.', 5000); showPanel(id); } }, pk.status === 'failed' ? '↻ Try again' : '⚡ Prepare this step now'),
            pk.status === 'failed' ? el('p', { class: 'tiny cg-kstat bad' }, '⚠️ ' + pk.error) : null);
          if (!st.mastered) act.append(el('button', { class: 'btn small', onclick: () => test(id) }, '🎓 I already know this'), tip('A 10-question test (from the step’s own exercises when it is prepared). 8 / 10 marks it mastered and opens the next steps.'));
          else if (st.how === 'test' || st.how === 'manual') act.append(el('button', { class: 'btn small ghost', onclick: () => { C().setMastered(acc, c, id, null); drawMap(); showPanel(id); } }, '↩ Undo “mastered”'));
        } else act.append(el('p', { class: 'cm-lock' }, '🔒 Locked. Master these first: ', ...missing.map((p, i) => [i ? ', ' : '', el('a', { href: '#', onclick: e => { e.preventDefault(); sel = p; drawMap(); showPanel(p); scrollToNode(p); } }, T(p))])));
        const prog = st.mastered ? `✅ Mastered${st.how === 'test' ? ' (placement test)' : st.how === 'auto' ? '' : ''}` : pk.status === 'ready' ? `Progress: ${fmtPct(st.read)} read · ${fmtPct(st.score)} of the exercises solved (needs 100 % read + 80 % solved)` : '';
        const md = (n.chapters || []).map((ch, i) => `${i + 1}. **${String(ch.title).replace(/([*_`\\[\]])/g, '\\$1')}**`).join('\n');
        const chBox = el('div', { class: 'nx-chapters cm-chapters' });
        if (window.marked && window.DOMPurify && md) chBox.innerHTML = DOMPurify.sanitize(marked.parse(md)); else chBox.append(el('ol', {}, ...(n.chapters || []).map(ch => el('li', {}, ch.title))));
        // tap a chapter → its teaching goals and coverage
        [...chBox.querySelectorAll('li')].forEach((li, i) => { const ch = n.chapters[i]; if (!ch) return; li.tabIndex = 0; li.title = 'Show the goals of this chapter'; li.addEventListener('click', () => { const open = li.querySelector('.cm-chd'); if (open) { open.remove(); return; } li.append(el('div', { class: 'cm-chd tiny' }, el('div', {}, '🎯 ', (ch.goals || []).join(' · ')), el('div', {}, '📌 ', (ch.coverage || []).join(' · ')))); }); });
        panel.append(el('button', { class: 'btn small ghost cm-pclose', 'aria-label': 'Close the panel', onclick: () => { panel.classList.remove('on'); sel = null; drawMap(); } }, '✕'),
          el('div', { class: 'cm-ptitle' }, el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('div', {}, el('h3', {}, n.title), el('div', { class: 'tiny' }, ROLE[n.role] + (n.domains?.length ? ' · ' + n.domains.join(', ') : '')))),
          n.summary ? el('p', {}, n.summary) : null, prog ? el('p', { class: 'tiny' }, prog) : null, act,
          n.material?.files?.length ? el('div', { class: 'cm-matpanel' }, el('div', { class: 'nx-lbl' }, '📎 Your material — this step is taught from it'), el('ul', { class: 'cm-matlist' }, ...n.material.files.map(f => el('li', {}, el('button', { class: 'linklike', onclick: () => openMaterial(acc, cid, id, f) }, '📄 ' + f.name), f.pages ? el('span', { class: 'tiny' }, ` · ${f.pages} pages`) : null)))) : null,
          el('div', { class: 'row cm-editrow' }, el('button', { class: 'btn small', onclick: () => editStep(acc, cid, id, { onDone: nid => { drawMap(); if (nid === null) { panel.classList.remove('on'); sel = null; } else showPanel(id); } }) }, '✏️ Edit step'),
            !pk.status && !st.mastered && (n.reviewed || c.autoApprove) && !(st.open) ? el('span', { class: 'tiny' }, '✔ reviewed — prepared when it opens') : null),
          n.learningGoals?.length ? el('div', {}, el('div', { class: 'nx-lbl' }, '🎯 After this step you can'), el('ul', { class: 'cm-goals' }, ...n.learningGoals.map(g => el('li', {}, g)))) : null,
          n.chapters?.length ? el('div', {}, el('div', { class: 'nx-lbl' }, `📖 ${n.chapters.length} chapters`, tip('Tap a chapter for its teaching goals and what it must cover.')), chBox) : null,
          st.parents.length ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Builds on: '), st.parents.map(T).join(' · ')) : null,
          (() => { const kids = c.edges.filter(e => e.from === id).map(e => T(e.to)); return kids.length ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Opens: '), kids.join(' · ')) : null; })(),
          n.kDomain ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Kind of knowledge: '), n.kDomain.replace('_', ' '), n.levels?.length ? ' — ' + n.levels.map(l => l.replace(/_/g, ' ')).join(', ') : '') : null);
      }
      // scroll only the map (scrollIntoView would also scroll the full-screen frame and hide the top bar)
      function scrollToNode(id) {
        const b = canvas.querySelector(`[data-id="${CSS.escape(id)}"]`); if (!b) return;
        const x = parseFloat(b.style.left) * zoom, y = parseFloat(b.style.top) * zoom, r = scroller.getBoundingClientRect();
        scroller.scrollTo({ left: Math.max(0, x - r.width / 2 + NW * zoom / 2), top: Math.max(0, y - r.height / 2 + NH * zoom / 2), behavior: 'smooth' });
      }
      function showNext() {
        const ids = C().nextUp(acc, c); const T = x => c.nodes[x].title;
        overlay((b2, close2) => b2.append(head('▶ Next up', 'Open steps, in a good study order'), ids.length ? el('ol', { class: 'cm-next' }, ...ids.slice(0, 30).map(id => el('li', {}, el('a', { href: '#', onclick: e => { e.preventDefault(); close2(); sel = id; drawMap(); showPanel(id); scrollToNode(id); } }, T(id)), ' ', el('span', { class: 'tiny' }, c.nodes[id].pack?.status === 'ready' ? '⚡ prepared' : c.nodes[id].pack?.status === 'generating' ? '⏳ preparing' : !c.nodes[id].reviewed && !c.autoApprove ? '📝 needs your review' : '✔ reviewed')))) : el('p', {}, '🎉 Everything is mastered!'), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))));
      }
      function settings() {
        overlay((b2, close2) => {
          const pf = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} steps ahead` : 'only when I open a step'))); pf.value = String(c.prefetch ?? 3);
          const bud = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(c.nodeBudget || 8) });
          const prov = el('select', { class: 'noema-input' }, el('option', { value: 'auto' }, 'Automatic'), el('option', { value: 'claude' }, 'Claude'), el('option', { value: 'gemini' }, 'Gemini')); prov.value = c.provider || 'auto';
          const pause = el('input', { type: 'checkbox' }); pause.checked = G().paused();
          const review = el('input', { type: 'checkbox' }); review.checked = !c.autoApprove;
          b2.append(head('⚙️ ' + (c.title || c.goal), `${Object.keys(c.nodes).length} steps · built ${new Date(c.created).toLocaleDateString()}`),
            el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, 'Prepare ahead', pf), el('label', { class: 'cg-field' }, 'Claude: limit per step ($)', bud), el('label', { class: 'cg-field' }, 'AI for new steps', prov),
              el('label', { class: 'tiny' }, review, ' Let me review each step before it is prepared (recommended)'),
              el('label', { class: 'tiny' }, pause, ' Pause preparing in the background on this device'), keysBox(acc)),
            el('div', { class: 'row noema-ovfoot' },
              el('button', { class: 'btn primary', onclick: () => { const cur = C().get(acc, cid); cur.prefetch = +pf.value; cur.nodeBudget = Math.max(1, +bud.value || 8); cur.provider = prov.value; cur.autoApprove = !review.checked; C().save(acc, cur); G().setPaused(pause.checked); close2(); drawMap(); G().kick(); } }, 'Save'),
              el('button', { class: 'btn small', onclick: () => { const b = new Blob([JSON.stringify(C().get(acc, cid), null, 1)], { type: 'application/json' }); const a = el('a', { href: URL.createObjectURL(b), download: `curriculum-${cid}.json` }); document.body.append(a); a.click(); a.remove(); } }, '⬇️ Export'),
              el('button', { class: 'btn small ghost', onclick: () => { if (confirm('Delete this curriculum? The subjects already prepared stay in your subjects.')) { C().remove(acc, cid); close2(); close(); library(acc, { onStudy }); } } }, '🗑 Delete'),
              el('button', { class: 'btn small', onclick: close2 }, 'Close')));
        });
      }
      async function test(id) {
        const n = c.nodes[id];
        overlay(async (b2, close2) => {
          b2.append(head('🎓 ' + n.title, 'Placement test — 8 of 10 right marks this step as mastered'), el('p', {}, '⏳ Preparing the questions…'));
          let qs; try { qs = await G().placementTest(c, id); } catch (e) { b2.lastChild.textContent = '⚠️ ' + e.message; b2.append(el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))); return; }
          let i = 0, right = 0; const body = el('div', { class: 'cm-test' }); b2.lastChild.replaceWith(body);
          const fmtQ = t => { const d = el('div', { class: 'cm-q' }); if (window.marked && window.DOMPurify) d.innerHTML = DOMPurify.sanitize(marked.parseInline(String(t))); else d.textContent = t; return d; };
          const ask = () => {
            body.innerHTML = '';
            if (i >= qs.length) { const ok = G().passTest(c, id, right / qs.length); body.append(el('div', { class: 'cg-status ' + (ok ? 'done' : 'error') }, ok ? `✅ ${right}/${qs.length} — mastered! The next steps are open.` : `${right}/${qs.length} — not yet (8/10 needed). Study the step and try again.`), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary', onclick: () => { close2(); drawMap(); showPanel(id); } }, 'OK'))); return; }
            const q = qs[i]; body.append(el('div', { class: 'tiny' }, `Question ${i + 1} of ${qs.length}`), fmtQ(q.q));
            const opts = el('div', { class: 'cm-opts' }, ...q.options.map((o, k) => el('button', { class: 'btn', onclick: () => {
              const ok = k === q.answer; if (ok) right++;
              [...opts.children].forEach((b, kk) => { b.disabled = true; if (kk === q.answer) b.classList.add('ok'); else if (kk === k) b.classList.add('bad'); });
              body.append(el('p', { class: 'tiny' }, (ok ? '✅ ' : '❌ ') + (q.explain || '')), el('button', { class: 'btn primary', onclick: () => { i++; ask(); } }, i + 1 < qs.length ? 'Next →' : 'See the result'));
            } }, o)));
            body.append(opts);
          };
          ask();
        });
      }
      drawMap(); if (sel) { showPanel(sel); setTimeout(() => scrollToNode(sel), 60); } else { const first = C().nextUp(acc, c)[0]; if (first) setTimeout(() => scrollToNode(first), 60); }
      // live updates (statuses, preparation) — redraw at most twice a second
      let t = null; const redraw = () => { if (!box.isConnected) { offA(); offB(); return; } clearTimeout(t); t = setTimeout(() => { drawMap(); if (sel && panel.classList.contains('on')) showPanel(sel); }, 400); };
      const offA = C().onChange(redraw), offB = G().onChange(redraw);
      scroller.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
    });
  }

  /** In a node's subject: the curriculum it belongs to, mastery so far, back to the map. */
  function nodeInfo(acc, ref) { const c = C().get(acc, ref?.id); const n = c?.nodes[ref?.node]; if (!n) return null; const st = C().nodeStatus(acc, c, ref.node); return { c, n, st }; }
  return { importMap, library, create, map, progress, nodeInfo, editStep };
})();
