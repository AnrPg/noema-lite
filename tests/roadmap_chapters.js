/* 📑🌐 The connector (bundled as tools/build.py does) against the Supabase emulator, without a browser, on steps 2 and 3 of the
   learner's electronics Roadmap (tests/fixtures/electronics_steps.js): chapters added to prepared steps in place, a repeat that
   changes nothing, refused requests, the Greek Roadmap translation of every chapter, an English + Greek Roadmap whose remaining
   work names only Greek, and four plan answers in one call, all stored with a receipt.
   Usage: node tests/roadmap_chapters.js <repo-dir> */
const path = require('path');
const { start } = require('./mock_supabase');
const { connectorHandler, removeConnector } = require('./connector_fn');
const F = require('./fixtures/electronics_steps');
const AG = require('./fixtures/curriculum_agents');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const PORT = 54391, BASE = `http://localhost:${PORT}`;

(async () => {
  const srv = await start({ port: PORT });
  const handler = await connectorHandler(ROOT, { config: { siteUrl: BASE, supabaseUrl: BASE, supabaseKey: 'sb_publishable_test', library: [] }, docs: {} });
  const su = await (await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'gadgets@example.com', password: 'secret123' }) })).json();
  const T = su.access_token, uid = su.user.id; let rpc = 0;
  const tool = async (name, args = {}) => { const r = await handler(new Request(BASE + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + T }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }) })); const j = await r.json(); return { text: j.result?.content?.[0]?.text || j.error?.message || '', isError: !!j.result?.isError }; };
  const cid = 'cg4tmvvv8', s2 = F.step2.id, s3 = F.step3.id;
  // the Roadmap: steps 2 and 3 prepared, and eight more steps waiting for their chapter plans (four batches of two)
  const more = Array.from({ length: 8 }, (_, i) => 'later_' + (i + 1));
  const c = { format: 'noema.curriculum/v1', id: cid, title: 'Build your own gadgets', goal: 'Build your own gadgets', language: 'en', provider: 'claudeapp', stage: 'plan', status: 'ready',
    nodes: { [s2]: F.step2, [s3]: F.step3, ...Object.fromEntries(more.map(id => [id, { id, title: 'Later ' + id, role: 'aspect', summary: 'later', chapters: [], learningGoals: [] }])) },
    edges: [{ from: s2, to: s3 }, ...more.map(id => ({ from: s3, to: id }))] };
  srv.state.kv[uid] = { ['a:curriculum:' + cid]: { value: JSON.stringify(c), updated_at: new Date().toISOString() } };
  const rec = () => JSON.parse(srv.state.kv[uid]['a:curriculum:' + cid].value);
  const refs = (x, id) => x.nodes[id].chapters.map(ch => ch.ref);

  console.log('— chapters added to prepared steps');
  let r = await tool('noema_add_roadmap_chapters', { curriculum_id: cid, step: '@' + s2, chapters_json: JSON.stringify(F.add2) });
  ok(!r.isError && /gained 1 chapter/.test(r.text) && /stays prepared/.test(r.text) && /3\. transformers_coupled/.test(r.text), 'step 2 gains “Transformers and coupled inductors” after the inductor chapter; the receipt lists the chapters: ' + r.text.split('\n')[0]);
  r = await tool('noema_add_roadmap_chapters', { curriculum_id: cid, step: s3, chapters_json: JSON.stringify(F.add3) });
  ok(!r.isError && /gained 2 chapter/.test(r.text), 'step 3 gains the semiconductor-physics and advanced-device chapters');
  ok(JSON.stringify(refs(rec(), s2)) === JSON.stringify(F.ORDER2) && JSON.stringify(refs(rec(), s3)) === JSON.stringify(F.ORDER3), 'in the Roadmap itself, in the right places: ' + refs(rec(), s3).join(', '));
  ok(rec().nodes[s2].pack.status === 'ready' && rec().nodes[s3].pack.status === 'ready' && rec().edges.length === c.edges.length, 'both steps still prepared, links unchanged');
  r = await tool('noema_add_roadmap_chapters', { curriculum_id: cid, step: s3, chapters_json: JSON.stringify(F.add3) });
  ok(!r.isError && /Nothing to add/.test(r.text) && rec().nodes[s3].chapters.length === 10, 'the same request again changes nothing');
  r = await tool('noema_add_roadmap_chapters', { curriculum_id: cid, step: s2, chapters_json: JSON.stringify({ chapters: [{ ref: 'inductor_ode', title: 'Other' }, { ref: 'zz', title: 'Z', after: 'nope' }, { ref: 'yy', title: '' }] }) });
  ok(r.isError && /already has a chapter "inductor_ode"/.test(r.text) && /unknown position "nope"/.test(r.text) && /empty title/.test(r.text), 'a duplicate ref, an unknown place and an empty title are refused, each with its reason');

  console.log('— the Greek Roadmap translation of every chapter');
  const elOf = x => ({ title: 'ΕΛ ' + x.title, goals: (x.goals || []).map(g => 'ΕΛ ' + g), coverage: (x.coverage || []).map(g => 'ΕΛ ' + g) });
  for (const id of [s2, s3]) {
    r = await tool('noema_save_roadmap_translation', { curriculum_id: cid, locale: 'el', translation_json: JSON.stringify({ nodes: { [id]: { chapters: Object.fromEntries(rec().nodes[id].chapters.map(ch => [ch.ref, elOf(ch)])) } } }) });
    ok(!r.isError && /Saved/.test(r.text), `step ${id === s2 ? 2 : 3}: the Greek translation of all ${rec().nodes[id].chapters.length} chapters is saved: ` + r.text.split('\n')[0].slice(0, 120));
    const tr = rec().i18n?.el?.nodes?.[id]?.chapters || {};
    ok(rec().nodes[id].chapters.every(ch => tr[ch.ref]?.title === 'ΕΛ ' + ch.title), '…and every chapter, the added ones too, has its Greek title in the Roadmap');
  }

  console.log('— an English + Greek Roadmap');
  r = await tool('noema_set_roadmap_languages', { curriculum_id: cid, languages_json: JSON.stringify({ translations: ['el'] }) });
  ok(!r.isError && /full translations: el; 文A bridges: en>el, el>en/.test(r.text), 'set: ' + r.text.split('\n')[0].slice(0, 160));
  ok(!/\b(ru|de|fr)\b —/.test(r.text) && /el — /.test(r.text), 'what is still untranslated names only Greek: ' + (r.text.split('\n').find(l => /untranslated/.test(l)) || '').slice(0, 160));
  r = await tool('noema_set_roadmap_languages', { curriculum_id: cid, languages_json: JSON.stringify({ translations: ['en'] }) });
  ok(r.isError && /own language/.test(r.text), 'the Roadmap\'s own language is refused as a translation');

  console.log('— a pack of this Roadmap is told only its languages, also before the app has them in its copy');
  {
    r = await tool('noema_set_roadmap_languages', { curriculum_id: cid, languages_json: JSON.stringify({ translations: ['el'] }) });
    ok(/Languages: set for this Roadmap — full translations: el;/.test((await tool('noema_roadmap_map', { curriculum_id: cid })).text), 'noema_roadmap_map names the Roadmap\'s languages');
    // the stored copy without them (the app wrote its own over it before it read the inbox): the inbox entry still has them
    const row = rec(); delete row.languages; srv.state.kv[uid]['a:curriculum:' + cid] = { value: JSON.stringify(row), updated_at: new Date().toISOString() };
    const fs = require('fs');
    const pk = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
    let h = 0; for (const ch of cid + s2) h = (h * 31 + ch.charCodeAt(0)) >>> 0;   // graph.ts packId
    const sid = `cur-${cid.slice(1, 7)}-${s2.replace(/_/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 38)}-${h.toString(36).slice(0, 4)}`;
    pk.subject = { ...pk.subject, id: sid, owner: null, authoring: { ...pk.subject.authoring, rules: 2 } }; pk.builtAt = '2026-11-01T00:00:00Z'; delete pk.translations;
    r = await tool('noema_save_pack', { pack_json: JSON.stringify(pk) });
    const todo = r.text.split('\n').find(l => l.startsWith('🌐 Still to do')) || '';
    ok(!r.isError && /full translations into el\b/.test(todo) && /en→el, el→en/.test(todo) && !/\b(ru|de|fr)\b/.test(todo), 'finish/save names only Greek and en↔el bridges, no ru, de, fr: ' + (todo || r.text.slice(0, 300)).slice(0, 240));
  }

  console.log('— four plan answers in one call');
  const tasks = [0, 2, 4, 6].map(i => 'plan:' + more.slice(i, i + 2).join(','));
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, answers_json: JSON.stringify(tasks.map(t => ({ task_id: t, result: AG.plans(t.slice(5).split(',')) }))) });
  ok(!r.isError && /4 of 4 answer\(s\) stored — the chapter plans of 8 step/.test(r.text), 'the receipt: ' + r.text.split('\n')[0]);
  ok(Object.keys(srv.state.kv[uid]).filter(k => k.startsWith('a:curin:' + cid + ':') && JSON.parse(srv.state.kv[uid][k].value).task).length === 4, 'four answers in the inbox');
  r = await tool('noema_curriculum_submit', { curriculum_id: cid, task_id: tasks[1], result_json: JSON.stringify(AG.plans(more.slice(2, 4))) });
  ok(!r.isError && /Stored: the chapter plans of later_3, later_4/.test(r.text), 'one of them again: replayed, its receipt says it is stored');

  removeConnector(handler); srv.close?.();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
