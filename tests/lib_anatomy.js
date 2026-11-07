/* anatomy@1 — computable anatomy (docs/library/anatomy.md): the curated data's consistency, the published reference values of the
   research brief (A1–A22: Moore 9e, Gray's 42e, ISNCSCI 2019, Nordin & Frankel, Waters 1993, Winter 2009, Beighton 1973; the source
   in each message), the edge cases and their codes, the checker's codes, the sim adapter, the Worker source in a fresh context,
   speed, the twin index of tools/lib_anatomy.py and the reference activity's own test cases.  Run: node tests/lib_anatomy.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibAnatomy = ENGINES.mod('anatomy@1');
const M = NoemaLibAnatomy;
const ev = (at, o, vs) => M.evaluate(Object.assign({ at }, o || {}), vs || [], o && o.completeness !== undefined ? o.completeness : 1);
const spec = (model, outs) => ({ format: 'noema.sim-spec/v1', engine: 'anatomy@1', model, outputs: outs.map((of, i) => ({ id: 'o' + i, kind: 'scalar', of })) });
const R = (model, outs, env) => { const s = spec(model, outs), r = M.engine.create(s).run(env || {}); return outs.map((_, i) => r['o' + i]); };
const all = (F, g, ids, v) => ids.every(id => F[g][id] === v);
const codes = (s) => M.checkSpec(s).map(p => p.code);

// ===== the data =====
{
  const dp = M.dataProblems();
  ok(dp.length === 0, 'the curated data is consistent: no dangling reference, unknown level, movement, root or attachment' + (dp.length ? ': ' + dp.slice(0, 5).join(' | ') : ''));
  const c = M.counts();
  ok(c.total >= 1000 && c.muscle >= 160 && c.nerve >= 100 && c.artery >= 140 && c.dermatome === 29, `the structure set: ${c.total} structures (${c.muscle} muscles, ${c.nerve} nerves, ${c.artery} arteries, ${c.vein} veins, ${c.dermatome} dermatomes), ${c.edges} vessel and lymph edges`);
  const G = M.graph(), has = id => G.node.has(id);
  const brachial = ['dorsal-scapular', 'long-thoracic', 'nerve-to-subclavius', 'suprascapular', 'lateral-pectoral', 'medial-pectoral', 'medial-cutaneous-arm', 'medial-cutaneous-forearm', 'upper-subscapular', 'thoracodorsal', 'lower-subscapular', 'axillary', 'radial', 'musculocutaneous', 'median', 'ulnar'];
  ok(brachial.every(has) && ['upper-trunk', 'middle-trunk', 'lower-trunk', 'lateral-cord', 'medial-cord', 'posterior-cord'].every(has), 'brachial plexus: 3 trunks, 6 divisions, 3 cords and all 16 named branches (Moore9 table 3.6)');
  const ls = ['iliohypogastric', 'ilioinguinal', 'genitofemoral', 'lateral-cutaneous-thigh', 'femoral', 'obturator', 'superior-gluteal', 'inferior-gluteal', 'sciatic', 'tibial', 'common-fibular', 'deep-fibular', 'superficial-fibular', 'sural', 'pudendal', 'posterior-cutaneous-thigh'];
  ok(ls.every(has), 'lumbosacral plexus: the named branches (research C1.9)');
  ok(['olfactory', 'optic', 'oculomotor', 'trochlear', 'trigeminal', 'abducens', 'facial', 'vestibulocochlear', 'glossopharyngeal', 'vagus', 'accessory', 'hypoglossal'].every(id => has(id) && G.node.get(id).cn), 'cranial nerves I–XII with their number, modality and exit');
  const rootsOf = id => M.compute({ mode: 'query', of: id }, {}).scalars;
  const chk = [['musculocutaneous', 5, 7], ['axillary', 5, 6], ['radial', 5, 9], ['median', 5, 9], ['ulnar', 7, 9], ['femoral', 22, 24], ['obturator', 22, 24], ['sciatic', 24, 28], ['pudendal', 27, 29], ['superior-gluteal', 24, 26], ['inferior-gluteal', 25, 27], ['long-thoracic', 5, 7]];
  ok(chk.every(([id, lo, hi]) => rootsOf(id).rootLo === lo && rootsOf(id).rootHi === hi), 'nerve roots: musculocutaneous C5–C7, axillary C5–C6, radial and median C5–T1, ulnar C7–T1, femoral and obturator L2–L4, sciatic L4–S3, pudendal S2–S4, gluteal nerves (Moore9)');
  ok(Object.keys(M.VARIANTS).every(v => M.VARIANTS[v].freq.length === 2 && M.VARIANTS[v].freq[0] <= M.VARIANTS[v].freq[1] && M.VARIANTS[v].src), 'every variant has a frequency range [low, high] and a source (never one figure)');
}

// ===== A1–A9, A21, A22: lesions, reflexes, ISNCSCI =====
{
  const F = ev(['upper-trunk']);
  ok(all(F, 'muscle', ['deltoid', 'supraspinatus', 'infraspinatus', 'teres-minor', 'supinator'], 2) && ['biceps-brachii', 'brachialis', 'brachioradialis'].every(m => F.muscle[m] >= 1) && F.muscle['serratus-anterior'] === 0 && F.muscle['rhomboid-major'] === 0,
    'A1 upper trunk (Erb): deltoid, supra/infraspinatus, teres minor, supinator paralysed; biceps, brachialis, brachioradialis weak; serratus and rhomboids spared (roots proximal) — Moore9');
  ok(F.reflex['biceps-reflex'] === 2 && F.reflex['brachioradialis-reflex'] === 2 && F.area['regimental-badge'] === 2 && F.area['lateral-forearm'] === 2 && F.sign['waiters-tip'] === 1, 'A1 biceps and brachioradialis reflexes lost, lateral arm and forearm numb, waiter\'s tip — Moore9');
  const K = ev(['C8', 'T1'], { avulsion: true }), Kt = ev(['lower-trunk']);
  ok(all(K, 'muscle', ['first-dorsal-interosseous', 'dorsal-interossei-2-4', 'palmar-interossei', 'lumbricals-1-2', 'lumbricals-3-4', 'abductor-pollicis-brevis', 'abductor-digiti-minimi', 'fdp-lateral', 'fdp-medial'], 2) && K.sign['claw-hand'] === 1 && K.area['medial-forearm'] === 2,
    'A2 C8–T1 (Klumpke): every intrinsic hand muscle and FDP paralysed, claw hand, medial forearm numb — Moore9; Gray42');
  ok(K.sign.horner === 1 && Kt.sign.horner === 0 && Kt.sign['claw-hand'] === 1, 'A2 Horner with a preganglionic T1 avulsion, not with a lower trunk lesion — Gray42');
  ok(K.dermatome.C8 === 2 && K.dermatome.T1 === 2 && K.dermatome.C7 === 0 && ev(['C6']).dermatome.C6 === 1, 'dermatomes: two adjacent roots → both lost; one root alone → partial (overlap; Lee 2008)');
  const Rg = ev(['radial@spiral-groove']);
  ok(all(Rg, 'muscle', ['extensor-carpi-radialis-longus', 'extensor-carpi-radialis-brevis', 'extensor-carpi-ulnaris', 'extensor-digitorum', 'brachioradialis', 'supinator'], 2) && all(Rg, 'muscle', ['triceps-long', 'triceps-lateral', 'triceps-medial'], 0) && Rg.area['dorsum-radial-hand'] === 2 && Rg.sign['wrist-drop'] === 1 && Rg.reflex['triceps-reflex'] === 0,
    'A3 radial at the spiral groove: wrist and finger extensors, brachioradialis, supinator paralysed; triceps spared; first web numb; wrist drop — Moore9');
  const Ue = ev(['ulnar@elbow']), Uw = ev(['ulnar@wrist']);
  ok(Ue.muscle['flexor-carpi-ulnaris'] === 2 && Ue.muscle['fdp-medial'] === 2 && Uw.muscle['flexor-carpi-ulnaris'] === 0 && Uw.muscle['fdp-medial'] === 0 && Ue.muscle['first-dorsal-interosseous'] === 2 && Uw.muscle['first-dorsal-interosseous'] === 2,
    'A4 ulnar at the elbow: FCU, FDP 4–5 and the intrinsics; at the wrist: the intrinsics only — Moore9');
  ok(Uw.ulnarClaw === 1 && Ue.ulnarClaw === 0.5 && Ue.area['dorsal-ulnar-hand'] === 2 && Uw.area['dorsal-ulnar-hand'] === 0, 'A4 the ulnar paradox: more clawing at the wrist (1) than at the elbow (0.5); the dorsal branch is spared at the wrist — Moore9');
  const Ct = ev(['carpal-tunnel']);
  ok(all(Ct, 'muscle', ['abductor-pollicis-brevis', 'opponens-pollicis', 'fpb-superficial', 'lumbricals-1-2'], 2) && Ct.area['palmar-lateral-digits'] === 2 && Ct.area['thenar-skin'] === 0 && Ct.muscle['flexor-pollicis-longus'] === 0,
    'A5 carpal tunnel: APB, opponens, FPB superficial head, lumbricals 1–2; lateral 3½ digits numb; palmar branch (thenar skin) spared — Moore9');
  const Fn = ev(['common-fibular@fibular-neck']), L5 = ev(['L5']);
  ok(all(Fn, 'muscle', ['tibialis-anterior', 'extensor-hallucis-longus', 'extensor-digitorum-longus', 'fibularis-longus', 'fibularis-brevis'], 2) && Fn.muscle['tibialis-posterior'] === 0 && Fn.muscle['gluteus-medius'] === 0 && Fn.reflex['achilles-reflex'] === 0 && Fn.sign['foot-drop'] === 1,
    'A6 common fibular at the neck: dorsiflexion, eversion, toe extension; tibialis posterior and gluteus medius spared; ankle reflex normal; foot drop — Moore9');
  ok(L5.muscle['tibialis-posterior'] === 1 && L5.muscle['gluteus-medius'] === 1 && L5.move['subtalar.inversion'] === 1 && L5.move['hip.abduction'] === 1 && L5.reflex['achilles-reflex'] === 0, 'A6 L5 root: inversion and hip abduction also weak, ankle reflex normal — standard neurology');
  const d = M.compute({ mode: 'lesion', lesions: [{ at: ['common-fibular@fibular-neck'] }, { at: ['L5'] }], compare: 1 }, {});
  ok(d.scalars.discriminators > 0 && [{ mode: 'lesion', lesions: [{ at: ['common-fibular@fibular-neck'] }, { at: ['L5'] }], compare: 1 }].every(m => R(m, ['differs.muscle.tibialis-posterior', 'differs.muscle.tibialis-anterior'])[0] === 1),
    'A6 the discriminators: tibialis posterior differs between the two lesions (differs.muscle.…)');
  const bf = R({ mode: 'lesion', lesions: [{ at: ['common-fibular@fibular-neck'] }, { at: ['L5'] }], findings: ['muscle.tibialis-anterior', 'sign.foot-drop', 'muscle.tibialis-posterior'] }, ['bestFinding'])[0];
  ok(bf === 0 || bf === 2, `the best next examination splits the candidates (index ${bf})`);
  const rr = id => R({ mode: 'query', of: id }, ['rootLo', 'rootHi']);
  ok(JSON.stringify([rr('biceps-reflex'), rr('brachioradialis-reflex'), rr('triceps-reflex'), rr('patellar-reflex'), rr('achilles-reflex')]) === JSON.stringify([[5, 6], [5, 6], [6, 8], [22, 24], [26, 27]]),
    'A7 reflex roots: biceps C5–C6, brachioradialis C5–C6, triceps C6–C8 (C7), patellar L2–L4 (L4), Achilles S1–S2 (S1) — Moore9; Bickerstaff');
  ok(ev(['C7']).reflex['triceps-reflex'] === 1 && ev(['L4']).reflex['patellar-reflex'] === 1 && ev(['S1']).reflex['achilles-reflex'] === 1 && ev(['C5']).reflex['biceps-reflex'] === 1, 'one root → its reflex reduced (C7 triceps, L4 patellar, S1 Achilles, C5 biceps)');
  const km = [['C5', 'elbow.flexion'], ['C6', 'wrist.extension'], ['C7', 'elbow.extension'], ['C8', 'dip.flexion'], ['T1', 'little-finger.abduction'], ['L2', 'hip.flexion'], ['L3', 'knee.extension'], ['L4', 'ankle.dorsiflexion'], ['L5', 'hallux.extension'], ['S1', 'ankle.plantarflexion']];
  ok(km.every(([s, dof]) => M.relation('key-muscle', s, dof, []) === 1) && M.relation('key-muscle', 'C5', 'wrist.extension', []) === 0, 'A8 ISNCSCI key muscles C5…T1, L2…S1 — ISNCSCI 2019');
  const G = M.graph(), kp = s => G.node.get('kp-' + s).en;
  ok(/thumb/.test(kp('C6')) && /middle finger/.test(kp('C7')) && /little finger/.test(kp('C8')) && /nipple/.test(kp('T4')) && /umbilicus/.test(kp('T10')) && /medial malleolus/.test(kp('L4')) && /third metatarsophalangeal/.test(kp('L5')) && /lateral heel/.test(kp('S1')),
    'A9 key sensory points: C6 thumb, C7 middle finger, C8 little finger, T4 nipple, T10 umbilicus, L4 medial malleolus, L5 3rd MTP, S1 lateral heel — ISNCSCI 2019');
  const mg = M.evaluate({ at: ['ulnar@elbow'] }, ['martin-gruber'], 1);
  const r21 = M.compute({ mode: 'lesion', lesions: [{ at: ['ulnar@elbow'] }], variants: ['martin-gruber'] }, {});
  ok(mg.muscle['first-dorsal-interosseous'] === 1 && r21.issues['variant-sensitive'] === 1, 'A21 Martin–Gruber + ulnar lesion at the elbow: first dorsal interosseous only weak, flagged variant-sensitive — Bergman 2016');
  ok(M.relation('innervates', 'axillary', 'deltoid', []) === 1 && M.relation('root', 'C5', 'deltoid', []) === 1 && M.relation('root', 'C6', 'deltoid', []) === 1 && M.relation('root', 'C7', 'deltoid', []) === 0, 'A22 deltoid: C5–C6, axillary nerve — Moore9');
}

// ===== A10–A12: path tracing =====
{
  const p10 = M.trace({ from: 'left-ventricle', to: 'radial-artery', side: 'R' }, []).path;
  ok(JSON.stringify(p10) === JSON.stringify(['left-ventricle', 'aortic-valve', 'ascending-aorta', 'aortic-arch', 'brachiocephalic-trunk', 'subclavian', 'axillary-1', 'axillary-2', 'axillary-3', 'brachial', 'radial-artery']),
    'A10 LV → right radial: aortic valve, ascending aorta, arch, brachiocephalic trunk, subclavian, axillary (3 parts), brachial, radial — Moore9');
  ok(!M.trace({ from: 'left-ventricle', to: 'radial-artery', side: 'L' }, []).path.includes('brachiocephalic-trunk'), 'the left subclavian comes from the arch itself');
  const p11 = M.trace({ from: 'inferior-mesenteric-vein', to: 'right-atrium' }, []).path;
  ok(JSON.stringify(p11) === JSON.stringify(['inferior-mesenteric-vein', 'splenic-vein', 'hepatic-portal-vein', 'liver-sinusoids', 'hepatic-veins', 'vena-cava-inferior', 'right-atrium']), 'A11 IMV → RA: splenic v., portal v., sinusoids, hepatic vv., IVC — Moore9');
  const v11 = R({ mode: 'trace', from: 'inferior-mesenteric-vein', to: 'right-atrium', variants: ['imv-into-smv'] }, ['via.superior-mesenteric-vein', 'issue.variant-sensitive']);
  ok(v11[0] === 1 && v11[1] === 1, 'A11 variant: the IMV into the SMV changes the route (variant-sensitive)');
  const p12 = M.trace({ system: 'fetal', from: 'placenta', to: 'left-atrium' }, []).path;
  ok(JSON.stringify(p12) === JSON.stringify(['placenta', 'umbilical-vein', 'ductus-venosus', 'vena-cava-inferior', 'right-atrium', 'foramen-ovale-heart', 'left-atrium']), 'A12 foetal: placenta → umbilical v. → ductus venosus → IVC → RA → foramen ovale → LA — Moore & Persaud 11e');
  ok(M.trace({ from: 'placenta', to: 'left-atrium' }, []).path === null && R({ mode: 'trace', from: 'placenta', to: 'left-atrium' }, ['found', 'issue.no-path'])[1] === 1, 'after birth the shunts are closed: no path (no-path), never a made-up route');
  const col = R({ mode: 'trace', from: 'subclavian', to: 'brachial', side: 'R', avoid: ['axillary-1'] }, ['found', 'collateral', 'via.circumflex-scapular']);
  ok(col[0] === 1 && col[1] === 1 && col[2] === 1, 'a blocked first part of the axillary artery: the scapular anastomosis (circumflex scapular) carries the flow — Moore9');
  ok(M.trace({ from: 'ascending-aorta', to: 'posterior-interventricular' }, ['left-dominance']).path.includes('circumflex') && M.trace({ from: 'ascending-aorta', to: 'posterior-interventricular' }, []).path.includes('right-coronary'), 'coronary dominance: the PDA from the RCA, or from the circumflex in left dominance');
  ok(M.trace({ system: 'lymph', from: 'testis-lymph', to: 'thoracic-duct' }, []).path.includes('lumbar-nodes') && M.trace({ system: 'lymph', from: 'scrotum-skin', to: 'thoracic-duct' }, []).path.includes('superficial-inguinal-nodes'), 'lymph: testis → para-aortic (lumbar) nodes, scrotum → superficial inguinal — Moore9');
  ok(JSON.stringify(M.trace({ system: 'nerve', from: 'C7', to: 'triceps-long' }, []).path) === JSON.stringify(['C7', 'middle-trunk', 'middle-trunk-post', 'posterior-cord', 'radial', 'triceps-long']), 'nerve trace: C7 → middle trunk → posterior division → posterior cord → radial → triceps');
  ok(M.relation('remnant', 'ligamentum-arteriosum', 'ductus-arteriosus', []) === 1 && M.relation('drains', 'great-saphenous-vein', 'vena-cava-inferior', []) === 1 && M.relation('continues', 'axillary-3', 'brachial', []) === 1, 'foetal remnants, venous drainage, continuations');
}

// ===== A13–A15: visual pathway, cord, foramina =====
{
  const V = (lesions, outs, pick) => R({ mode: 'visual', lesions, pick: pick || 0 }, outs);
  ok(V(['chiasm-central'], ['defect.bitemporal-hemianopia'])[0] === 1 && V(['optic-tract-L'], ['defect.homonymous-hemianopia-right'])[0] === 1 && V(['meyer-loop-L'], ['defect.superior-quadrantanopia-right'])[0] === 1,
    'A13 chiasm → bitemporal hemianopia; left optic tract → right homonymous hemianopia; left Meyer\'s loop → right superior quadrantanopia — Gray42');
  ok(V(['occipital-L'], ['defect.homonymous-hemianopia-right', 'defect.macular-sparing']).join() === '1,1' && V(['optic-nerve-R'], ['defect.monocular-R', 'rapd.R']).join() === '1,1' && V(['parietal-radiation-R'], ['defect.inferior-quadrantanopia-left'])[0] === 1, 'occipital: macular sparing; optic nerve: monocular loss + RAPD; parietal: inferior quadrantanopia');
  const c = R({ mode: 'cord', level: 'T10', side: 'R', kind: 'hemisection' }, ['umn.R', 'dcml.R', 'stt.L', 'sttFrom.L', 'sttFromHi.L', 'umn.L', 'stt.R', 'babinski.R']);
  ok(c.join() === '1,1,1,19,20,0,0,1', 'A14 right T10 hemisection: right UMN and dorsal columns, left pain/temperature from T11–T12 — Gray42');
  ok(R({ mode: 'cord', level: 'C5', kind: 'central', extent: 3 }, ['stt.L', 'stt.R', 'dcml.L', 'armsWorse', 'sttBandTo']).join() === '1,1,0,1,7' && R({ mode: 'cord', level: 'T6', kind: 'anterior' }, ['dcml.L', 'stt.R', 'umn.L']).join() === '0,1,1' && R({ mode: 'cord', level: 'T6', kind: 'posterior' }, ['dcml.L', 'umn.L']).join() === '1,0',
    'central cord (cape, arms worse, dorsal columns spared), anterior cord, posterior cord');
  const J = ev(['jugular-foramen']);
  ok(J.nerve.glossopharyngeal === 1 && J.nerve.vagus === 1 && J.nerve.accessory === 1 && J.nerve.hypoglossal === 0 && J.reflex['gag-reflex'] === 2, 'A15 jugular foramen: CN IX, X, XI (Vernet), XII spared, gag lost — Gray42');
  const cs = ev(['cavernous-sinus']);
  ok(['oculomotor', 'trochlear', 'ophthalmic', 'maxillary', 'abducens'].every(x => cs.nerve[x] === 1) && cs.nerve.mandibular === 0 && cs.sign.horner === 1, 'cavernous sinus: III, IV, V1, V2, VI and the sympathetics; V3 spared');
  const sm = ev(['facial@stylomastoid']), iam = ev(['internal-acoustic-meatus']);
  ok(sm.sign['facial-palsy-lmn'] === 1 && sm.fn['taste-anterior'] === 0 && sm.sign.hyperacusis === 0 && iam.fn['taste-anterior'] === 2 && iam.sign.hyperacusis === 1 && iam.fn.lacrimation === 2 && iam.fn.hearing === 2,
    'facial nerve level: at the stylomastoid foramen taste, stapedius and tears are spared; at the internal meatus all lost with hearing — Moore9');
  const III = ev(['oculomotor@subarachnoid']);
  ok(III.sign['down-and-out'] === 1 && III.sign.ptosis === 1 && III.sign['fixed-dilated-pupil'] === 1 && ev(['abducens']).muscle['lateral-rectus'] === 2 && ev(['abducens']).move['eye.abduction'] >= 1, 'CN III: down and out, ptosis, fixed dilated pupil; CN VI: lateral rectus paralysed, abduction weak (the obliques still abduct a little)');
  ok(ev(['accessory@posterior-triangle']).muscle.sternocleidomastoid === 0 && ev(['accessory@posterior-triangle']).sign['winged-scapula-lateral'] === 1, 'accessory nerve in the posterior triangle: trapezius (lateral winging), SCM spared');
}

// ===== A16–A20: biomechanics, ROM, Beighton =====
{
  const a16 = R({ mode: 'biomech', lever: { muscleArm: 0.04, loads: [{ f: 50, arm: 0.35 }, { f: 15, arm: 0.15 }] } }, ['muscleForce', 'jrf', 'jrfY', 'ma', 'leverClass']);
  ok(near(a16[0], 493.75, 1e-9) && near(a16[1], 428.75, 1e-9) && a16[2] < 0 && near(a16[3], 0.114, 0.0005) && a16[4] === 3, 'A16 elbow at 90°: biceps 493.75 N, joint reaction 428.75 N downward on the ulna, MA 0.114, third-class lever — Nordin & Frankel 5e (method)');
  const a17 = R({ mode: 'biomech', hip: { bw: 700 } }, ['hipW', 'hipAbductor', 'hipJrf', 'hipJrfBw', 'hipJrfAngle']);
  ok(near(a17[0], 587.3, 1e-9) && near(a17[1], 1174.6, 1e-9) && near(a17[2], 1738, 1) && near(a17[3], 2.48, 0.01) && near(a17[4], 13.4, 0.05), 'A17 single-leg stance, BW 700 N: abductors 1174.6 N, JRF 1738 N ≈ 2.48 BW at 13.4° from vertical — Pauwels; Nordin & Frankel');
  ok(R({ mode: 'biomech', hip: { bw: 700, caneForce: 100, caneArm: 0.4 } }, ['hipJrf'])[0] < a17[2] / 2, 'a cane in the opposite hand more than halves the hip load');
  ok(near(R({ mode: 'biomech', niosh: { H: 25, V: 75, D: 25, A: 0 } }, ['rwl'])[0], 23, 1e-9) && near(R({ mode: 'biomech', niosh: { H: 50, V: 75, D: 25 } }, ['rwl'])[0], 11.5, 1e-9), 'A18 NIOSH RWL: 23.0 kg at the origin, 11.5 kg at H = 50 cm — Waters 1993');
  const ni = M.compute({ mode: 'biomech', niosh: { H: 20, V: 200, D: 10, A: 0, load: 10 } }, {});
  ok(ni.issues.clamped === 1 && ni.issues.range === 1 && ni.scalars.hm === 1 && ni.scalars.vm === 0, 'NIOSH edge cases: H < 25 → HM 1 (clamped, per the manual), V > 175 → VM 0 (range)');
  ok(near(M.nioshFM(4, 'long', 75), 0.45, 1e-12) && near(M.nioshFM(1.5, 'short', 30), 0.925, 1e-12) && M.nioshFM(16, 'short', 75) === 0, 'NIOSH frequency multiplier: table value, linear between rows, 0 above 15 lifts/min');
  const b = R({ mode: 'rom', beighton: { pinkyL: 1, pinkyR: 1, thumbL: 1, thumbR: 1, elbowL: 1, elbowR: 1, kneeL: 1, kneeR: 1, palms: 1 } }, ['beighton', 'beightonPositive']);
  ok(b.join() === '9,1' && R({ mode: 'rom', beighton: { palms: 1 } }, ['beighton'])[0] === 1, 'A19 Beighton: all positive 9, only palms flat 1 — Beighton 1973');
  ok(R({ mode: 'rom', beighton: { pinkyL: 1, pinkyR: 1, thumbL: 1, thumbR: 1 }, age: 60 }, ['beightonPositive', 'beightonCut']).join() === '1,4' && R({ mode: 'rom', beighton: { pinkyL: 1, pinkyR: 1, thumbL: 1, thumbR: 1, elbowL: 1 }, prepubertal: true }, ['beightonPositive', 'beightonCut']).join() === '0,6', 'Beighton cut-offs of the 2017 hEDS criteria: ≥ 4 over 50, ≥ 6 before puberty — Malfait 2017');
  ok(Number.isNaN(R({ mode: 'rom', beighton: { palms: 2 } }, ['beighton'])[0]), 'a Beighton item that is not 0 or 1: NaN (range)');
  const w = R({ mode: 'biomech', segment: { name: 'forearm', bodyMass: 80, length: 0.27 } }, ['comFrac', 'massFrac', 'mass', 'comDist']);
  ok(w[0] === 0.43 && w[1] === 0.016 && near(w[2], 1.28, 1e-12) && near(w[3], 0.1161, 1e-12) && R({ mode: 'biomech', segment: { name: 'thigh' } }, ['massFrac'])[0] === 0.1, 'A20 Winter: forearm COM at 43.0 % from the elbow, thigh 10.0 % of body mass — Winter 2009 table 4.1');
  const rom = R({ mode: 'rom', joint: 'elbow', dof: 'flexion', measured: 100 }, ['normMax', 'limited', 'pctNorm', 'issue.limited']);
  ok(rom[0] === 150 && rom[1] === 1 && near(rom[2], 66.667, 0.001) && rom[3] === 1 && R({ mode: 'rom', joint: 'elbow', dof: 'flexion', source: 'ama', measured: 145 }, ['normMax', 'hypermobile']).join() === '140,1', 'ROM: elbow flexion 150° (AAOS 1965) / 140° (AMA); 100° is limited (< 80 %), 145° beyond the AMA norm');
  const arm = R({ mode: 'biomech', arm: { a: 0.3, b: 0.04, angle: 90 } }, ['momentArmAt', 'peakAngle']);
  ok(near(arm[0], 0.3 * 0.04 / Math.hypot(0.3, 0.04), 1e-12) && near(arm[1], 180 - Math.acos(0.04 / 0.3) * 180 / Math.PI, 1e-9), 'moment arm of a straight-line muscle at 90°: ab/√(a²+b²); peak where cos α = b/a');
  const imp = M.compute({ mode: 'biomech', lever: { muscleArm: 0.04, muscleAngle: 0, loads: [{ f: 50, arm: 0.35 }] } }, {});
  ok(imp.issues.impossible === 1 && Number.isNaN(imp.scalars.muscleForce), 'a muscle line through the joint (angle 0): impossible, NaN — never a division by zero');
  ok(M.compute({ mode: 'biomech', lever: { muscleArm: 0.04, loads: [{ f: -50, arm: 0.35 }] } }, {}).issues.model === 1, 'a muscle that would have to push: model');
}

// ===== edge cases of lesions and queries =====
{
  const amb = M.compute({ mode: 'lesion', lesions: [{ at: ['median@forearm'] }, { at: ['median@wrist'] }, { at: ['median@carpal-tunnel'] }], pick: 2 }, {});
  ok(amb.issues['level-ambiguous'] === undefined && M.compute({ mode: 'lesion', lesions: [{ at: ['median@carpal-tunnel'] }, { at: ['carpal-tunnel'] }] }, {}).issues['level-ambiguous'] === 1, 'level-ambiguous: two candidate lesions with identical findings are flagged');
  ok(M.compute({ mode: 'lesion', lesions: [{ at: ['radial'] }], pick: 3 }, {}).issues.range === 1 && Number.isNaN(R({ mode: 'lesion', lesions: [{ at: ['radial'] }], pick: 'k' }, ['paralysed'], { k: 5 })[0]), 'a pick outside the candidates: range, NaN outputs');
  const half = ev(['radial@spiral-groove'], { completeness: 0.5 });
  ok(half.muscle['extensor-digitorum'] === 1 && half.sign['wrist-drop'] === 0, 'an incomplete lesion (completeness 0.5): weakness, not paralysis');
  ok(ev(['musculocutaneous']).move['elbow.flexion'] === 1 && ev(['musculocutaneous']).muscle['biceps-brachii'] === 2 && ev(['musculocutaneous', 'radial@lateral-septum']).muscle.brachioradialis === 2 && ev(['musculocutaneous', 'radial@lateral-septum']).move['elbow.flexion'] === 1, 'elbow flexion after a musculocutaneous lesion is only weak (brachioradialis); with the radial too, pronator teres and the forearm flexors still flex weakly');
  ok(M.evaluate({ at: ['musculocutaneous'] }, ['brachialis-radial'], 1).muscle.brachialis === 1 && ev(['musculocutaneous']).muscle.brachialis === 2, 'variant brachialis-radial: a radial twig keeps brachialis weak, not paralysed');
  ok(M.evaluate({ at: ['C5'] }, ['prefixed-plexus'], 1).loss.deltoid < ev(['C5']).loss.deltoid && M.evaluate({ at: ['C4'] }, ['prefixed-plexus'], 1).muscle.deltoid >= 1, 'prefixed plexus: the deltoid\'s roots shift up one (C4–C5)');
  ok(M.evaluate({ at: ['median@elbow'] }, ['riche-cannieu'], 1).muscle['abductor-pollicis-brevis'] === 1, 'Riche–Cannieu: a complete median lesion leaves the thenar muscles only weak');
  ok(M.evaluate({ at: ['femoral'] }, ['accessory-obturator'], 1).muscle.pectineus === 1 && ev(['femoral']).muscle.pectineus === 2, 'accessory obturator nerve: pectineus keeps a supply after a femoral lesion');
  ok(M.compute({ mode: 'lesion', lesions: [{ at: ['ulnar@elbow'] }] }, {}).scalars.variantRisk >= 1, 'variantRisk counts the known variants that would change the answer (Martin–Gruber here)');
  const un = M.compute({ mode: 'query', facts: [{ id: 'a', rel: 'origin', from: 'masseter', to: 'zygomatic-arch' }, { id: 'b', rel: 'origin', from: 'levator-palpebrae', to: 'sphenoid' }, { id: 'c', rel: 'supplies', from: 'facial-artery', to: 'buccinator' }] }, {});
  ok(un.scalars['fact.a'] === 1 && Number.isNaN(un.scalars['fact.b']) && Number.isNaN(un.scalars['fact.c']) && un.issues.uncurated === 2, 'uncurated data (head muscles\' attachments and arteries): NaN and uncurated, never a silent 0');
  const q = M.compute({ mode: 'query', quiz: { rel: 'innervates', to: 'deltoid', choices: ['radial', 'axillary', 'musculocutaneous'], pick: 1 } }, {}).scalars;
  ok(q.correct === 1 && q.answerIndex === 1 && q.answers === 1, 'a quiz: the picked choice is graded, the right one is found');
  ok(M.relation('origin', 'biceps-brachii', 'scapula', []) === 1 && M.relation('insertion', 'biceps-brachii', 'radial-tuberosity', []) === 1 && M.relation('part', 'triceps-long', 'posterior-arm', []) === 1 && M.relation('branch', 'anterior-interosseous', 'lateral-cord', []) === 1,
    'attachments to landmarks and their bones, compartments, branches back to the plexus');
  ok(M.relation('prime', 'brachioradialis', 'elbow.flexion', []) === 1 && M.relation('acts', 'deltoid', 'elbow.flexion', []) === 0 && M.relation('innervates', 'median', 'flexor-digitorum-profundus', []) === 1 && M.relation('innervates', 'ulnar', 'flexor-digitorum-profundus', []) === 1, 'dual innervation: FDP from the median (AIN) and the ulnar');
}

// ===== regions =====
{
  const m = { mode: 'regions', image: [400, 300], regions: [{ structure: 'deltoid', polygon: [10, 10, 100, 10, 100, 100, 10, 100] }, { structure: 'radial', polyline: [0, 200, 300, 200], width: 6 }, { structure: 'triceps-long', circle: [200, 100, 30], z: 2 }], target: 'triceps-brachii', accept: 'part-of-up' };
  ok(R(Object.assign({}, m, { x: 205, y: 95 }), ['hit', 'correct'])[0] === 2 && R(Object.assign({}, m, { x: 205, y: 95 }), ['correct'])[0] === 1, 'a click on the long head when asked for triceps (part-of-up): correct');
  ok(R(Object.assign({}, m, { x: 205, y: 95, accept: 'exact' }), ['correct'])[0] === 0, '… but not with accept exact');
  ok(R(Object.assign({}, m, { x: 150, y: 202 }), ['hit'])[0] === 1 && R(Object.assign({}, m, { x: 150, y: 220 }), ['hit'])[0] === -1, 'a polyline (a nerve) is hit within its width and the tolerance');
  const nm = R(Object.assign({}, m, { x: 200, y: 140 }), ['correct', 'distance', 'nearMiss']);
  ok(nm[0] === 0 && near(nm[1], 10, 1e-9) && nm[2] === 1, 'a near miss: 10 px from the target region');
}

// ===== the checker's codes =====
{
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'enginelib', 'anatomy.json'), 'utf8')).specs;
  const got = new Set(); for (const s of fx) for (const p of M.checkSpec(s)) got.add(p.code);
  const want = ['format', 'value', 'enum', 'size', 'unknown-field', 'unknown-structure', 'wrong-type', 'unknown-level', 'unknown-variant', 'variant-unused', 'inconsistent', 'unknown-finding', 'unknown-dof', 'no-rom', 'region', 'output'];
  ok(want.every(c => got.has(c)), 'the fixtures exercise every checker code: ' + want.filter(c => !got.has(c)).join(', '));
  ok(codes(spec({ mode: 'lesion', lesions: [{ at: ['deltoid'] }] }, ['paralysed'])).includes('wrong-type') && codes(spec({ mode: 'lesion', lesions: [{ at: ['radial@wrist'] }] }, ['paralysed'])).includes('unknown-level'), 'a muscle is not a lesion site; the radial nerve has no level "wrist"');
  ok(codes(spec({ mode: 'lesion', lesions: [{ at: ['radial'] }] }, ['muscle.nope'])).includes('output') && codes(spec({ mode: 'lesion', lesions: [{ at: ['radial'] }] }, ['muscle.deltoid'])).length === 0, 'outputs must name known findings');
  ok(M.engine.check(spec({ mode: 'trace', from: 'aorta', to: 'brachial' }, ['found'])).length === 1, 'engine.check gives the errors as messages');
  ok(M.exprs(spec({ mode: 'lesion', lesions: [{ at: ['radial'], completeness: 'k/2' }], pick: 'p' }, [])).length === 2 && JSON.stringify(M.keys(spec({ mode: 'lesion', lesions: [{ at: ['radial'] }], labels: [{ id: 'radial', key: 'radialName' }] }, []))) === '[["radialName","model.labels[0].key"]]', 'exprs lists every expression with its path; keys lists the labels\' keys');
}

// ===== the adapter, the Worker, speed, the twin index, the reference activity =====
{
  const ex = path.join(ROOT, 'tools', 'activities_examples', 'brachial-lesion'), aspec = JSON.parse(fs.readFileSync(path.join(ex, 'spec.json'), 'utf8'));
  ok(M.checkSpec(aspec).length === 0, 'the reference activity brachial-lesion has a valid spec');
  const sim = M.engine.create(aspec), r6 = sim.run({ les: 6 });
  ok(r6.sWrist === 1 && r6.mElbE === 0 && Array.isArray(r6.muscles.items) && r6.muscles.items.length > 0 && r6.muscles.items.length <= 2000, 'the adapter: create(spec).run(inputs) gives the declared outputs (spiral groove: wrist drop, triceps spared)');
  const cases = JSON.parse(fs.readFileSync(path.join(ex, 'tests.json'), 'utf8')).cases;
  let pass = 0;
  for (const c of cases) { const env = {}; for (const s of c.steps) env[s.set] = s.value; const r = sim.run(env); if (Object.entries(c.expect.values).every(([k, [lo, hi]]) => r[k] >= lo && r[k] <= hi)) pass++; else console.log('  case failed: ' + c.name); }
  ok(pass === cases.length, `the reference activity's own tests.json: ${pass}/${cases.length} cases`);
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const wr = ctx.self.noemaEngine.create(aspec).run({ les: 6 });
  ok(wr.sWrist === 1 && JSON.stringify(wr.muscles) === JSON.stringify(r6.muscles), 'the Worker source in a fresh context gives the same outputs (the data travels inside the module)');
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < 12; i++) sim.run({ les: i });
  const typ = Number(process.hrtime.bigint() - t0) / 1e6 / 12;
  ok(typ < 50, `a typical run < 50 ms (${typ.toFixed(1)} ms)`);
  const big = { mode: 'lesion', lesions: Array.from({ length: 24 }, (_, i) => ({ at: [['radial@spiral-groove', 'ulnar@elbow', 'median@wrist', 'C5', 'C6', 'C7', 'L5', 'S1', 'sciatic@gluteal', 'upper-trunk', 'jugular-foramen', 'cavernous-sinus'][i % 12], 'femoral'] })),
    variants: ['martin-gruber', 'riche-cannieu', 'accessory-obturator', 'brachialis-radial'], compare: 3, findings: ['muscle.deltoid', 'sign.wrist-drop', 'reflex.achilles-reflex', 'muscle.tibialis-anterior'] };
  t0 = process.hrtime.bigint();
  const rb = R(big, ['paralysed', 'variantRisk', 'bestFinding']);
  R({ mode: 'trace', from: 'left-ventricle', to: 'plantar-arch', avoid: ['popliteal'], variants: ['high-radial', 'bovine-arch', 'lusoria'] }, ['found']);
  const worst = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(worst < 2000 && Number.isFinite(rb[0]), `the worst allowed runs (24 candidates × 4 variants with variant risk and the best finding; a collateral trace with 3 variants) < 2 s (${worst.toFixed(0)} ms)`);
  let threw = false; try { R({ mode: 'lesion', lesions: [{ at: ['radial'], completeness: 'nope(' }] }, ['paralysed']); M.engine.create({}).run({}); } catch (e) { threw = true; }
  ok(!threw, 'a number that does not compute, or a broken spec: no throw');
  const pyIdx = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_anatomy as M; print(json.dumps(M.INDEX))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8', maxBuffer: 1 << 26 }));
  ok(JSON.stringify(pyIdx) === JSON.stringify(M.index()), 'tools/lib_anatomy.py carries the same INDEX (ids, types, levels, movements, tables, outputs) as the JS module');
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
