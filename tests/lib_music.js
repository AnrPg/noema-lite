/* music@1 (src/engines/music/music.ts, docs/library/music.md): published reference values (the source in each message), the edge cases
   and their codes, the checker's codes, the sim adapter (with its sound outputs), the Worker source in a fresh global, speed.
   Run: node tests/lib_music.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const allNear = (a, b, tol) => a.length === b.length && a.every((v, i) => near(v, b[i], tol));
globalThis.window = globalThis;
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaLibMusic = ENGINES.mod('music@1');
const L = NoemaLibMusic, P = L.parsePitch;
const spec = (model, outputs, params) => ({ format: 'noema.sim-spec/v1', engine: 'music@1', params: params || [], model: model || {}, outputs: outputs || [] });
const run1 = (model, o) => { const r = L.run(spec(model, [Object.assign({ id: 'x' }, o)]), {}, {}); return r.out.x; };
const codesOf = (model, o) => L.run(spec(model, [Object.assign({ id: 'x' }, o)]), {}, {}).codes.map(c => c.code);

// ---- 1. pitch and frequency (M1, M19) ----
const f12 = m => run1({}, { kind: 'scalar', of: 'freq', note: L.fromMidi(m) && ['C4', 'A0', 'C8', 'C-1', 'G9'][[60, 21, 108, 0, 127].indexOf(m)] });
ok(allNear([60, 21, 108, 0, 127].map(f12), [261.6256, 27.5, 4186.009, 8.1758, 12543.854], 1e-3), 'M1: MIDI 60, 21, 108, 0, 127 at A4 = 440 Hz → 261.6256, 27.5, 4186.009, 8.1758, 12543.854 Hz (ISO 16:1975; f = 440·2^((m−69)/12))');
ok(['C4', 'A0', 'C8', 'C-1', 'G9', 'B#3', 'Cb4', 'Fx4'].map(s => P(s).midi).join() === '60,21,108,0,127,60,59,67', 'scientific pitch notation: C4 = MIDI 60; B♯3 = 60, C♭4 = 59, F𝄪4 = 67 (the octave number follows the letter)');
ok(near(run1({ tuning: { a4: 256 * Math.pow(2, 9 / 12) } }, { kind: 'scalar', of: 'freq', note: 'C4' }), 256, 1e-9) && near(256 * Math.pow(2, 9 / 12), 430.539, 1e-3) && near(run1({ tuning: { a4: 415 } }, { kind: 'scalar', of: 'freq', note: 'C4' }), 246.76, 0.01), 'M19: scientific pitch C4 = 256 Hz ↔ A4 = 430.539 Hz; baroque A4 = 415 Hz → C4 = 246.76 Hz (Haynes 2002)');
ok(run1({}, { kind: 'scalar', of: 'midi', note: 'C^4' }) === 60.5 && near(run1({ tuning: { system: 'edo', edo: 24 } }, { kind: 'scalar', of: 'cents', from: 'C4', to: 'E^4' }), 450, 1e-9), 'quarter tones: C↑4 = MIDI 60.5; E↑ is 450 c above C in 24-EDO');

// ---- 2. ratios, commas, tunings (M2–M6) ----
const rc = r => run1({}, { kind: 'scalar', of: 'ratioCents', ratio: r });
ok(allNear([3 / 2, 5 / 4, 81 / 80, 531441 / 524288, 32805 / 32768, 128 / 125].map(rc), [701.955, 386.314, 21.506, 23.460, 1.954, 41.059], 1e-3), 'M2: cents of 3/2, 5/4, 81/80, 531441/524288, 32805/32768, 128/125 = 701.955, 386.314, 21.506, 23.460, 1.954, 41.059 (Barbour 1951; Sethares 2005)');
ok(['syntonic', 'pythagorean', 'schisma', 'diesis'].map(c => run1({}, { kind: 'scalar', of: 'comma', name: c })).every((v, i) => near(v, [21.506, 23.460, 1.954, 41.059][i], 1e-3)) && near(run1({}, { kind: 'scalar', of: 'monzo', monzo: [-2, 0, 1] }), 386.314, 1e-3), 'commas by name and as monzos: syntonic [−4 4 −1], Pythagorean [−19 12], schisma, diesis; [−2 0 1] = 5/4 = 386.314 c');
const mt = { tuning: { system: 'meantone', fraction: 0.25, layout: 'keyboard', chainStart: 'Eb' } };
ok(near(run1(mt, { kind: 'scalar', of: 'cents', from: 'C4', to: 'G4' }), 696.578, 1e-3) && near(run1(mt, { kind: 'scalar', of: 'cents', from: 'G#4', to: 'Eb5' }), 737.637, 1e-3), 'M3: ¼-comma meantone fifth 696.578 c; on a keyboard E♭…G♯ the wolf G♯–E♭ is 737.637 c (Barbour 1951)');
ok(near(run1(mt, { kind: 'scalar', of: 'cents', from: 'C4', to: 'E4' }), 1200 * Math.log2(5 / 4), 1e-9) && near(run1({ tuning: { system: 'meantone', fraction: 0.25 } }, { kind: 'scalar', of: 'cents', from: 'G#4', to: 'Ab4' }), 41.059, 1e-3), '¼-comma meantone: pure major thirds; spelled (not on a keyboard) A♭ is a diesis (41.06 c) above G♯');
ok(near(run1({ tuning: { system: 'pythagorean' } }, { kind: 'scalar', of: 'cents', from: 'C4', to: 'E4' }), 407.820, 1e-3) && near(run1({ tuning: { system: 'pythagorean' } }, { kind: 'scalar', of: 'cents', from: 'Gb4', to: 'F#4' }), 23.460, 1e-3), 'Pythagorean: the ditone 81/64 = 407.820 c; F♯ is a Pythagorean comma above G♭');
const tun = sys => Array.from({ length: 12 }, (_, i) => run1({ tuning: { system: sys } }, { kind: 'scalar', of: 'tuning', pc: i, field: 'cents' }));
ok(allNear(tun('werckmeister3'), [0, 90.225, 192.180, 294.135, 390.225, 498.045, 588.270, 696.090, 792.180, 888.270, 996.090, 1092.180], 1e-3), 'M4: Werckmeister III, C…B: 0, 90.225, 192.180, 294.135, 390.225, 498.045, 588.270, 696.090, 792.180, 888.270, 996.090, 1092.180 (Barbour 1951)');
ok(allNear(tun('vallotti'), [0, 94.135, 196.090, 298.045, 392.180, 501.955, 592.180, 698.045, 796.090, 894.135, 1000, 1090.225], 1e-3), 'M5: Vallotti, C…B: 0, 94.135, 196.090, 298.045, 392.180, 501.955, 592.180, 698.045, 796.090, 894.135, 1000, 1090.225 (Barbour; Sethares)');
ok(allNear(tun('kirnberger3').filter((_, i) => [4, 7, 9].includes(i)), [386.314, 696.578, 889.735], 1e-3) && allNear(tun('just').filter((_, i) => [4, 7, 9].includes(i)), [386.314, 701.955, 884.359], 1e-3), 'Kirnberger III: E pure (386.314), G and A ¼-comma; 5-limit just: 5/4, 3/2, 5/3 (Barbour 1951)');
ok(allNear([19, 31, 53].map(k => run1({ tuning: { system: 'edo', edo: k } }, { kind: 'scalar', of: 'cents', from: 'C4', to: 'G4' })), [694.737, 696.774, 701.887], 1e-3) && [19, 31, 53].map(k => run1({}, { kind: 'scalar', of: 'edo', n: k, ratio: 1.5, field: 'steps' })).join() === '11,18,31', 'M6: the best fifth of 19-, 31-, 53-EDO is 11, 18, 31 steps = 694.737, 696.774, 701.887 c');
ok(near(run1({ tuning: { system: 'edo', edo: 19 } }, { kind: 'scalar', of: 'cents', from: 'C#4', to: 'Db4' }), 1200 / 19, 1e-9) && near(run1({ tuning: { system: 'edo', edo: 12 } }, { kind: 'scalar', of: 'cents', from: 'C#4', to: 'Db4' }), 0, 1e-9), '19-EDO tells C♯ from D♭ (D♭ one step higher); 12-EDO does not');
ok(near(run1({ tuning: { system: 'cents', cents: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100], tonic: 'D' } }, { kind: 'scalar', of: 'freq', note: 'A4' }), 440, 1e-9), 'cents tables are relative to the tonic, and A4 stays the reference');
ok(codesOf({ tuning: { system: 'edo', edo: 4 } }, { kind: 'scalar', of: 'freq', note: 'C4' }).includes('invalid'), 'an EDO below 5 steps is flagged invalid');

// ---- 3. intervals (M7) ----
const ivl = (a, b) => { const r = L.interval(P(a), P(b)); return [r.simple === r.number ? r.number : r.number, r.quality, r.semitones]; };
const Q = { 0: 'P', 1: 'M', '-1': 'm', 2: 'A', '-2': 'd', 3: 'AA', '-3': 'dd' };
const nm = (a, b) => { const [num, q, s] = ivl(a, b); return `${Q[q]}${num}(${s})`; };
ok([['C4', 'G4'], ['C4', 'F#4'], ['C4', 'Gb4'], ['E4', 'C5'], ['C4', 'B#4'], ['C4', 'Dbb4'], ['C4', 'D5'], ['C4', 'E##4']].map(p => nm(...p)).join(' ') === 'P5(7) A4(6) d5(6) m6(8) A7(12) d2(0) M9(14) AA3(6)', 'M7: C–G P5(7), C–F♯ A4(6), C–G♭ d5(6), E–C m6(8), C–B♯ A7(12), C–D𝄫 d2(0), C–D5 M9(14), C–E♯♯ AA3(6) (Aldwell & Schachter)');
{ const a = L.interval(P('C4'), P('F#4')), b = L.interval(P('E4'), P('C5')); ok(a.invNumber === 5 && a.invQuality === -2 && b.invNumber === 3 && b.invQuality === 1, 'M7: the inversion of A4 is d5, of m6 is M3 (numbers sum to 9, qualities swap)'); }
ok(run1({}, { kind: 'scalar', of: 'interval', from: 'G4', to: 'C4', field: 'direction' }) === -1 && run1({}, { kind: 'scalar', of: 'interval', from: 'G4', to: 'C4', field: 'number' }) === 5 && run1({}, { kind: 'scalar', of: 'interval', from: 'C4', to: 'C4', field: 'quality' }) === 0, 'a descending fifth: number 5, direction −1; the unison is perfect');
ok(near(run1({ tuning: { system: 'pythagorean' } }, { kind: 'scalar', of: 'interval', from: 'C4', to: 'F#4', field: 'cents' }), 611.730, 1e-3) && near(run1({ tuning: { system: 'pythagorean' } }, { kind: 'scalar', of: 'interval', from: 'C4', to: 'Gb4', field: 'cents' }), 588.270, 1e-3), 'Pythagorean A4 = 611.730 c, d5 = 588.270 c: enharmonic intervals differ in a tuning that spells');
ok(L.transpose(P('E4'), L.parseIvl('m3')).tpc === P('G4').tpc && L.transpose(P('F#4'), L.parseIvl('-A4')).midi === P('C4').midi && L.parseIvl('P3') === null && L.parseIvl('M5') === null, 'transposing by M3, −A4; P3 and M5 do not exist');
ok(run1({ sets: [{ id: 's', notes: ['C4', 'E4', 'G4'], transpose: 'M2' }] }, { kind: 'scalar', of: 'chord', set: 's', field: 'root' }) === 2, 'a set transposed up a major second: the C major triad becomes D major');

// ---- 4. pitch-class sets (M8–M10) ----
const mask = a => a.reduce((m, p) => m | (1 << p), 0), pf = a => L.primeForm(a), F = a => L.forteNumber(a);
ok(pf([0, 4, 7]).join() === '0,3,7' && L.iv([0, 4, 7]).join('') === '001110' && F([0, 4, 7]).num === 11, 'M8: {0,4,7} → [037], IV 001110, 3-11 (Forte 1973)');
ok(pf([0, 4, 7, 10]).join() === '0,2,5,8' && L.iv([0, 4, 7, 10]).join('') === '012111' && F([0, 4, 7, 10]).num === 27, 'M8: {0,4,7,10} → [0258], IV 012111, 4-27');
ok(L.iv([0, 1, 4, 6]).join('') === '111111' && L.iv([0, 1, 3, 7]).join('') === '111111' && F([0, 1, 4, 6]).num === 15 && F([0, 1, 3, 7]).num === 29 && F([0, 1, 4, 6]).z === 29 && F([0, 1, 3, 7]).z === 15, 'M8: the all-interval tetrachords 4-Z15 and 4-Z29 share IV 111111 (Z-related)');
ok(pf([0, 2, 4, 6, 8, 10]).join() === '0,2,4,6,8,10' && L.iv([0, 2, 4, 6, 8, 10]).join('') === '060603' && F([0, 2, 4, 6, 8, 10]).num === 35, 'M8: the whole-tone scale [02468t], IV 060603, 6-35');
ok(pf([0, 2, 4, 5, 7, 9, 11]).join() === '0,1,3,5,6,8,10' && L.iv([0, 2, 4, 5, 7, 9, 11]).join('') === '254361' && F([0, 2, 4, 5, 7, 9, 11]).num === 35, 'M8: the diatonic scale [013568t], IV 254361, 7-35');
ok(pf([0, 1, 3, 4, 6, 7, 9, 10]).join() === '0,1,3,4,6,7,9,10' && L.iv([0, 1, 3, 4, 6, 7, 9, 10]).join('') === '448444' && F([0, 1, 3, 4, 6, 7, 9, 10]).num === 28, 'M8: the octatonic scale [0134679t], IV 448444, 8-28');
ok(pf([0, 1, 3, 7, 8]).join() === '0,1,3,7,8' && L.primeForm([0, 1, 3, 7, 8], true).join() === '0,1,5,6,8', 'M9: 5-20: Forte prime (01378), Rahn prime (01568) (Forte 1973; Rahn 1980)');
{ let ok1 = true; const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], seen = new Set();
  for (let m = 1; m < 4096; m++) { const a = L.pcsOf(m), p = mask(pf(a)); if (!seen.has(p)) { seen.add(p); cnt[a.length]++; } if (a.length >= 3 && a.length <= 9 && !F(a)) ok1 = false; }
  ok(cnt.slice(3, 10).join() === '12,29,38,50,38,29,12' && ok1, 'M10: the 4095 non-empty sets fall into 12, 29, 38, 50, 38, 29, 12 set classes of 3…9 notes (Σ 208), and every one has its Forte number'); }
{ let zs = 0; const pairs = []; for (let m = 1; m < 4096; m++) { const a = L.pcsOf(m); if (a.length === 6) { const f = F(a); if (f.z) pairs.push(f.num); } } zs = new Set(pairs).size;
  ok(zs === 30, `hexachords: 15 Z-pairs (30 set classes), each the complement of its mate (Forte 1973) — ${zs}`); }
ok(L.invariance([0, 4, 8]) === 6 && L.invariance([0, 3, 6, 9]) === 8 && L.invariance([0, 4, 7]) === 1 && L.invariance([0, 2, 4, 6, 8, 10]) === 12, 'invariance (transpositions and inversions that map the set to itself): augmented triad 6, diminished seventh 8, major triad 1, whole-tone 12');
const pcs = (ps, f) => run1({ sets: [{ id: 's', pcs: ps }] }, { kind: 'scalar', of: 'pcset', set: 's', field: f });
ok(pcs([0, 1, 3, 7, 8], 'differs') === 1 && pcs([0, 4, 7], 'differs') === 0 && pcs([0, 2, 4, 5, 7, 9, 11], 'complement') === 35 && pcs([0, 4, 7], 'iv5') === 1 && pcs([0, 4, 7], 'card') === 3, 'outputs: Forte ≠ Rahn for 5-20, the complement of 7-35 is 5-35, iv5 of a triad 1');
ok(Number.isNaN(pcs([0, 1], 'forte')) && codesOf({ sets: [{ id: 's', pcs: [0, 1] }] }, { kind: 'scalar', of: 'pcset', set: 's', field: 'forte' }).includes('out-of-range'), 'a dyad has no Forte number: NaN + out-of-range');

// ---- 5. chords, Roman numerals, Neo-Riemannian (M17) ----
const ch = (notes, f) => run1({ sets: [{ id: 's', notes }] }, { kind: 'scalar', of: 'chord', set: 's', field: f });
const QI = n => L.CHORDS.findIndex(c => c[0] === n);
ok(ch(['C4', 'E4', 'G4'], 'quality') === QI('maj') && ch(['E3', 'G3', 'C4'], 'inversion') === 1 && ch(['E3', 'G3', 'C4'], 'figure') === 63 && ch(['G3', 'C4', 'E4'], 'figure') === 64, 'C major in root position, first inversion (6/3), second inversion (6/4)');
ok(ch(['G3', 'B3', 'D4', 'F4'], 'quality') === QI('dom7') && ch(['F3', 'G3', 'B3', 'D4'], 'figure') === 42 && ch(['B3', 'D4', 'F4', 'G4'], 'figure') === 65 && ch(['D3', 'F3', 'G3', 'B3'], 'figure') === 43, 'G7 and its inversions: 6/5, 4/3, 4/2 (figured bass)');
ok(ch(['B3', 'D4', 'F4', 'Ab4'], 'quality') === QI('dim7') && ch(['B3', 'D4', 'F4', 'A4'], 'quality') === QI('halfDim7') && ch(['C4', 'E4', 'G#4'], 'quality') === QI('aug'), 'B°7, Bø7 and the augmented triad');
ok(Number.isNaN(ch(['C4', 'C#4', 'D4'], 'root')) && ch(['C4', 'C#4', 'D4'], 'candidates') === 0, 'a cluster is no chord: NaN (no-chord), 0 candidates');
ok(ch(['A3', 'C4', 'E4', 'G4'], 'root') === 9 && ch(['C4', 'E4', 'G4', 'A4'], 'root') === 0, 'Am7 is named from A in root position; C–E–G–A over C is C6 (the bass decides between the two readings)');
const rn = (notes, key, mode, f) => run1({ sets: [{ id: 's', notes }] }, { kind: 'scalar', of: 'roman', set: 's', key, mode, field: f });
ok(rn(['G3', 'B3', 'D4', 'F4'], 'C', 'major', 'degree') === 5 && rn(['D4', 'F#4', 'A4', 'C5'], 'C', 'major', 'secondary') === 5 && rn(['D4', 'F#4', 'A4', 'C5'], 'C', 'major', 'degree') === 2, 'V7 in C; D7 is V7/V (secondary dominant)');
ok(rn(['F3', 'Ab3', 'Db4'], 'C', 'minor', 'degree') === 2 && rn(['F3', 'Ab3', 'Db4'], 'C', 'minor', 'alter') === -1 && rn(['F3', 'Ab3', 'Db4'], 'C', 'minor', 'inversion') === 1, 'the Neapolitan sixth ♭II6 in C minor (D♭ major over F)');
ok(rn(['Ab3', 'C4', 'F#4'], 'C', 'minor', 'quality') === 100 && rn(['Ab3', 'C4', 'D4', 'F#4'], 'C', 'minor', 'quality') === 101 && rn(['Ab3', 'C4', 'Eb4', 'F#4'], 'C', 'minor', 'quality') === 102, 'augmented sixths on ♭6: Italian (100), French (101), German (102)');
ok(rn(['B3', 'D4', 'F4', 'Ab4'], 'C', 'minor', 'degree') === 7 && rn(['B3', 'D4', 'F4', 'Ab4'], 'C', 'minor', 'secondary') === 0, 'vii°7 in C minor is diatonic (the raised leading tone)');
const nr = ops => [run1({ sets: [{ id: 's', notes: ['C4', 'E4', 'G4'] }] }, { kind: 'scalar', of: 'nrt', set: 's', ops, field: 'root' }), run1({ sets: [{ id: 's', notes: ['C4', 'E4', 'G4'] }] }, { kind: 'scalar', of: 'nrt', set: 's', ops, field: 'mode' })].join();
ok(nr('P') === '0,0' && nr('R') === '9,0' && nr('L') === '4,0' && nr('PP') === '0,1' && nr('RR') === '0,1' && nr('LL') === '0,1', 'M17: on C major P → C minor, R → A minor, L → E minor; P is an involution (Cohn 1998)');
ok(nr('LPRLPR').split(',')[1] === '1' && nr('PLPLPL') === '0,1', 'the hexatonic cycle PLPLPL returns to C major (Cohn 1996)');
ok(codesOf({ sets: [{ id: 's', notes: ['C4', 'E4', 'G4', 'Bb4'] }] }, { kind: 'scalar', of: 'nrt', set: 's', ops: 'P', field: 'root' }).includes('no-triad'), 'P, L, R need a consonant triad: no-triad');

// ---- 6. scales and rāgas (M16) ----
const sc = (name, f, i) => run1({}, { kind: 'scalar', of: 'scale', name, field: f, i });
ok(sc('major', 'size') === 7 && [0, 1, 2, 3, 4, 5, 6].map(i => sc('dorian', 'semitones', i)).join() === '0,2,3,5,7,9,10' && sc('blues', 'size') === 6 && sc('octatonicHW', 'size') === 8, 'scales: major 7 notes, Dorian 0 2 3 5 7 9 10, blues 6, octatonic 8');
ok(near(run1({ tuning: { system: 'meantone', fraction: 0.25, tonic: 'D' } }, { kind: 'scalar', of: 'scale', name: 'major', field: 'cents', i: 2 }), 1200 * Math.log2(5 / 4), 1e-9), 'the major scale on D in ¼-comma meantone: its third is pure');
ok(sc('rast', 'cents', 2) === 350 && sc('bayati', 'cents', 1) === 150 && codesOf({}, { kind: 'scalar', of: 'scale', name: 'rast', field: 'cents', i: 2 }).includes('approx'), 'maqām rāst: the third ~350 c, bayātī the second ~150 c, in 24-TET (flagged approx: the real intervals vary by region)');
const mk = k => [0, 1, 2, 3, 4, 5, 6].map(i => run1({}, { kind: 'scalar', of: 'melakarta', n: k, i })).join();
ok(mk(29) === '0,2,4,5,7,9,11' && mk(22) === '0,2,3,5,7,9,10' && mk(65) === '0,2,4,6,7,9,11' && mk(15) === '0,1,4,5,7,8,11', 'M16: mēḷakarta 29 Dhīraśankarābharaṇam = major, 22 Kharaharapriyā = Dorian, 65 Mechakalyāṇi = Lydian, 15 Māyāmāḷavagauḷa = 0 1 4 5 7 8 11 (Sambamoorthy)');
ok(Number.isNaN(run1({}, { kind: 'scalar', of: 'melakarta', n: 73, i: 0 })), 'there are 72 mēḷakarta: 73 → NaN');

// ---- 7. rhythm (M11) ----
const E = (k, n) => L.bjorklund(k, n).map(v => (v ? 'x' : '.')).join('');
ok([E(3, 8), E(5, 8), E(2, 5), E(7, 12), E(5, 16)].join(' ') === 'x..x..x. x.xx.xx. x.x.. x.xx.x.xx.x. x..x..x..x..x...', 'M11: E(3,8) tresillo, E(5,8) cinquillo, E(2,5), E(7,12) (the bell pattern), E(5,16) bossa x..x..x..x..x... (Toussaint 2005; Bjorklund 2003)');
ok(L.necklace(L.bjorklund(5, 8)) === L.necklace([1, 1, 0, 1, 1, 0, 1, 0]) && L.evenness(L.bjorklund(3, 8)) > L.evenness([1, 1, 1, 0, 0, 0, 0, 0]), 'rotations share a necklace; the Euclidean rhythm is the most even');
ok(run1({ rhythms: [{ id: 'r', k: 3, n: 8, rot: 1 }] }, { kind: 'scalar', of: 'onset', rhythm: 'r', i: 2 }) === 1 && run1({ rhythms: [{ id: 'r', pattern: 'x.x..x' }] }, { kind: 'scalar', of: 'rhythm', rhythm: 'r', field: 'onsets' }) === 3, 'rotation and patterns');
const du = o => run1({}, Object.assign({ kind: 'scalar', of: 'duration' }, o));
ok(du({ value: 0.25, bpm: 120 }) === 500 && du({ value: 0.25, dots: 1, bpm: 120 }) === 750 && near(du({ value: 0.125, tuplet: 3, tupletIn: 2, bpm: 60 }), 1000 / 3, 1e-9) && du({ value: 0.5, bpm: 60, beat: 0.375 }) === 4000 / 3, 'durations: a quarter at 120 bpm 500 ms, dotted 750 ms, a triplet eighth at 60 bpm 333 ms; in 6/8 (dotted-quarter beat) a half note');
const me = (m, f) => run1({}, { kind: 'scalar', of: 'meter', meter: m, field: f });
ok(me('6/8', 'beats') === 2 && me('6/8', 'compound') === 1 && me('3/4', 'beats') === 3 && me('3/8', 'compound') === 0 && me('12/8', 'beats') === 4 && me('7/8', 'beats') === 7, 'metres: 6/8 two compound beats, 3/4 three simple, 3/8 simple, 12/8 four');

// ---- 8. acoustics: roughness, beats, partials, resonators (M12–M15) ----
const u = Math.log(5.75 / 3.5) / 2.25, dmax = Math.exp(-3.5 * u) - Math.exp(-5.75 * u);
ok(near(u, 0.220639, 1e-6) && near(dmax, 0.180775, 1e-6) && near(u / (0.24 / (0.0207 * 440 + 18.96)), 25.80, 0.01), 'M12: the Plomp–Levelt curve peaks at s·x = 0.220639 with d = 0.180775, at Δf = 25.80 Hz above 440 Hz (Sethares 1993)');
ok(near(L.dPair(440, 440 + 25.80, 1, 1), 0.180775, 1e-5) && near(L.dPair(440, 660, 1, 1), 0.001362, 1e-5), 'M12: d(440, 465.8) = d_max; d(440, 660) = 0.001362');
{ const tb = { timbres: [{ id: 'h', kind: 'harmonic', n: 6, decay: 0.88 }] }, xs = run1(tb, { kind: 'series', of: 'dissonance', timbre: 'h', note: 'C4', from: 1, to: 2, points: 1001, part: 'x' }), ys = run1(tb, { kind: 'series', of: 'dissonance', timbre: 'h', note: 'C4', from: 1, to: 2, points: 1001, part: 'y' });
  const mins = []; for (let i = 1; i < ys.length - 1; i++) if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) mins.push(xs[i]);
  const at = r => ys[Math.round((r - 1) * 1000)];
  ok([1.2, 1.25, 4 / 3, 1.5, 5 / 3].every(r => mins.some(m => Math.abs(m - r) <= 0.002)), `M13: the dissonance curve of six harmonics (0.88^k) has minima at 6/5, 5/4, 4/3, 3/2, 5/3 (Sethares 2005 ch. 6) — ${mins.map(m => m.toFixed(3)).join(' ')}`);
  ok(at(2) < at(1.5) && at(1.5) < at(Math.SQRT2), 'M13: D(2) < D(3/2) < D(√2)'); }
ok(near(run1({}, { kind: 'scalar', of: 'beats', a: 'C4', b: 'E4', p: 5, q: 4 }), 10.38, 0.01) && near(run1({}, { kind: 'scalar', of: 'beats', a: 'C4', b: 'G4', p: 3, q: 2 }), 0.886, 0.01), 'M14: 12-TET C4–E4 beats 10.38 Hz (5:4), C4–G4 0.886 Hz (3:2) (Rossing)');
ok(near(run1({ tuning: { system: 'just' } }, { kind: 'scalar', of: 'beats', a: 'C4', b: 'E4', p: 5, q: 4 }), 0, 1e-9), 'just intonation: the third does not beat');
const rs = o => run1({}, Object.assign({ kind: 'scalar', of: 'resonator' }, o)), T343 = 273.15 * ((343 / 331.3) ** 2 - 1);
ok(allNear([1, 2, 3].map(k => rs({ type: 'closed', k, L: 1, tempC: T343 })), [85.75, 257.25, 428.75], 0.01) && near(rs({ type: 'string', k: 1, L: 0.65, tension: 70, mu: 0.0004 }), 321.79, 0.01), 'M15: a closed pipe of 1 m (v = 343 m/s): 85.75, 257.25, 428.75 Hz; a string 0.65 m, 70 N, 0.4 g/m: 321.79 Hz (Fletcher & Rossing)');
ok(rs({ type: 'open', k: 1, L: 1, r: 0.02 }) < rs({ type: 'open', k: 1, L: 1 }) && near(rs({ type: 'bar', k: 2, f1: 100 }), 275.6, 0.1) && near(rs({ type: 'membrane', k: 2, f1: 100 }), 159.4, 0.1), 'end correction lowers a pipe; a free bar 1 : 2.756; a membrane 1 : 1.594 (Bessel zeros)');
ok(near(run1({ timbres: [{ id: 's', kind: 'string', B: 0.001 }] }, { kind: 'scalar', of: 'partial', timbre: 's', note: 'A4', k: 3 }), 440 * 3 * Math.sqrt(1 + 0.009) / Math.sqrt(1.001), 1e-9), 'a stiff string: partial k at k·f1·√(1+Bk²)/√(1+B) (Fletcher 1964)');
{ const s = run1({ timbres: [{ id: 'q', kind: 'square', n: 4 }] }, { kind: 'series', of: 'spectrum', timbre: 'q', note: 'A4', part: 'x' }); ok(s.join() === '440,1320,2200,3080', 'a square wave: odd harmonics only'); }

// ---- 9. voice leading (M18) ----
const vl = (chords, rule, key) => run1({ progressions: [{ id: 'p', key: key || 'C', chords }] }, { kind: 'scalar', of: 'vl', progression: 'p', rule });
{ const p = [['C5', 'G4', 'E4', 'C3'], ['D5', 'A4', 'F4', 'D3']], F2 = L.voiceLeading(p.map(c => c.map(P)), P('C4'), 'major');
  ok(JSON.stringify(F2.parallel8) === '[[0,0,3]]' && JSON.stringify(F2.parallel5) === '[[0,1,3]]' && vl(p, 'all') === 2, 'M18: C5 G4 E4 C3 → D5 A4 F4 D3: exactly parallel octaves S–B and parallel fifths A–B'); }
ok(vl([['C5', 'E4', 'G3', 'C3'], ['B4', 'D4', 'G3', 'G2']], 'all') === 0, 'a correct I–V: no findings');
ok(vl([['E4', 'G4', 'C4', 'C3'], ['D4', 'G4', 'B3', 'G2']], 'crossing') >= 1 && vl([['G5', 'C4', 'G3', 'C3'], ['G5', 'C4', 'G3', 'C3']], 'spacing') === 2, 'voice crossing; more than an octave between soprano and alto');
ok(vl([['E5', 'G4', 'C4', 'C3'], ['G5', 'B4', 'D4', 'G2']], 'hidden') === 0 && vl([['E5', 'G4', 'C4', 'C3'], ['D6', 'B4', 'D4', 'G3']], 'hidden') === 1, 'hidden (direct) octaves and fifths: outer voices into a perfect interval by similar motion with a soprano leap');
ok(vl([['B4', 'G4', 'D4', 'G3'], ['G4', 'G4', 'E4', 'C3']], 'leadingTone', 'C') === 1 && vl([['B4', 'G4', 'D4', 'G3'], ['C5', 'G4', 'E4', 'C3']], 'leadingTone', 'C') === 0, 'the leading tone in the soprano of V–I must rise to the tonic');

// ---- 10. the checker ----
const cs = (model, outputs) => L.checkSpec(spec(model, outputs)).map(p => `${p.level[0]}:${p.code}:${p.path}`).join();
ok(cs({ sets: [{ id: 'a', notes: ['C4', 'H4'] }, { id: 'a', midi: [60] }] }) === 'e:duplicate:model.sets[1].id,e:value:model.sets[0].notes[1]', 'a pitch that is not one; an id used twice');
ok(cs({ sets: [{ id: 'a', notes: ['C4'], pcs: [0] }, { id: 'b', midi: [60], transpose: 'P3' }] }) === 'e:value:model.sets[0],w:unused:model.sets[1].transpose', 'exactly one of notes, midi, pcs; transpose only with notes');
ok(cs({ sets: [{ id: 'a', notes: ['C4'], transpose: 'P3' }] }) === 'e:value:model.sets[0].transpose', 'P3 is no interval');
ok(cs({ tuning: { system: 'edo', tonic: 'H' } }) === 'e:value:model.tuning.tonic,e:value:model.tuning.edo', 'an EDO tuning needs edo; a tonic must be a pitch class');
ok(cs({ progressions: [{ id: 'p', key: 'C', chords: [['C4', 'E4'], ['D4', 'F4', 'A4']] }] }) === 'e:size:model.progressions[0].chords', 'every chord of a progression needs the same voices');
ok(cs({ rhythms: [{ id: 'r' }, { id: 's', pattern: 'x-x' }] }) === 'e:value:model.rhythms[0],e:value:model.rhythms[1].pattern', 'a rhythm needs k and n or a pattern of x and .');
ok(cs({ timbres: [{ id: 't', kind: 'custom', ratios: [1, 2], amps: [1] }] }) === 'e:value:model.timbres[0]', 'a custom timbre needs ratios and amps of the same length');
ok(cs({}, [{ id: 'a', kind: 'scalar', of: 'chord', set: 'zz', field: 'root' }, { id: 'b', kind: 'scalar', of: 'freq' }, { id: 'c', kind: 'sound', of: 'play' }, { id: 'd', kind: 'scalar', of: 'meter', meter: '3/5', field: 'beats' }, { id: 'e', kind: 'scalar', of: 'nope' }, { id: 'f', kind: 'scalar', of: 'nrt', set: 'zz', ops: 'PQ', field: 'root' }])
  === 'e:ref:outputs[0].set,e:value:outputs[1],e:value:outputs[2],e:value:outputs[3].meter,e:output:outputs[4].of,e:ref:outputs[5].set,e:value:outputs[5].ops', 'outputs: an unknown set, freq without a note, play without anything to play, a bad metre, an unknown output, bad P/L/R');
ok(cs({}, [{ id: 'd', kind: 'series', of: 'dissonance', from: 'r0', to: 2, part: 'y' }]) === '' && JSON.stringify(L.exprs(spec({ tuning: { a4: 'A' }, sets: [{ id: 's', midi: ['m', 64] }] }, [{ id: 'd', kind: 'series', of: 'dissonance', from: 'r0', part: 'y' }]))) === '[["A","model.tuning.a4",[]],["m","model.sets[0].midi[0]",[]],["r0","outputs[0].from",[]]]', 'exprs: every number that can be a formula, with its path (pitch names are not formulas)');
ok(JSON.stringify(L.keys(spec({}))) === '[]', 'keys: music@1 names no string keys');
ok(cs({}, [{ id: 'k', kind: 'scene', of: 'keyboard' }]) === 'e:value:outputs[0]', 'a keyboard needs a set');

// ---- 11. the sim adapter, sound, the Worker, speed ----
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'meantone-wolf', 'spec.json'), 'utf8'));
ok(L.checkSpec(EX).filter(p => p.level === 'error').length === 0, 'the reference activity meantone-wolf has no errors');
const inst = L.engine.create(EX, { seed: 1 }), env = Object.fromEntries(EX.params.map(p => [p.id, p.default]));
let t0 = Date.now(); const o1 = inst.run(env); const dt = Date.now() - t0;
ok(EX.outputs.every(o => o.id in o1) && o1.kb && o1.kb.items.length > 10 && o1.chord && Array.isArray(o1.chord.notes) && o1.chord.notes.length === 3 && o1.chord.notes.every(x => x.f > 20 && x.d > 0), 'engine.create(spec).run(inputs) gives every output: numbers, the keyboard scene and the sound (notes {f, t, d, g})');
{ const o2 = inst.run(Object.assign({}, env, { fr: 0.25 })); ok(near(o2.third, 386.314, 1e-3) && near(o2.wolf, 737.637, 1e-3) && near(o2.beats, 0, 1e-9) && near(o1.third, 407.820, 1e-3), 'the example: at ¼ comma the third is pure (386.31 c) and does not beat, the wolf is 737.64 c; at 0 (Pythagorean) the third is 407.82 c'); }
ok(dt < 50, `a typical run takes < 50 ms (${dt} ms)`);
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + L.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(EX, { seed: 1 }).run(env);
  ok(JSON.stringify(w) === JSON.stringify(o1), 'the Worker source in a fresh global gives the same outputs (the sound too)'); }
{ const big = spec({ sets: [{ id: 's', notes: Array.from({ length: 24 }, (_, i) => P('C2').midi + i * 3).map(m => ['C', 'Eb', 'Gb', 'A'][(m - 36) / 3 % 4] + (Math.floor(m / 12) - 1)) }], timbres: [{ id: 't', kind: 'string', n: 64 }], progressions: [{ id: 'p', chords: Array.from({ length: 32 }, () => ['C5', 'G4', 'E4', 'C3', 'G2', 'C2']) }] },
    [{ id: 'd', kind: 'series', of: 'dissonance', timbre: 't', points: 2000, part: 'y' }, { id: 'r', kind: 'scalar', of: 'roughness', set: 's', timbre: 't' }, { id: 'v', kind: 'scalar', of: 'vl', progression: 'p', rule: 'all' }, { id: 'st', kind: 'scene', of: 'staff', progression: 'p' }, { id: 'pl', kind: 'sound', of: 'play', set: 's', timbre: 't' }]);
  ok(L.checkSpec(big).filter(p => p.level === 'error').length === 0, 'the worst allowed model is valid');
  t0 = Date.now(); const r = L.run(big, {}, {}); const d2 = Date.now() - t0;
  ok(d2 < 2000 && r.out.d.length === 2000 && Number.isFinite(r.out.r) && r.out.st.items.length <= 2000 && r.out.pl.notes.length <= 512, `the worst allowed model (64 partials × 2000 points, 24 notes, 32 chords, a staff, a sound) runs in < 2 s (${d2} ms)`); }
ok(Number.isNaN(L.engine.create(spec({ tuning: { a4: 'nope(' } }, [{ id: 'x', kind: 'scalar', of: 'freq', note: 'C4' }])).run({}).x) && Number.isNaN(L.engine.create(spec({}, [{ id: 'x', kind: 'scalar', of: 'freq', note: 'H9' }])).run({}).x), 'a formula or a pitch that cannot be computed gives NaN, never throws');
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
