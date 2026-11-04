/* xAPI 1.0.3 / cmi5 export (engine/src/43_xapi.js, docs/activities-dev/xapi.md):
   statements of sample attempts validate against tools/schemas/noema.xapi-export.v1.schema.json (a small validator here, and
   Python's jsonschema too when it is installed), are deterministic, never carry an email, have the right durations; the cmi5
   profile keeps the cmi5 rules; cmi5.xml is well-formed with the course structure the spec asks for.
   Usage: node tests/xapi.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const X = require(path.join(ROOT, 'engine', 'src', '43_xapi.js'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'schemas', 'noema.xapi-export.v1.schema.json'), 'utf8'));

/* ---- a small JSON Schema (2020-12) validator: the keywords the schema uses ---- */
function check(schema, v, at = '$', root = schema, out = []) {
  if (schema.$ref) { const p = schema.$ref.replace(/^#\//, '').split('/'); let s = root; for (const k of p) s = s[k]; return check(s, v, at, root, out); }
  const type = x => x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x;
  const bad = m => out.push(at + ': ' + m);
  if ('const' in schema && JSON.stringify(v) !== JSON.stringify(schema.const)) bad('not ' + JSON.stringify(schema.const));
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(v))) bad('not in enum');
  if (schema.type) { const t = type(v); if (!(t === schema.type || (schema.type === 'number' && t === 'integer'))) { bad('type ' + t + ' != ' + schema.type); return out; } }
  if (typeof v === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) bad('does not match ' + schema.pattern);
    if (schema.minLength != null && v.length < schema.minLength) bad('too short');
  }
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum) bad('< minimum'); if (schema.maximum != null && v > schema.maximum) bad('> maximum');
  }
  if (Array.isArray(v) && schema.items) v.forEach((x, i) => check(schema.items, x, at + '[' + i + ']', root, out));
  if (type(v) === 'object') {
    for (const k of schema.required || []) if (!(k in v)) bad('missing ' + k);
    if (schema.minProperties != null && Object.keys(v).length < schema.minProperties) bad('too few properties');
    for (const [k, x] of Object.entries(v)) {
      if (schema.propertyNames) check(schema.propertyNames, k, at + '{' + k + '}', root, out);
      if (schema.properties && k in schema.properties) check(schema.properties[k], x, at + '.' + k, root, out);
      else if (schema.additionalProperties === false) bad('unexpected property ' + k);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') check(schema.additionalProperties, x, at + '.' + k, root, out);
    }
  }
  return out;
}

/* ---- sample attempts (the shape of S.att, engine/src/32_activities.js saveAttempt) and answers (S.res) ---- */
const T = Date.UTC(2026, 10, 4, 9, 0, 0);
const att = {
  'ch01-e010': { id: 'a0f3c9e1b2d4', seed: 4242, t0: T, t: T + 90000, hints: 2,
    result: { score: 0.72, passed: true, detail: 'R=10k', t: T + 65430 },
    events: [{ t: T + 1000, name: 'probe:placed', data: { node: 'n2' } }, { t: T + 5000, name: 'fs' }, { t: T + 60000, name: 'param:set', data: { R: 10000 } }] },
  'ch01-e011': { id: 'b7e1aa90c3f2', seed: 7, t0: T + 100000, t: T + 100000 + 3725040, hints: 0,
    result: { score: 0.25, passed: false, detail: null, checks: [{ label: 'V out < 1 V', ok: true }, { label: 'I < 2 mA', ok: false }], t: T + 100000 + 3725040 },
    events: [{ t: T + 100500, name: 'switch' }] },
  'ch02-e004': { id: 'c1d2e3f4a5b6', seed: 1, t0: T + 200000, t: T + 230000, hints: 1, result: null, events: [{ t: T + 210000, name: 'drag' }] },   // left without a result
  'ch01-e012': { id: 'd9d9d9d9d9d9', seed: 3, t0: T + 300000, t: T + 310000, hints: 0, result: { score: 1, passed: true, t: T + 310000 }, events: [] },
};
const res = { 'ch01-e001': { n: 3, ok: 2, last: true, t: T + 400000, conf: 'sure' }, 'ch02-e002': { n: 1, ok: 0, last: false, t: T + 410000 } };
const chapters = [
  { id: 'ch01', title: 'Circuits', subtitle: 'Ohm & Kirchhoff', exercises: [{ id: 'ch01-e001', type: 'mcq', q: 'Which law gives **V = IR**?' }, { id: 'ch01-e010', type: 'sim', q: 'Set the divider so that $V_{out} = 3$ V.' }, { id: 'ch01-e011', type: 'sim', q: 'Find the fault.' }, { id: 'ch01-e012', type: 'sim', q: 'Light the LED.' }] },
  { id: 'ch02', title: 'Transients', exercises: [{ id: 'ch02-e002', type: 'cloze', q: 'tau = [[RC]]' }, { id: 'ch02-e004', type: 'sim', q: 'Charge the capacitor.' }] },
];
const input = { pack: { id: 'demo-circuits', title: 'Demo circuits', language: 'en' }, chapters, att, res };
const opts = { actor: { name: 'Ann', account: { homePage: 'https://noema-lite.netlify.app', name: 'acc-7f3a' } }, activityBase: 'https://noema-lite.netlify.app/xapi/demo-circuits/', registrationSeed: 'acc-7f3a|demo-circuits', locale: 'en' };

// 1. the plain xAPI profile
const S = X.statements(input, opts);
const verbs = S.map(s => s.verb.display['en-US']);
ok(verbs.filter(v => v === 'attempted').length === 4, 'one "attempted" per attempt (4)');
ok(verbs.filter(v => v === 'interacted').length === 5, 'one "interacted" per event (5)');
ok(verbs.filter(v => v === 'passed').length === 2 && verbs.filter(v => v === 'failed').length === 1, 'a result → passed / failed (2 + 1); an attempt without a result has none');
ok(verbs.filter(v => v === 'answered').length === 2, 'each answered ordinary exercise (S.res) → one "answered"');
const file = X.exportFile(input, opts);
const probs = check(SCHEMA, file);
ok(!probs.length, 'the export file validates against the schema' + (probs.length ? ': ' + probs.slice(0, 5).join('; ') : ''));
ok(!X.validateAll(S).length, 'NoemaXAPI.validateAll finds no problem' + (X.validateAll(S).length ? ': ' + X.validateAll(S).slice(0, 3).join('; ') : ''));
ok(JSON.stringify(X.statements(input, opts)) === JSON.stringify(S), 'deterministic: the same input gives the same statements, byte for byte');
ok(JSON.stringify(X.statements({ ...input, att: Object.fromEntries(Object.entries(att).reverse()), res: Object.fromEntries(Object.entries(res).reverse()) }, opts)) === JSON.stringify(S), 'the order of the keys of S.att / S.res does not matter');
ok(new Set(S.map(s => s.id)).size === S.length, 'every statement id is unique');
const S2 = X.statements(input, { ...opts, registrationSeed: 'another' });
ok(S2[0].context.registration !== S[0].context.registration && S2[0].id !== S[0].id, 'another registration seed → another registration and other ids');
ok(S.every(s => s.context.registration === file.registration && /^[0-9a-f-]{36}$/.test(s.context.registration)), 'every statement has the registration (a UUID v5 of the seed)');
ok(X.uuid5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8') === '2ed6657d-e927-568b-95e1-2665a8aea6a2', 'UUID v5 matches the RFC 4122 example (DNS namespace)');
// the actor: an account, never an email
const withMail = X.statements(input, { ...opts, actor: { name: 'ann@example.org', mbox: 'mailto:ann@example.org', mbox_sha1sum: 'abc', account: opts.actor.account } });
ok(withMail.every(s => !('mbox' in s.actor) && !('mbox_sha1sum' in s.actor) && !('name' in s.actor) && s.actor.account.name === 'acc-7f3a'), 'mbox / mbox_sha1sum are never written, and an address given as name is dropped');
ok(!JSON.stringify(withMail).includes('example.org'), 'the email appears nowhere in the export');
let threw = false; try { X.statements(input, { ...opts, actor: { mbox: 'mailto:ann@example.org' } }); } catch (e) { threw = /account/.test(e.message); }
ok(threw, 'an actor without an account is refused (no fallback to the email)');
ok(X.validate({ ...S[0], actor: { objectType: 'Agent', mbox: 'mailto:x@y.z' } }).some(p => /mbox/.test(p)) && check(SCHEMA.$defs.actor, { objectType: 'Agent', mbox: 'mailto:x@y.z', account: opts.actor.account }, '$', SCHEMA).length > 0, 'validate() and the schema both reject an actor with mbox');
// durations and results
const passed = S.find(s => s.verb.display['en-US'] === 'passed' && s.object.id.endsWith('ch01-e010'));
ok(passed.result.duration === 'PT1M5.43S', 'duration t0 → result: 65.43 s = PT1M5.43S (' + passed.result.duration + ')');
const failed = S.find(s => s.verb.display['en-US'] === 'failed');
ok(failed.result.duration === 'PT1H2M5.04S', 'duration 3725.04 s = PT1H2M5.04S (' + failed.result.duration + ')');
ok([[0, 'PT0S'], [10, 'PT0.01S'], [1500, 'PT1.5S'], [60000, 'PT1M'], [3600000, 'PT1H'], [86400000, 'PT24H']].every(([ms, d]) => X.duration(ms) === d), 'X.duration: 0, 10 ms, 1.5 s, 1 min, 1 h, 24 h');
ok(passed.result.score.scaled === 0.72 && passed.result.success === true && passed.result.completion === true && passed.result.score.min === 0 && passed.result.score.max === 1, 'result: score {scaled, raw, min, max}, success, completion');
ok(passed.result.extensions[X.EXT_BASE + 'hints-used'] === 2 && passed.result.extensions[X.EXT_BASE + 'detail'] === 'R=10k', 'hints used and the detail are result extensions under the noema IRI');
ok(failed.result.extensions[X.EXT_BASE + 'checks'].length === 2 && failed.result.extensions[X.EXT_BASE + 'checks'][1].ok === false, 'the checks grader: every check met or not is kept');
const ev = S.filter(s => s.verb.display['en-US'] === 'interacted' && s.object.id.endsWith('ch01-e010'));
ok(ev[0].context.extensions[X.EXT_BASE + 'event-name'] === 'probe:placed' && ev[0].context.extensions[X.EXT_BASE + 'event-data'].node === 'n2' && ev[0].timestamp === new Date(T + 1000).toISOString(), 'an event → interacted with its name, data and time');
ok(!(X.EXT_BASE + 'event-data' in ev[1].context.extensions), 'an event without data has no data extension');
ok(passed.context.contextActivities.parent[0].id === opts.activityBase + 'chapter/ch01' && passed.context.contextActivities.grouping[0].id === opts.activityBase, 'context: the chapter as parent, the pack as grouping');
ok(passed.object.definition.type === 'http://adlnet.gov/expapi/activities/simulation' && /V_\{out\} = 3 V/.test(passed.object.definition.name.en), 'a sim is a simulation activity named by its prompt (marks removed)');
const ans = S.find(s => s.object.id.endsWith('ch01-e001'));
ok(ans.object.definition.interactionType === 'choice' && ans.result.success === true && ans.result.extensions[X.EXT_BASE + 'confidence'] === 'sure', 'an mcq answer: cmi.interaction choice, success, confidence');
ok(S.filter(s => s.verb.display['en-US'] === 'attempted').every(s => s.context.extensions[X.EXT_BASE + 'seed'] != null && s.context.extensions[X.EXT_BASE + 'attempt-id']), 'attempted carries the attempt id and the seed');
// a statement the validator must refuse
ok(X.validate({ ...passed, result: { ...passed.result, duration: '65 s', score: { scaled: 2 } } }).length >= 2, 'validate(): a bad duration and a scaled score out of range are problems');

// 2. the cmi5 profile
for (const gran of ['chapter', 'activity']) {
  const C = X.statements(input, { ...opts, profile: 'cmi5', granularity: gran });
  const cf = X.exportFile(input, { ...opts, profile: 'cmi5', granularity: gran });
  const pr = check(SCHEMA, cf);
  ok(!pr.length, `cmi5 (${gran}): the export validates against the schema` + (pr.length ? ': ' + pr.slice(0, 3).join('; ') : ''));
  const va = X.validateAll(C);
  ok(!va.length, `cmi5 (${gran}): the cmi5 rules hold (category, session id, moveOn, success, duration, once per AU)` + (va.length ? ': ' + va.slice(0, 3).join('; ') : ''));
  const defined = C.filter(s => (s.context.contextActivities.category || []).some(c => c.id === X.CMI5_CAT));
  ok(defined.every(s => ['initialized', 'passed', 'failed', 'completed', 'terminated'].includes(s.verb.display['en-US']) && s.object.id.includes('/au/')), `cmi5 (${gran}): only defined verbs carry the cmi5 category, and they are about an AU`);
  ok(C.every(s => s.context.extensions && s.context.extensions[X.CMI5_SESSION]), `cmi5 (${gran}): every statement has the session id`);
  ok(C.filter(s => s.verb.display['en-US'] === 'initialized').length === 4 && C.filter(s => s.verb.display['en-US'] === 'terminated').length === 4, `cmi5 (${gran}): a session (initialized … terminated) per attempt`);
  if (gran === 'chapter') ok(C.filter(s => s.verb.display['en-US'] === 'passed').length === 1, 'cmi5 (chapter): ch01 is passed once, though two of its sims passed; no failed after it');
  else ok(C.filter(s => s.verb.display['en-US'] === 'passed').length === 2, 'cmi5 (activity): each passed sim passes its own AU');
}
ok(X.validateAll([...X.statements({ ...input, res: null }, { ...opts, profile: 'cmi5' }), ...X.statements({ ...input, res: null }, { ...opts, profile: 'cmi5' }).map(s => ({ ...s, id: X.uuid5(s.id) }))]).some(p => /second passed/.test(p)), 'validateAll(): a second passed for an AU in one registration is a problem');

// 3. cmi5.xml
const course = { id: 'demo-circuits', subject: { title: 'Demo circuits & <friends>', description: 'Circuits, step by step.', language: 'en' }, chapters };
const P1 = X.cmi5Package(course, { activityBase: opts.activityBase }), P2 = X.cmi5Package(course, { activityBase: opts.activityBase, granularity: 'activity', masteryScore: 0.8 });
ok(P1.files['cmi5.xml'] === X.cmi5Package(course, { activityBase: opts.activityBase }).files['cmi5.xml'], 'cmi5.xml is deterministic');
ok(P1.aus.length === 2 && P2.aus.length === 6, 'AUs: one per chapter (2); per activity: one per sim (4) + one for the rest of each chapter (2)');
const py = `
import sys, json, xml.etree.ElementTree as ET
NS = '{https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd}'
out = []
for f in sys.argv[1:]:
    r = ET.parse(f).getroot()
    c = r.find(NS + 'course')
    aus = r.iter(NS + 'au')
    def okau(a):
        kids = [k.tag[len(NS):] for k in a]
        return kids[:2] == ['title', 'description'] and 'url' in kids and a.get('id') and a.get('moveOn') in ('Passed','Completed','CompletedAndPassed','CompletedOrPassed','NotApplicable') and all(l.get('lang') for l in a.iter(NS + 'langstring'))
    al = list(aus)
    out.append({'root': r.tag == NS + 'courseStructure', 'course': c is not None and c.get('id') and [k.tag[len(NS):] for k in c] == ['title', 'description'],
                'title': c.find(NS + 'title/' + NS + 'langstring').text, 'aus': len(al), 'auok': all(okau(a) for a in al),
                'blocks': len(r.findall(NS + 'block')), 'mastery': sorted({a.get('masteryScore') or '' for a in al}),
                'urls': [a.find(NS + 'url').text for a in al]})
print(json.dumps(out))`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xapi-')), f1 = path.join(tmp, 'a.xml'), f2 = path.join(tmp, 'b.xml');
fs.writeFileSync(f1, P1.files['cmi5.xml']); fs.writeFileSync(f2, P2.files['cmi5.xml']);
let R = null; try { R = JSON.parse(cp.execFileSync('python3', ['-I', '-c', py, f1, f2], { encoding: 'utf8' })); } catch (e) { console.log(e.message); }
ok(R && R.every(x => x.root && x.course && x.auok), 'cmi5.xml is well-formed XML: courseStructure (cmi5 namespace) → course {title, description} → AUs {title, description, url} with moveOn');
ok(R && R[0].title === 'Demo circuits & <friends>', 'text is escaped in the XML and reads back exactly');
ok(R && R[0].blocks === 0 && R[0].aus === 2 && R[1].blocks === 2 && R[1].aus === 6, 'per chapter: AUs at the top; per activity: a block per chapter with its AUs');
ok(R && R[1].mastery.join() === '0.8' && R[0].mastery.join() === '', 'masteryScore only when asked');
ok(R && R[0].urls[0] === 'https://noema-lite.netlify.app/?subject=demo-circuits#/ch/ch01', 'an AU launches the app at its chapter');
const S5 = X.statements(input, { ...opts, profile: 'cmi5' });
ok(S5.filter(s => s.verb.display['en-US'] === 'passed').every(s => P1.aus.some(a => a.id === s.object.id)), 'the AU ids of the statements are the AUs of cmi5.xml');
fs.rmSync(tmp, { recursive: true, force: true });

// 4. Python's jsonschema agrees (when installed)
try {
  const tf = path.join(os.tmpdir(), 'xapi-export-' + process.pid + '.json');
  fs.writeFileSync(tf, JSON.stringify([file, X.exportFile(input, { ...opts, profile: 'cmi5' })]));
  const out = cp.execFileSync('python3', ['-I', '-c', `
import json, sys
try:
    import jsonschema
    if not hasattr(jsonschema, 'Draft202012Validator'): raise ImportError
except ImportError:
    print('skip'); sys.exit(0)
s = json.load(open(sys.argv[1])); docs = json.load(open(sys.argv[2]))
v = jsonschema.Draft202012Validator(s); jsonschema.Draft202012Validator.check_schema(s)
print(sum(1 for d in docs for e in v.iter_errors(d)))`, path.join(ROOT, 'tools', 'schemas', 'noema.xapi-export.v1.schema.json'), tf], { encoding: 'utf8' }).trim();
  fs.rmSync(tf, { force: true });
  if (out === 'skip') console.log('  ⏭  jsonschema not installed: Python cross-check skipped');
  else ok(out === '0', 'Python jsonschema (draft 2020-12) accepts the schema and both exports (' + out + ' errors)');
} catch (e) { ok(false, 'Python jsonschema check ran: ' + e.message); }

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
