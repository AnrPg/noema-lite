/* noema-lite — curriculum work done OUTSIDE this app, by the learner's own Claude with their Claude plan (docs/CURRICULUM.md §7):
     • through the noema-lite connector in the Claude app / website (cloud/mcp/server.mjs): Claude asks for the next task,
       answers it, and the answer reaches the app by itself;
     • by hand, without the connector: copy a task into any Claude chat, paste the answer back (map, plans), or give Claude
       a step's bundle and import the .noema.zip it makes (steps).
   The SAME code runs here and in the connector (tools/build.py bundles it), so a task, the checks of its answer and the way
   the answer changes the curriculum are identical everywhere — exactly as when the app runs the agents with an API key.

   Work a curriculum can have:  map    the graph agents (1 · 1b · 2) — only for a curriculum made with “Claude app”
                                plan   chapter plans of steps (batches of 5) — curricula made with “Claude app”
                                step   a step to prepare as a subject — any curriculum, when the learner sends it here
   Answers never touch the curriculum record itself (the app may be changing it): the connector writes each one to
   KV a:curin:<cid>:<seq>; the app checks it again, applies it, saves the curriculum and deletes the entry. */
(function (root) {
  'use strict';
  const C = () => root.NoemaCurriculum, L = () => root.NoemaLLM;
  const BATCH = 5, BATCH_FILES = 2, GRAPH = ['dag', 'audit', 'expand'], IN = 'a:curin:';
  /* A step handed to a run of the learner's Claude is CLAIMED (KV a:curclaim:<cid>:<nid>, a lease): other runs — e.g. the
     hourly scheduled ones, while this one is still building — skip it, so every queued step is prepared once. The claim
     ends when the step is saved, or after LEASE (a run that died without saving). */
  const CLAIM = 'a:curclaim:', LEASE = 4 * 3600e3;
  const claimKey = (cid, nid) => `${CLAIM}${cid}:${nid}`;
  const isApp = c => c?.provider === 'claudeapp';
  const prepared = n => ['ready', 'generating'].includes(n?.pack?.status);
  const needsPlan = n => !prepared(n) && (!n.chapters?.length || !!n.replan);
  const clone = o => JSON.parse(JSON.stringify(o));
  const ms = v => Date.parse(v || '') || 0;

  /** What is still to do outside the app: { graph: 'dag'|'audit'|'expand'|null, toPlan: [ids], steps: [ids], claimed: [ids], done }
      steps: queued and free, in queue order · claimed: queued and being prepared by a run right now (see settle) */
  const member = c => c?.shared?.role === 'member' && !c.shared.ended;   // 👥 a curriculum someone shared with the learner: its map and plans are the owner's
  function work(c) {
    const graph = isApp(c) && !member(c) && GRAPH.includes(c.stage) ? c.stage : null;
    const toPlan = isApp(c) && !member(c) && !graph && c.stage !== 'dag' ? C().order(c).filter(id => needsPlan(c.nodes[id])) : [];
    const queued = Object.keys(c.nodes || {}).filter(id => c.nodes[id].pack?.status === 'app').sort((a, b) => String(c.nodes[a].pack.queuedAt || '').localeCompare(String(c.nodes[b].pack.queuedAt || '')) || a.localeCompare(b));
    const steps = queued.filter(id => !c.nodes[id].pack.claimedAt), claimed = queued.filter(id => c.nodes[id].pack.claimedAt);
    return { graph, toPlan, steps, claimed, done: !graph && !toPlan.length && !steps.length };
  }
  /** Saved already? The step's subject (KV a:packmeta:<packId>, written when it is saved) is newer than the step's place in the queue. */
  const savedSince = (c, nid, meta) => !!meta && meta.id === C().packId(c, nid) && meta.curriculum === c.id && meta.node === nid && ms(meta.updatedAt) >= ms(c.nodes[nid]?.pack?.queuedAt);
  /** The queue as it really is (the connector works on this): a queued step whose subject was saved after it was queued is
      prepared — even when an older copy of the curriculum (another device) put it back in the queue; a queued step with a
      live claim is being prepared by another run.  claims: KV rows a:curclaim:<cid>:*  · packs: KV rows a:packmeta:* */
  function settle(c, { claims = [], packs = [], remote = null, me = null, now = Date.now(), lease = LEASE } = {}) {
    const cc = clone(c), live = {}, saved = {};
    // 👥 a shared curriculum: what the other participants prepared / are preparing (rows of noema_curriculum_steps)
    const rem = remote && cc.shared && !cc.shared.ended && root.NoemaCurShare ? root.NoemaCurShare.core.remoteOf(remote, me, now) : null;
    if (rem) cc.remote = rem;
    for (const r of claims) { if (!r.key.startsWith(CLAIM + c.id + ':')) continue; const t = ms(r.updated_at); if (now - t < lease) live[r.key.slice(CLAIM.length + c.id.length + 1)] = t; }
    for (const r of packs) { let m; try { m = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (x) { continue; } if (m?.curriculum === c.id && m.node) saved[m.node] = m; }
    for (const [nid, n] of Object.entries(cc.nodes || {})) {
      if (n.pack?.status !== 'app') continue;
      if (savedSince(cc, nid, saved[nid])) { n.pack = { ...n.pack, status: 'ready', version: saved[nid].version || null }; continue; }
      const x = rem?.[nid];
      if (x?.status === 'ready') { n.pack = { ...n.pack, status: 'ready', version: x.version || null, by: x.by }; continue; }   // prepared already (by somebody, or by me elsewhere)
      if (x && !x.mine) { n.pack = { ...n.pack, claimedAt: x.at || new Date(now).toISOString(), by: x.by }; continue; }     // being prepared by somebody else
      if (live[nid]) n.pack = { ...n.pack, claimedAt: new Date(live[nid]).toISOString() };
    }
    return cc;
  }

  /* ---------- tasks ---------- */
  const TITLES = { dag: 'Agent 1 — the map: every prerequisite, the goal, its applications', audit: 'Agent 1b — are the prerequisites complete?', expand: 'Agent 2 — the whole goal, in depth' };
  const SYS = { audit: 'You are a rigorous curriculum reviewer. Answer only through the requested structure.', expand: 'You are a curriculum graph editor. Answer only through the requested structure.' };
  const wishes = (c, ids) => { const w = ids.filter(i => c.nodes[i]?.planWish).map(i => `- ${i} (“${c.nodes[i].title}”): ${c.nodes[i].planWish}`); return w.length ? `\n\nThe learner's own wishes for these steps (follow them):\n${w.join('\n')}` : ''; };
  function spec(c, kind, ids) {
    const P = C().prompts, S = C().schemas, x = C().ctx(c);
    if (kind === 'dag') return { kind, id: 'dag', title: TITLES.dag, system: P.dagPrompt(x), prompt: `Build the curriculum DAG for the goal “${c.goal}”.`, schema: S.S_DAG };
    if (kind === 'audit') return { kind, id: 'audit', title: TITLES.audit, system: SYS.audit, prompt: P.auditPrompt(x, C().snapshot(c, { withSummaries: true })), schema: S.S_AUDIT };
    if (kind === 'expand') return { kind, id: 'expand', title: TITLES.expand, system: SYS.expand, prompt: P.expandPrompt(x, C().snapshot(c), c.nodes[c.goalId]), schema: S.S_EXPAND };
    if (kind === 'plan') return { kind, id: 'plan:' + ids.join(','), ids, title: `Agent 3 — the chapters of ${ids.length} step${ids.length > 1 ? 's' : ''}: ${ids.map(i => c.nodes[i].title).join(' · ')}`, system: P.PLANNER_SYSTEM, prompt: P.planPrompt(x, C().snapshot(c, { withSummaries: true }), ids) + P.materialText(c, ids) + wishes(c, ids), schema: S.S_PLAN, downloads: downloadsOf(c, ids) };
    return null;
  }
  /** The learner's files of some steps, each file once (even when several steps or page ranges use it). */
  function downloadsOf(c, ids) {
    const downloads = [], seen = new Set();
    for (const nid of ids) for (const f of c.nodes[nid]?.material?.files || []) {
      const store = f.fileId ? C().curStore(c.id) : C().packId(c, nid), src = f.fileId || f.srcId, k = store + '/' + src;
      if (seen.has(k)) continue; seen.add(k);
      downloads.push({ store, src, name: f.name, size: f.size || 0, type: f.type || '', pages: f.pages || null, sha256: f.sha256 || null });
    }
    return downloads;
  }
  const hasFiles = (c, id) => !!c.nodes[id]?.material?.files?.length;
  /** The next plan batch: up to 5 steps, of which at most 2 with files (Claude reads their pages before planning them). */
  function planBatch(c, ids) {
    const out = []; let withFiles = 0;
    for (const id of ids) { const f = hasFiles(c, id); if (out.length && f && withFiles >= BATCH_FILES) continue; out.push(id); if (f) withFiles++; if (out.length >= BATCH) break; }
    return out;
  }
  /** One step to prepare: the brief, the subject id and the learner's files (each file once, even when several page ranges use it). */
  function stepSpec(c, nid) {
    const n = c.nodes[nid]; if (!n) return null;
    const downloads = downloadsOf(c, [nid]);
    return { kind: 'step', id: 'step:' + nid, nid, packId: C().packId(c, nid), title: `Prepare the step “${n.title}”`, stepTitle: n.title, language: c.language, brief: C().nodeBrief(c, nid), downloads, planned: !!n.chapters?.length };
  }
  /** The next task. want: 'any' | 'map' | 'plan' | 'step'; step: a step id or title (prepares that one). */
  function next(c, { want = 'any', step = '', force = false } = {}) {
    if (step) {
      const s = String(step).trim().toLowerCase(); const nid = c.nodes[step] ? step : Object.keys(c.nodes).find(id => c.nodes[id].title.toLowerCase() === s) || Object.keys(c.nodes).find(id => c.nodes[id].title.toLowerCase().includes(s));
      if (!nid) return { error: `No step “${step}” in “${c.title}”.` };
      if (prepared(c.nodes[nid])) return { error: `“${c.nodes[nid].title}” is already prepared.` };
      if (c.nodes[nid].pack?.claimedAt && !force) return { error: `“${c.nodes[nid].title}” is being prepared by another run since ${c.nodes[nid].pack.claimedAt} — do not prepare it twice. If that run has stopped without saving it, call noema_curriculum_task again with step and force = true.` };
      if (c.shared && !c.shared.ended && c.remote?.[nid] && (c.remote[nid].status === 'ready' || !c.remote[nid].mine)) return { error: `“${c.nodes[nid].title}” ${c.remote[nid].status === 'ready' ? 'has been prepared' : 'is being prepared'} by ${c.remote[nid].by || 'another member'} of this shared curriculum — do not prepare it again (the learner gets it on the map).` };
      if (!c.nodes[nid].chapters?.length) return member(c) ? { error: `“${c.nodes[nid].title}” has no chapter plan yet — the owner of this shared curriculum plans it first.` } : isApp(c) ? spec(c, 'plan', [nid]) : { error: `“${c.nodes[nid].title}” has no chapter plan yet — open it in noema-lite and plan it first (✏️ Edit step).` };
      return stepSpec(c, nid);
    }
    const w = work(c);
    if (w.graph && /any|map/.test(want)) return spec(c, w.graph);
    if (w.toPlan.length && /any|plan/.test(want)) return spec(c, 'plan', planBatch(c, w.toPlan));
    if (w.steps.length && /any|step/.test(want)) return stepSpec(c, w.steps[0]);
    return null;
  }
  /** A submitted answer → its task, if that task is still open (else null: done already, or the curriculum changed). */
  function byId(c, id) {
    const w = work(c);
    if (GRAPH.includes(id)) return w.graph === id ? spec(c, id) : null;
    const m = /^plan:(.+)$/.exec(String(id || '')); if (!m) return null;
    const ids = m[1].split(',').filter(Boolean);
    return ids.length && ids.every(i => c.nodes[i] && needsPlan(c.nodes[i])) ? spec(c, 'plan', ids) : null;
  }
  /** Problems of an answer (JSON Schema + the same semantic checks as the in-app agents) → [] when it is good. */
  function check(c, t, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the answer must be ONE JSON object (not a list, not text)'];
    const e = L().check(t.schema, data); if (e.length) return e;
    if (t.kind === 'dag') return C().validateDag(data, C().ctx(c));
    if (t.kind === 'audit') return C().validateAudit(data, C().auditBase(c));
    if (t.kind === 'expand') return C().validateExpand(data, c);
    if (t.kind === 'plan') return C().validatePlans(data, t.ids, c);
    return [];
  }
  /** Apply a checked answer to the curriculum (mutates it) → a log line. */
  function apply(c, t, data) {
    let line;
    if (t.kind === 'dag') { line = C().applyDag(c, data); c.stage = 'audit'; }
    else if (t.kind === 'audit') { line = C().applyAudit(c, data); c.stage = 'expand'; }
    else if (t.kind === 'expand') { C().applyExpansion(c, data); line = C().expandLine(data); c.stage = 'plan'; c.title = c.nodes[c.goalId]?.goalTitle || c.title || c.goal; }
    else if (t.kind === 'plan') { C().applyPlans(c, data); line = `   ✓ planned: ${t.ids.map(i => c.nodes[i]?.title).filter(Boolean).join(', ')}`; }
    if (isApp(c) && !GRAPH.includes(c.stage)) { c.status = 'ready'; c.error = null; if (c.stage === 'plan' && !Object.values(c.nodes).some(needsPlan)) c.stage = 'done'; }
    (c.log = c.log || []).push({ t: Date.now(), m: '💬 Claude app — ' + t.title.split(' — ')[0] + ':' + line.replace(/^\s*/, ' ') });
    return line;
  }
  /** The curriculum as it will be once the app has applied the answers still in the inbox (the connector works on this). */
  function merged(c, rows) {
    const cc = clone(c);
    for (const r of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
      let e; try { e = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (x) { continue; }
      if (e.kind === 'step') { const n = cc.nodes[e.nid]; if (n) n.pack = { ...(n.pack || {}), id: e.packId, status: 'ready' }; continue; }
      const t = byId(cc, e.task); if (t && !check(cc, t, e.data).length) apply(cc, t, e.data);
    }
    return cc;
  }
  const inboxKey = (cid, seq) => `${IN}${cid}:${seq || Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 6)}`;

  /* ---------- texts (the same words in the connector, the copied task and the step bundle) ---------- */
  const LANGN = c => C().LANG[c.language] || c.language;
  /** A map / plan task as text. mode 'connector' (answer with noema_curriculum_submit) or 'paste' (answer with the JSON only). */
  function taskText(c, t, mode = 'connector', { fileLines = [] } = {}) {
    const how = mode === 'connector'
      ? `## How to answer\nThink it through first (search the web when it helps). Then call **noema_curriculum_submit** with curriculum_id "${c.id}", task_id "${t.id}" and result_json = ONE JSON object that matches the JSON Schema below (no prose, no code fence). The tool checks it exactly like noema-lite does: if it lists problems, fix ALL of them and submit the corrected object again. When it is accepted, call noema_curriculum_task for the next task.`
      : `## How to answer\nThink it through first (search the web when it helps). Then answer with exactly ONE JSON object that matches the JSON Schema below — only the JSON, nothing before or after it. The learner pastes it into noema-lite, which checks it; if noema-lite lists problems, fix all of them and send the whole corrected object again.`;
    const files = t.kind === 'plan' && t.downloads?.length ? `\n\n## Read the learner's files before planning\nSome of these steps come with the learner's own files — ALL of them are listed above, with the pages that belong to each step. The outline and first lines above are only a summary: download EVERY file below and READ every page of each step before planning it. Anchor the step's chapters to those pages: together they cover everything in them, in their order, down to the details (nothing skipped), and every chapter's "material" names its file + pages — the check rejects a plan that leaves pages out. ${mode === 'connector' ? 'Get the files into your sandbox (code execution) and extract the text of those pages (pdftotext -f A -l B, or the noema-pack-builder pdf_text.py); do not paste the files into your answer:' : 'The learner attaches these files to this chat:'}\n${(mode === 'connector' ? fileLines : t.downloads.map(d => `- ${d.name}${d.pages ? ` (${d.pages} pages)` : ''}`)).join('\n')}` : '';
    return `# noema-lite curriculum task — ${t.title}\nCurriculum: “${c.title || c.goal}” (${c.id}) · write in ${LANGN(c)} · task ${t.id}\n\n## Your role and rules\n${t.system}\n\n## The task\n${t.prompt}${files}\n\n${how}\n\n## JSON Schema of the answer\n${JSON.stringify(t.schema)}`;
  }
  /** A step to prepare as text. fileLines: how to get each file into the sandbox (signed links, or “attached to this chat”). */
  function stepText(c, t, { mode = 'connector', fileLines = [] } = {}) {
    const files = t.downloads.length;
    return [`# noema-lite — prepare ONE step of the curriculum “${c.title || c.goal}” as a subject pack`,
      `Step: “${t.stepTitle}” (${t.nid}) · subject_id: ${t.packId} (use exactly this id: pack.subject.id = "${t.packId}") · language: ${LANGN(c)} (${c.language})`,
      files ? `\n## The learner's files — THE sources of this step\n${fileLines.join('\n')}\nRead every page of them that belongs to this step and build the pack FROM them: each planned chapter teaches and tests everything its pages contain (its "From the material" pages) — every topic, definition, mechanism, example, figure, table and detail, nothing skipped — and cites those pages. Do NOT research the theory on the web (web search only for pictures). Where a planned chapter is not covered by the files, write it briefly from reliable knowledge and say so in the coverage notes. Package the files (SKILL.md §3b) with the source ids of the plan below (m1, m2…); when only some pages belong to this step, split those pages out (split_pdf.py --ranges, keeps firstPage) and package the part instead of the whole file.`
        : `\n## Sources\nThere are no files for this step: research it yourself — official, authoritative sources first (official documentation and standards, university course pages, open textbooks such as OpenStax and LibreTexts, review articles, reference works; Wikipedia only as a pointer to better sources). Read what you cite. Record every source in sources.json (title, url, retrieved date) and map each chapter to its main source.`,
      `\n## The plan (follow it exactly: one pack chapter per planned chapter, same order and titles; do not re-teach what the learner already mastered)\n${t.brief}`,
      `\n## How to build and save it\n1. Use the noema-pack-builder skill if you have it; otherwise ${mode === 'connector' ? 'call noema_get_toolkit and noema_authoring_guide' : 'follow the noema-lite authoring guide you were given'}. Start with: python3 scripts/start_subject.py work ${t.packId} "${t.stepTitle.replace(/"/g, "'")}" --lang ${c.language}\n2. Include all three kinds of pictures (from the files, from the web, drawn diagrams / function graphs) with several picture exercises each; validate with make_pack.py.\n` +
        (mode === 'connector'
          ? `3. Save it with noema_start_upload → curl → noema_finish_upload, subject_id "${t.packId}" (it asks for the source files you packaged; the learner's own files are recognised and not uploaded twice). The step then appears ready on the learner's map by itself.\n4. Then call noema_curriculum_task for the next step, if the learner asked for more than one.`
          : `3. Give the learner the package ${t.packId}.noema.zip to download. In noema-lite they open this step on the map and press “📥 Import its package”.`),
      `Do not ask questions unless something essential is missing — choose sensible defaults.`].join('\n');
  }
  /** The message the learner pastes into a Claude chat (the connector does the rest). count: how many steps to prepare. */
  function message(c, { count = 1 } = {}) {
    const w = work(c); const parts = [];
    if (w.graph) parts.push('build its map');
    if (w.graph || w.toPlan.length) parts.push('plan the chapters of its steps');
    if (w.steps.length) parts.push(`prepare ${Math.min(count, w.steps.length) > 1 ? `the next ${Math.min(count, w.steps.length)} queued steps, one after the other` : 'the next queued step'}`);
    return `Use the noema-lite connector to work on my noema-lite curriculum “${c.title || c.goal}” (id ${c.id}): ${parts.join(', then ') || 'see what is left to do'}.\nCall noema_curriculum_task with curriculum_id "${c.id}" and follow what it returns; after each accepted answer or saved step call it again — ${count > 1 ? `stop after ${count} prepared steps or` : 'stop after one prepared step or'} when it says there is nothing left. Do not ask me questions — choose sensible defaults.`;
  }

  /* ======================= in the app: the inbox, pasted answers, step bundles and packages ======================= */
  const App = { acc: null, timer: null, last: null, error: null, busy: false, listeners: new Set() };
  const emitA = () => App.listeners.forEach(f => { try { f(App); } catch (e) { } });
  const toast = (m, ms) => root.Noema?.toast?.(m, ms);
  /** Is any curriculum of this account waiting for the Claude app? */
  App.waiting = acc => C().list(acc).some(c => !work(c).done);
  /** A step the connector saved: get the pack from the cloud (and its pictures) and mark the step ready. */
  async function finishStep(acc, c, e) {
    const n = c.nodes[e.nid]; if (!n) return false;
    if (n.pack?.status === 'ready' && n.pack.id === e.packId && (!e.version || n.pack.version === e.version)) return false;
    const pack = await root.Noema.getPackById(acc, e.packId);
    await C().Gen.finish(c, e.nid, pack, { stored: true, via: 'claude-app' });
    toast(`🧭 “${n.title}” — prepared by your Claude app — is ready to study`, 4000); return true;
  }
  /** Fetch the answers waiting in the cloud, check and apply them, delete them. → how many were applied */
  App.poll = async (acc = App.acc) => {
    const CL = root.NoemaCloud; if (!acc || App.busy || !CL?.session?.() || !CL.kvRows) return 0;
    App.busy = true; let n = 0;
    try {
      const rows = (await CL.kvRows(IN)).sort((a, b) => a.key.localeCompare(b.key)); App.last = Date.now(); App.error = null;
      if (rows.length && CL.pull) await CL.pull(acc).catch(() => { });   // apply the answers to the newest copy of each curriculum, not to an older one on this device
      const done = []; let steps = 0;
      for (const r of rows) {
        const cid = r.key.slice(IN.length).split(':')[0];
        let e; try { e = JSON.parse(r.value); } catch (x) { done.push(r.key); continue; }
        const c = C().get(acc, cid);
        if (!c) { if (Date.now() - (Date.parse(r.updated_at) || 0) > 7 * 864e5) done.push(r.key); continue; }   // not on this device (yet)
        try {
          if (e.kind === 'step') { if (await finishStep(acc, c, e)) { n++; steps++; } }
          else {
            const t = byId(c, e.task);   // null: applied already (an earlier check) — or out of date
            if (t) { const errs = check(c, t, e.data); if (!errs.length) { apply(c, t, e.data); C().save(acc, c); n++; } else console.warn('[curjobs] answer refused', errs); }
          }
          done.push(r.key);
        } catch (x) { console.warn('[curjobs]', x); App.error = x.message; }
      }
      // a queued step whose subject is saved already — its answer was handled on another device, then an older copy of the
      // curriculum put the step back in the queue: finish it here, so it is not prepared a second time
      for (const c of C().list(acc)) for (const [nid, nd] of Object.entries(c.nodes || {})) {
        if (nd.pack?.status !== 'app') continue;
        const pid = C().packId(c, nid), meta = C().kvGet(acc, 'packmeta:' + pid);
        if (!savedSince(c, nid, meta)) continue;
        try { if (await finishStep(acc, c, { nid, packId: pid, version: meta.version || null })) { n++; steps++; } } catch (x) { console.warn('[curjobs]', x); App.error = x.message; }
      }
      // the changed curricula reach the cloud BEFORE their answers leave the inbox: the connector always sees one or the other
      if (n) await CL.push(acc);
      for (const k of done) await CL.kvDelete(k).catch(() => { });
      if (steps) await CL.pull(acc).catch(() => { });   // what the connector wrote with a step: its source-file index (👁), its subject's card
    } catch (x) { App.error = x.message; } finally { App.busy = false; emitA(); }
    if (n) C().Gen.kick();
    return n;
  };
  /** Keep an eye on the inbox: when the app comes back to the front, and every 20 s while something waits for the Claude app. */
  App.start = acc => {
    if (!acc) return; C().Gen.start(acc);
    if (App.acc === acc) return; App.acc = acc;
    const loop = async () => { clearTimeout(App.timer); if (document.visibilityState === 'visible' && App.waiting(App.acc)) await App.poll().catch(() => { }); App.timer = setTimeout(loop, 20000); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') App.poll().catch(() => { }); });
    root.addEventListener?.('focus', () => App.poll().catch(() => { }));
    App.poll().catch(() => { }); App.timer = setTimeout(loop, 20000);
  };
  App.onChange = f => { App.listeners.add(f); return () => App.listeners.delete(f); };

  /** Without the connector: the learner pasted Claude's answer to a copied task → { ok, line } | { errors } */
  App.paste = (acc, cid, taskId, text) => {
    const c = C().get(acc, cid); if (!c) return { errors: ['This curriculum is not on this device.'] };
    const t = byId(c, taskId); if (!t) return { errors: ['This task is already done (or the curriculum changed) — copy the current task again.'] };
    let data; try { data = L().parseJSON(text); } catch (e) { return { errors: ['That is not a JSON answer — paste exactly what Claude answered (the JSON object).'] }; }
    const errs = check(c, t, data); if (errs.length) return { errors: errs };
    const line = apply(c, t, data); C().save(acc, c); C().Gen.kick(); return { ok: true, line };
  };
  /** The task text to copy into any Claude chat (no connector). */
  App.copyTask = (acc, cid) => { const c = C().get(acc, cid); const t = c && next(c, { want: 'any' }); return t && t.kind !== 'step' && !t.error ? { id: t.id, title: t.title, text: taskText(c, t, 'paste'), files: (t.downloads || []).map(d => d.name), steps: t.ids || [] } : null; };
  /** ⬇️ A step's bundle for a Claude chat without the connector: the task, the learner's files and the toolkit. */
  App.bundle = async (acc, cid, nid) => {
    const c = C().get(acc, cid); const t = c && stepSpec(c, nid); if (!t) throw new Error('Step not found.');
    if (!root.JSZip && root.NoemaViewer?.jszip) await root.NoemaViewer.jszip();
    if (!root.JSZip) throw new Error('The package writer is not available.');
    const z = new root.JSZip(), lines = [], missing = [];
    for (const d of t.downloads) {
      const rec = await root.NoemaSrcFiles.get(acc, d.store, d.src).catch(() => null);
      if (rec?.blob) { z.file('files/' + d.name, rec.blob); lines.push(`- files/${d.name}${d.pages ? ` (${d.pages} pages)` : ''} — in this bundle`); } else { missing.push(d.name); lines.push(`- ${d.name} — NOT in this bundle (ask the learner to attach it)`); }
    }
    try { const kit = await fetch((root.NOEMA_CONFIG?.siteUrl || '').replace(/\/$/, '') + '/downloads/noema-pack-builder.zip'); if (kit.ok) z.file('noema-pack-builder.zip', await kit.blob()); } catch (e) { }
    z.file('TASK.md', stepText(c, t, { mode: 'bundle', fileLines: lines }) + `\n\n## The toolkit\nnoema-pack-builder.zip in this bundle is the noema-pack-builder skill: unzip it in your sandbox and follow its SKILL.md (scripts/ has start_subject.py, make_pack.py…). If you have the skill installed already, use that.`);
    const blob = await z.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${t.packId}-for-claude.zip`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    return { missing, name: a.download };
  };
  /** 📥 The package Claude made for a step (.noema.zip or .json) → the step's subject. */
  App.importPackage = async (acc, cid, nid, file) => {
    const SF = root.NoemaSrcFiles; let pack, files = null;
    if (SF && await SF.isZip(file)) { const b = await SF.readBundle(file); pack = b.pack; files = {}; for (const s of SF.packaged(pack)) { const blob = await b.file(s.file); if (blob) files[s.file] = blob; } }
    else { try { pack = JSON.parse(await file.text()); } catch (e) { throw new Error('This file is not a noema-lite package (.noema.zip) or pack (.json).'); } }
    if (pack?.format !== 'noema-pack' && pack?.format !== 'noema-pack/v1' && !Array.isArray(pack?.chapters)) throw new Error('This file is not a noema-lite subject pack.');
    const res = root.NoemaPackCheck?.checkPack(pack); if (res?.errors?.length) throw new Error(`The pack has ${res.errors.length} error(s): ${res.errors.slice(0, 3).join('; ')}`);
    const c = C().get(acc, cid); if (!c?.nodes[nid]) throw new Error('Step not found.');
    C().Gen.start(acc); await C().Gen.finish(c, nid, pack, { files, via: 'claude-chat' });
    return { title: c.nodes[nid].title };
  };

  root.NoemaCurJobs = { work, settle, savedSince, claimKey, CLAIM, LEASE, next, byId, check, apply, merged, spec, stepSpec, planBatch, downloadsOf, taskText, stepText, message, inboxKey, needsPlan, prepared, isApp, BATCH, BATCH_FILES, IN, App };
})(typeof window !== 'undefined' ? window : globalThis);
