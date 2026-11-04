/* ===================== interactive activities — the radio engine rf@1 (docs/activities-dev/rf.md, docs/adr/001 D12, P6) =====================
   Radio link budgets and propagation for IoT benches of tier B (sim-spec@1): free-space path loss (Friis), two-ray ground,
   log-distance with seeded log-normal shadowing, Okumura–Hata (urban / large city / suburban / open, inside its range of
   validity), ITU-R P.1238 indoor (floors) plus wall losses, Fresnel zone and knife-edge diffraction (ITU-R P.526), antenna gains,
   cable losses, EIRP, the noise floor (kTB + NF), receiver sensitivity, link margin, the maximum range (bisection), RSSI against
   distance, bit and packet error rates against SNR (BPSK, QPSK, FSK, BLE, Wi-Fi rough, LoRa SF7–12), LoRa airtime (Semtech) and
   duty cycle, BLE and Wi-Fi airtime (rough). Pure JS, no DOM, no text for the learner: codes and numbers only.
   The link (noema.rf/v1) is described in docs/activities-dev/rf.md and tools/schemas/noema.rf.v1.schema.json. Python twin of
   check() / checkSpec(): tools/rf.py. Registering it is one line: ACT.registerEngine(NoemaRF.engine). Tests: node tests/rf.js. */
(function noemaRfModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this engine
  'use strict';
  const ID = 'rf@1', FORMAT = 'noema.rf/v1';
  const MAX_POINTS = 2000, MAX_WALLS = 32, MAX_BINDINGS = 24, MAX_ITER = 200;
  const C0 = 299792458, KB = 1.380649e-23, T0 = 290;
  const KT_DBM_HZ = 10 * Math.log10(KB * T0 * 1000);   // −173.98 dBm/Hz
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const log10 = Math.log10;
  function fail(code, extra) { const e = new Error('rf: ' + code); e.code = code; if (extra) Object.assign(e, extra); return e; }

  /** a number, or a string with an SI prefix ("868M", "125k") → number; anything else → NaN (as NoemaCircuit.num) */
  const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, G: 1e9 };
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$/.exec(v);
    return m ? parseFloat(m[1]) * (m[2] ? SI[m[2]] : 1) : NaN;
  }

  // ---- the formulas (SI: m, Hz, dB, dBm, s) ----
  /** free-space path loss (Friis): 20·log10(4π d f / c) */
  const fspl = (d, f) => 20 * log10(4 * Math.PI * d * f / C0);
  /** two-ray ground reflection: free space up to the crossover d_c = 4π·ht·hr/λ, then 40·log10 d − 20·log10(ht·hr) */
  const crossover = (f, ht, hr) => 4 * Math.PI * ht * hr * f / C0;
  const twoRay = (d, f, ht, hr) => (d < crossover(f, ht, hr) ? fspl(d, f) : 40 * log10(d) - 20 * log10(ht * hr));
  /** log-distance: PL(d0) (free space) + 10·n·log10(d/d0); free space below d0 */
  const logDistance = (d, f, n, d0) => (d <= d0 ? fspl(d, f) : fspl(d0, f) + 10 * n * log10(d / d0));
  /** Okumura–Hata (Hata 1980; COST 231 final report §4.4.1). f 150–1500 MHz, hb 30–200 m, hm 1–10 m, d 1–20 km; NaN outside */
  const HATA_ENVS = ['urban', 'urban-large', 'suburban', 'open'];
  const hataValid = (d, f, hb, hm) => f >= 150e6 && f <= 1500e6 && hb >= 30 && hb <= 200 && hm >= 1 && hm <= 10 && d >= 1000 && d <= 20000;
  function hata(d, f, hb, hm, env) {
    if (!hataValid(d, f, hb, hm)) return NaN;
    const F = f / 1e6, lf = log10(F), dk = d / 1000;
    const aSmall = (1.1 * lf - 0.7) * hm - (1.56 * lf - 0.8);
    const a = env !== 'urban-large' ? aSmall : F < 300 ? 8.29 * Math.pow(log10(1.54 * hm), 2) - 1.1 : 3.2 * Math.pow(log10(11.75 * hm), 2) - 4.97;
    const Lu = 69.55 + 26.16 * lf - 13.82 * log10(hb) - a + (44.9 - 6.55 * log10(hb)) * log10(dk);
    if (env === 'suburban') return Lu - 2 * Math.pow(log10(F / 28), 2) - 5.4;
    if (env === 'open') return Lu - 4.78 * lf * lf + 18.33 * lf - 40.94;
    return Lu;
  }
  /** ITU-R P.1238 indoor: 20·log10 f(MHz) + N·log10 d + Lf(floors) − 28. N and Lf from its Tables 2 and 3 (nearest band; a gap in
      a table takes the nearest band's value of the same environment). f 0.8–6 GHz, d ≥ 1 m; NaN outside */
  const INDOOR_ENVS = ['residential', 'office', 'commercial'];
  const P1238 = [   // band GHz: N by environment, Lf(n floors ≥ 1) by environment
    { g: 0.9, N: { residential: 28, office: 33, commercial: 20 }, Lf: { residential: n => 4 * n, office: n => [9, 19, 24][Math.min(n, 3) - 1] + 4 * Math.max(0, n - 3), commercial: n => 6 + 3 * (n - 1) } },
    { g: 1.9, N: { residential: 28, office: 30, commercial: 22 }, Lf: { residential: n => 4 * n, office: n => 15 + 4 * (n - 1), commercial: n => 6 + 3 * (n - 1) } },
    { g: 2.4, N: { residential: 28, office: 30, commercial: 22 }, Lf: { residential: n => 10 + 4 * (n - 1), office: n => 14 + 4 * (n - 1), commercial: n => 6 + 3 * (n - 1) } },
    { g: 5.2, N: { residential: 28, office: 31, commercial: 22 }, Lf: { residential: n => 13 + 4 * (n - 1), office: n => 16 + 4 * (n - 1), commercial: n => 8 + 3 * (n - 1) } },
  ];
  const indoorBand = f => P1238.reduce((b, x) => (Math.abs(Math.log(f / 1e9 / x.g)) < Math.abs(Math.log(f / 1e9 / b.g)) ? x : b));
  const indoorValid = (d, f) => f >= 0.8e9 && f <= 6e9 && d >= 1;
  function indoor(d, f, env, floors, N, lf) {
    if (!indoorValid(d, f)) return NaN;
    const b = indoorBand(f), e = INDOOR_ENVS.includes(env) ? env : 'office';
    const n = N !== undefined ? N : b.N[e], Lf = floors > 0 ? (lf !== undefined ? lf : b.Lf[e](floors)) : 0;
    return 20 * log10(f / 1e6) + n * log10(d) + Lf - 28;
  }
  /** walls (rough losses at 2.4 GHz, dB per wall; docs/activities-dev/rf.md) */
  const WALLS = { drywall: 3, wood: 4, glass: 2, brick: 8, concrete: 12, metal: 26 };
  /** the n-th Fresnel zone radius at d1 from one end and d2 from the other */
  const fresnelRadius = (d1, d2, f, n) => Math.sqrt((n || 1) * (C0 / f) * d1 * d2 / (d1 + d2));
  /** single knife-edge (ITU-R P.526-15 eq. 31): h above the line of sight (> 0 blocks) → loss dB */
  function knifeEdge(h, d1, d2, f) {
    const v = h * Math.sqrt(2 * (d1 + d2) / ((C0 / f) * d1 * d2));
    return v > -0.78 ? 6.9 + 20 * log10(Math.sqrt((v - 0.1) * (v - 0.1) + 1) + v - 0.1) : 0;
  }
  /** the receiver: noise floor kTB + NF (dBm) */
  const noiseFloor = (bw, nf) => KT_DBM_HZ + 10 * log10(bw) + (nf || 0);
  // error functions: erfc (Numerical Recipes erfcc, relative error < 1.2e-7), Q(x) = ½·erfc(x/√2)
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const Q = x => 0.5 * erfc(x / Math.SQRT2);
  /** LoRa demodulator SNR floors (Semtech SX1276/77/78/79 datasheet rev. 7, table 13), SF7…SF12, dB */
  const LORA_SNR = { 7: -7.5, 8: -10, 9: -12.5, 10: -15, 11: -17.5, 12: -20 };
  const WIFI_RATES = [6, 9, 12, 18, 24, 36, 48, 54];
  const qamM = rate => (rate <= 9 ? 2 : rate <= 18 ? 4 : rate <= 36 ? 16 : 64);
  function mqamBer(M, ebn0) {   // Gray-coded square M-QAM (M = 2: BPSK), uncoded
    if (M === 2) return Q(Math.sqrt(2 * ebn0));
    const k = Math.log2(M);
    return Math.min(0.5, (4 / k) * (1 - 1 / Math.sqrt(M)) * Q(Math.sqrt(3 * k * ebn0 / (M - 1))));
  }
  /** bit error rate. bpsk / qpsk: Q(√(2·Eb/N0)); fsk, ble (non-coherent binary FSK): ½·e^(−Eb/2N0); wifi: uncoded M-QAM of its rate;
      lora (Elshabrawy & Robert 2018, AWGN): ½·Q(√(2^(SF+1)·SNR) − √(1.386·SF + 1.154)), SNR in the channel bandwidth. Linear inputs. */
  function ber(mod, x, o) {
    if (mod === 'bpsk' || mod === 'qpsk') return Q(Math.sqrt(2 * x));
    if (mod === 'fsk' || mod === 'ble') return 0.5 * Math.exp(-x / 2);
    if (mod === 'wifi') return mqamBer(qamM((o && o.rate) || 6), x);
    if (mod === 'lora') { const sf = (o && o.sf) || 7; return 0.5 * Q(Math.sqrt(x * Math.pow(2, sf + 1)) - Math.sqrt(1.386 * sf + 1.154)); }
    return NaN;
  }
  const perOf = (b, bytes) => 1 - Math.pow(1 - Math.min(0.5, Math.max(0, b)), 8 * Math.max(1, bytes));
  /** LoRa time on air (Semtech SX1276 datasheet §4.1.1.6, AN1200.13): {symbol, preamble, payloadSymbols, airtime} s */
  function loraAirtime(o) {
    const sf = o.sf || 7, bw = o.bw || 125e3, cr = o.cr || 1, npre = o.preamble === undefined ? 8 : o.preamble;
    const ih = o.header === false ? 1 : 0, crc = o.crc === false ? 0 : 1, pl = o.payload === undefined ? 20 : o.payload;
    const ts = Math.pow(2, sf) / bw, de = o.ldro === undefined ? (ts > 0.016 ? 1 : 0) : (o.ldro ? 1 : 0);
    const nPay = 8 + Math.max(Math.ceil((8 * pl - 4 * sf + 28 + 16 * crc - 20 * ih) / (4 * (sf - 2 * de))) * (cr + 4), 0);
    const tPre = (npre + 4.25) * ts;
    return { symbol: ts, preamble: tPre, payloadSymbols: nPay, airtime: tPre + nPay * ts, ldro: de };
  }
  /** BLE (rough): one link-layer packet, preamble + access address + header + payload + CRC, at 1 or 2 Mb/s */
  const bleAirtime = (payload, phy) => (phy === '2M' ? (2 + 4 + 2 + payload + 3) * 8 / 2e6 : (1 + 4 + 2 + payload + 3) * 8 / 1e6);
  /** Wi-Fi 802.11a/g OFDM (rough): 20 µs preamble + 4 µs symbols of 16 service + 8·(payload + 36 MAC/LLC bytes) + 6 tail bits */
  const wifiAirtime = (payload, rate) => 20e-6 + 4e-6 * Math.ceil((16 + 8 * (payload + 36) + 6) / (4 * rate));

  // ---- seeded noise (as NoemaCircuit) ----
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function hash32(s, seed) { let h = (2166136261 ^ (seed >>> 0)) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const gauss = r => { const u = Math.max(r(), 1e-300), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // ---- the link format: a table the checker walks (the same table in tools/rf.py) ----
  const MODELS = ['fspl', 'two-ray', 'log-distance', 'hata', 'indoor'], MODS = ['bpsk', 'qpsk', 'fsk', 'lora', 'ble', 'wifi'];
  const WALL_T = { type: 'enum:' + Object.keys(WALLS).join('|'), loss: 'nonneg', count: 'int:1:50' };
  const TABLE = {
    format: 'const', f: 'pos!', d: 'pos!', fadeMargin: 'fin',
    tx: { $obj: { power: 'fin', gain: 'fin', cable: 'nonneg' } },
    rx: { $obj: { gain: 'fin', cable: 'nonneg', nf: 'nonneg', bw: 'pos', snr: 'fin', sensitivity: 'fin' } },
    path: { $obj: { model: 'enum:' + MODELS.join('|'), ht: 'pos', hr: 'pos', n: 'pos', d0: 'pos', sigma: 'nonneg',
      env: 'enum:' + HATA_ENVS.concat(INDOOR_ENVS).join('|'), floors: 'int:0:20', N: 'pos', lf: 'nonneg', extra: 'nonneg',
      walls: { $list: WALL_T, max: MAX_WALLS }, obstacle: { $obj: { d1: 'pos!', h: 'fin!' } } } },
    radio: { $obj: { mod: 'enum:' + MODS.join('|'), bitrate: 'pos', bw: 'pos', sf: 'int:7:12', cr: 'int:1:4', preamble: 'int:0:65535',
      header: 'bool', crc: 'bool', ldro: 'bool', payload: 'int:0:255', phy: 'enum:1M|2M', rate: 'pos', interval: 'pos', dutyLimit: 'unit' } },
    sweep: { $obj: { from: 'pos!', to: 'pos!', points: 'int:2:' + MAX_POINTS, scale: 'enum:log|lin' } },
    snrSweep: { $obj: { from: 'fin!', to: 'fin!', points: 'int:2:' + MAX_POINTS } },
  };
  /** the generic walk of a table: codes format, value, enum, size, unknown-field (a warning); the same messages as tools/rf.py */
  function checkNum(kind, v) {
    if (kind === 'bool') return typeof v === 'boolean';
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return typeof v === 'number' && Number.isInteger(v) && v >= +a && v <= +b; }
    if (kind.startsWith('enum:')) return typeof v === 'string' && kind.slice(5).split('|').includes(v);
    const x = num(v);
    return kind === 'pos' ? x > 0 : kind === 'nonneg' ? x >= 0 : kind === 'unit' ? x >= 0 && x <= 1 : Number.isFinite(x);
  }
  function kindMsg(kind) {
    if (kind === 'bool') return 'needs true or false';
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return `needs an integer from ${a} to ${b}`; }
    if (kind.startsWith('enum:')) return 'one of ' + kind.slice(5).split('|').join(', ');
    return { pos: 'needs a number > 0', nonneg: 'needs a number >= 0', unit: 'needs a number from 0 to 1', fin: 'needs a number' }[kind];
  }
  const join = (p, k) => (p ? p + '.' + k : k);
  function walk(o, T, path, E, W, format) {
    if (!isObj(o)) { E('format', path, 'not an object'); return; }
    for (const k of Object.keys(o)) if (!has(T, k) && k !== 'meta') W('unknown-field', join(path, k), 'ignored');
    for (const k of Object.keys(T)) {
      const kd = T[k], p = join(path, k), v = o[k];
      if (typeof kd === 'string') {
        const must = kd.endsWith('!'), kind = must ? kd.slice(0, -1) : kd;
        if (v === undefined) { if (must) E('value', p, 'missing'); continue; }
        if (kind === 'const') { if (v !== format) E('format', p, 'not ' + format); continue; }
        if (!checkNum(kind, v)) E(kind.startsWith('enum:') ? 'enum' : 'value', p, kindMsg(kind));
      } else if (v === undefined) continue;
      else if (kd.$obj) walk(v, kd.$obj, p, E, W, format);
      else if (!Array.isArray(v)) E('format', p, 'not an array');
      else if (v.length > kd.max) E('size', p, `more than ${kd.max} items`);
      else v.forEach((x, i) => walk(x, kd.$list, `${p}[${i}]`, E, W, format));
    }
  }
  /** the dotted paths of every numeric field (what a binding may set) */
  function numericFields(T, path, out) {
    for (const k of Object.keys(T)) {
      const kd = T[k];
      if (typeof kd === 'string') { const kind = kd.replace('!', ''); if (['pos', 'nonneg', 'fin', 'unit'].includes(kind) || kind.startsWith('int:')) out.push(join(path, k)); }
      else if (kd.$obj) numericFields(kd.$obj, join(path, k), out);
    }
    return out;
  }
  const NUM_FIELDS = numericFields(TABLE, '', []);

  // ---- defaults ----
  const g = (o, k, dflt) => (o && o[k] !== undefined ? (typeof o[k] === 'boolean' || (typeof o[k] === 'string' && !Number.isFinite(num(o[k]))) ? o[k] : num(o[k])) : dflt);
  function norm(link) {
    const t = link.tx || {}, r = link.rx || {}, p = link.path || {}, q = link.radio || {};
    const model = g(p, 'model', 'fspl');
    const mod = g(q, 'mod', 'lora'), sf = g(q, 'sf', 7), cr = g(q, 'cr', 1), phy = q.phy === '2M' ? '2M' : '1M', rate = g(q, 'rate', 6);
    const bitrate0 = g(q, 'bitrate', 9600);
    const chanBw = mod === 'lora' ? g(q, 'bw', 125e3) : mod === 'ble' ? (phy === '2M' ? 2e6 : 1e6) : mod === 'wifi' ? 20e6 : g(q, 'bw', mod === 'fsk' ? 2 * bitrate0 : mod === 'qpsk' ? bitrate0 / 2 : bitrate0);
    const bitrate = mod === 'lora' ? sf * chanBw / Math.pow(2, sf) * 4 / (4 + cr) : mod === 'ble' ? (phy === '2M' ? 2e6 : 1e6) : mod === 'wifi' ? rate * 1e6 : bitrate0;
    return {
      f: num(link.f), d: num(link.d), fadeMargin: g(link, 'fadeMargin', 0),
      tx: { power: g(t, 'power', 14), gain: g(t, 'gain', 0), cable: g(t, 'cable', 0) },
      rx: { gain: g(r, 'gain', 0), cable: g(r, 'cable', 0), nf: g(r, 'nf', 6), bw: g(r, 'bw', chanBw), snr: g(r, 'snr', undefined), sensitivity: g(r, 'sensitivity', undefined) },
      path: { model, ht: g(p, 'ht', model === 'hata' ? 30 : 10), hr: g(p, 'hr', 1.5), n: g(p, 'n', 3), d0: g(p, 'd0', 1), sigma: g(p, 'sigma', 0),
        env: g(p, 'env', model === 'indoor' ? 'office' : 'urban'), floors: g(p, 'floors', 0), N: g(p, 'N', undefined), lf: g(p, 'lf', undefined), extra: g(p, 'extra', 0),
        walls: Array.isArray(p.walls) ? p.walls : [], obstacle: isObj(p.obstacle) ? { d1: num(p.obstacle.d1), h: num(p.obstacle.h) } : null },
      radio: { mod, sf, cr, bw: chanBw, bitrate, preamble: g(q, 'preamble', 8), header: g(q, 'header', true), crc: g(q, 'crc', true), ldro: g(q, 'ldro', undefined),
        payload: g(q, 'payload', 20), phy, rate, interval: g(q, 'interval', undefined), dutyLimit: g(q, 'dutyLimit', 0.01) },
      sweep: link.sweep ? { from: num(link.sweep.from), to: num(link.sweep.to), points: g(link.sweep, 'points', 200), scale: g(link.sweep, 'scale', 'log') } : null,
      snrSweep: link.snrSweep ? { from: num(link.snrSweep.from), to: num(link.snrSweep.to), points: g(link.snrSweep, 'points', 81) } : null,
    };
  }

  /** check(link) → [{code, path, msg, level}] — what create() would refuse (errors) and fields it ignores (warnings) */
  function check(link) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    if (!isObj(link)) { E('format', '', 'link is not an object'); return P; }
    walk(link, TABLE, '', E, W, FORMAT);
    if (P.some(p => p.level === 'error')) return P;
    const L = norm(link), p = L.path, model = p.model;
    if (!(L.f >= 1e6 && L.f <= 1e11)) E('range', 'f', 'outside 1 MHz to 100 GHz');
    if (model === 'hata') {
      if (link.path.env !== undefined && !HATA_ENVS.includes(p.env)) E('enum', 'path.env', 'one of ' + HATA_ENVS.join(', '));
      if (!(L.f >= 150e6 && L.f <= 1500e6)) E('range', 'f', 'outside 150 to 1500 MHz (Okumura-Hata)');
      if (!(p.ht >= 30 && p.ht <= 200)) E('range', 'path.ht', 'outside 30 to 200 m (Okumura-Hata)');
      if (!(p.hr >= 1 && p.hr <= 10)) E('range', 'path.hr', 'outside 1 to 10 m (Okumura-Hata)');
      if (!(L.d >= 1000 && L.d <= 20000)) E('range', 'd', 'outside 1 to 20 km (Okumura-Hata)');
    }
    if (model === 'indoor') {
      if (link.path.env !== undefined && !INDOOR_ENVS.includes(p.env)) E('enum', 'path.env', 'one of ' + INDOOR_ENVS.join(', '));
      if (!(L.f >= 0.8e9 && L.f <= 6e9)) E('range', 'f', 'outside 0.8 to 6 GHz (ITU-R P.1238)');
      if (!(L.d >= 1)) E('range', 'd', 'below 1 m (ITU-R P.1238)');
    }
    if (p.obstacle && !(p.obstacle.d1 < L.d)) E('value', 'path.obstacle.d1', 'must be less than d');
    p.walls.forEach((w, i) => { if (w.type === undefined && w.loss === undefined) E('value', `path.walls[${i}]`, 'needs type or loss'); });
    const q = L.radio;
    if (q.mod === 'lora' && !(q.bw >= 7800 && q.bw <= 500000)) E('value', 'radio.bw', 'LoRa bandwidth from 7.8 to 500 kHz');
    if (q.mod === 'wifi' && !WIFI_RATES.includes(q.rate)) E('enum', 'radio.rate', 'one of ' + WIFI_RATES.join(', '));
    if (L.sweep && !(L.sweep.from < L.sweep.to)) E('value', 'sweep', 'from must be less than to');
    if (L.snrSweep && !(L.snrSweep.from < L.snrSweep.to)) E('value', 'snrSweep', 'from must be less than to');
    return P;
  }

  // ---- the outputs a spec may name (of) ----
  const SCALARS = ['lambda', 'eirp', 'pl', 'plMedian', 'shadow', 'prx', 'rssi', 'noiseFloor', 'snrReq', 'sensitivity', 'snr', 'ebn0', 'margin', 'range',
    'fresnel', 'clearance', 'diffraction', 'crossover', 'wallLoss', 'floorLoss', 'ber', 'per', 'bitrate', 'airtime', 'symbolTime', 'dutyCycle', 'minInterval', 'valid'];
  const SERIES = ['d', 'pl', 'plMedian', 'prx', 'prxMedian', 'margin', 'snrAxis', 'per', 'ber'];

  /** checkSpec(spec) → problems of a sim-spec's model {link, bindings} and outputs [{id, kind, of?}] (paths from the spec) */
  function checkSpec(spec) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('format', 'model', 'not an object'); return P; }
    for (const k of Object.keys(m)) if (!['link', 'bindings'].includes(k)) W('unknown-field', 'model.' + k, 'ignored');
    for (const p of check(m.link)) P.push({ ...p, path: p.path ? 'model.link.' + p.path : 'model.link' });
    if (m.bindings !== undefined) {
      if (!Array.isArray(m.bindings)) E('format', 'model.bindings', 'not an array');
      else if (m.bindings.length > MAX_BINDINGS) E('size', 'model.bindings', `more than ${MAX_BINDINGS} items`);
      else m.bindings.forEach((b, i) => {
        const at = `model.bindings[${i}]`;
        if (!isObj(b)) { E('binding', at, 'a binding is an object {field, expr}'); return; }
        if (typeof b.field !== 'string' || !NUM_FIELDS.includes(b.field)) E('binding', at + '.field', 'not a numeric field of the link');
        if (typeof b.expr !== 'string' || !b.expr.trim()) E('binding', at + '.expr', 'needs an expression');
      });
    }
    const outs = isObj(spec) ? spec.outputs : undefined;
    if (!Array.isArray(outs)) { E('format', 'outputs', 'not an array'); return P; }
    outs.forEach((o, i) => {
      const at = `outputs[${i}]`;
      if (!isObj(o)) { E('output', at, 'not an object'); return; }
      const of = o.of !== undefined ? o.of : o.id;
      if (o.kind === 'scalar') { if (!SCALARS.includes(of)) E('output', at + '.of', 'not a scalar of ' + ID); }
      else if (o.kind === 'series') { if (!SERIES.includes(of)) E('output', at + '.of', 'not a series of ' + ID); }
      else E('output', at + '.kind', 'scalar or series');
    });
    return P;
  }

  // ---- the simulator ----
  function reqEbn0(mod, o) {   // Eb/N0 (linear) where the BER is 1e-3 (bisection on a monotone curve)
    let lo = 1e-3, hi = 1e4;
    for (let i = 0; i < 100; i++) { const mid = Math.sqrt(lo * hi); if (ber(mod, mid, o) > 1e-3) lo = mid; else hi = mid; }
    return Math.sqrt(lo * hi);
  }
  function compileLink(link) {
    const L = norm(link), p = L.path, f = L.f, q = L.radio;
    const wallLoss = p.walls.reduce((s, w) => s + (w.loss !== undefined ? num(w.loss) : WALLS[w.type]) * (w.count === undefined ? 1 : w.count), 0);
    const floorLoss = p.model === 'indoor' && p.floors > 0 ? (p.lf !== undefined ? p.lf : indoorBand(f).Lf[INDOOR_ENVS.includes(p.env) ? p.env : 'office'](p.floors)) : 0;
    function base(d) {
      if (p.model === 'two-ray') return twoRay(d, f, p.ht, p.hr);
      if (p.model === 'log-distance') return logDistance(d, f, p.n, p.d0);
      if (p.model === 'hata') return hata(d, f, p.ht, p.hr, p.env);
      if (p.model === 'indoor') return indoor(d, f, p.env, p.floors, p.N, p.lf);
      return fspl(d, f);
    }
    const diffAt = d => (p.obstacle && p.obstacle.d1 < d ? knifeEdge(p.obstacle.h, p.obstacle.d1, d - p.obstacle.d1, f) : 0);
    /** the median path loss at d (no shadowing): the model + walls + knife edge + extra */
    const plMedian = d => base(d) + wallLoss + diffAt(d) + p.extra;
    const eirp = L.tx.power - L.tx.cable + L.tx.gain;
    const prxOf = pl => eirp - pl + L.rx.gain - L.rx.cable;
    const nfl = noiseFloor(L.rx.bw, L.rx.nf);
    const brOpts = { sf: q.sf, rate: q.rate };
    const snrReq = L.rx.snr !== undefined ? L.rx.snr : q.mod === 'lora' ? LORA_SNR[q.sf] : 10 * log10(reqEbn0(q.mod, brOpts)) - 10 * log10(L.rx.bw / q.bitrate);
    const sens = L.rx.sensitivity !== undefined ? L.rx.sensitivity : nfl + snrReq;
    const berAt = snr => (q.mod === 'lora' ? ber('lora', Math.pow(10, snr / 10), brOpts) : ber(q.mod, Math.pow(10, (snr + 10 * log10(L.rx.bw / q.bitrate)) / 10), brOpts));
    let air = NaN, ts = NaN;
    if (q.mod === 'lora') { const a = loraAirtime(q); air = a.airtime; ts = a.symbol; }
    else if (q.mod === 'ble') air = bleAirtime(q.payload, q.phy);
    else if (q.mod === 'wifi') air = wifiAirtime(q.payload, q.rate);
    else air = 8 * (q.preamble + q.payload) / q.bitrate;
    return { L, plMedian, prxOf, eirp, nfl, snrReq, sens, berAt, air, ts, wallLoss, floorLoss };
  }
  function bounds(L) {
    if (L.path.model === 'hata') return [1000, 20000];
    if (L.path.model === 'indoor') return [1, 1e5];
    return [0.01, 1e7];
  }
  /** the largest d where the median margin ≥ fadeMargin (bisection on log d); {range, code?} */
  function solveRange(k) {
    const [lo0, hi0] = bounds(k.L), ok = d => k.prxOf(k.plMedian(d)) - k.sens >= k.L.fadeMargin;
    if (!ok(lo0)) return { range: 0, code: 'range-none' };
    if (ok(hi0)) return { range: hi0, code: 'range-open' };
    let lo = Math.log(lo0), hi = Math.log(hi0);
    for (let i = 0; i < MAX_ITER && hi - lo > 1e-12; i++) { const mid = (lo + hi) / 2; if (ok(Math.exp(mid))) lo = mid; else hi = mid; }
    return { range: Math.exp(lo) };
  }

  /** create(link, {seed}) → {run(), at(d), range(), ...}; throws code 'invalid' (with .problems) on errors of check() */
  function create(link, opts) {
    opts = opts || {};
    const problems = check(link);   // (outside a model's range is not refused here: a slider may go there; the results are NaN, code 'range')
    if (problems.some(p => p.level === 'error' && p.code !== 'range')) throw fail('invalid', { problems });
    const k = compileLink(JSON.parse(JSON.stringify(link))), L = k.L, seed = (opts.seed === undefined ? 1 : num(opts.seed)) >>> 0;
    function at(d, shadow) {
      const plm = k.plMedian(d), pl = plm + (shadow || 0), prx = k.prxOf(pl), snr = prx - k.nfl;
      const b = k.berAt(snr);
      return { plMedian: plm, pl, prx, snr, margin: prx - k.sens, ber: b, per: perOf(b, L.radio.payload) };
    }
    function run() {
      const codes = [], d = L.d, p = L.path, q = L.radio;
      const shadow = p.sigma > 0 ? p.sigma * gauss(mulberry32(hash32('shadow', seed))) : 0;
      const a = at(d, shadow), rg = solveRange(k);
      if (rg.code) codes.push(rg.code);
      if (!Number.isFinite(a.plMedian)) codes.push('range');
      const o = p.obstacle, d1 = o && o.d1 < d ? o.d1 : d / 2, r1 = fresnelRadius(d1, d - d1, L.f, 1);
      const s = {
        lambda: C0 / L.f, eirp: k.eirp, pl: a.pl, plMedian: a.plMedian, shadow, prx: a.prx, rssi: a.prx, noiseFloor: k.nfl, snrReq: k.snrReq,
        sensitivity: k.sens, snr: a.snr, ebn0: a.snr + 10 * log10(L.rx.bw / q.bitrate), margin: a.margin, range: rg.range,
        fresnel: r1, clearance: o && o.d1 < d ? -o.h / r1 : NaN, diffraction: o && o.d1 < d ? knifeEdge(o.h, o.d1, d - o.d1, L.f) : 0,
        crossover: crossover(L.f, p.ht, p.hr), wallLoss: k.wallLoss, floorLoss: k.floorLoss, ber: a.ber, per: a.per, bitrate: q.bitrate,
        airtime: k.air, symbolTime: k.ts, dutyCycle: q.interval ? k.air / q.interval : NaN, minInterval: k.air / q.dutyLimit,
        valid: Number.isFinite(a.plMedian) ? 1 : 0,
      };
      // the distance sweep (shadowing: one seeded draw per point) and the error-rate curve
      const sw = L.sweep || (p.model === 'hata' ? { from: 1000, to: 20000, points: 200, scale: 'log' } : { from: Math.max(p.model === 'indoor' ? 1 : 0.1, d / 100), to: d * 10, points: 200, scale: 'log' });
      const n = sw.points, D = [], r = mulberry32(hash32('sweep', seed));
      for (let i = 0; i < n; i++) D.push(sw.scale === 'lin' ? sw.from + (sw.to - sw.from) * i / (n - 1) : sw.from * Math.pow(sw.to / sw.from, i / (n - 1)));
      const ser = { d: D, pl: [], plMedian: [], prx: [], prxMedian: [], margin: [] };
      for (const x of D) {
        const sh = p.sigma > 0 ? p.sigma * gauss(r) : 0, y = at(x, sh);
        ser.pl.push(y.pl); ser.plMedian.push(y.plMedian); ser.prx.push(y.prx); ser.prxMedian.push(k.prxOf(y.plMedian)); ser.margin.push(y.margin);
      }
      const ss = L.snrSweep || (q.mod === 'lora' ? { from: k.snrReq - 10, to: k.snrReq + 10, points: 81 } : { from: k.snrReq - 10, to: k.snrReq + 10, points: 81 });
      ser.snrAxis = []; ser.per = []; ser.ber = [];
      for (let i = 0; i < ss.points; i++) { const x = ss.from + (ss.to - ss.from) * i / (ss.points - 1), b = k.berAt(x); ser.snrAxis.push(x); ser.ber.push(b); ser.per.push(perOf(b, q.payload)); }
      return { scalars: s, series: ser, codes };
    }
    return Object.freeze({ id: ID, run, at: d => at(num(d), 0), range: () => solveRange(k) });
  }

  // ---- the sim-spec@1 adapter: model {link, bindings: [{field, expr}]}, outputs [{id, kind: scalar | series, of?}] ----
  function setPath(o, path, v) {
    const ks = path.split('.'); let x = o;
    for (let i = 0; i < ks.length - 1; i++) { if (!isObj(x[ks[i]])) x[ks[i]] = {}; x = x[ks[i]]; }
    x[ks[ks.length - 1]] = v;
  }
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  /** what the worker runs (self.noemaEngine): create(spec, {seed}) → {run(inputs) → {id: number | [numbers]}} */
  const simEngine = {
    create(spec, opts) {
      const model = (spec && spec.model) || {}, outs = (spec && spec.outputs) || [], seed = (opts && opts.seed) >>> 0;
      let key = null, res = null;
      return {
        run(inp) {
          inp = inp || {};
          const binds = inp.$bind || (model.bindings || []).map(b => [b.field, NAME_RE.test(b.expr) ? inp[b.expr] : NaN]);
          const kk = JSON.stringify(binds);
          if (kk !== key) {
            key = kk;
            const link = JSON.parse(JSON.stringify(model.link || {}));
            for (const [field, v] of binds) if (typeof v === 'number' && Number.isFinite(v)) setPath(link, field, v);
            try { res = create(link, { seed }).run(); } catch (e) { res = null; }
          }
          const r = {};
          for (const o of outs) {
            const of = o.of !== undefined ? o.of : o.id;
            if (o.kind === 'series') r[o.id] = res && res.series[of] ? res.series[of].slice(0, MAX_POINTS) : [];
            else r[o.id] = res && of in res.scalars ? res.scalars[of] : NaN;
          }
          return r;
        },
      };
    },
  };
  /** the registration (one line in the app: ACT.registerEngine(NoemaRF.engine)) — the same shape as circuit-mna@1's */
  const engine = {
    id: ID,
    check: spec => checkSpec(spec).filter(p => p.level === 'error').map(p => `${p.path}: ${p.msg}`),
    /** on the main thread: the bindings' expressions become numbers (the app's NoemaExpr), so the worker needs no evaluator */
    prepare(spec, compile) {
      const bs = ((spec && spec.model && spec.model.bindings) || []).map(b => [b.field, compile(b.expr)]);
      const ev = (fn, env) => { try { return +fn(env); } catch (e) { return NaN; } };
      return env => ({ ...env, $bind: bs.map(([fl, fn]) => [fl, ev(fn, env)]) });
    },
    create: (spec, opts) => simEngine.create(spec, opts),
  };
  /** the engine's own source, to run it in a Worker: it defines self.NoemaRF and self.noemaEngine */
  const source = () => '(' + noemaRfModule.toString() + ')(self); self.noemaEngine = self.NoemaRF.simEngine;';
  engine.workerSource = source();
  root.NoemaRF = Object.freeze({
    id: ID, format: FORMAT, limits: Object.freeze({ points: MAX_POINTS, walls: MAX_WALLS, bindings: MAX_BINDINGS, iterations: MAX_ITER }),
    MODELS: Object.freeze(MODELS.slice()), MODS: Object.freeze(MODS.slice()), SCALARS: Object.freeze(SCALARS.slice()), SERIES: Object.freeze(SERIES.slice()),
    NUM_FIELDS: Object.freeze(NUM_FIELDS.slice()), WALLS: Object.freeze({ ...WALLS }), LORA_SNR: Object.freeze({ ...LORA_SNR }),
    check, checkSpec, create, num, source, simEngine: Object.freeze(simEngine), engine: Object.freeze(engine),
    // the formulas, for other engines and tests
    fspl, twoRay, crossover, logDistance, hata, indoor, fresnelRadius, knifeEdge, noiseFloor, erfc, Q, ber, per: perOf, loraAirtime, bleAirtime, wifiAirtime,
    KT_DBM_HZ, C0,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
