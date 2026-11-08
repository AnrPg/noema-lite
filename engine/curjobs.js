/* noema-lite — curriculum work done OUTSIDE this app, by the learner's own Claude with their Claude plan (docs/CURRICULUM.md §7):
     • through the noema-lite connector in the Claude app / website (src/connector): Claude asks for the next task,
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
  /** An error's words for the learner (its code's message in the UI language, else its English text — docs/i18n.md §6). */
  const errW = e => root.NoemaI18n ? root.NoemaI18n.err(e) : String((e && e.message) || e);
  /** The learner's words for a key of i18n/roadmaps (docs/i18n.md). In the connector (no i18n runtime) the English catalog
      when it is loaded, else the key: nothing there is for a learner — the tasks, checks and errors for Claude stay English. */
  function rt(k, p) {
    const I = root.NoemaI18n; if (I) return I.t(k, p);
    const m = root.NOEMA_I18N?.en?.m?.[k]; if (m == null) return k;
    const F = root.IntlMessageFormat, M = F && (F.IntlMessageFormat || F.default || F);
    try { return M ? String(new M(m, 'en', undefined, { ignoreTag: true }).format(p || {})) : m; } catch (e) { return m; }
  }
  /* The queue, the claims and the inbox are the Roadmaps domain (src/features/roadmaps/domain: work.ts, claims.ts, inbox.ts),
     through NoemaCore.roadmaps (the connector hands its own scope the same module). Here: the agents' tasks (prompts, checks,
     answers), the texts for Claude, and the app's side of the inbox. */
  const R = () => root.NoemaCore.roadmaps;
  const { BATCH, BATCH_FILES, GRAPH, IN, CLAIM, LEASE, WAIT } = root.NoemaCore.roadmaps;
  const claimKey = (cid, nid) => R().claimKey(cid, nid);
  /** How long a claim row (KV { value, updated_at }) lasts: WAIT once its upload waits, else LEASE. */
  const leaseOf = (r, lease = LEASE, wait = WAIT) => R().leaseOf(r, lease, wait);
  /** Has this claim row run out? */
  const claimExpired = (r, now = Date.now(), lease = LEASE, wait = WAIT) => R().claimExpired(r, now, lease, wait);
  const isApp = c => R().isApp(c), prepared = n => R().prepared(n), needsPlan = n => R().needsPlan(n);
  const member = c => R().member(c);
  /** What is still to do outside the app (docs/CURRICULUM.md §7): { graph, toPlan, steps, claimed, done }; level: only that level's steps. */
  const work = (c, o) => R().work(c, o);
  const savedSince = (c, nid, meta) => R().savedSince(c, nid, meta);
  /** The queue as it really is (the connector works on this). claims: KV rows a:curclaim:<cid>:* · packs: KV rows a:packmeta:* ·
      remote: 👥 rows of noema_curriculum_steps (a shared curriculum) */
  function settle(c, { claims = [], packs = [], remote = null, me = null, now = Date.now(), lease = LEASE, wait = WAIT } = {}) {
    const rem = remote && c.shared && !c.shared.ended && root.NoemaCurShare ? root.NoemaCurShare.core.remoteOf(remote, me, now) : null;
    return R().settle(c, { claims, packs, remote: rem, now, lease, wait });
  }

  /* ---------- tasks ---------- */
  /* i18n-ignore-start — the tasks, their errors and the checks are for Claude (the connector, a copied task): English */
  const TITLES = { dag: 'Agent 1 — the Roadmap: every prerequisite, the goal, its applications', audit: 'Agent 1b — are the prerequisites complete?', expand: 'Agent 2 — the whole goal, in depth' };
  const SYS = { audit: 'You are a rigorous curriculum reviewer. Answer only through the requested structure.', expand: 'You are a curriculum graph editor. Answer only through the requested structure.' };
  const wishes = (c, ids) => { const w = ids.filter(i => c.nodes[i]?.planWish).map(i => `- ${i} (“${c.nodes[i].title}”): ${c.nodes[i].planWish}`); return w.length ? `\n\nThe learner's own wishes for these steps (follow them):\n${w.join('\n')}` : ''; };
  const planGen = (c, ids) => R().planGen(c, ids);
  /** 🪜 The level a task targets (noema_curriculum_task level): what it is, its steps, what difficulty means there. */
  const levelPart = (c, level) => level ? '\n\n' + R().levelBrief(c, level) : '';
  function spec(c, kind, ids, { level = '' } = {}) {
    const P = C().prompts, S = C().schemas, x = C().ctx(c);
    if (kind === 'dag') return { kind, id: 'dag', title: TITLES.dag, system: P.dagPrompt(x), prompt: `Build the curriculum DAG for the goal “${c.goal}”.`, schema: S.S_DAG };
    if (kind === 'audit') return { kind, id: 'audit', title: TITLES.audit, system: SYS.audit, prompt: P.auditPrompt(x, C().snapshot(c, { withSummaries: true })), schema: S.S_AUDIT };
    if (kind === 'expand') return { kind, id: 'expand', title: TITLES.expand, system: SYS.expand, prompt: P.expandPrompt(x, C().snapshot(c), c.nodes[c.goalId]), schema: S.S_EXPAND };
    if (kind === 'plan') return { kind, id: R().planTaskId(c, ids), ids, title: `Agent 3 — the chapters of ${ids.length} step${ids.length > 1 ? 's' : ''}: ${ids.map(i => c.nodes[i].title).join(' · ')}`, system: P.PLANNER_SYSTEM, prompt: P.planPrompt(x, C().snapshot(c, { withSummaries: true }), ids) + P.materialText(c, ids) + P.packageText(c, ids) + wishes(c, ids) + levelPart(c, level), schema: S.S_PLAN, downloads: downloadsOf(c, ids), ...(level ? { level } : {}) };
    return null;
  }
  /** The learner's files of some steps, each file once (even when several steps or page ranges use it). */
  const downloadsOf = (c, ids) => R().downloadsOf(c, ids);
  /** The next plan batch: up to 5 steps, of which at most 2 with files (Claude reads their pages before planning them). */
  const planBatch = (c, ids) => R().planBatch(c, ids);
  /** One step to prepare: the brief, the subject id and the learner's files (each file once, even when several page ranges use it). */
  function stepSpec(c, nid, { level = '' } = {}) {
    const n = c.nodes[nid]; if (!n) return null;
    const lv = level || (n.level !== undefined ? (typeof n.level === 'string' ? n.level : n.level.from) : '');
    return { kind: 'step', id: 'step:' + nid, nid, packId: C().packId(c, nid), title: `Prepare the step “${n.title}”`, stepTitle: n.title, language: c.language, brief: C().nodeBrief(c, nid) + levelPart(c, lv), downloads: downloadsOf(c, [nid]), planned: !!n.chapters?.length, ...(lv ? { level: lv } : {}) };
  }
  /** The next task. want: 'any' | 'map' | 'plan' | 'step'; step: a step id or title (prepares that one); level: only the steps at that level. */
  function next(c, { want = 'any', step = '', force = false, level = '' } = {}) {
    if (step) {
      const nid = R().findStep(c, String(step));
      if (!nid) return { error: `No step “${step}” in “${c.title}”.` };
      const why = R().stepRefusal(c, nid, { force });
      if (why === 'plan') return spec(c, 'plan', [nid], { level });
      return why ? { error: why } : stepSpec(c, nid, { level });
    }
    const w = work(c, { level });
    if (w.graph && /any|map/.test(want)) return spec(c, w.graph);
    if (w.toPlan.length && /any|plan/.test(want)) return spec(c, 'plan', planBatch(c, w.toPlan), { level });
    if (w.steps.length && /any|step/.test(want)) return stepSpec(c, w.steps[0], { level });
    return null;
  }
  /** A submitted answer → its task, if that task is still open (else null: done already, or the curriculum changed). */
  function byId(c, id) {
    const w = work(c);
    if (GRAPH.includes(id)) return w.graph === id ? spec(c, id) : null;
    const ids = R().planTaskSteps(c, String(id || ''));
    return ids ? spec(c, 'plan', ids) : null;
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
  /* i18n-ignore-end */
  /** The task's name for the learner (the app's “Next task”), in their language. */
  function taskLabel(c, t) {
    if (t.kind === 'plan') return rt('roadmap.jobs.task.plan', { n: t.ids.length, list: t.ids.map(i => c.nodes[i]?.title).join(' · ') });
    return rt(t.kind === 'dag' ? 'roadmap.jobs.task.dag' : t.kind === 'audit' ? 'roadmap.jobs.task.audit' : 'roadmap.jobs.task.expand');
  }
  const logApp = (c, m) => (c.log = c.log || []).push({ t: Date.now(), m, via: 'claude-app' });   // via: what the Claude app did (the words depend on the language)
  /** Apply a checked answer to the curriculum (mutates it) → a log line. */
  function apply(c, t, data) {
    let line;
    if (t.kind === 'dag') { line = C().applyDag(c, data); c.stage = 'audit'; }
    else if (t.kind === 'audit') { line = C().applyAudit(c, data); c.stage = 'expand'; }
    else if (t.kind === 'expand') { C().applyExpansion(c, data); line = C().expandLine(data); c.stage = 'plan'; c.title = c.nodes[c.goalId]?.goalTitle || c.title || c.goal; }
    else if (t.kind === 'plan') { C().applyPlans(c, data); line = '   ✓ ' + rt('roadmap.jobs.planned', { list: t.ids.map(i => c.nodes[i]?.title).filter(Boolean).join(', ') }); }
    if (isApp(c) && !GRAPH.includes(c.stage)) { R().readyForApp(c); if (c.stage === 'plan' && !Object.values(c.nodes).some(needsPlan)) c.stage = 'done'; }
    logApp(c, '💬 ' + rt('roadmap.jobs.log', { kind: t.kind, line: line.replace(/^\s*/, '') }));
    return line;
  }
  /** The curriculum as it will be once the app has applied the answers still in the inbox (the connector works on this). */
  const merged = (c, rows) => R().merged(c, rows, {
    now: Date.now(),
    answer: (cc, e) => { const t = byId(cc, e.task); if (t && !check(cc, t, e.data).length) apply(cc, t, e.data); },
    assign: (cc, e) => { const n = cc.nodes[e.nid]; if (n && !C().Edit?.cannotAssign?.(cc, n)) attachTo(cc, n, e); },
  });
  /** 📦 What an attached subject changes on its step (the same here, in the connector's view and in Edit.assign's effect on
      the plan): the step is taught by it, and re-planned from its outline. e: { packId, title, description, outline, at } */
  function attachTo(c, n, e) {
    const at = e.at || new Date().toISOString();
    n.pack = { id: e.packId, status: 'ready', assigned: { from: e.from || 'claude', at }, title: e.title || e.packId, description: e.description || '', outline: e.outline || [], ...(e.sections ? { sections: e.sections, exercises: e.exercises || 0, chapters: e.chapters || 0 } : {}) };
    n.assignedAt = at; if (c.shared && !c.shared.ended && !n.groupPlan) n.groupPlan = C().planOf(n);
    if (n.chapters?.length || c.stage === 'done') { n.replan = true; n.replanAt = C().stampAfter(n.plannedAt, n.replanAt); n.planFrom = 'pack'; } delete n.reviewed;
    if (c.stage === 'done') c.stage = 'plan';
  }
  /** 🌱 A new part (noema_extend_roadmap): can it still be added to this copy? → [] / ['applied'] / the problems (src/features/roadmaps/domain/inbox.ts). */
  const extendProblems = (c, e) => R().extendProblems(c, e);
  /** Add the part (mutates c; check extendProblems first). */
  function extend(c, e) {
    R().extend(c, e, Date.now());
    logApp(c, '🌱 ' + rt('roadmap.jobs.partAdded', { title: e.part.title, n: Object.keys(e.nodes).length }));
    return true;
  }
  /** 🔗 Links between steps already on the map (noema_link_roadmap_steps): can they still be applied to this copy? */
  const linkProblems = (c, e) => R().linkProblems(c, e);
  /** Apply the links (mutates c; check linkProblems first) → { added, removed } */
  function link(c, e) {
    const r = R().link(c, e);
    logApp(c, '🔗 ' + rt('roadmap.jobs.linksAdded', r));
    return r;
  }
  /** 🪜 A restructuring proposal (noema_restructure_levels): kept on the Roadmap for the learner to decide (mutates c). */
  const proposeProblems = (c, e) => R().proposeProblems(c, e);
  function propose(c, e) {
    const p = R().propose(c, e);
    logApp(c, '🪜 ' + rt('roadmap.jobs.proposed'));
    return p;
  }
  const inboxKey = (cid, seq) => R().inboxKey(cid, seq || R().inboxSeq(Date.now(), Math.random().toString(36).slice(2, 6)));

  /* ---------- texts (the same words in the connector, the copied task and the step bundle) ---------- */
  /* i18n-ignore-start — what Claude reads: the tasks, a step's brief, the message the learner pastes into a Claude chat */
  const LANGN = c => C().LANG[c.language] || c.language;
  /** A map / plan task as text. mode 'connector' (answer with noema_curriculum_submit) or 'paste' (answer with the JSON only). */
  function taskText(c, t, mode = 'connector', { fileLines = [] } = {}) {
    const how = mode === 'connector'
      ? `## How to answer\nThink it through first (search the web when it helps). Then call **noema_curriculum_submit** with curriculum_id "${c.id}", task_id "${t.id}" and result_json = ONE JSON object that matches the JSON Schema below (no prose, no code fence). The tool checks it exactly like noema-lite does: if it lists problems, fix ALL of them and submit the corrected object again. When it is accepted, call noema_curriculum_task for the next task.`
      : `## How to answer\nThink it through first (search the web when it helps). Then answer with exactly ONE JSON object that matches the JSON Schema below — only the JSON, nothing before or after it. The learner pastes it into noema-lite, which checks it; if noema-lite lists problems, fix all of them and send the whole corrected object again.`;
    const files = t.kind === 'plan' && t.downloads?.length ? `\n\n## Read the learner's files before planning\nSome of these steps come with the learner's own files — ALL of them are listed above, with the pages that belong to each step. The outline and first lines above are only a summary: download EVERY file below and READ every page of each step before planning it. Anchor the step's chapters to those pages: together they cover everything in them, in their order, down to the details (nothing skipped), and every chapter's "material" names its file + pages — the check rejects a plan that leaves pages out. ${mode === 'connector' ? 'Get the files into your sandbox (code execution) and extract the text of those pages (pdftotext -f A -l B, or the noema-pack-builder pdf_text.py); do not paste the files into your answer:' : 'The learner attaches these files to this chat:'}\n${(mode === 'connector' ? fileLines : t.downloads.map(d => `- ${d.name}${d.pages ? ` (${d.pages} pages)` : ''}`)).join('\n')}` : '';
    return `# noema-lite curriculum task — ${t.title}\nCurriculum: “${c.title || c.goal}” (${c.id}) · write in ${LANGN(c)} · task ${t.id}\n\n## Your role and rules\n${t.system}\n\n## The task\n${t.prompt}${files}${chatText(c, t.ids || [])}\n\n${how}\n\n## JSON Schema of the answer\n${JSON.stringify(t.schema)}`;
  }
  /** Steps made by the learner's Claude from files in its own chat (noema_create_roadmap): those files, per step. */
  function chatText(c, ids) {
    const rows = ids.map(id => c.nodes[id]).filter(n => n?.chatFiles?.length);
    const where = n => { const p = n.addedIn && (c.parts || []).find(x => x.id === n.addedIn); return p ? `the Claude chat where the part “${p.title}” was added` : 'the Claude chat where this Roadmap was made'; };
    const chats = [...new Set(rows.map(where))];
    return rows.length ? `\n\n## The learner's files — in ${chats.length === 1 ? chats[0] : 'the Claude chats named below'}\nThe learner gave these files to Claude when ${chats.length === 1 && !/part/.test(chats[0]) ? 'the Roadmap was made from them' : 'these steps were made from them'}; they are THE sources of these steps: read every page that belongs to a step and anchor its chapters to them. If this chat does not have them, ask the learner to attach them.\n${rows.map(n => `- “${n.title}”${chats.length > 1 ? ` (${where(n).replace(/^the Claude chat /, 'in the chat ')})` : ''}: ${n.chatFiles.join('; ')}`).join('\n')}` : '';
  }
  /** A step to prepare as text. fileLines: how to get each file into the sandbox (signed links, or “attached to this chat”). */
  function stepText(c, t, { mode = 'connector', fileLines = [] } = {}) {
    const files = t.downloads.length;
    return [`# noema-lite — prepare ONE step of the curriculum “${c.title || c.goal}” as a subject pack`,
      `Step: “${t.stepTitle}” (${t.nid}) · subject_id: ${t.packId} (use exactly this id: pack.subject.id = "${t.packId}") · language: ${LANGN(c)} (${c.language})`,
      !files && c.nodes[t.nid]?.chatFiles?.length ? chatText(c, [t.nid]).replace(/^\n/, '') : files ? `\n## The learner's files — THE sources of this step\n${fileLines.join('\n')}\nRead every page of them that belongs to this step and build the pack FROM them: each planned chapter teaches and tests everything its pages contain (its "From the material" pages) — every topic, definition, mechanism, example, figure, table and detail, nothing skipped — and cites those pages. Do NOT research the theory on the web (web search only for pictures). Where a planned chapter is not covered by the files, write it briefly from reliable knowledge and say so in the coverage notes. Package the files (SKILL.md §3b) with the source ids of the plan below (m1, m2…); when only some pages belong to this step, split those pages out (split_pdf.py --ranges, keeps firstPage) and package the part instead of the whole file.`
        : `\n## Sources\nThere are no files for this step: research it yourself — official, authoritative sources first (official documentation and standards, university course pages, open textbooks such as OpenStax and LibreTexts, review articles, reference works; Wikipedia only as a pointer to better sources). Read what you cite. Record every source in sources.json (title, url, retrieved date) and map each chapter to its main source.`,
      `\n## The plan (follow it exactly: one pack chapter per planned chapter, same order and titles; do not re-teach what the learner already mastered)\n${t.brief}`,
      `\n## How to build and save it\n1. Use the noema-pack-builder skill if you have it; otherwise ${mode === 'connector' ? 'call noema_get_toolkit and noema_authoring_guide' : 'follow the noema-lite authoring guide you were given'}. Start with: python3 scripts/start_subject.py work ${t.packId} "${t.stepTitle.replace(/"/g, "'")}" --lang ${c.language}, then python3 scripts/pipeline.py start 2 work/${t.packId} and, after each step, pipeline.py next / pipeline.py check work/${t.packId} <step> (without the skill: noema_pipeline gives the same steps)\n2. Pictures only where they have real teaching value (from the files, from the web, drawn diagrams / function graphs) — none is better than a decorative one; each picture gets ≥ 3 exercises, and a chapter with pictures has every picture exercise type ≥ 3 times. In every chapter: every exercise type and focus tag that fits the chapter (declared in its map) ≥ 3 times; counts are a guide, never a target (tools/pack_rules.json). Quality rules Q1–Q8 (CONTENT_SPEC.md): before each chapter write its exhaustive knowledge map (map/chNN.json: every point not taught earlier on the map, learnables, the types and paradigms that fit, every question the files ask); every exercise is self-contained (never \"Q2\", \"page 5\" or \"the source\" — write the item out, origin only in \"cite\"); every exercise of the sources is in, written out in full (a source's own solution is taken as correct, answerFrom \"source\", but explained more deeply in your own words; one the source does not solve is solved twice and checked, answerFrom \"claude\"; never drop one to meet a quota: add exercises on top, or lightly adjust some source exercises into the needed type, focus or difficulty, keeping their substance, answer and cite); the theory of every chapter has all three kinds of table (table blocks with kind \"compare\" = a comparative matrix, \"summary\" = categorises or sums up the concepts, \"breakdown\" = related concepts across columns of different parameters); exercises test the idea, never the specifics of a lesson's example: an exercise never points at \"the example above\" and, when it uses an example, writes it out in full (data, code, table: it is also shown alone in drills and the Mistakes gym) and asks a question that needs thinking about it (only an interesting case in itself may be tested as such); every figure and diagram is explained in detail right after it (what it shows, how to read it, what it teaches); img_sequence (tap the parts in order) rarely on a graph diagram whose arrows already show the order (say why in map.sequenceWhy); difficulty ≈ 20/25/55 %, recall ≤ 25 %; then solve every exercise blind and write review/chNN.json. Then translate every chapter into ${(globalThis.NoemaPackCheck?.requiredLocales(c.language || 'en').translations || ['en', 'el', 'ru', 'de', 'fr']).join(', ')} (translations/<locale>/chNN.json, same ids and answers) and make 文A bridges into ${(globalThis.NoemaPackCheck?.requiredLocales(c.language || 'en').bridges || ['en', 'el', 'ru', 'ar', 'de', 'fr']).join(', ')}, everyday words included (bridge.py require). Validate with make_pack.py.\n` +
        (mode === 'connector'
          ? `3. Save it with noema_start_upload → curl → noema_finish_upload, subject_id "${t.packId}" (it asks for the source files you packaged; the learner's own files are recognised and not uploaded twice). The step then appears ready on the learner's map by itself. If the network blocks the upload (curl refused, 403, timeout), do not stop: python3 scripts/pipeline.py defer work/${t.packId} upload --note "why" and go on with 4 and 5 (translations and bridges are made here and never need the upload); at the end of the run retry every waiting upload together — pack, source files, translations, bridges (python3 scripts/pipeline.py pending work) — and if they still fail give the learner each <id>.noema.zip and the bridge files, and say what is waiting.\n4. With the pack's translations (English, Greek, Russian, German, French minus its own language — every chapter and the subject's name, subject.i18n), translate this step on the Roadmap into the same languages: everything its panel shows — title, summary, learning goals, domains, and every chapter's title, teaching goals and coverage — with noema_save_roadmap_translation; then the 文A bridges for every pair, from the pack's language and from each translation (bridge.py --from <locale>, noema_save_bridge with source) (noema_finish_upload and noema_save_translation list the exact texts still untranslated).\n5. Then call noema_curriculum_task for the next step, if the learner asked for more than one — also when this step's upload is waiting.`
          : `3. Give the learner the package ${t.packId}.noema.zip to download. In noema-lite they open this step on the map and press “📥 Import its package”.`),
      `Do not ask questions unless something essential is missing — choose sensible defaults.`].join('\n');
  }
  /** The message the learner pastes into a Claude chat (the connector does the rest). count: how many steps to prepare. */
  function message(c, { count = 1 } = {}) {
    const w = work(c); const parts = [];
    if (w.graph) parts.push('build its map');
    if (w.graph || w.toPlan.length) parts.push('plan the chapters of its steps');
    if (w.steps.length) parts.push(`prepare ${Math.min(count, w.steps.length) > 1 ? `the next ${Math.min(count, w.steps.length)} queued steps, one after the other` : 'the next queued step'}`);
    return `Use the noema-lite connector to work on my noema-lite curriculum “${c.title || c.goal}” (id ${c.id}): ${parts.join(', then ') || 'see what is left to do'}.\nCall noema_curriculum_task with curriculum_id "${c.id}" and follow what it returns; after each accepted answer or saved step call it again — ${count > 1 ? `stop after ${count} prepared steps or` : 'stop after one prepared step or'} when it says there is nothing left. Do not ask me questions — choose sensible defaults.${talkIn(c)}`;
  }
  /** 🌱 The message for a Claude chat that adds a new part to this Roadmap from new material (the map's ⋮ → Add a part with Claude). */
  function growMessage(c) {
    return `Use the noema-lite connector to add a new part to my noema-lite Roadmap “${c.title || c.goal}” (id ${c.id}) from the material I attach to this chat (or describe here).\nCall noema_pipeline with action detect and facts.grow = true, and follow its steps: read the map with noema_roadmap_map, read every file, then add the new steps with noema_extend_roadmap — each joined to the steps already on the map by their "@id" — and plan and prepare the new steps with noema_curriculum_task. Do not add again what the map already teaches. Do not ask me questions — choose sensible defaults.${talkIn(c)}`;
  }
  /** The language the learner reads Claude's messages in (engine/llm.js replyLang), when it is not English: the curriculum keeps its own. */
  const talkIn = c => { const r = L()?.replyLang?.(); return !r || /^en\b/.test(r.code) ? '' : ` Write your messages to me in ${r.name}${r.address ? ` (${r.address})` : ''}; the curriculum itself stays in ${LANGN(c)}.`; };
  /* i18n-ignore-end */

  /* ======================= in the app: the inbox, pasted answers, step bundles and packages ======================= */
  const App = { acc: null, timer: null, last: null, error: null, busy: false, listeners: new Set() };
  const emitA = () => App.listeners.forEach(f => { try { f(App); } catch (e) { } });
  const toast = (m, ms) => root.Noema?.toast?.(m, ms);
  const notice = (m, ms) => root.Noema?.notice ? root.Noema.notice(m, ms) : toast(m, ms);   // 🔔 news: a toast, or the bell when more would stack up
  /** Is any curriculum of this account waiting for the Claude app? */
  App.waiting = acc => C().list(acc).some(c => !work(c).done);
  /** A step the connector saved: get the pack from the cloud (and its pictures) and mark the step ready. */
  async function finishStep(acc, c, e) {
    const n = c.nodes[e.nid]; if (!n) return false;
    if (n.pack?.assigned) return false;   // 📦 the learner attached their own subject to this step since — it is not replaced
    if (n.pack?.status === 'ready' && n.pack.id === e.packId && (!e.version || n.pack.version === e.version)) return false;
    const pack = await root.Noema.getPackById(acc, e.packId);
    await C().Gen.finish(c, e.nid, pack, { stored: true, via: 'claude-app' });
    notice('🧭 ' + rt('roadmap.jobs.stepReady', { title: n.title }), 4000); return true;
  }
  /** 🛡 Is this tab older than the website (build.json, written by tools/build.py site)? An old tab may not know what the
      connector writes now, and deleting what it does not understand loses it — so it leaves the inbox alone and reloads
      the next time it comes back to the front. Not on a bundle / file:// copy (no build.json): never stale. */
  App.stale = async () => {
    const mine = root.NOEMA_BUILD?.commit; if (!mine || root.NOEMA_BUNDLE || !/^https?:/.test(root.location?.protocol || '')) return false;
    if (App.staleSeen) return true;
    if (App.buildAt && Date.now() - App.buildAt < 60000) return false; App.buildAt = Date.now();
    try {
      const r = await fetch('build.json', { cache: 'no-store' }); if (!r.ok) return false;
      const live = (await r.json())?.commit; if (!live || live === mine) return false;
    } catch (x) { return false; }
    App.staleSeen = true; toast?.('🔄 ' + rt('roadmap.jobs.newVersion'), 8000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') root.location.reload(); });
    return true;
  };
  /** The kinds of inbox entry this build knows, besides a task's answer ({ task }). Anything else (written by a newer connector) stays for a newer app. */
  const KINDS = R().KINDS;
  /** Fetch the answers waiting in the cloud, check and apply them, delete them. → how many were applied */
  App.poll = async (acc = App.acc) => {
    const CL = root.NoemaCloud; if (!acc || App.busy || !CL?.session?.() || !CL.kvRows) return 0;
    App.busy = true; let n = 0;
    try {
      const rows = (await CL.kvRows(IN)).sort((a, b) => a.key.localeCompare(b.key)); App.last = Date.now(); App.error = null;
      if (rows.length && await App.stale()) return 0;   // 🛡 an old tab: the inbox waits for the new build
      if (rows.length && CL.pull) { try { await CL.pull(acc); } catch (x) { App.error = errW(x); return 0; } }   // apply the answers to the newest copy of each curriculum, not to an older one on this device; no sync → they wait in the inbox for the next poll
      const done = []; let steps = 0;
      for (const r of rows) {
        const cid = r.key.slice(IN.length).split(':')[0];
        let e; try { e = JSON.parse(r.value); } catch (x) { done.push(r.key); continue; }
        const c = C().get(acc, cid), age = Date.now() - (Date.parse(r.updated_at) || 0);
        if (!c) { if (age > 7 * 864e5) done.push(r.key); continue; }   // not on this device (yet)
        if (!e?.task && !KINDS.includes(e?.kind)) { if (age > 30 * 864e5) done.push(r.key); continue; }   // 🛡 a kind this build does not know: never deleted unread (a task's answer names its task)
        try {
          if (e.kind === 'step') { if (await finishStep(acc, c, e)) { n++; steps++; } }
          else if (e.kind === 'assign') {   // 📦 Claude saved a subject for a step the learner named: it teaches that step from now on
            const res = await C().Edit.assign(acc, cid, e.nid, e.packId, { from: e.from || 'claude' });
            if (res.code === 'notInLibrary' && Date.now() - (Date.parse(r.updated_at) || 0) < 864e5) continue;   // its card has not synced yet: next time
            if (res.ok) { n++; notice('📦 ' + rt('roadmap.jobs.attached', { subject: e.title || e.packId, step: C().get(acc, cid)?.nodes[e.nid]?.title || e.nid, replan: res.replan ? 'yes' : 'no' }), 5000); }
            else toast('📦 ' + res.error, 5000);
          }
          else if (e.kind === 'i18n') {   // 🌐 Claude translated the Roadmap's own words (titles, learning goals, chapters) with its steps' packs
            const errs = C().checkI18n(c, e.locale, e.data);
            if (!errs.length) { C().setI18n(c, e.locale, e.data); C().save(acc, c); n++; }
            else { console.warn('[curjobs] translation refused', errs); if (age < 7 * 864e5) continue; }   // 🛡 e.g. a step this copy does not have yet: try again later, never lose it at once
          }
          else if (e.kind === 'extend') {   // 🌱 Claude added a new part to the Roadmap, joined to steps already on it
            const errs = extendProblems(c, e);
            if (!errs.length) { extend(c, e); C().save(acc, c); n++; notice('🌱 ' + rt('roadmap.jobs.partAdded', { title: e.part.title, n: Object.keys(e.nodes).length }), 5000); }
            else if (errs[0] !== 'applied') { console.warn('[curjobs] part refused', errs); if (age < 7 * 864e5) continue; }   // 🛡 e.g. this copy has not got a step it links to yet: try again later
          }
          else if (e.kind === 'link') {   // 🔗 Claude linked steps already on the map (a prepared step keeps its subject and progress)
            const errs = linkProblems(c, e);
            if (!errs.length) { const r = link(c, e); C().save(acc, c); n++; notice('🔗 ' + rt('roadmap.jobs.linksAdded', r), 5000); }
            else if (errs[0] !== 'applied') { console.warn('[curjobs] links refused', errs); if (age < 7 * 864e5) continue; }   // 🛡 e.g. this copy has not got a step yet: try again later
          }
          else if (e.kind === 'restructure') {   // 🪜 Claude proposes a new arrangement by level: it waits for the learner's decision (App.decide)
            const errs = proposeProblems(c, e);
            if (!errs.length) { propose(c, e); C().save(acc, c); n++; notice('🪜 ' + rt('roadmap.levels.proposal.notice', { title: C().shownTitle(c) }), 8000); }
            else if (errs[0] !== 'applied') { console.warn('[curjobs] proposal refused', errs); if (age < 7 * 864e5) continue; }   // 🛡 e.g. a step this copy does not have yet: try again later
          }
          else {
            const t = byId(c, e.task);   // null: applied already (an earlier check) — or out of date
            if (t) { const errs = check(c, t, e.data); if (!errs.length) { apply(c, t, e.data); C().save(acc, c); n++; } else console.warn('[curjobs] answer refused', errs); }
          }
          done.push(r.key);
        } catch (x) { console.warn('[curjobs]', x); App.error = errW(x); }
      }
      // a queued step whose subject is saved already — its answer was handled on another device, then an older copy of the
      // curriculum put the step back in the queue: finish it here, so it is not prepared a second time
      for (const c of C().list(acc)) for (const [nid, nd] of Object.entries(c.nodes || {})) {
        if (nd.pack?.status !== 'app') continue;
        const pid = C().packId(c, nid), meta = C().kvGet(acc, 'packmeta:' + pid);
        if (!savedSince(c, nid, meta)) continue;
        try { if (await finishStep(acc, c, { nid, packId: pid, version: meta.version || null })) { n++; steps++; } } catch (x) { console.warn('[curjobs]', x); App.error = errW(x); }
      }
      // the changed curricula reach the cloud BEFORE their answers leave the inbox: the connector always sees one or the other
      if (n) await CL.push(acc);
      for (const k of done) await CL.kvDelete(k).catch(() => { });
      if (steps) await CL.pull(acc).catch(() => { });   // what the connector wrote with a step: its source-file index (👁), its subject's card
    } catch (x) { App.error = errW(x); } finally { App.busy = false; emitA(); }
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

  /** 🪜 The learner's subjects as a restructuring needs them (src/features/roadmaps/application/ports.ts RoadmapPacks): a pack
      with its translations and 文A bridges, saved as a Roadmap step's subject (engine/loader.js importPack keeps the
      translations in their own files), the bridges attached again, the joined packs removed, the progress state moved. */
  const ok = value => ({ ok: true, value }), fail = e => ({ ok: false, error: e });
  const Packs = {
    async load(acc, id) {
      try {
        const N = root.Noema; let pack = await N.getPackById(acc, id); if (!pack) return fail(new Error(id));
        pack = await N.inlineTranslations(acc, JSON.parse(JSON.stringify(pack)));
        const translations = {};
        for (const [loc, t] of Object.entries(pack.translations || {})) if (Array.isArray(t?.chapters)) translations[loc] = { format: 'noema-translation', v: 1, locale: loc, pack: id, ...t };
        delete pack.translations;
        const B = root.NoemaBridge, bridges = [];
        if (B) {
          const own = pack.subject.language || 'en', srcs = [own, ...Object.keys(translations)];
          for (const src of srcs) for (const [nat, m] of Object.entries(B.available(acc, id, { language: own }, src === own ? null : src, own))) {
            if (!m.own) continue;   // a library bridge belongs to the library's pack, not to the learner's copy
            const b = await B.load(acc, id, nat, src === own ? null : src, own).catch(() => null); if (b) bridges.push(JSON.parse(JSON.stringify(b)));
          }
        }
        return ok({ pack, translations, bridges });
      } catch (e) { return fail(e); }
    },
    async save(acc, b, step) {
      try {
        const p = { ...b.pack, translations: b.translations };
        await root.Noema.importPack(acc, p, { curriculum: step.roadmap, node: step.node, curTitle: step.title, via: 'restructure' });
        for (const x of b.bridges) await root.NoemaBridge?.attach(acc, x);
        return ok(undefined);
      } catch (e) { return fail(e); }
    },
    async remove(acc, id) {
      try { const s = (await root.Noema.subjectsFor(acc)).find(x => x.id === id); if (s) await root.Noema.deleteSubject(s); return ok(undefined); } catch (e) { return fail(e); }
    },
    /* the subject's progress is the learning log's fold; what a subject is handed (its items moved here) becomes its events */
    state(acc, id) { const p = root.NoemaCore.learning.progressOf(acc, id); return p ? JSON.parse(JSON.stringify(p)) : null; },
    async setState(acc, id, st) { try { await root.NoemaCore.learning.adoptProgress(acc, id, st); return ok(undefined); } catch (e) { return fail(e); } },
  };
  /** 🪜 The learner decides on a restructuring proposal: approve (applied to the Roadmap and its subjects; nothing is lost) or
      decline. In a shared Roadmap only its owner decides (the map is theirs). → { ok, changes } | { error } */
  App.decide = async (acc, cid, id, approve) => {
    const c = C().get(acc, cid); if (!c) return { error: rt('roadmap.jobs.notHere') };
    if (member(c)) return { error: rt('roadmap.levels.proposal.ownerOnly', { owner: c.shared.ownerName || '' }) };
    if (!approve) { C().save(acc, R().restructure.decline(c, id, Date.now())); return { ok: true }; }
    const r = await R().restructure.apply(acc, c, id, Packs, Date.now());
    if (!r.ok) return { error: errW(r.error) };
    const cc = r.value.roadmap; logApp(cc, '🪜 ' + rt('roadmap.jobs.restructured'));
    C().save(acc, cc);   // 👥 the owner's shared map follows by itself (NoemaCurShare.push on every save)
    return { ok: true, before: r.value.before, after: r.value.after };
  };

  /** Without the connector: the learner pasted Claude's answer to a copied task → { ok, line } | { errors } */
  App.paste = (acc, cid, taskId, text) => {
    const c = C().get(acc, cid); if (!c) return { errors: [rt('roadmap.jobs.notHere')] };
    const t = byId(c, taskId); if (!t) return { errors: [rt('roadmap.jobs.taskDone')] };
    let data; try { data = L().parseJSON(text); } catch (e) { return { errors: [rt('roadmap.jobs.notJson')] }; }
    const errs = check(c, t, data); if (errs.length) return { errors: errs };   // the checks' words are for Claude (the learner copies them into the chat): English
    const line = apply(c, t, data); C().save(acc, c); C().Gen.kick(); return { ok: true, line };
  };
  /** The task text to copy into any Claude chat (no connector). */
  App.copyTask = (acc, cid) => { const c = C().get(acc, cid); const t = c && next(c, { want: 'any' }); return t && t.kind !== 'step' && !t.error ? { id: t.id, title: taskLabel(c, t), text: taskText(c, t, 'paste'), files: (t.downloads || []).map(d => d.name), steps: t.ids || [] } : null; };
  /** ⬇️ A step's bundle for a Claude chat without the connector: the task, the learner's files and the toolkit. */
  App.bundle = async (acc, cid, nid) => {
    const c = C().get(acc, cid); const t = c && stepSpec(c, nid); if (!t) throw new Error(rt('roadmap.stepNotFound'));
    if (!root.JSZip && root.NoemaViewer?.jszip) await root.NoemaViewer.jszip();
    if (!root.JSZip) throw new Error(rt('roadmap.jobs.noZip'));
    const z = new root.JSZip(), lines = [], missing = [];
    for (const d of t.downloads) {
      const rec = await root.NoemaSrcFiles.get(acc, d.store, d.src).catch(() => null);
      /* i18n-ignore-start — TASK.md is for Claude */
      if (rec?.blob) { z.file('files/' + d.name, rec.blob); lines.push(`- files/${d.name}${d.pages ? ` (${d.pages} pages)` : ''} — in this bundle`); } else { missing.push(d.name); lines.push(`- ${d.name} — NOT in this bundle (ask the learner to attach it)`); }
      /* i18n-ignore-end */
    }
    try { const kit = await fetch((root.NOEMA_CONFIG?.siteUrl || '').replace(/\/$/, '') + '/downloads/noema-pack-builder.zip'); if (kit.ok) z.file('noema-pack-builder.zip', await kit.blob()); } catch (e) { }
    z.file('TASK.md', stepText(c, t, { mode: 'bundle', fileLines: lines }) + `\n\n## The toolkit\nnoema-pack-builder.zip in this bundle is the noema-pack-builder skill: unzip it in your sandbox and follow its SKILL.md (scripts/ has start_subject.py, make_pack.py…). If you have the skill installed already, use that.`);   // i18n-ignore (for Claude)
    const blob = await z.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${t.packId}-for-claude.zip`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    return { missing, name: a.download };
  };
  /** 📥 The package Claude made for a step (.noema.zip or .json) → the step's subject. */
  App.importPackage = async (acc, cid, nid, file) => {
    const SF = root.NoemaSrcFiles; let pack, files = null;
    if (SF && await SF.isZip(file)) { const b = await SF.readBundle(file); pack = b.pack; files = await SF.bundleFiles(b, pack); }   // its source files and its H5P activities' files
    else { try { pack = JSON.parse(await file.text()); } catch (e) { throw new Error(rt('roadmap.jobs.notPackage')); } }
    if (pack?.format !== 'noema-pack' && pack?.format !== 'noema-pack/v1' && !Array.isArray(pack?.chapters)) throw new Error(rt('roadmap.jobs.notPack'));
    if (root.NoemaPackCheck && root.NoemaCore?.engines) await root.NoemaCore.engines.load(root.NoemaPackCheck.enginesNamed(pack));   // the engines its activities name check their models
    const res = root.NoemaPackCheck?.checkPack(pack); if (res?.errors?.length) throw new Error(rt('roadmap.jobs.packErrors', { n: res.errors.length, list: res.errors.slice(0, 3).join('; ') }));   // the errors themselves: English diagnostics (engine/packcheck.js)
    const c = C().get(acc, cid); if (!c?.nodes[nid]) throw new Error(rt('roadmap.stepNotFound'));
    C().Gen.start(acc); await C().Gen.finish(c, nid, pack, { files, via: 'claude-chat' });
    return { title: c.nodes[nid].title };
  };

  root.NoemaCurJobs = { work, settle, extend, extendProblems, link, linkProblems, propose, proposeProblems, growMessage, attachTo, savedSince, claimKey, CLAIM, LEASE, WAIT, leaseOf, claimExpired, next, byId, planGen, check, apply, merged, spec, stepSpec, planBatch, downloadsOf, taskText, taskLabel, stepText, message, inboxKey, needsPlan, prepared, isApp, BATCH, BATCH_FILES, IN, App };
})(typeof window !== 'undefined' ? window : globalThis);
