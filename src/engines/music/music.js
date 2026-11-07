/* ===================== music@1 — music theory and acoustics: the engine library of sim-spec@1 (docs/library/music.md) =====================
   Spelled pitches on the line of fifths (Temperley 2000) — so A4 ≠ d5 and G♯ ≠ A♭ until a tuning makes them equal — and a tuning
   that turns them into frequencies: 12-TET at any A4, n-EDO, Pythagorean and meantone (regular temperaments of any fifth, spelled or
   on a 12-key keyboard with its wolf), 5-limit just intonation, Werckmeister III, Vallotti, Kirnberger III or 12 cents of the author's.
   Intervals, scales and modes (maqām in 24-TET approximation, the 72 mēḷakarta), chords and their inversions, figured bass, Roman
   numerals (secondary dominants, Neapolitan, augmented sixths), Neo-Riemannian P/L/R, pitch-class sets (Forte and Rahn prime forms,
   Forte numbers, interval vectors, Z-relations), voice-leading checks, rhythm (Euclidean rhythms, metres, durations), timbre
   (partials of strings, pipes, bars, membranes), beats and roughness (Plomp & Levelt 1965 as parametrised by Sethares 1993;
   Vassilakis 2001), and sounds to play (WebAudio on the main thread: the engine only writes the notes).
   Sources (each function names its own): A. Forte 1973; J. Rahn 1980; J. M. Barbour 1951; W. A. Sethares 1993/2005; G. T. Toussaint
   2005; R. Cohn 1998; N. H. Fletcher & T. D. Rossing 1998; ISO 16:1975; the Forte table is music21's (chord/tables.py, BSD-3-Clause,
   © C. Ariza, M. S. Cuthbert), as 208 prime-form bit masks.  Pure, bounded, deterministic; numbers, codes and notation symbols only.
   Tests: node tests/lib_music.js */
import NoemaLibCore from '../kernel/core.js';
  /* i18n-ignore-start */
  const C = NoemaLibCore;
  const ID = 'music@1';
  const T = {"SCALES":["major","naturalMinor","harmonicMinor","melodicMinor","dorian","phrygian","lydian","mixolydian","locrian","majorPentatonic","minorPentatonic","blues","wholeTone","octatonicHW","octatonicWH","hexatonic","acoustic","hungarianMinor","doubleHarmonic","chromatic","rast","bayati","hijaz","saba","sikah"],"MODEL":{"tuning":{"$obj":{"system":"enum:12tet|pythagorean|meantone|just|werckmeister3|vallotti|kirnberger3|edo|cents","a4":"numx","tonic":"expr","edo":"numx","fraction":"numx","cents":{"$list":"numx","min":12,"max":12},"layout":"enum:spelled|keyboard","chainStart":"expr"}},"sets":{"$list":{"$obj":{"id":"id!","notes":{"$list":"expr","max":24},"midi":{"$list":"numx","max":24},"pcs":{"$list":"numx","max":12},"transpose":"expr"}},"max":24},"progressions":{"$list":{"$obj":{"id":"id!","key":"expr","mode":"enum:major|minor","chords":{"$req":true,"$list":{"$list":"expr","min":2,"max":6},"min":1,"max":32}}},"max":8},"rhythms":{"$list":{"$obj":{"id":"id!","k":"numx","n":"numx","rot":"numx","pattern":"expr"}},"max":8},"timbres":{"$list":{"$obj":{"id":"id!","kind":"enum:harmonic|saw|square|triangle|string|closed|bar|membrane|custom!","n":"numx","decay":"numx","B":"numx","pluck":"numx","ratios":{"$list":"numx","max":64},"amps":{"$list":"numx","max":64}}},"max":8}},"OUT":{"scalar":{"freq":{"id":"expr","kind":"expr","of":"expr","note":"expr","set":"ref","i":"numx"},"midi":{"id":"expr","kind":"expr","of":"expr","note":"expr","set":"ref","i":"numx"},"cents":{"id":"expr","kind":"expr","of":"expr","from":"expr!","to":"expr!"},"ratioCents":{"id":"expr","kind":"expr","of":"expr","ratio":"numx!"},"monzo":{"id":"expr","kind":"expr","of":"expr","monzo":{"$req":true,"$list":"numx","min":1,"max":6}},"comma":{"id":"expr","kind":"expr","of":"expr","name":"enum:syntonic|pythagorean|schisma|diaschisma|diesis|greaterDiesis|kleisma|septimal|holdrian!"},"interval":{"id":"expr","kind":"expr","of":"expr","from":"expr!","to":"expr!","field":"enum:number|simple|quality|semitones|cents|direction|compound|invNumber|invQuality|ic!"},"chord":{"id":"expr","kind":"expr","of":"expr","set":"ref!","field":"enum:root|quality|inversion|candidates|bass|figure!"},"roman":{"id":"expr","kind":"expr","of":"expr","set":"ref!","key":"expr!","mode":"enum:major|minor","field":"enum:degree|alter|quality|inversion|secondary|figure!"},"pcset":{"id":"expr","kind":"expr","of":"expr","set":"ref!","field":"enum:card|prime|rahnPrime|forte|z|iv1|iv2|iv3|iv4|iv5|iv6|invariance|complement|differs!"},"nrt":{"id":"expr","kind":"expr","of":"expr","set":"ref!","ops":"expr!","field":"enum:root|mode!"},"beats":{"id":"expr","kind":"expr","of":"expr","a":"expr!","b":"expr!","p":"numx","q":"numx"},"roughness":{"id":"expr","kind":"expr","of":"expr","set":"ref!","timbre":"ref","model":"enum:sethares|sethares93|vassilakis"},"partial":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","note":"expr!","k":"numx!"},"tuning":{"id":"expr","kind":"expr","of":"expr","pc":"numx!","field":"enum:cents|dev!"},"edo":{"id":"expr","kind":"expr","of":"expr","n":"numx!","ratio":"numx!","field":"enum:steps|cents|error!"},"scale":{"id":"expr","kind":"expr","of":"expr","name":"enum:major|naturalMinor|harmonicMinor|melodicMinor|dorian|phrygian|lydian|mixolydian|locrian|majorPentatonic|minorPentatonic|blues|wholeTone|octatonicHW|octatonicWH|hexatonic|acoustic|hungarianMinor|doubleHarmonic|chromatic|rast|bayati|hijaz|saba|sikah!","i":"numx","field":"enum:size|cents|semitones!"},"melakarta":{"id":"expr","kind":"expr","of":"expr","n":"numx!","i":"numx!"},"rhythm":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","field":"enum:onsets|length|necklace|evenness!"},"onset":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","i":"numx!"},"duration":{"id":"expr","kind":"expr","of":"expr","value":"numx!","dots":"numx","tuplet":"numx","tupletIn":"numx","bpm":"numx!","beat":"numx"},"meter":{"id":"expr","kind":"expr","of":"expr","meter":"expr!","field":"enum:beats|beatUnit|compound|bar!"},"vl":{"id":"expr","kind":"expr","of":"expr","progression":"ref!","rule":"enum:parallel5|parallel8|contrary|hidden|crossing|overlap|spacing|range|leadingTone|all!"},"resonator":{"id":"expr","kind":"expr","of":"expr","type":"enum:string|open|closed|bar|membrane!","k":"numx!","L":"numx","tension":"numx","mu":"numx","r":"numx","tempC":"numx","f1":"numx","B":"numx"}},"series":{"dissonance":{"id":"expr","kind":"expr","of":"expr","timbre":"ref","note":"expr","from":"numx","to":"numx","points":"int:2:2000","model":"enum:sethares|sethares93|vassilakis","part":"enum:x|y!"},"spectrum":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","note":"expr!","part":"enum:x|y!"},"waveform":{"id":"expr","kind":"expr","of":"expr","timbre":"ref!","samples":"int:16:2000","part":"enum:x|y!"},"tuning":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y|dev!"},"scale":{"id":"expr","kind":"expr","of":"expr","name":"enum:major|naturalMinor|harmonicMinor|melodicMinor|dorian|phrygian|lydian|mixolydian|locrian|majorPentatonic|minorPentatonic|blues|wholeTone|octatonicHW|octatonicWH|hexatonic|acoustic|hungarianMinor|doubleHarmonic|chromatic|rast|bayati|hijaz|saba|sikah!","part":"enum:x|y!"},"rhythm":{"id":"expr","kind":"expr","of":"expr","rhythm":"ref!","part":"enum:x|y!"},"harmonics":{"id":"expr","kind":"expr","of":"expr","note":"expr!","n":"int:1:64","part":"enum:x|y!"}},"scene":{"keyboard":{"id":"expr","kind":"expr","of":"expr","set":"ref","from":"expr","to":"expr","cents":"bool"},"staff":{"id":"expr","kind":"expr","of":"expr","set":"ref","progression":"ref","clef":"enum:treble|bass|grand"},"clock":{"id":"expr","kind":"expr","of":"expr","set":"ref","rhythm":"ref"},"circle":{"id":"expr","kind":"expr","of":"expr","set":"ref"},"tonnetz":{"id":"expr","kind":"expr","of":"expr","set":"ref"}},"sound":{"play":{"id":"expr","kind":"expr","of":"expr","set":"ref","progression":"ref","rhythm":"ref","timbre":"ref","mode":"enum:chord|arpeggio","dur":"numx","bpm":"numx"}}},"REFS":{"set":"sets","progression":"progressions","rhythm":"rhythms","timbre":"timbres"},"PITCHF":["note","from","to","a","b"],"PITCH_RE":"^([A-G])(#{1,3}|x|b{1,3}|n)?([\\^v])?(-1|[0-9])$","PC_RE":"^[A-G](#{1,2}|x|b{1,2})?$","IVL_RE":"^-?(P|M|m|A{1,3}|d{1,3})([1-9]|1[0-5])$","METER_RE":"^([1-9][0-9]?)/(1|2|4|8|16|32|64)$","OPS_RE":"^[PLR]{1,12}$","PAT_RE":"^[x.]{1,64}$"};
  const FORTE = [[],[],[],[7,11,19,35,67,21,37,69,133,73,137,273],[15,23,27,39,71,135,51,99,195,45,43,77,75,141,83,163,153,147,275,291,85,149,165,277,325,297,293,585,139],[31,47,55,79,143,103,199,93,87,91,157,107,279,167,327,155,283,179,203,395,307,403,173,171,301,309,299,333,331,339,587,595,341,597,661,151,313,295],[63,95,111,119,207,231,455,189,175,187,183,215,219,315,311,371,407,423,411,819,349,343,365,347,363,427,603,619,843,715,811,693,685,683,1365,159,287,399,317,303,335,591,359,615,605,599,663,679,667,723],[127,191,319,223,239,415,463,381,351,607,379,671,375,431,471,623,631,815,719,919,823,871,701,687,733,699,695,747,727,855,731,859,1367,1371,1387,367,443,439],[255,383,639,447,479,495,831,927,975,765,703,763,735,759,863,943,891,879,887,951,1375,1391,1455,1399,1495,1719,1463,1755,751],[511,767,895,959,991,1407,1471,1503,1519,1759,1775,1911]], FORTE_Z = [[],[],[],[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,29,0,0,0,0,0,0,0,0,0,0,0,0,0,15],[0,0,0,0,0,0,0,0,0,0,0,36,0,0,0,0,37,38,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,17,18],[0,0,36,37,0,38,0,0,0,39,40,41,42,0,0,0,43,0,44,0,0,0,45,46,47,48,0,49,50,0,0,0,0,0,0,3,4,6,10,11,12,13,17,19,23,24,25,26,28,29],[0,0,0,0,0,0,0,0,0,0,0,36,0,0,0,0,37,38,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,17,18],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,29,0,0,0,0,0,0,0,0,0,0,0,0,0,15],[0,0,0,0,0,0,0,0,0,0,0,0]];
  const md = (a, b) => a - b * Math.floor(a / b), fl = Math.floor, isInt = v => typeof v === 'number' && Number.isInteger(v);
  const log2 = Math.log2, CENTS = r => 1200 * log2(r);
  const RX = { pitch: new RegExp(T.PITCH_RE), pc: new RegExp(T.PC_RE), ivl: new RegExp(T.IVL_RE), meter: new RegExp(T.METER_RE), ops: new RegExp(T.OPS_RE), pat: new RegExp(T.PAT_RE) };

  /* ---------- spelled pitch (line of fifths: Temperley 2000; scientific pitch notation, C4 = MIDI 60, ISO 16:1975 A4 = 440 Hz) ---------- */
  const FIF = [0, 2, 4, -1, 1, 3, 5], NAT = [0, 2, 4, 5, 7, 9, 11], LET = 'CDEFGAB';
  const ACC = { '': 0, '#': 1, '##': 2, '###': 3, x: 2, b: -1, bb: -2, bbb: -3, n: 0 };
  function parsePitch(s) {
    if (typeof s !== 'string') return null; const m = RX.pitch.exec(s); if (!m) return null;
    const L = LET.indexOf(m[1]), alt = ACC[m[2] || ''], q = m[3] === '^' ? 0.5 : m[3] === 'v' ? -0.5 : 0, oct = +m[4];
    return mk(L, alt, oct, q);
  }
  function parsePC(s) { if (typeof s !== 'string' || !RX.pc.test(s)) return null; return mk(LET.indexOf(s[0]), ACC[s.slice(1)], 4, 0); }
  function mk(L, alt, oct, q) { return { L, alt, oct, q: q || 0, tpc: FIF[L] + 7 * alt, midi: 12 * (oct + 1) + NAT[L] + alt + (q || 0), pc: md(NAT[L] + alt, 12), step: L + 7 * oct }; }
  /** an unspelled MIDI number → a spelling from the window A♭…C♯ of the line of fifths (tpc −4 … 7) */
  function fromMidi(m) { const k = Math.round(m), pc = md(k, 12); let tpc = 0; for (let t = -4; t <= 7; t++) if (md(7 * t, 12) === pc) tpc = t;
    const L = FIF.indexOf(md(tpc + 1, 7) - 1), alt = (tpc - FIF[L]) / 7, oct = fl((k - NAT[L] - alt) / 12) - 1; return mk(L, alt, oct, m - k); }
  /* intervals: number from the letters, quality from the fifths (perfect: 1 4 5; imperfect: 2 3 6 7) */
  const BASE = [0, 2, 4, -1, 1, 3, 5], PERFECT = [true, false, false, true, true, false, false];
  function qualityCode(s, k) { return PERFECT[s] ? (k === 0 ? 0 : k > 0 ? k + 1 : k - 1) : (k === 0 ? 1 : k === -1 ? -1 : k > 0 ? k + 1 : k); }
  /** interval(a, b) → {number, simple, quality (P 0, M 1, m −1, A 2, d −2, AA 3, dd −3), semitones, direction, compound, ic} */
  function interval(a, b) {
    let g = b.step - a.step, semis = b.midi - a.midi, dir = 1, x = a, y = b;
    if (g < 0 || (g === 0 && semis < 0)) { dir = -1; x = b; y = a; g = -g; semis = -semis; }
    const s = md(g, 7), k = Math.round((y.tpc - x.tpc - BASE[s]) / 7), q = qualityCode(s, k);
    const ic = md(Math.round(semis), 12);
    return { number: g + 1, simple: s + 1, quality: q, semitones: dir * semis, direction: g === 0 && semis === 0 ? 0 : dir, compound: +(g >= 7), invNumber: 9 - (s + 1), invQuality: -q, ic: Math.min(ic, 12 - ic) };
  }
  /** an interval name (M3, P5, d7, AA4, -m2) → {g generic steps, q fifths} or null when the quality does not fit the number */
  function parseIvl(s) {
    const m = typeof s === 'string' ? RX.ivl.exec(s) : null; if (!m) return null;
    const n = +m[2], sg = (s[0] === '-' ? -1 : 1), st = md(n - 1, 7), qs = m[1], per = PERFECT[st];
    let k;
    if (qs === 'P') { if (!per) return null; k = 0; } else if (qs === 'M') { if (per) return null; k = 0; } else if (qs === 'm') { if (per) return null; k = -1; }
    else if (qs[0] === 'A') k = qs.length; else k = per ? -qs.length : -qs.length - 1;
    return { g: sg * (n - 1), q: sg * (BASE[st] + 7 * k) };
  }
  function transpose(p, iv) { const st = p.L + iv.g, L = md(st, 7), oct = p.oct + fl(st / 7), tpc = p.tpc + iv.q; return mk(L, (tpc - FIF[L]) / 7, oct, p.q); }

  /* ---------- tunings (Barbour 1951; Sethares 2005 ch. 4) ---------- */
  const P5 = CENTS(3 / 2), PC = CENTS(531441 / 524288), SC = CENTS(81 / 80), SCHISMA = CENTS(32805 / 32768);
  const CHAIN = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'].map(n => parsePC(n).pc);
  /** 12 cents above C from a chain of fifths C–G–…–F with some fifths narrowed (temper: {index of the lower note in CHAIN: cents}) */
  function chain12(temper) { const out = new Array(12); let x = 0; for (let i = 0; i < 12; i++) { out[CHAIN[i]] = md(x, 1200); x += P5 - (temper[i] || 0); } return out; }
  const WELL = {
    werckmeister3: chain12({ 0: PC / 4, 1: PC / 4, 2: PC / 4, 5: PC / 4 }),          // C–G, G–D, D–A, B–F♯ narrowed by ¼ Pythagorean comma (Werckmeister 1691)
    vallotti: chain12({ 11: PC / 6, 0: PC / 6, 1: PC / 6, 2: PC / 6, 3: PC / 6, 4: PC / 6 }),   // F–C–G–D–A–E–B narrowed by ⅙ PC (Vallotti, publ. 1779)
    kirnberger3: chain12({ 0: SC / 4, 1: SC / 4, 2: SC / 4, 3: SC / 4, 6: SCHISMA }),      // C–G–D–A–E by ¼ syntonic comma, F♯–C♯ by a schisma (Kirnberger 1779)
    just: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8].map(CENTS),   // 5-limit just intonation on the tonic (Zarlino 1558)
  };
  function tuner(M, X, flag) {
    const tu = M.tuning || {}, sys = tu.system || '12tet', a4 = tu.a4 === undefined ? 440 : X(tu.a4);
    const tonic = parsePC(tu.tonic || 'C') || parsePC('C'), layout = tu.layout || 'spelled', start = parsePC(tu.chainStart || 'Eb') || parsePC('Eb');
    let fifth = P5, edo = NaN, tab = null;
    if (sys === '12tet') fifth = 700;
    if (sys === 'meantone') { const fr = tu.fraction === undefined ? 0.25 : X(tu.fraction); fifth = P5 - fr * SC; }
    if (sys === 'edo') { edo = X(tu.edo); if (!isInt(edo) || edo < 5 || edo > 311) { flag('invalid'); edo = NaN; } }
    if (WELL[sys]) tab = sys === 'just' ? WELL.just : WELL[sys];
    if (sys === 'cents') { tab = (tu.cents || []).map(v => X(v)); if (tab.length !== 12 || !tab.every(Number.isFinite)) { flag('invalid'); tab = null; } }
    const tabRel = sys === 'just' || sys === 'cents';     // relative to the tonic; the well temperaments are relative to C
    const regular = (L, alt, oct, F) => { const W = 2 * F - 1200, h = 3600 - 5 * F, A1 = 7 * F - 4800, nat = [0, W, 2 * W, 2 * W + h, 3 * W + h, 4 * W + h, 5 * W + h]; return 1200 * (oct - 4) + nat[L] + alt * A1; };
    function centsAbs(p) {        // cents above C4 in this tuning (before the reference pitch)
      if (sys === 'edo') {
        if (!Number.isFinite(edo)) return NaN;
        const p5 = Math.round(edo * log2(1.5)), W = 2 * p5 - edo, h = 3 * edo - 5 * p5, A1 = 7 * p5 - 4 * edo, nat = [0, W, 2 * W, 2 * W + h, 3 * W + h, 4 * W + h, 5 * W + h];
        if (W <= 0 || h < 0) flag('edo-mapping');
        let steps = edo * (p.oct - 4) + nat[p.L] + p.alt * A1;
        if (p.q) { const qs = p.q * edo / 12; if (!isInt(qs)) flag('approx'); steps += Math.round(qs); }
        return 1200 * steps / edo;
      }
      if (tab) { const base = tabRel ? tonic.pc : 0, i = md(Math.round(p.midi - p.q) - base, 12); return 100 * (Math.round(p.midi - p.q) - 60) + tab[i] - 100 * i + 100 * p.q; }
      if (sys === 'pythagorean' || sys === 'meantone') {
        if (layout === 'keyboard') { const pc = md(Math.round(p.midi - p.q), 12); let t = start.tpc; while (md(7 * t, 12) !== pc) t++;
          const L = FIF.indexOf(md(t + 1, 7) - 1), alt = (t - FIF[L]) / 7, oct = fl((Math.round(p.midi - p.q) - NAT[L] - alt) / 12) - 1; return regular(L, alt, oct, fifth) + 100 * p.q; }
        return regular(p.L, p.alt, p.oct, fifth) + 100 * p.q;
      }
      return 100 * (p.midi - 60);                      // 12-TET
    }
    const A4 = parsePitch('A4');
    const freq = p => a4 * Math.pow(2, (centsAbs(p) - centsAbs(A4)) / 1200);
    /** cents of the degree i (0–11 semitones above the tonic; above C for the well temperaments), in 0 … 1200 */
    const degree = i => { const base = WELL[sys] && !tabRel ? 0 : tonic.pc, v = centsAbs(fromMidi(60 + base + i)) - centsAbs(fromMidi(60 + base)); return Math.max(0, md(v + 1e-9, 1200) - 1e-9); };
    return { sys, a4, tonic, centsAbs, freq, degree, fifth, edo };
  }

  /* ---------- pitch-class sets: Forte (1973) and Rahn (1980) prime forms, interval vectors, Forte numbers (music21's table) ---------- */
  const maskOf = pcs => pcs.reduce((m, p) => m | (1 << md(p, 12)), 0);
  const pcsOf = m => { const a = []; for (let i = 0; i < 12; i++) if (m >> i & 1) a.push(i); return a; };
  function normalForm(pcs, rahn) {
    const s = [...new Set(pcs.map(p => md(p, 12)))].sort((a, b) => a - b), n = s.length; if (!n) return [];
    let best = null, bk = null;
    for (let i = 0; i < n; i++) {
      const r = s.slice(i).concat(s.slice(0, i).map(p => p + 12)), d = r.map(p => p - r[0]);
      const key = rahn ? d.slice(1).reverse() : [d[n - 1]].concat(d.slice(1, n - 1));   // Rahn: from the right; Forte: span, then from the left
      if (!bk || key.some((v, j) => v !== bk[j]) && cmp(key, bk) < 0) { best = r; bk = key; }
    }
    return best.map(p => md(p, 12));
  }
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  function primeForm(pcs, rahn) {
    const a = normalForm(pcs, rahn); if (!a.length) return [];
    const z = x => x.map(p => md(p - x[0], 12)), A = z(a), B = z(normalForm(pcs.map(p => -p), rahn)), n = A.length;
    const key = d => (rahn ? d.slice(1).reverse() : [d[n - 1]].concat(d.slice(1, n - 1)));
    return cmp(key(A), key(B)) <= 0 ? A : B;
  }
  function iv(pcs) { const s = [...new Set(pcs.map(p => md(p, 12)))], v = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const d = md(s[j] - s[i], 12), c = Math.min(d, 12 - d); v[c - 1]++; } return v; }
  function forteNumber(pcs) { const p = primeForm(pcs, false), c = p.length; if (c < 3 || c > 9) return null; const i = FORTE[c].indexOf(maskOf(p)); return i < 0 ? null : { card: c, num: i + 1, z: FORTE_Z[c][i] }; }
  function invariance(pcs) { const m = maskOf(pcs); let k = 0; for (let n = 0; n < 12; n++) { if (maskOf(pcs.map(p => p + n)) === m) k++; if (maskOf(pcs.map(p => n - p)) === m) k++; } return k; }

  /* ---------- chords, inversions, figured bass, Roman numerals (Aldwell, Schachter & Cadwallader; Kostka & Payne) ---------- */
  const CHORDS = [['maj', [0, 4, 7]], ['min', [0, 3, 7]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['dom7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]],
    ['min7', [0, 3, 7, 10]], ['minMaj7', [0, 3, 7, 11]], ['halfDim7', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['aug7', [0, 4, 8, 10]], ['augMaj7', [0, 4, 8, 11]], ['maj6', [0, 4, 7, 9]], ['min6', [0, 3, 7, 9]],
    ['dom7no5', [0, 4, 10]], ['add9', [0, 2, 4, 7]], ['dom9', [0, 2, 4, 7, 10]], ['maj9', [0, 2, 4, 7, 11]], ['min9', [0, 2, 3, 7, 10]], ['dom7b9', [0, 1, 4, 7, 10]], ['dom7s9', [0, 3, 4, 7, 10]],
    ['sixNine', [0, 2, 4, 7, 9]], ['dom11', [0, 2, 4, 5, 7, 10]], ['dom13', [0, 2, 4, 5, 7, 9, 10]]];
  const TERTIAN = [1, 3, 5, 7, 2, 4, 6];        // generic simple intervals of a tertian stack (9 = 2, 11 = 4, 13 = 6)
  /** analyse a chord of spelled pitches → candidates [{root (a pitch), q (index in CHORDS), inv, figure}], the best first */
  function analyseChord(ps) {
    if (ps.length < 2) return [];
    const bass = ps.reduce((a, b) => (b.midi < a.midi ? b : a)), pcs = [...new Set(ps.map(p => md(Math.round(p.midi), 12)))].sort((a, b) => a - b), out = [];
    const seen = new Set();
    for (const r of ps) {
      const rpc = md(Math.round(r.midi), 12); if (seen.has(r.L * 100 + r.alt)) continue; seen.add(r.L * 100 + r.alt);
      const rel = pcs.map(p => md(p - rpc, 12)).sort((a, b) => a - b);
      const q = CHORDS.findIndex(c => c[1].length === rel.length && c[1].every((v, i) => v === rel[i])); if (q < 0) continue;
      const tert = ps.every(p => TERTIAN.includes(md(p.step - r.step, 7) + 1));
      const bi = md(bass.step - r.step, 7) + 1, inv = bi === 1 ? 0 : bi === 3 ? 1 : bi === 5 ? 2 : bi === 7 ? 3 : 4;
      const seventh = CHORDS[q][1].some(v => v === 10 || v === 11) || CHORDS[q][0] === 'dim7';
      const figure = seventh ? [7, 65, 43, 42, NaN][inv] : [53, 63, 64, NaN, NaN][inv];
      out.push({ root: r, q, inv, figure, score: (tert ? 0 : 100) + (md(Math.round(bass.midi), 12) === rpc ? 0 : 10) + q / 100 });
    }
    return out.sort((a, b) => a.score - b.score);
  }
  const SCALE_TPC = { major: [0, 2, 4, -1, 1, 3, 5], minor: [0, 2, -3, -1, 1, -4, -2] };
  function roman(ps, key, mode) {
    const tonic = key, sc = SCALE_TPC[mode === 'minor' ? 'minor' : 'major'];
    const bass = ps.reduce((a, b) => (b.midi < a.midi ? b : a));
    // augmented sixth chords: an augmented 6th above the bass (♭6 – ♯4): Italian, French (with 2), German (with ♭3)
    if (ps.some(p => { const i = interval(bass, p); return i.simple === 6 && i.quality === 2; })) {
      const has = (s, q) => ps.some(p => { const i = interval(bass, p); return i.simple === s && i.quality === q; });
      const deg = md(bass.L - tonic.L, 7) + 1, alter = Math.round((bass.tpc - tonic.tpc - sc[deg - 1]) / 7);
      return { degree: deg, alter, quality: has(5, 0) ? 102 : has(4, 2) ? 101 : 100, inversion: 0, secondary: 0, figure: has(5, 0) ? 65 : has(4, 2) ? 43 : 63 };
    }
    const c = analyseChord(ps)[0]; if (!c) return null;
    const r = c.root, degree = md(r.L - tonic.L, 7) + 1, alter = Math.round((r.tpc - tonic.tpc - sc[degree - 1]) / 7);
    const keyPcs = new Set(sc.map(t => md(7 * (tonic.tpc + t), 12))); if (mode === 'minor') keyPcs.add(md(tonic.pc + 11, 12));
    const diatonic = ps.every(p => keyPcs.has(md(Math.round(p.midi), 12)));
    let secondary = 0;
    const nm = CHORDS[c.q][0];
    if (!diatonic && ['maj', 'dom7', 'dom7no5', 'dom9'].includes(nm)) { const td = md(r.L + 3 - tonic.L, 7) + 1; if (td !== 1) secondary = td; }   // V/x: x a fifth below the root
    if (!diatonic && ['dim', 'dim7', 'halfDim7'].includes(nm)) { const td = md(r.L + 1 - tonic.L, 7) + 1; if (td !== 1) secondary = td; }
    return { degree, alter, quality: c.q, inversion: c.inv, secondary, figure: c.figure };
  }
  /** Neo-Riemannian P, L, R on a consonant triad (Cohn 1998): {root pc, mode 1 major / 0 minor} */
  function nrt(root, mode, ops) {
    for (const o of ops) {
      if (o === 'P') mode = 1 - mode;
      else if (o === 'R') { root = md(root + (mode ? 9 : 3), 12); mode = 1 - mode; }
      else if (o === 'L') { root = md(root + (mode ? 4 : 8), 12); mode = 1 - mode; }
    }
    return { root, mode };
  }

  /* ---------- scales (semitones / line-of-fifths offsets) and maqāmāt in 24-TET (Marcus 1989; Farraj & Abu Shumays 2019) ---------- */
  const SCALE = {
    major: [0, 2, 4, -1, 1, 3, 5], naturalMinor: [0, 2, -3, -1, 1, -4, -2], harmonicMinor: [0, 2, -3, -1, 1, -4, 5], melodicMinor: [0, 2, -3, -1, 1, 3, 5],
    dorian: [0, 2, -3, -1, 1, 3, -2], phrygian: [0, -5, -3, -1, 1, -4, -2], lydian: [0, 2, 4, 6, 1, 3, 5], mixolydian: [0, 2, 4, -1, 1, 3, -2], locrian: [0, -5, -3, -1, -6, -4, -2],
    majorPentatonic: [0, 2, 4, 1, 3], minorPentatonic: [0, -3, -1, 1, -2], blues: [0, -3, -1, -6, 1, -2], wholeTone: [0, 2, 4, 6, 8, 10],
    octatonicHW: [0, -5, -3, 4, 6, 1, 3, -2], octatonicWH: [0, 2, -3, -1, 6, -4, 3, 5], hexatonic: [0, -5, 4, -1, 8, 3], acoustic: [0, 2, 4, 6, 1, 3, -2],
    hungarianMinor: [0, 2, -3, 6, 1, -4, 5], doubleHarmonic: [0, -5, 4, -1, 1, -4, 5], chromatic: [0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5],
  };
  const MAQAM = { rast: [0, 200, 350, 500, 700, 900, 1050], bayati: [0, 150, 300, 500, 700, 800, 1000], hijaz: [0, 100, 400, 500, 700, 800, 1000], saba: [0, 150, 300, 400, 600, 800, 1000], sikah: [0, 150, 350, 500, 650, 850, 1000] };
  /** the 72 mēḷakarta rāgas (Venkatamakhi, 17th c.; Sambamoorthy): n 1–72 → the seven svaras in semitones */
  function melakarta(n) {
    if (!isInt(n) || n < 1 || n > 72) return null;
    const ma = n <= 36 ? 5 : 6, i = md(n - 1, 36), P = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]], rg = P[fl(i / 6)], dn = P[md(i, 6)];
    return [0, rg[0], rg[1], ma, 7, dn[0] + 7, dn[1] + 7];
  }

  /* ---------- rhythm: Euclidean rhythms (Toussaint 2005, the Bjorklund 2003 algorithm), metres, durations ---------- */
  function bjorklund(k, n) {
    if (!isInt(k) || !isInt(n) || n < 1 || n > 64 || k < 0 || k > n) return null;
    if (k === 0) return new Array(n).fill(0);
    let a = Array.from({ length: k }, () => [1]), b = Array.from({ length: n - k }, () => [0]);
    while (b.length > 1) { const m = Math.min(a.length, b.length), na = []; for (let i = 0; i < m; i++) na.push(a[i].concat(b[i])); const rest = a.length > m ? a.slice(m) : b.slice(m); a = na; b = rest; }
    return [].concat(...a, ...b);
  }
  const necklace = pat => { let best = Infinity; const n = pat.length; for (let r = 0; r < n; r++) { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + pat[(i + r) % n]; best = Math.min(best, v); } return best; };
  const evenness = pat => { const n = pat.length, on = pat.map((v, i) => (v ? i : -1)).filter(i => i >= 0); let s = 0; for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) s += 2 * Math.sin(Math.PI * (on[j] - on[i]) / n); return s; };

  /* ---------- timbres (Fletcher & Rossing 1998) and roughness ---------- */
  const BAR = [1, 2.756, 5.404, 8.933, 13.344, 18.638], DRUM = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];   // free–free bar; ideal membrane (Bessel zeros j_mn / j_01)
  function partials(tb, X) {
    const kind = tb ? tb.kind : 'harmonic', n0 = tb && tb.n !== undefined ? X(tb.n) : NaN, dec = tb && tb.decay !== undefined ? X(tb.decay) : 0.88, out = [];
    const N = (d, max) => Math.max(1, Math.min(max || 64, isInt(n0) ? n0 : d));
    if (kind === 'harmonic') for (let k = 1; k <= N(6); k++) out.push({ r: k, a: Math.pow(dec, k - 1) });
    else if (kind === 'saw') for (let k = 1; k <= N(16); k++) out.push({ r: k, a: 1 / k });
    else if (kind === 'square') for (let k = 1; out.length < N(8); k += 2) out.push({ r: k, a: 1 / k });
    else if (kind === 'triangle') for (let k = 1; out.length < N(8); k += 2) out.push({ r: k, a: 1 / (k * k) });
    else if (kind === 'string') { const p = tb.pluck === undefined ? 0.2 : X(tb.pluck), B = tb.B === undefined ? 0 : X(tb.B); for (let k = 1; k <= N(12); k++) out.push({ r: k * Math.sqrt(1 + B * k * k) / Math.sqrt(1 + B), a: Math.abs(Math.sin(k * Math.PI * p)) / (k * k) }); }
    else if (kind === 'closed') for (let k = 1; k <= N(6); k++) out.push({ r: 2 * k - 1, a: Math.pow(dec, k - 1) });
    else if (kind === 'bar') BAR.slice(0, N(6, 6)).forEach((r, k) => out.push({ r, a: Math.pow(dec, k) }));
    else if (kind === 'membrane') DRUM.slice(0, N(8, 8)).forEach((r, k) => out.push({ r, a: Math.pow(dec, k) }));
    else if (kind === 'custom') (tb.ratios || []).forEach((r, k) => out.push({ r: X(r), a: X((tb.amps || [])[k]) }));
    const mx = out.reduce((m, p) => Math.max(m, Math.abs(p.a)), 0);
    return out.filter(p => Number.isFinite(p.r) && Number.isFinite(p.a) && p.r > 0).map(p => ({ r: p.r, a: mx > 0 ? p.a / mx : 0 }));
  }
  /** Plomp & Levelt (1965) as parametrised by Sethares (1993; 2005 app. E): one pair of partials */
  function dPair(f1, f2, a1, a2, model) {
    if (f2 < f1) { const t = f1; f1 = f2; f2 = t; const u = a1; a1 = a2; a2 = u; }
    const s = 0.24 / (0.0207 * f1 + 18.96), x = f2 - f1, e = Math.exp(-3.5 * s * x) - Math.exp(-5.75 * s * x);
    if (model === 'vassilakis') { const am = Math.min(a1, a2), S = a1 + a2; return S > 0 ? Math.pow(a1 * a2, 0.1) * 0.5 * Math.pow(2 * am / S, 3.11) * e : 0; }   // Vassilakis 2001
    return (model === 'sethares93' ? a1 * a2 : Math.min(a1, a2)) * e;
  }
  function roughness(spec, model) { let D = 0; for (let i = 0; i < spec.length; i++) for (let j = i + 1; j < spec.length; j++) D += dPair(spec[i].f, spec[j].f, spec[i].a, spec[j].a, model); return D; }

  /* ---------- voice leading (Fux 1725; Aldwell, Schachter & Cadwallader; Huron 2001): chords of voices from the top down ---------- */
  const RANGE = [[60, 79], [55, 74], [48, 67], [40, 60]];    // S C4–G5, A G3–D5, T C3–G4, B E2–C4 (a common convention)
  function voiceLeading(chords, key, mode) {
    const F = { parallel5: [], parallel8: [], contrary: [], hidden: [], crossing: [], overlap: [], spacing: [], range: [], leadingTone: [] };
    const nv = chords[0].length, m = c => c.map(p => Math.round(p.midi));
    for (let t = 0; t < chords.length; t++) {
      const a = m(chords[t]);
      for (let i = 0; i + 1 < nv; i++) { if (a[i] < a[i + 1]) F.crossing.push([t, i, i + 1]); if (i + 1 < nv - 1 && a[i] - a[i + 1] > 12) F.spacing.push([t, i, i + 1]); }
      if (nv === 4) a.forEach((p, i) => { if (p < RANGE[i][0] || p > RANGE[i][1]) F.range.push([t, i, i]); });
      if (t + 1 >= chords.length) continue;
      const b = m(chords[t + 1]);
      for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) {
        const c1 = md(a[i] - a[j], 12), c2 = md(b[i] - b[j], 12), di = Math.sign(b[i] - a[i]), dj = Math.sign(b[j] - a[j]);
        const perfect = c => c === 0 || c === 7;
        if (c1 === c2 && perfect(c1) && di !== 0 && dj !== 0) {
          if (di === dj) (c1 === 7 ? F.parallel5 : F.parallel8).push([t, i, j]); else F.contrary.push([t, i, j]);
        }
        if (i === 0 && j === nv - 1 && perfect(c2) && !(c1 === c2) && di === dj && di !== 0 && Math.abs(b[i] - a[i]) > 2) F.hidden.push([t, i, j]);
      }
      for (let i = 0; i + 1 < nv; i++) if (b[i] < a[i + 1] || b[i + 1] > a[i]) F.overlap.push([t, i, i + 1]);
      if (key) {
        const r1 = analyseChord(chords[t])[0], r2 = analyseChord(chords[t + 1])[0];
        if (r1 && r2) { const d1 = md(Math.round(r1.root.midi) - key.pc, 12), d2 = md(Math.round(r2.root.midi) - key.pc, 12), lt = md(key.pc + 11, 12);
          if ((d1 === 7 || d1 === 11) && d2 === 0 && md(a[0], 12) === lt && b[0] !== a[0] + 1) F.leadingTone.push([t, 0, 0]); }
      }
    }
    return F;
  }

  /* ---------- acoustic resonators (Fletcher & Rossing 1998; Levine & Schwinger 1948 end correction 0.6133 r) ---------- */
  function resonator(q, X) {
    const k = X(q.k), v = 331.3 * Math.sqrt(1 + (q.tempC === undefined ? 20 : X(q.tempC)) / 273.15), L = q.L === undefined ? NaN : X(q.L), r = q.r === undefined ? 0 : X(q.r);
    if (!isInt(k) || k < 1) return NaN;
    if (q.type === 'string') { const B = q.B === undefined ? 0 : X(q.B); return k / (2 * L) * Math.sqrt(X(q.tension) / X(q.mu)) * Math.sqrt(1 + B * k * k); }
    if (q.type === 'open') return k * v / (2 * (L + 2 * 0.6133 * r));
    if (q.type === 'closed') return (2 * k - 1) * v / (4 * (L + 0.6133 * r));
    const f1 = X(q.f1); if (q.type === 'bar') return k <= BAR.length ? f1 * BAR[k - 1] : NaN;
    return k <= DRUM.length ? f1 * DRUM[k - 1] : NaN;
  }
  const COMMA = { syntonic: [-4, 4, -1], pythagorean: [-19, 12], schisma: [-15, 8, 1], diaschisma: [11, -4, -2], diesis: [7, 0, -3], greaterDiesis: [3, 4, -4], kleisma: [-6, -5, 6], septimal: [6, -2, 0, -1] };
  const PRIMES = [2, 3, 5, 7, 11, 13];
  const monzoCents = mz => mz.reduce((s, e, i) => s + e * 1200 * log2(PRIMES[i]), 0);

  /* ---------- the checker (the same codes, paths and messages as tools/lib_music.py) ---------- */
  const MSG = { pitch: 'needs a pitch such as C4, F#3, Bb5, Ebb2, Gx4 (quarter tones: ^ up, v down)', pc: 'needs a pitch class such as C, F#, Bb', ivl: 'needs an interval such as M3, P5, d7, -m2',
    meter: 'needs a time signature such as 3/4 or 6/8', ops: 'needs P, L and R operations, such as PLR (at most 12)', pat: 'needs a pattern of x (onset) and . (rest), at most 64' };
  const okPitch = v => typeof v === 'string' && RX.pitch.test(v), okPC = v => typeof v === 'string' && RX.pc.test(v);
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = C.isObj(spec) ? spec.model : undefined;
    C.walk(m, T.MODEL, 'model', E, W);
    const M = C.isObj(m) ? m : {}, arr = k => (Array.isArray(M[k]) ? M[k] : []);
    const ids = { sets: [], progressions: [], rhythms: [], timbres: [] }, seen = [];
    for (const k of Object.keys(ids)) arr(k).forEach((x, i) => {
      if (!C.isObj(x) || typeof x.id !== 'string') return;
      if (seen.includes(x.id)) E('duplicate', `model.${k}[${i}].id`, `the id ${x.id} is used twice`); else { seen.push(x.id); ids[k].push(x.id); }
    });
    const tu = C.isObj(M.tuning) ? M.tuning : null;
    if (tu) {
      for (const k of ['tonic', 'chainStart']) if (typeof tu[k] === 'string' && !okPC(tu[k])) E('value', 'model.tuning.' + k, MSG.pc);
      if (tu.system === 'edo' && tu.edo === undefined) E('value', 'model.tuning.edo', 'missing');
      if (tu.system === 'cents' && tu.cents === undefined) E('value', 'model.tuning.cents', 'missing');
    }
    arr('sets').forEach((x, i) => {
      if (!C.isObj(x)) return; const p = `model.sets[${i}]`;
      if (['notes', 'midi', 'pcs'].filter(k => x[k] !== undefined).length !== 1) E('value', p, 'needs exactly one of notes, midi, pcs');
      if (Array.isArray(x.notes)) x.notes.forEach((v, j) => { if (typeof v === 'string' && v.trim() !== '' && !okPitch(v)) E('value', `${p}.notes[${j}]`, MSG.pitch); });
      if (x.transpose !== undefined) { if (x.notes === undefined) W('unused', p + '.transpose', 'only with notes'); else if (typeof x.transpose === 'string' && x.transpose.trim() !== '' && !parseIvl(x.transpose)) E('value', p + '.transpose', MSG.ivl); }
    });
    arr('progressions').forEach((x, i) => {
      if (!C.isObj(x)) return; const p = `model.progressions[${i}]`;
      if (typeof x.key === 'string' && !okPC(x.key)) E('value', p + '.key', MSG.pc);
      if (Array.isArray(x.chords)) {
        x.chords.forEach((c, j) => { if (Array.isArray(c)) c.forEach((v, k) => { if (typeof v === 'string' && v.trim() !== '' && !okPitch(v)) E('value', `${p}.chords[${j}][${k}]`, MSG.pitch); }); });
        if (x.chords.every(Array.isArray) && x.chords.some(c => c.length !== x.chords[0].length)) E('size', p + '.chords', 'every chord needs the same number of voices');
      }
    });
    arr('rhythms').forEach((x, i) => {
      if (!C.isObj(x)) return; const p = `model.rhythms[${i}]`;
      if (!((x.k !== undefined && x.n !== undefined) || x.pattern !== undefined)) E('value', p, 'needs k and n, or a pattern');
      if (typeof x.pattern === 'string' && x.pattern.trim() !== '' && !RX.pat.test(x.pattern)) E('value', p + '.pattern', MSG.pat);
    });
    arr('timbres').forEach((x, i) => {
      if (!C.isObj(x)) return;
      if (x.kind === 'custom' && !(Array.isArray(x.ratios) && Array.isArray(x.amps) && x.ratios.length === x.amps.length && x.ratios.length > 0)) E('value', `model.timbres[${i}]`, 'needs ratios and amps of the same length');
    });
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene', 'sound'], (o, at) => {
      const tb = C.has(T.OUT, o.kind) && C.has(T.OUT[o.kind], o.of) ? T.OUT[o.kind][o.of] : null;
      if (!tb) { E('output', at + '.of', `${o.of} is not a ${o.kind} output of ${ID}`); return; }
      C.walk(o, tb, at, E, W);
      for (const k of Object.keys(tb)) {
        const v = o[k];
        if (C.has(T.REFS, k) && typeof v === 'string' && C.ID_RE.test(v) && !ids[T.REFS[k]].includes(v)) E('ref', `${at}.${k}`, `no ${k} ${v}`);
        if (T.PITCHF.includes(k) && /^expr/.test(tb[k]) && typeof v === 'string' && v.trim() !== '' && !okPitch(v)) E('value', `${at}.${k}`, MSG.pitch);
      }
      if (typeof o.key === 'string' && o.key.trim() !== '' && !okPC(o.key)) E('value', at + '.key', MSG.pc);
      if (o.of === 'meter' && typeof o.meter === 'string' && o.meter.trim() !== '' && !RX.meter.test(o.meter)) E('value', at + '.meter', MSG.meter);
      if (o.of === 'nrt' && typeof o.ops === 'string' && o.ops.trim() !== '' && !RX.ops.test(o.ops)) E('value', at + '.ops', MSG.ops);
      if ((o.of === 'freq' || o.of === 'midi') && !(o.note !== undefined || (o.set !== undefined && o.i !== undefined))) E('value', at, 'needs note, or set and i');
      if (o.of === 'play' && ['set', 'progression', 'rhythm'].filter(k => o[k] !== undefined).length !== 1) E('value', at, 'needs one of set, progression, rhythm');
      if (['keyboard', 'staff', 'clock', 'circle', 'tonnetz'].includes(o.of) && o.kind === 'scene' && !['set', 'progression', 'rhythm'].some(k => o[k] !== undefined)) E('value', at, 'needs a set' + (o.of === 'staff' ? ' or a progression' : o.of === 'clock' ? ' or a rhythm' : ''));
    }, E, W);
    return P;
  }
  function collect(v, kd, p, kind, out) {
    if (typeof kd === 'string') { if (kd.replace(/!$/, '') === kind && typeof v === 'string' && v.trim() !== '') out.push(kind === 'numx' ? [v, p, []] : [v, p]); return; }
    if (kd.$obj) { if (!C.isObj(v)) return; for (const k of Object.keys(kd.$obj)) if (v[k] !== undefined) collect(v[k], kd.$obj[k], p + '.' + k, kind, out); return; }
    if (kd.$list && Array.isArray(v)) v.forEach((x, i) => collect(x, kd.$list, `${p}[${i}]`, kind, out));
  }
  function gather(spec, kind) {
    const out = []; if (!C.isObj(spec)) return out;
    collect(spec.model, { $obj: T.MODEL }, 'model', kind, out);
    (Array.isArray(spec.outputs) ? spec.outputs : []).forEach((o, i) => { if (C.isObj(o) && C.has(T.OUT, o.kind) && C.has(T.OUT[o.kind], o.of)) collect(o, { $obj: T.OUT[o.kind][o.of] }, `outputs[${i}]`, kind, out); });
    return out;
  }
  const exprs = spec => gather(spec, 'numx');
  const keys = () => [];       // music@1 names no string keys in its model

  /* ---------- run ---------- */
  function prepare(spec) { const cache = new Map(); for (const [src] of exprs(spec)) if (!cache.has(src)) cache.set(src, C.cx(src)); return { cache }; }
  function run(spec, env, opts) {
    const M = spec.model || {}, codes = [], out = {}, cache = (opts && opts.prepared && opts.prepared.cache) || new Map();
    const X = v => { if (typeof v === 'number') return v; if (typeof v !== 'string') return NaN; if (!cache.has(v)) cache.set(v, C.cx(v)); return cache.get(v)(env); };
    const XI = v => { const x = X(v); return Number.isFinite(x) && Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x; };
    let cur = 'model';
    const flag = code => { if (!codes.some(c => c.code === code && c.of === cur)) codes.push({ code, of: cur }); };
    const tun = tuner(M, X, flag);
    const sets = new Map();
    for (const s of M.sets || []) {
      if (!C.isObj(s)) continue; let ps = [];
      if (Array.isArray(s.notes)) { ps = s.notes.map(parsePitch); const iv2 = s.transpose ? parseIvl(s.transpose) : null; if (iv2) ps = ps.map(p => p && transpose(p, iv2)); }
      else if (Array.isArray(s.midi)) ps = s.midi.map(v => { const x = X(v); return Number.isFinite(x) ? fromMidi(x) : null; });
      else if (Array.isArray(s.pcs)) ps = s.pcs.map(v => { const x = XI(v); return isInt(x) ? fromMidi(60 + md(x, 12)) : null; });
      sets.set(s.id, ps.every(Boolean) ? ps : null);
    }
    const prog = new Map(); for (const p of M.progressions || []) if (C.isObj(p) && Array.isArray(p.chords)) { const cs = p.chords.map(c => c.map(parsePitch)); prog.set(p.id, cs.every(c => c.every(Boolean)) ? { chords: cs, key: parsePC(p.key || 'C'), mode: p.mode || 'major' } : null); }
    const rhy = new Map(); for (const r of M.rhythms || []) if (C.isObj(r)) {
      let pat = null;
      if (typeof r.pattern === 'string') pat = RX.pat.test(r.pattern) ? [...r.pattern].map(c => +(c === 'x')) : null;
      else { pat = bjorklund(XI(r.k), XI(r.n)); }
      const rot = r.rot === undefined ? 0 : XI(r.rot);
      if (pat && isInt(rot)) pat = pat.map((_, i) => pat[md(i + rot, pat.length)]); else pat = null;
      rhy.set(r.id, pat);
    }
    const tim = new Map(); for (const t of M.timbres || []) if (C.isObj(t)) tim.set(t.id, t);
    const note = (s, i) => { if (typeof s === 'string') return parsePitch(s); const S = sets.get(i && i.set); const k = XI(i && i.i); return S && isInt(k) && k >= 0 && k < S.length ? S[k] : null; };
    const pitchOf = q => (q.note !== undefined ? parsePitch(q.note) : note(null, q));
    const spectrumOf = (p, tb) => { const f = tun.freq(p); return partials(tb, X).map(x => ({ f: f * x.r, a: x.a })); };
    for (const o of Array.isArray(spec.outputs) ? spec.outputs : []) {
      if (!C.isObj(o) || typeof o.id !== 'string') continue;
      cur = o.id;
      try {
        out[o.id] = o.kind === 'scalar' ? scalar(o) : o.kind === 'series' ? series(o) : o.kind === 'scene' ? scene(o) : o.kind === 'sound' ? sound(o) : NaN;
        if (o.kind === 'scalar' && typeof out[o.id] === 'number' && !Number.isFinite(out[o.id])) flag('invalid');
      } catch (e) { out[o.id] = o.kind === 'scalar' ? NaN : o.kind === 'series' ? [] : o.kind === 'scene' ? { view: [-1, 1, -1, 1], items: [] } : { notes: [] }; flag('invalid'); }
    }
    return { out, codes };

    function scalar(q) {
      switch (q.of) {
        case 'freq': { const p = pitchOf(q); return p ? tun.freq(p) : NaN; }
        case 'midi': { const p = pitchOf(q); if (p && (p.midi < 0 || p.midi > 127)) flag('out-of-range'); return p ? p.midi : NaN; }
        case 'cents': { const a = parsePitch(q.from), b = parsePitch(q.to); return a && b ? CENTS(tun.freq(b) / tun.freq(a)) : NaN; }
        case 'ratioCents': { const r = X(q.ratio); return r > 0 ? CENTS(r) : NaN; }
        case 'monzo': return monzoCents(q.monzo.map(X));
        case 'comma': return q.name === 'holdrian' ? 1200 / 53 : monzoCents(COMMA[q.name]);
        case 'interval': { const a = parsePitch(q.from), b = parsePitch(q.to); if (!a || !b) return NaN; if (q.field === 'cents') return CENTS(tun.freq(b) / tun.freq(a)); const r = interval(a, b); if (Math.abs(r.quality) > 4) flag('approx'); return r[q.field]; }
        case 'chord': {
          const S = sets.get(q.set); if (!S) return NaN; const c = analyseChord(S);
          if (q.field === 'candidates') return c.length; if (!c.length) { flag('no-chord'); return NaN; }
          const b = S.reduce((a, x) => (x.midi < a.midi ? x : a));
          return { root: md(Math.round(c[0].root.midi), 12), quality: c[0].q, inversion: c[0].inv, bass: md(Math.round(b.midi), 12), figure: c[0].figure }[q.field];
        }
        case 'roman': { const S = sets.get(q.set), k = parsePC(q.key); if (!S || !k) return NaN; const r = roman(S, k, q.mode || 'major'); if (!r) { flag('no-chord'); return NaN; } return r[q.field]; }
        case 'pcset': {
          const S = sets.get(q.set); if (!S) return NaN; const pcs = S.map(p => md(Math.round(p.midi), 12)), u = [...new Set(pcs)];
          if (q.field === 'card') return u.length;
          if (q.field === 'prime') return maskOf(primeForm(u, false));
          if (q.field === 'rahnPrime') return maskOf(primeForm(u, true));
          if (q.field === 'differs') return +(maskOf(primeForm(u, false)) !== maskOf(primeForm(u, true)));
          if (q.field === 'invariance') return invariance(u);
          if (/^iv[1-6]$/.test(q.field)) return iv(u)[+q.field[2] - 1];
          if (q.field === 'complement') { const f = forteNumber(pcsOf(4095 & ~maskOf(u))); if (!f) flag('out-of-range'); return f ? f.num : NaN; }
          const f = forteNumber(u); if (!f) { flag('out-of-range'); return NaN; }
          return q.field === 'forte' ? f.num : +(f.z > 0);
        }
        case 'nrt': { const S = sets.get(q.set); if (!S) return NaN; const c = analyseChord(S)[0]; if (!c || c.q > 1) { flag('no-triad'); return NaN; } return nrt(md(Math.round(c.root.midi), 12), c.q === 0 ? 1 : 0, q.ops)[q.field]; }
        case 'beats': { const a = parsePitch(q.a), b = parsePitch(q.b), p = q.p === undefined ? 1 : X(q.p), r = q.q === undefined ? 1 : X(q.q); return a && b ? Math.abs(p * tun.freq(a) - r * tun.freq(b)) : NaN; }
        case 'roughness': { const S = sets.get(q.set); if (!S) return NaN; const tb = q.timbre ? tim.get(q.timbre) : null; return roughness([].concat(...S.map(p => spectrumOf(p, tb))), q.model || 'sethares'); }
        case 'partial': { const p = parsePitch(q.note), k = XI(q.k), pa = partials(tim.get(q.timbre), X); return p && isInt(k) && k >= 1 && k <= pa.length ? tun.freq(p) * pa[k - 1].r : NaN; }
        case 'tuning': { const i = XI(q.pc); if (!isInt(i) || i < 0 || i > 11) return NaN; const c = tun.degree(i); return q.field === 'dev' ? c - 100 * i : c; }
        case 'edo': { const n = XI(q.n), r = X(q.ratio); if (!isInt(n) || n < 1 || !(r > 0)) return NaN; const st = Math.round(n * log2(r)); return { steps: st, cents: 1200 * st / n, error: 1200 * st / n - CENTS(r) }[q.field]; }
        case 'scale': {
          const sc = scaleCents(q.name); if (q.field === 'size') return sc.length; const i = XI(q.i); if (!isInt(i) || i < 0 || i >= sc.length) return NaN;
          return q.field === 'cents' ? sc[i] : SCALE[q.name] ? md(7 * SCALE[q.name][i], 12) : sc[i] / 100;
        }
        case 'melakarta': { const s = melakarta(XI(q.n)), i = XI(q.i); return s && isInt(i) && i >= 0 && i < 7 ? s[i] : NaN; }
        case 'rhythm': { const p = rhy.get(q.rhythm); if (!p) return NaN; return { onsets: p.reduce((a, b) => a + b, 0), length: p.length, necklace: necklace(p), evenness: evenness(p) }[q.field]; }
        case 'onset': { const p = rhy.get(q.rhythm), i = XI(q.i); return p && isInt(i) ? p[md(i, p.length)] : NaN; }
        case 'duration': {
          const v = X(q.value), dots = q.dots === undefined ? 0 : XI(q.dots), tu = q.tuplet === undefined ? 1 : X(q.tuplet), ti = q.tupletIn === undefined ? 1 : X(q.tupletIn), bpm = X(q.bpm), beat = q.beat === undefined ? 0.25 : X(q.beat);
          if (!(v > 0 && bpm > 0 && beat > 0 && tu > 0 && ti > 0) || !isInt(dots) || dots < 0 || dots > 4) return NaN;
          return v * (2 - Math.pow(2, -dots)) * (ti / tu) / beat * 60000 / bpm;
        }
        case 'meter': { const m = RX.meter.exec(q.meter); if (!m) return NaN; const n = +m[1], d = +m[2], comp = n % 3 === 0 && n > 3; return { beats: comp ? n / 3 : n, beatUnit: comp ? 3 / d : 1 / d, compound: +comp, bar: n / d }[q.field]; }
        case 'vl': { const P = prog.get(q.progression); if (!P) return NaN; const F = voiceLeading(P.chords, P.key, P.mode); return q.rule === 'all' ? Object.values(F).reduce((s, a) => s + a.length, 0) : F[q.rule].length; }
        case 'resonator': return resonator(q, X);
      }
      return NaN;
    }
    function scaleCents(name) {
      if (MAQAM[name]) { flag('approx'); return MAQAM[name].slice(); }
      const t = tun.tonic, c0 = tun.centsAbs(t);
      return SCALE[name].map(o => { const L = FIF.indexOf(md(t.tpc + o + 1, 7) - 1), alt = (t.tpc + o - FIF[L]) / 7; return Math.max(0, md(tun.centsAbs(mk(L, alt, 4, 0)) - c0 + 1e-9, 1200) - 1e-9); });
    }
    function series(q) {
      const pick = (xs, ys) => C.thin(q.part === 'x' ? xs : ys, C.MAX_POINTS);
      switch (q.of) {
        case 'dissonance': {
          const p = q.note ? parsePitch(q.note) : parsePitch('C4'); if (!p) return [];
          const tb = q.timbre ? tim.get(q.timbre) : null, f0 = tun.freq(p), pa = partials(tb, X), a = q.from === undefined ? 1 : X(q.from), b = q.to === undefined ? 2 : X(q.to), n = q.points || 1001;
          if (!(a > 0 && b > a)) return [];
          const xs = [], ys = []; for (let i = 0; i < n; i++) { const r = a + (b - a) * i / (n - 1); xs.push(r); ys.push(roughness(pa.map(x => ({ f: f0 * x.r, a: x.a })).concat(pa.map(x => ({ f: f0 * r * x.r, a: x.a }))), q.model || 'sethares')); }
          return pick(xs, ys);
        }
        case 'spectrum': { const p = parsePitch(q.note); if (!p) return []; const s = spectrumOf(p, tim.get(q.timbre)); return pick(s.map(x => x.f), s.map(x => x.a)); }
        case 'waveform': { const pa = partials(tim.get(q.timbre), X), n = q.samples || 512, xs = [], ys = []; for (let i = 0; i < n; i++) { const x = i / (n - 1); xs.push(x); ys.push(pa.reduce((s, p) => s + p.a * Math.sin(2 * Math.PI * p.r * x), 0)); } return pick(xs, ys); }
        case 'tuning': { const xs = [], ys = []; for (let i = 0; i < 12; i++) { xs.push(i); ys.push(q.part === 'dev' ? tun.degree(i) - 100 * i : tun.degree(i)); } return q.part === 'x' ? xs : ys; }
        case 'scale': { const sc = scaleCents(q.name); return pick(sc.map((_, i) => i), sc); }
        case 'rhythm': { const p = rhy.get(q.rhythm); return p ? pick(p.map((_, i) => i), p) : []; }
        case 'harmonics': { const p = parsePitch(q.note); if (!p) return []; const f = tun.freq(p), n = q.n || 16, xs = [], ys = []; for (let k = 1; k <= n; k++) { xs.push(k); ys.push(k * f); } return pick(xs, ys); }
      }
      return [];
    }
    function scene(q) {
      const S = q.set ? sets.get(q.set) : null;
      if (q.of === 'keyboard') {
        const lo = parsePitch(q.from || 'C3'), hi = parsePitch(q.to || 'C6'); if (!lo || !hi || hi.midi <= lo.midi) return { view: [-1, 1, -1, 1], items: [] };
        const a = Math.round(lo.midi), b = Math.min(Math.round(hi.midi), a + 88), whites = []; for (let m = a; m <= b; m++) if (![1, 3, 6, 8, 10].includes(md(m, 12))) whites.push(m);
        const sc = C.scene([-0.5, whites.length + 0.5, -1.5, 5.6]), on = new Set((S || []).map(p => Math.round(p.midi)));
        const xOf = m => { const w = whites.filter(x => x < m).length; return [1, 3, 6, 8, 10].includes(md(m, 12)) ? w : w + 0.5; };
        whites.forEach((m, i) => sc.poly([i, 0, i + 1, 0, i + 1, 4, i, 4], { c: on.has(m) ? 'hi' : 'base', fill: on.has(m), closed: true }));
        for (let m = a; m <= b; m++) if ([1, 3, 6, 8, 10].includes(md(m, 12))) { const x = xOf(m); sc.poly([x - 0.3, 1.6, x + 0.3, 1.6, x + 0.3, 4, x - 0.3, 4], { c: on.has(m) ? 'hi' : 'muted', fill: true, closed: true }); }
        for (const p of S || []) { const x = xOf(Math.round(p.midi)); if (q.cents) sc.txt(x, 4.7, { v: Math.round(10 * (tun.centsAbs(p) - 100 * (Math.round(p.midi) - 60))) / 10, c: 'info', anchor: 'middle' }); }
        whites.forEach((m, i) => { if (md(m, 12) === 0) sc.txt(i + 0.5, -0.8, { s: 'C' + (m / 12 - 1), c: 'muted', anchor: 'middle' }); });
        return sc.done();
      }
      if (q.of === 'staff') {
        const P = q.progression ? prog.get(q.progression) : null, chords = P ? P.chords : S ? [S] : [];
        const clef = q.clef || 'grand', sc = C.scene([-1.5, Math.max(4, chords.length * 2 + 1), clef === 'grand' ? -14 : -3, clef === 'grand' ? 14 : 13]);
        const Y = p => p.step - (clef === 'bass' ? 18 : 30);     // y in staff steps: treble (and grand) E4 = 0, bass G2 = 0; lines at even y
        const ys = clef === 'grand' ? [0, 2, 4, 6, 8, -12, -10, -8, -6, -4] : [0, 2, 4, 6, 8];
        const W = chords.length * 2 + 1;
        for (const y of ys) sc.seg(-1, y, W, y, { c: 'muted' });
        chords.forEach((c, t) => c.forEach(p => {
          const x = t * 2 + 1, y = Y(p);
          for (let l = y <= -2 ? -2 : 10; (y <= -2 ? l >= y : l <= y) && Math.abs(l) < 30; l += y <= -2 ? -2 : 2) if (!(clef === 'grand' && l <= -2 && l >= -12)) sc.seg(x - 0.6, l, x + 0.6, l, { c: 'muted' });
          sc.circ(x, y, 0.5, { c: 'base', fill: true });
          const acc = { 1: '♯', 2: '𝄪', '-1': '♭', '-2': '𝄫', 3: '♯𝄪', '-3': '♭𝄫' }[p.alt]; if (acc) sc.txt(x - 1, y, { s: acc + (p.q > 0 ? '↑' : p.q < 0 ? '↓' : ''), c: 'base', anchor: 'middle' });
        }));
        if (P) { const F = voiceLeading(P.chords, P.key, P.mode); for (const [t, i, j] of F.parallel5.concat(F.parallel8)) for (const v of [i, j]) sc.seg(t * 2 + 1, Y(P.chords[t][v]), t * 2 + 3, Y(P.chords[t + 1][v]), { c: 'bad', w: 2 }); }
        return sc.done();
      }
      if (q.of === 'clock') {
        const R = q.rhythm ? rhy.get(q.rhythm) : null, n = R ? R.length : 12, on = R ? R.map((v, i) => (v ? i : -1)).filter(i => i >= 0) : [...new Set((S || []).map(p => md(Math.round(p.midi), 12)))].sort((a, b) => a - b);
        const sc = C.scene([-1.35, 1.35, -1.35, 1.35]), P2 = i => [Math.sin(2 * Math.PI * i / n), Math.cos(2 * Math.PI * i / n)];
        sc.circ(0, 0, 1, { c: 'muted' });
        for (let i = 0; i < n; i++) { const [x, y] = P2(i); sc.pt(x, y, { r: on.includes(i) ? 6 : 3, c: on.includes(i) ? 'hi' : 'muted' }); sc.txt(x * 1.2, y * 1.2, { v: i, c: 'muted', anchor: 'middle' }); }
        if (on.length >= 2) sc.poly([].concat(...on.map(P2)), { c: 'hi', closed: true });
        return sc.done();
      }
      if (q.of === 'circle') {
        const sc = C.scene([-1.4, 1.4, -1.4, 1.4]), on = new Set((S || []).map(p => md(Math.round(p.midi), 12))), names = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'A♭', 'E♭', 'B♭', 'F'];
        sc.circ(0, 0, 1, { c: 'muted' });
        for (let i = 0; i < 12; i++) { const x = Math.sin(2 * Math.PI * i / 12), y = Math.cos(2 * Math.PI * i / 12), pc = md(7 * i, 12); sc.pt(x, y, { r: on.has(pc) ? 7 : 3, c: on.has(pc) ? 'hi' : 'muted' }); sc.txt(1.22 * x, 1.22 * y, { s: names[i], c: on.has(pc) ? 'hi' : 'base', anchor: 'middle' }); }
        return sc.done();
      }
      if (q.of === 'tonnetz') {      // Euler's Tonnetz: fifths to the right, major thirds up-right (Cohn 1998)
        const sc = C.scene([-0.5, 7.5, -0.5, 5.2]), on = new Set((S || []).map(p => md(Math.round(p.midi), 12))), pos = (i, j) => [i + j * 0.5, j * 0.866];
        for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) {
          const pc = md(7 * (i - 2) + 4 * (j - 2), 12), [x, y] = pos(i, j);
          if (i < 6) { const pc2 = md(pc + 7, 12), [x2, y2] = pos(i + 1, j); sc.seg(x, y, x2, y2, { c: on.has(pc) && on.has(pc2) ? 'hi' : 'muted', w: on.has(pc) && on.has(pc2) ? 3 : 1 }); }
          if (j < 5) { const pc2 = md(pc + 4, 12), [x2, y2] = pos(i, j + 1); sc.seg(x, y, x2, y2, { c: on.has(pc) && on.has(pc2) ? 'hi' : 'muted', w: on.has(pc) && on.has(pc2) ? 3 : 1 }); }
          sc.pt(x, y, { r: on.has(pc) ? 7 : 3, c: on.has(pc) ? 'hi' : 'muted', v: pc });
        }
        return sc.done();
      }
      return { view: [-1, 1, -1, 1], items: [] };
    }
    function sound(q) {
      const tb = q.timbre ? tim.get(q.timbre) : null, pa = partials(tb, X), harmonic = pa.every(p => Math.abs(p.r - Math.round(p.r)) < 1e-9);
      const dur = q.dur === undefined ? 1 : X(q.dur), notes = [];
      if (!(dur > 0)) return { notes: [] };
      const add = (f, t, d, g) => { if (notes.length >= 512 || t > 60) return; if (harmonic) notes.push({ f, t, d, g }); else for (const p of pa) if (notes.length < 512) notes.push({ f: f * p.r, t, d, g: g * p.a / pa.length }); };
      if (q.rhythm) { const R = rhy.get(q.rhythm); if (!R) return { notes: [] }; const bpm = q.bpm === undefined ? 120 : X(q.bpm), st = 60 / bpm / 2; for (let rep = 0; rep < 4; rep++) R.forEach((v, i) => { if (v) add(i === 0 ? 1320 : 880, (rep * R.length + i) * st, Math.min(0.08, st * 0.8), i === 0 ? 0.9 : 0.6); }); }
      else if (q.progression) { const P = prog.get(q.progression); if (!P) return { notes: [] }; P.chords.forEach((c, t) => c.forEach(p => add(tun.freq(p), t * dur, dur * 0.95, 0.5 / c.length + 0.1))); }
      else { const S = sets.get(q.set); if (!S) return { notes: [] }; S.forEach((p, i) => { const f = tun.freq(p); if (!(f >= 20 && f <= 20000)) flag('unplayable'); add(f, q.mode === 'arpeggio' ? i * dur : 0, dur, q.mode === 'arpeggio' ? 0.6 : 0.5 / S.length + 0.1); }); }
      const r = { notes: notes.filter(n => n.f >= 20 && n.f <= 20000) };
      if (harmonic) { r.wave = 'sine'; const amps = new Array(Math.min(32, Math.max(1, ...pa.map(p => Math.round(p.r))))).fill(0); for (const p of pa) if (Math.round(p.r) <= amps.length) amps[Math.round(p.r) - 1] = p.a; r.partials = amps; }
      return r;
    }
  }
  /* the adapter: the core's makeEngine plus `sound` outputs (an object {notes, wave?, partials?}) */
  function makeEngine(def) {
    const base = C.makeEngine(def);
    const pick = (spec, res) => { const r = {}; for (const o of (spec && spec.outputs) || []) { if (!o || typeof o.id !== 'string') continue; const v = res && res.out ? res.out[o.id] : undefined;
      if (o.kind === 'series') r[o.id] = Array.isArray(v) ? C.thin(v, C.MAX_POINTS) : []; else if (o.kind === 'scene') r[o.id] = C.isObj(v) ? v : { view: [-1, 1, -1, 1], items: [] };
      else if (o.kind === 'sound') r[o.id] = C.isObj(v) ? v : { notes: [] }; else r[o.id] = typeof v === 'number' || typeof v === 'boolean' ? v : NaN; } return r; };
    const simEngine = { create(spec, opts) { const seed = ((opts && opts.seed) >>> 0) || 1, prepared = def.prepare ? def.prepare(spec) : null; let key = null, res = null;
      return { run(inp) { const env = {}; for (const [k, v] of Object.entries(inp || {})) if (typeof v === 'number' || typeof v === 'boolean') env[k] = v; const kk = JSON.stringify(env); if (kk !== key) { key = kk; try { res = def.run(spec, env, { seed, prepared }); } catch (e) { res = null; } } return pick(spec, res); } }; } };
    const engine = { ...base.engine, create: (spec, opts) => simEngine.create(spec, opts) };
    return { engine, simEngine };
  }
  const { engine, simEngine } = makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  const API = Object.freeze({
    table: { model: T.MODEL, outputs: T.OUT },   // the form of the activity author (46_lib_schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine, TABLES: T,
    parsePitch, parsePC, fromMidi, interval, parseIvl, transpose, tuner, normalForm, primeForm, iv, forteNumber, invariance, maskOf, pcsOf, analyseChord, roman, nrt, CHORDS,
    melakarta, bjorklund, necklace, evenness, partials, dPair, roughness, voiceLeading, resonator, monzoCents, COMMA, WELL, SCALE, MAQAM,
  });
  export default API;
  /* i18n-ignore-end */
