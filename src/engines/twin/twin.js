/* ===================== interactive activities — the IoT device twin twin@1 (docs/INTERACTIVE_ENGINES.md §5, docs/adr/001 D12, P6) =====================
   A small "digital twin" of a battery-powered microcontroller node for tier B (sim-spec@1): a discrete-event simulator of a
   duty-cycled firmware (wake every T, sense, transmit every k-th wake, wait for an ack, retry), a battery (capacity, open-circuit
   voltage curve, internal resistance, self-discharge), power states (sleep / active / sense / radio TX / RX, currents in mA),
   sensors with seeded noise and drift, a radio link (log-distance path loss with seeded shadowing, LoRa / BLE / FSK error rates
   and airtime — the minimal formulas of rf@1, duplicated so the worker needs one file), brown-out resets below a voltage, and
   hidden FAULTS (as the circuit bench): sensor stuck / drifting, an aged battery, a detached antenna, a misconfigured wake period,
   a brown-out level set too high. Deterministic for a seed; bounded (sim.maxEvents → code 'budget'). Codes and numbers only.
   The device (noema.twin/v1): docs/INTERACTIVE_ENGINES.md §5, src/contracts/schemas/noema.twin.v1.schema.json. Python twin of check(),
   checkFaults(), checkSpec(): tools/twin.py. It is a plugin of the engine library: one line of src/engines/plugins.ts. Tests: node tests/twin.js. */
import NoemaSimKit from '../kernel/simkit.ts';
  /* i18n-ignore-start */   // code, not text: only codes and numbers leave this engine
  const ID = 'twin@1', FORMAT = 'noema.twin/v1';
  const MAX_SENSORS = 8, MAX_SAMPLES = 2000, MAX_EVENTS = 5000000, DEF_EVENTS = 1000000, MAX_LOG = 1000, MAX_TRACE = 4000, MAX_POINTS = 2000, MAX_BINDINGS = 24;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const log10 = Math.log10, ID_RE = /^[A-Za-z][A-Za-z0-9_\-]{0,31}$/;
  function fail(code, extra) { const e = new Error('twin: ' + code); e.code = code; if (extra) Object.assign(e, extra); return e; }
  const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, G: 1e9 };
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|[fpnuµmkKMG])?\s*$/.exec(v);
    return m ? parseFloat(m[1]) * (m[2] ? SI[m[2]] : 1) : NaN;
  }

  // ---- the minimal radio formulas of rf@1 (src/engines/rf/rf.js; tests/twin.js checks they agree) ----
  const C0 = 299792458, KT_DBM_HZ = 10 * Math.log10(1.380649e-23 * 290 * 1000);
  const fspl = (d, f) => 20 * log10(4 * Math.PI * d * f / C0);
  const logDistance = (d, f, n, d0) => (d <= d0 ? fspl(d, f) : fspl(d0, f) + 10 * n * log10(d / d0));
  const noiseFloor = (bw, nf) => KT_DBM_HZ + 10 * log10(bw) + (nf || 0);
  // error functions: erfc from the kernel (NoemaSimKit.erfc = Q(½, x²), accurate in the far tail), Q(x) = ½·erfc(x/√2);
  // FALLBACK without the kernel: Numerical Recipes erfcc (relative error < 1.2e-7)
  function erfc(x) {
    const K = kit(); if (K) return K.erfc(x);
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const Q = x => 0.5 * erfc(x / Math.SQRT2);
  const loraBer = (snrLin, sf) => 0.5 * Q(Math.sqrt(snrLin * Math.pow(2, sf + 1)) - Math.sqrt(1.386 * sf + 1.154));
  const fskBer = ebn0 => 0.5 * Math.exp(-ebn0 / 2);
  const perOf = (b, bytes) => 1 - Math.pow(1 - Math.min(0.5, Math.max(0, b)), 8 * Math.max(1, bytes));
  function loraAirtime(sf, bw, cr, pl) {
    const ts = Math.pow(2, sf) / bw, de = ts > 0.016 ? 1 : 0;
    return (8 + 4.25) * ts + (8 + Math.max(Math.ceil((8 * pl - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * (cr + 4), 0)) * ts;
  }
  const bleAirtime = pl => (1 + 4 + 2 + pl + 3) * 8 / 1e6;

  // ---- seeded noise ----
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function hash32(s, seed) { let h = (2166136261 ^ (seed >>> 0)) >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const gauss = r => (typeof r.normal === 'function' ? r.normal(0, 1) : boxMuller(r));
  const boxMuller = r => { const u = Math.max(r(), 1e-300), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  /** the simulation kernel (NoemaSimKit, src/engines/kernel/simkit.ts): its MRG32k3a streams, one per purpose (radio, each sensor, the network);
      normals by inversion (AS241), Poisson by inversion. FALLBACK without the kernel (marked): mulberry32 + Box–Muller */
  function kit() {
    return NoemaSimKit;
  }
  const streamOf = (name, seed) => { const K = kit(); return K ? K.stream(seed >>> 0, 'twin:' + name) : mulberry32(hash32(name, seed)); };

  // ---- batteries: open-circuit voltage per cell against state of charge (typical curves at room temperature, light load) ----
  const CHEMS = {
    'li-ion': { curve: [[0, 3.0], [0.05, 3.3], [0.1, 3.5], [0.2, 3.6], [0.4, 3.7], [0.6, 3.8], [0.8, 3.95], [0.9, 4.05], [1, 4.2]], r: 0.15, kc: 0.008 },
    lifepo4: { curve: [[0, 2.5], [0.05, 3.0], [0.1, 3.2], [0.2, 3.25], [0.5, 3.3], [0.8, 3.33], [0.95, 3.4], [1, 3.6]], r: 0.05, kc: 0.01 },
    alkaline: { curve: [[0, 0.9], [0.1, 1.05], [0.3, 1.15], [0.5, 1.25], [0.7, 1.3], [0.9, 1.4], [1, 1.55]], r: 0.2, kc: 0.015 },
    nimh: { curve: [[0, 1.0], [0.05, 1.1], [0.2, 1.2], [0.8, 1.25], [0.95, 1.35], [1, 1.4]], r: 0.05, kc: 0.01 },
  };
  const interp = (c, x) => { if (x <= c[0][0]) return c[0][1]; for (let i = 1; i < c.length; i++) if (x <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1); } return c[c.length - 1][1]; };

  // ---- the device format: a table the checker walks (the same table in tools/twin.py) ----
  const TECHS = ['lora', 'ble', 'fsk'];
  const TABLE = {
    format: 'const',
    battery: { req: true, $obj: { capacity: 'pos!', chem: 'enum:li-ion|lifepo4|alkaline|nimh|custom', cells: 'int:1:6', curve: { $list: { soc: 'unit!', v: 'pos!' }, max: 32 },
      selfDischarge: 'unit', rInt: 'nonneg', soc0: 'unit', cutoff: 'pos', tempCap: 'unit' } },
    power: { $obj: { sleep: 'nonneg', active: 'nonneg', sense: 'nonneg', tx: 'nonneg', rx: 'nonneg' } },
    schedule: { req: true, $obj: { period: 'pos!', sense: 'nonneg', txEvery: 'int:1:10000', ack: 'bool', rxWindow: 'nonneg', retries: 'int:0:8', boot: 'nonneg' } },
    sensors: { $list: { id: 'id!', base: 'fin', amp: 'fin', cycle: 'pos', noise: 'nonneg', drift: 'fin', current: 'nonneg', tempco: 'fin' }, max: MAX_SENSORS },
    radio: { $obj: { tech: 'enum:' + TECHS.join('|'), f: 'pos', power: 'fin', gain: 'fin', d: 'pos', n: 'pos', d0: 'pos', sigma: 'nonneg', extra: 'nonneg', nf: 'nonneg',
      sf: 'int:7:12', bw: 'pos', cr: 'int:1:4', payload: 'int:0:255', bitrate: 'pos', txTime: 'pos' } },
    brownout: { $obj: { v: 'nonneg', reset: 'nonneg' } },
    env: { $obj: { temp: 'fin', swing: 'nonneg', cycle: 'pos' } },                                                  // ambient temperature (°C): temp − swing·cos(2πt/cycle)
    clock: { $obj: { ppm: 'fin', tempco: 'fin', t0: 'fin', guard: 'nonneg', resync: 'nonneg' } },                   // the crystal: ppm + tempco·(T − t0)²; slots of ±guard s
    network: { $obj: { nodes: 'int:0:200', period: 'pos', airtime: 'pos', jitter: 'unit', capture: 'nonneg', spread: 'nonneg', offset: 'fin' } },   // other nodes on the channel
    sim: { req: true, $obj: { duration: 'pos!', samples: 'int:2:' + MAX_SAMPLES, trace: 'nonneg', maxEvents: 'int:1:' + MAX_EVENTS } },
  };
  function checkNum(kind, v) {
    if (kind === 'bool') return typeof v === 'boolean';
    if (kind === 'id') return typeof v === 'string' && ID_RE.test(v);
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return typeof v === 'number' && Number.isInteger(v) && v >= +a && v <= +b; }
    if (kind.startsWith('enum:')) return typeof v === 'string' && kind.slice(5).split('|').includes(v);
    const x = num(v);
    return kind === 'pos' ? x > 0 : kind === 'nonneg' ? x >= 0 : kind === 'unit' ? x >= 0 && x <= 1 : Number.isFinite(x);
  }
  function kindMsg(kind) {
    if (kind === 'bool') return 'needs true or false';
    if (kind === 'id') return 'needs a name (a letter, then letters, digits, _ or -)';
    if (kind.startsWith('int:')) { const [, a, b] = kind.split(':'); return `needs an integer from ${a} to ${b}`; }
    if (kind.startsWith('enum:')) return 'one of ' + kind.slice(5).split('|').join(', ');
    return { pos: 'needs a number > 0', nonneg: 'needs a number >= 0', unit: 'needs a number from 0 to 1', fin: 'needs a number' }[kind];
  }
  const join = (p, k) => (p ? p + '.' + k : k);
  function walk(o, T, path, E, W) {
    if (!isObj(o)) { E('format', path, 'not an object'); return; }
    for (const k of Object.keys(o)) if (!has(T, k) && k !== 'meta') W('unknown-field', join(path, k), 'ignored');
    for (const k of Object.keys(T)) {
      const kd = T[k], p = join(path, k), v = o[k];
      if (typeof kd === 'string') {
        const must = kd.endsWith('!'), kind = must ? kd.slice(0, -1) : kd;
        if (v === undefined) { if (must) E('value', p, 'missing'); continue; }
        if (kind === 'const') { if (v !== FORMAT) E('format', p, 'not ' + FORMAT); continue; }
        if (!checkNum(kind, v)) E(kind.startsWith('enum:') ? 'enum' : 'value', p, kindMsg(kind));
      } else if (v === undefined) { if (kd.req) E('value', p, 'missing'); }
      else if (kd.$obj) walk(v, kd.$obj, p, E, W);
      else if (!Array.isArray(v)) E('format', p, 'not an array');
      else if (v.length > kd.max) E('size', p, `more than ${kd.max} items`);
      else v.forEach((x, i) => walk(x, kd.$list, `${p}[${i}]`, E, W));
    }
  }
  function numericFields(T, path, out) {
    for (const k of Object.keys(T)) {
      const kd = T[k];
      if (typeof kd === 'string') { const kind = kd.replace('!', ''); if (['pos', 'nonneg', 'fin', 'unit'].includes(kind) || kind.startsWith('int:')) out.push(join(path, k)); }
      else if (kd.$obj) numericFields(kd.$obj, join(path, k), out);
    }
    return out;
  }
  const NUM_FIELDS = numericFields(TABLE, '', []);

  // ---- defaults: every number parsed ----
  const g = (o, k, d) => (o && o[k] !== undefined ? (typeof o[k] === 'boolean' || (typeof o[k] === 'string' && !Number.isFinite(num(o[k]))) ? o[k] : num(o[k])) : d);
  function norm(dev) {
    const b = dev.battery || {}, pw = dev.power || {}, s = dev.schedule || {}, r = dev.radio || {}, bo = dev.brownout || {}, sm = dev.sim || {};
    const chem = g(b, 'chem', 'li-ion'), cells = g(b, 'cells', 1);
    const curve = chem === 'custom' ? (Array.isArray(b.curve) ? b.curve.map(p => [num(p.soc), num(p.v)]) : []) : CHEMS[chem].curve;
    const active = g(pw, 'active', 5);
    return {
      battery: { capacity: num(b.capacity), chem, cells, curve, selfDischarge: g(b, 'selfDischarge', 0), soc0: g(b, 'soc0', 1),
        rInt: g(b, 'rInt', (CHEMS[chem] ? CHEMS[chem].r : 0.1) * cells), cutoff: g(b, 'cutoff', (curve.length ? curve[0][1] : 0) * cells), tempCap: g(b, 'tempCap', CHEMS[chem] ? CHEMS[chem].kc : 0.008) },
      power: { sleep: g(pw, 'sleep', 0.005), active, sense: g(pw, 'sense', active), tx: g(pw, 'tx', 40), rx: g(pw, 'rx', 12) },
      schedule: { period: num(s.period), sense: g(s, 'sense', 0.05), txEvery: g(s, 'txEvery', 1), ack: g(s, 'ack', false), rxWindow: g(s, 'rxWindow', 0.2), retries: g(s, 'retries', 0), boot: g(s, 'boot', 0.1) },
      sensors: (Array.isArray(dev.sensors) ? dev.sensors : []).map(x => ({ id: x.id, base: g(x, 'base', 20), amp: g(x, 'amp', 0), cycle: g(x, 'cycle', 86400), noise: g(x, 'noise', 0), drift: g(x, 'drift', 0), current: g(x, 'current', 0), tempco: g(x, 'tempco', 0) })),
      radio: { tech: g(r, 'tech', 'lora'), f: g(r, 'f', 868e6), power: g(r, 'power', 14), gain: g(r, 'gain', 0), d: g(r, 'd', 1000), n: g(r, 'n', 2.7), d0: g(r, 'd0', 1), sigma: g(r, 'sigma', 0),
        extra: g(r, 'extra', 0), nf: g(r, 'nf', 6), sf: g(r, 'sf', 7), bw: g(r, 'bw', 125e3), cr: g(r, 'cr', 1), payload: g(r, 'payload', 12), bitrate: g(r, 'bitrate', 50000), txTime: g(r, 'txTime', undefined) },
      brownout: { v: g(bo, 'v', 0), reset: g(bo, 'reset', 0) },
      env: { temp: g(dev.env, 'temp', 25), swing: g(dev.env, 'swing', 0), cycle: g(dev.env, 'cycle', 86400), on: isObj(dev.env) },
      clock: { ppm: g(dev.clock, 'ppm', 0), tempco: g(dev.clock, 'tempco', 0), t0: g(dev.clock, 't0', 25), guard: g(dev.clock, 'guard', 0), resync: g(dev.clock, 'resync', 0) },
      network: { nodes: g(dev.network, 'nodes', 0), period: g(dev.network, 'period', undefined), airtime: g(dev.network, 'airtime', undefined), jitter: g(dev.network, 'jitter', 1),
        capture: g(dev.network, 'capture', 6), spread: g(dev.network, 'spread', 6), offset: g(dev.network, 'offset', 0), sync: false },
      sim: { duration: num(sm.duration), samples: g(sm, 'samples', 200), trace: g(sm, 'trace', 0), maxEvents: g(sm, 'maxEvents', DEF_EVENTS) },
    };
  }

  /** check(device) → [{code, path, msg, level}] */
  function check(dev) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    if (!isObj(dev)) { E('format', '', 'device is not an object'); return P; }
    walk(dev, TABLE, '', E, W);
    if (P.some(p => p.level === 'error')) return P;
    const D = norm(dev), ids = new Set();
    (dev.sensors || []).forEach((x, i) => { if (ids.has(x.id)) E('dup-id', `sensors[${i}].id`, 'duplicate id ' + x.id); else ids.add(x.id); });
    if (D.battery.chem === 'custom') {
      const c = D.battery.curve;
      const okc = c.length >= 2 && c[0][0] === 0 && c[c.length - 1][0] === 1 && c.every((p, i) => !i || (p[0] > c[i - 1][0] && p[1] >= c[i - 1][1]));
      if (!okc) E('value', 'battery.curve', 'a custom battery needs a curve from soc 0 to 1, rising');
    } else if (dev.battery.curve !== undefined) W('unknown-field', 'battery.curve', 'ignored (chem is not custom)');
    if (!(D.schedule.sense < D.schedule.period)) E('value', 'schedule.sense', 'must be shorter than the period');
    if (D.radio.tech === 'lora' && !(D.radio.bw >= 7800 && D.radio.bw <= 500000)) E('value', 'radio.bw', 'LoRa bandwidth from 7.8 to 500 kHz');
    const est = Math.ceil(D.sim.duration / D.schedule.period) * (2 + (D.schedule.retries + 1) * (D.schedule.ack ? 2 : 1) / D.schedule.txEvery);
    if (est > D.sim.maxEvents) E('budget', 'sim.duration', 'more events than sim.maxEvents');
    return P;
  }

  /** checkFaults(device, faults) → [{code: 'fault', path, msg, level: 'error'}] (what create() would throw, as a list) */
  const FAULT_KINDS = ['sensor-stuck', 'sensor-drift', 'battery-ageing', 'antenna-detached', 'wake-period', 'brownout', 'clock-drift', 'sync-wake', 'busy-channel', 'sensor-tempco'];
  const FAULT_KEYS = ['kind', 'sensor', 'value', 'at', 'rate', 'factor', 'rInt', 'loss', 'period', 'v', 'ppm', 'nodes', 'coef'];
  const FAULT_NUM = { value: 'fin', at: 'nonneg', rate: 'fin', factor: 'pos', rInt: 'pos', loss: 'nonneg', period: 'pos', v: 'pos', ppm: 'fin', nodes: 'int:1:200', coef: 'fin' };
  function checkFaults(dev, faults) {
    const P = [], E = (path, msg) => { P.push({ code: 'fault', path, msg, level: 'error' }); };
    if (!Array.isArray(faults)) { E('', 'faults must be a list'); return P; }
    const sensors = new Set((isObj(dev) && Array.isArray(dev.sensors) ? dev.sensors : []).filter(isObj).map(x => x.id));
    faults.forEach((f, i) => {
      const at = `faults[${i}]`;
      if (!isObj(f)) { E(at, 'a fault is an object {kind, ...}'); return; }
      for (const k of Object.keys(f)) if (!FAULT_KEYS.includes(k)) E(`${at}.${k}`, 'unknown field');
      if (!FAULT_KINDS.includes(f.kind)) { E(at + '.kind', 'one of ' + FAULT_KINDS.join(', ')); return; }
      for (const k of FAULT_KEYS) if (has(FAULT_NUM, k) && f[k] !== undefined && !checkNum(FAULT_NUM[k], f[k])) E(`${at}.${k}`, kindMsg(FAULT_NUM[k]));
      if (f.kind.startsWith('sensor-') && !(typeof f.sensor === 'string' && sensors.has(f.sensor))) E(at + '.sensor', 'not a sensor of the device');
      if (f.kind === 'battery-ageing' && f.factor !== undefined && !(num(f.factor) <= 1)) E(at + '.factor', 'needs a number > 0 and <= 1');
    });
    return P;
  }

  // ---- outputs a spec may name ----
  const SCALARS = ['lifeAnalytic', 'lifeSim', 'iAvg', 'iAvgAnalytic', 'chargeUsed', 'socEnd', 'vEnd', 'vMin', 'wakes', 'sent', 'attempts', 'delivered', 'lost', 'deliveryRatio',
    'resets', 'dead', 'tDead', 'rssiMean', 'snrMean', 'per', 'airtime', 'activeFraction', 'readingMean', 'readingLast', 'readingErr',
    'tempMin', 'tempMax', 'tempMean', 'collisions', 'slotMisses', 'clockErrMax', 'ppmMean'];
  const SERIES = ['t', 'soc', 'v', 'vload', 'current', 'delivered', 'resets', 'rssi', 'rxT', 'reading', 'truth', 'traceT', 'traceI', 'eventT', 'eventCode', 'temp', 'clockErr'];
  const PER_SENSOR = ['readingMean', 'readingLast', 'readingErr', 'reading', 'truth'];
  const EVENT_CODES = { reset: 1, lost: 2, dead: 3, overrun: 4, collision: 5, 'slot-miss': 6 };

  function checkSpec(spec) {
    const P = [];
    const E = (code, path, msg) => { P.push({ code, path, msg, level: 'error' }); };
    const W = (code, path, msg) => { P.push({ code, path, msg, level: 'warning' }); };
    const m = isObj(spec) ? spec.model : undefined;
    if (!isObj(m)) { E('format', 'model', 'not an object'); return P; }
    for (const k of Object.keys(m)) if (!['device', 'bindings'].includes(k)) W('unknown-field', 'model.' + k, 'ignored');
    for (const p of check(m.device)) P.push({ ...p, path: p.path ? 'model.device.' + p.path : 'model.device' });
    if (m.bindings !== undefined) {
      if (!Array.isArray(m.bindings)) E('format', 'model.bindings', 'not an array');
      else if (m.bindings.length > MAX_BINDINGS) E('size', 'model.bindings', `more than ${MAX_BINDINGS} items`);
      else m.bindings.forEach((b, i) => {
        const at = `model.bindings[${i}]`;
        if (!isObj(b)) { E('binding', at, 'a binding is an object {field, expr}'); return; }
        if (typeof b.field !== 'string' || !NUM_FIELDS.includes(b.field)) E('binding', at + '.field', 'not a numeric field of the device');
        if (typeof b.expr !== 'string' || !b.expr.trim()) E('binding', at + '.expr', 'needs an expression');
      });
    }
    const sensors = isObj(m.device) && Array.isArray(m.device.sensors) ? m.device.sensors.filter(isObj).map(x => x.id) : [];
    const outs = isObj(spec) ? spec.outputs : undefined;
    if (!Array.isArray(outs)) { E('format', 'outputs', 'not an array'); return P; }
    outs.forEach((o, i) => {
      const at = `outputs[${i}]`;
      if (!isObj(o)) { E('output', at, 'not an object'); return; }
      const of = o.of !== undefined ? o.of : o.id;
      if (o.kind === 'scalar') { if (!SCALARS.includes(of)) { E('output', at + '.of', 'not a scalar of ' + ID); return; } }
      else if (o.kind === 'series') { if (!SERIES.includes(of)) { E('output', at + '.of', 'not a series of ' + ID); return; } }
      else { E('output', at + '.kind', 'scalar or series'); return; }
      if (PER_SENSOR.includes(of) ? !(o.sensor === undefined ? sensors.length : sensors.includes(o.sensor)) : o.sensor !== undefined) E('output', at + '.sensor', 'not a sensor of the device');
    });
    return P;
  }

  // ---- the simulator ----
  function compile(dev, faults) {
    const D = norm(dev), B = D.battery, R = D.radio, S = D.schedule;
    let capF = 1, rF = 1, antenna = 0;
    const sens = D.sensors.map(x => ({ ...x, stuck: null, fdrift: null }));
    for (const f of faults) {
      if (f.kind === 'battery-ageing') { capF *= f.factor !== undefined ? num(f.factor) : 0.5; rF *= f.rInt !== undefined ? num(f.rInt) : 3; }
      else if (f.kind === 'antenna-detached') antenna += f.loss !== undefined ? num(f.loss) : 20;
      else if (f.kind === 'wake-period') S.period = f.period !== undefined ? num(f.period) : S.period * (f.factor !== undefined ? num(f.factor) : 0.1);
      else if (f.kind === 'brownout') D.brownout.v = f.v !== undefined ? num(f.v) : 3.6;
      else if (f.kind === 'sensor-stuck') { const x = sens.find(s => s.id === f.sensor); x.stuck = { at: f.at !== undefined ? num(f.at) : 0, value: f.value !== undefined ? num(f.value) : undefined }; }
      else if (f.kind === 'sensor-drift') { const x = sens.find(s => s.id === f.sensor); x.fdrift = { at: f.at !== undefined ? num(f.at) : 0, rate: f.rate !== undefined ? num(f.rate) : 1 }; }
      else if (f.kind === 'sensor-tempco') { const x = sens.find(s => s.id === f.sensor); x.tempco += f.coef !== undefined ? num(f.coef) : 0.5; }
      else if (f.kind === 'clock-drift') D.clock.ppm += f.ppm !== undefined ? num(f.ppm) : 200;
      else if (f.kind === 'sync-wake') { D.network.sync = true; D.network.jitter = 0; if (!D.network.nodes) D.network.nodes = f.nodes !== undefined ? num(f.nodes) : 5; }
      else if (f.kind === 'busy-channel') D.network.nodes += f.nodes !== undefined ? num(f.nodes) : 50;
    }
    B.capacity *= capF; B.rInt *= rF;
    const air = R.txTime !== undefined ? R.txTime : R.tech === 'lora' ? loraAirtime(R.sf, R.bw, R.cr, R.payload) : R.tech === 'ble' ? bleAirtime(R.payload) : 8 * (R.payload + 8) / R.bitrate;
    const bw = R.tech === 'lora' ? R.bw : R.tech === 'ble' ? 1e6 : 2 * R.bitrate, bitrate = R.tech === 'ble' ? 1e6 : R.bitrate;
    const plMedian = logDistance(R.d, R.f, R.n, R.d0) + R.extra + antenna;
    const nfl = noiseFloor(bw, R.nf);
    const perAt = snr => perOf(R.tech === 'lora' ? loraBer(Math.pow(10, snr / 10), R.sf) : fskBer(Math.pow(10, (snr + 10 * log10(bw / bitrate)) / 10)), R.payload);
    return { D, B, R, S, P: D.power, sens, air, plMedian, nfl, perAt, prxMedian: R.power + R.gain - plMedian };
  }
  /** the analytic average current (mA) and battery life (s) of the schedule: capacity / average current, no losses, no resets */
  function analytic(k) {
    const { S, P, B, sens } = k, sc = P.sense + sens.reduce((a, s) => a + s.current, 0);
    const radioT = (k.air + (S.ack ? S.rxWindow : 0)) / S.txEvery, radioQ = (k.air * P.tx + (S.ack ? S.rxWindow * P.rx : 0)) / S.txEvery;
    const q = S.sense * sc + radioQ + Math.max(0, S.period - S.sense - radioT) * P.sleep;   // mA·s per wake
    const isd = B.selfDischarge * B.capacity / (30 * 24), iAvg = q / S.period + isd;
    return { iAvg, life: B.capacity * B.soc0 / iAvg * 3600 };
  }

  function simulate(k, seed, o) { const g = simGen(k, seed, o, null); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  /** the firmware's run as a generator: with a target {t} (the stepper) it pauses whenever the clock reaches target.t (a sleep is
      split there) and yields the run's state so far; without one it runs to the end */
  function* simGen(k, seed, o, target) {
    const { B, P, S, R, sens } = k, T = k.D.sim.duration, maxEv = k.D.sim.maxEvents, bor = k.D.brownout.v;
    const nb = k.D.sim.samples, W = T / nb, isd = B.selfDischarge * B.capacity / (30 * 24);
    const trFrom = o && o.traceFrom !== undefined ? o.traceFrom : 0, trTo = o && o.traceTo !== undefined ? o.traceTo : k.D.sim.trace;
    const rRadio = streamOf('radio', seed), rSens = sens.map(s => streamOf('sensor:' + s.id, seed)), rNet = streamOf('network', seed);
    const voc = soc => interp(B.curve, Math.max(0, soc)) * B.cells;
    // the environment: ambient temperature and what it does to the battery (capacity, internal resistance, self-discharge) and the sleep current
    const EN = k.D.env, CK = k.D.clock, NW = k.D.network;
    const tempAt = tt => (EN.swing ? EN.temp - EN.swing * Math.cos(2 * Math.PI * tt / EN.cycle) : EN.temp);
    let fc = 1, fr = 1, fsd = 1, fsl = 1, Tc = EN.temp, tMin = Infinity, tMax = -Infinity, tSum = 0, tN = 0;
    const envAt = tt => {
      if (!EN.on) return;
      Tc = tempAt(tt);
      fc = Math.min(1, Math.max(0.2, 1 - B.tempCap * Math.max(0, 25 - Tc))); fr = Math.max(0.5, Math.exp(0.035 * (25 - Tc)));
      fsd = Math.pow(2, (Tc - 25) / 10); fsl = Math.max(0.5, Math.pow(2, (Tc - 25) / 15));
    };
    envAt(0);
    let t = 0, q = 0, events = 0, dead = false, tDead = NaN, vMin = Infinity, logCount = 0, overrun = false; const counts = { reset: 0, lost: 0, overrun: 0, dead: 0 };
    const soc = () => B.soc0 - q / (fc === 1 ? B.capacity : B.capacity * fc);
    const bins = { q: new Float64Array(nb), vload: new Float64Array(nb).fill(Infinity), soc: new Float64Array(nb), v: new Float64Array(nb), del: new Float64Array(nb), res: new Float64Array(nb), rs: new Float64Array(nb), rn: new Float64Array(nb),
      temp: new Float64Array(nb), cerr: new Float64Array(nb) };
    // the crystal: its error accumulates between synchronisations; slots of ±guard are missed beyond it
    let cerr = 0, cerrMax = 0, ppmSum = 0, ppmN = 0, lastSync = 0, binErr = 0;
    const ppmAt = () => CK.ppm + CK.tempco * (Tc - CK.t0) * (Tc - CK.t0);
    // the other nodes on the channel (ALOHA): random access, or fixed phases (all in step after a power cut: sync-wake)
    const pO = NW.period !== undefined ? NW.period : S.period * S.txEvery, aO = NW.airtime !== undefined ? NW.airtime : k.air;
    const phases = NW.nodes > 0 && (NW.sync || NW.jitter < 1) ? Array.from({ length: NW.nodes }, () => (NW.sync ? S.sense : rNet() * pO)) : null;
    function collided(tt, prx) {
      if (!(NW.nodes > 0)) return false;
      const hit = () => k.prxMedian + NW.offset + (NW.spread > 0 ? NW.spread * gauss(rNet) : 0) > prx - NW.capture;
      if (!phases) {   // random access: Poisson arrivals in the window where another packet would overlap ours
        const mean = NW.nodes * (k.air + aO) / pO;
        let others; if (typeof rNet.poisson === 'function') others = Math.min(999, rNet.poisson(mean));
        else { const L = Math.exp(-mean); let p = 1, n = 0; do { n++; p *= rNet(); } while (p > L && n < 1000); others = n - 1; }
        for (let i = 0; i < others; i++) if (hit()) return true;
        return false;
      }
      for (const ph of phases) {
        let d = ((tt - ph) % pO + pO) % pO; if (d > pO / 2) d -= pO;
        if (NW.jitter > 0) d += NW.jitter * pO * (rNet() - 0.5);
        if (d > -aO && d < k.air && hit()) return true;
      }
      return false;
    }
    let bi = 0;
    const log = [], trace = [[], []], rx = { t: [], rssi: [], snr: [], reading: sens.map(() => []), truth: sens.map(() => []) };
    const cnt = { wakes: 0, sent: 0, attempts: 0, delivered: 0, lost: 0, resets: 0, active: 0, collisions: 0, slotMisses: 0 };
    const ev = (code, extra) => { logCount++; counts[code] = (counts[code] || 0) + 1; if (log.length < MAX_LOG) log.push({ t, code, ...extra }); };
    const closeBin = () => { bins.soc[bi] = soc(); bins.v[bi] = voc(soc()); bins.temp[bi] = Tc; bins.cerr[bi] = binErr; binErr = 0; bi++; };
    /** a segment of dur s at I mA; false when the loaded voltage is below the brown-out level (nothing is drawn: the reset follows) */
    function seg(dur, I, checkBor) {
      if (dead || t >= T) return true;
      if (++events > maxEv) throw fail('budget', { events });
      if (EN.on) { envAt(t); if (I === P.sleep) I *= fsl; }
      const vl = voc(soc()) - I * (fr === 1 ? B.rInt : B.rInt * fr) / 1000, sdNow = fsd === 1 ? isd : isd * fsd;
      if (checkBor && bor > 0 && vl < bor) return false;
      if (vl < vMin) vMin = vl;
      dur = Math.min(dur, T - t);
      if (t < trTo && t + dur > trFrom && trace[0].length < MAX_TRACE) { trace[0].push(t, t + dur); trace[1].push(I, I); }
      let rest = dur;
      while (rest > 0 && bi < nb) {
        const edge = (bi + 1) * W, part = Math.min(rest, edge - t);
        q += (I + sdNow) * part / 3600; bins.q[bi] += (I + sdNow) * part / 3600; if (vl < bins.vload[bi]) bins.vload[bi] = vl;
        t += part; rest -= part;
        if (t >= edge - 1e-9 * W) closeBin();
      }
      if (rest > 0) { q += (I + sdNow) * rest / 3600; t += rest; }
      if (I > P.sleep) cnt.active += dur;
      if (soc() <= 0 || voc(soc()) < B.cutoff) { dead = true; tDead = t; ev('dead', { soc: soc() }); }
      return true;
    }
    function reading(i, tt) {
      const s = sens[i], truth = s.base + s.amp * Math.sin(2 * Math.PI * tt / s.cycle);
      let v = truth + s.drift * tt / 86400 + s.noise * gauss(rSens[i]);
      if (s.tempco) v += s.tempco * (tempAt(tt) - 25);
      if (s.fdrift && tt >= s.fdrift.at) v += s.fdrift.rate * (tt - s.fdrift.at) / 86400;
      if (s.stuck && tt >= s.stuck.at) { if (s.stuck.value === undefined) s.stuck.value = s.base + s.amp * Math.sin(2 * Math.PI * s.stuck.at / s.cycle); v = s.stuck.value; }
      return [v, truth];
    }
    function reset() {
      cnt.resets++; if (bi < nb) bins.res[bi]++;
      ev('reset', { v: voc(soc()) });
      seg(S.boot + k.D.brownout.reset, P.active, false);
    }
    const senseI = P.sense + sens.reduce((a, s) => a + s.current, 0);
    let wakeAt = 0, n = 0;
    const now = () => ({ T: t, t, q, dead, tDead, vMin, log, logCount, counts, trace, rx, cnt, bins, W, vNow: voc(soc()), socNow: soc(), tempNow: Tc,
      env: { min: tN ? tMin : EN.temp, max: tN ? tMax : EN.temp, mean: tN ? tSum / tN : EN.temp }, clock: { errMax: cerrMax, ppmMean: ppmN ? ppmSum / ppmN : CK.ppm } });
    while (!dead && t < T) {
      while (target && t >= target.t && !dead && t < T) yield now();   // the stepper: the clock has reached the target
      if (wakeAt > t) {
        const vs = voc(soc()) - P.sleep * B.rInt / 1000;
        if (bor > 0 && vs < bor) { dead = true; tDead = t; ev('dead', { soc: soc(), bor: 1 }); break; }
        while (target && target.t < wakeAt && !dead && t < T) { if (target.t > t) seg(target.t - t, P.sleep, false); yield now(); }   // the stepper: a pause inside the sleep
        if (dead || t >= T) break;
        seg(wakeAt - t, P.sleep, false);
        if (dead || t >= T) break;
      }
      const start = t; cnt.wakes++;
      if (EN.on) { envAt(t); tMin = Math.min(tMin, Tc); tMax = Math.max(tMax, Tc); tSum += Tc; tN++; }
      const ppm = ppmAt(); ppmSum += ppm; ppmN++;
      if (CK.resync > 0 && t - lastSync >= CK.resync) { cerr = 0; lastSync = t; }
      const rd = sens.map((_, i) => reading(i, t));
      if (!seg(S.sense, senseI, true)) { reset(); n = 0; wakeAt = t + S.period; continue; }
      n++;
      let brown = false;
      if (n % S.txEvery === 0) {
        cnt.sent++; let got = false;
        for (let a = 0; a <= S.retries && !dead && t < T; a++) {
          cnt.attempts++;
          if (!seg(k.air, P.tx, true)) { brown = true; break; }
          const prx = k.prxMedian + (R.sigma > 0 ? R.sigma * gauss(rRadio) : 0), snr = prx - k.nfl, per = k.perAt(snr);
          let ok = rRadio() >= per;
          if (CK.guard > 0 && Math.abs(cerr) > CK.guard) { ok = false; cnt.slotMisses++; ev('slot-miss', { err: cerr }); }
          else if (collided(t - k.air, prx)) { if (ok) { cnt.collisions++; ev('collision'); } ok = false; }
          if (S.ack && !seg(S.rxWindow, P.rx, true)) { brown = true; break; }
          if (ok) {
            got = true; cnt.delivered++;
            if (S.ack) { cerr = 0; lastSync = t; }   // the ack carries the network's time
            rx.t.push(t); rx.rssi.push(prx); rx.snr.push(snr); rd.forEach((x, i) => { rx.reading[i].push(x[0]); rx.truth[i].push(x[1]); });
            if (bi < nb) { bins.del[bi]++; bins.rs[bi] += prx; bins.rn[bi]++; }
            break;
          }
          if (!S.ack) break;
        }
        if (!got) { cnt.lost++; if (S.ack && !brown) ev('lost'); }
      }
      if (brown) { reset(); n = 0; wakeAt = t + S.period; continue; }
      wakeAt = start + (ppm ? S.period * (1 + ppm * 1e-6) : S.period);
      if (ppm) { cerr += S.period * ppm * 1e-6; const ae = Math.abs(cerr); if (ae > cerrMax) cerrMax = ae; if (ae > binErr) binErr = ae; }
      if (wakeAt < t) { if (!overrun) ev('overrun'); overrun = true; wakeAt = t; }
    }
    while (bi < nb) closeBin();
    if (target) { for (;;) yield now(); }   // stepped past the end: the state stays
    return { T, t, q, dead, tDead, vMin, log, logCount, counts, trace, rx, cnt, bins, W,
      env: { min: tN ? tMin : EN.temp, max: tN ? tMax : EN.temp, mean: tN ? tSum / tN : EN.temp }, clock: { errMax: cerrMax, ppmMean: ppmN ? ppmSum / ppmN : CK.ppm } };
  }

  function results(k, r) {
    const an = analytic(k), c = r.cnt, nb = r.bins.q.length, T = r.dead ? r.tDead : r.T;
    const iAvg = r.q / (T / 3600);
    const s = {
      lifeAnalytic: an.life, iAvgAnalytic: an.iAvg, iAvg, chargeUsed: r.q,
      lifeSim: r.dead ? r.tDead : k.B.capacity * k.B.soc0 / iAvg * 3600,
      socEnd: k.B.soc0 - r.q / k.B.capacity, vEnd: r.bins.v[nb - 1], vMin: r.vMin,
      wakes: c.wakes, sent: c.sent, attempts: c.attempts, delivered: c.delivered, lost: c.lost, deliveryRatio: c.sent ? c.delivered / c.sent : NaN,
      resets: c.resets, dead: r.dead ? 1 : 0, tDead: r.tDead,
      rssiMean: r.rx.rssi.length ? r.rx.rssi.reduce((a, b) => a + b, 0) / r.rx.rssi.length : NaN,
      snrMean: r.rx.snr.length ? r.rx.snr.reduce((a, b) => a + b, 0) / r.rx.snr.length : NaN,
      per: k.perAt(k.prxMedian - k.nfl), airtime: k.air, activeFraction: c.active / T,
      tempMin: r.env.min, tempMax: r.env.max, tempMean: r.env.mean, collisions: c.collisions, slotMisses: c.slotMisses, clockErrMax: r.clock.errMax, ppmMean: r.clock.ppmMean,
    };
    const perSensor = k.sens.map((_, i) => {
      const v = r.rx.reading[i], tr = r.rx.truth[i];
      return { readingMean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN, readingLast: v.length ? v[v.length - 1] : NaN,
        readingErr: v.length ? v.reduce((a, b, j) => a + Math.abs(b - tr[j]), 0) / v.length : NaN };
    });
    let cd = 0, cr = 0;
    const series = {
      t: Array.from({ length: nb }, (_, i) => (i + 1) * r.W), soc: Array.from(r.bins.soc), v: Array.from(r.bins.v),
      vload: Array.from(r.bins.vload, x => (Number.isFinite(x) ? x : NaN)), current: Array.from(r.bins.q, x => x / (r.W / 3600)),
      delivered: Array.from(r.bins.del, x => (cd += x)), resets: Array.from(r.bins.res, x => (cr += x)),
      rssi: Array.from(r.bins.rs, (x, i) => (r.bins.rn[i] ? x / r.bins.rn[i] : NaN)),
      rxT: r.rx.t, traceT: r.trace[0], traceI: r.trace[1], eventT: r.log.map(e => e.t), eventCode: r.log.map(e => EVENT_CODES[e.code]),
      temp: Array.from(r.bins.temp), clockErr: Array.from(r.bins.cerr),
    };
    return { scalars: s, perSensor, series, readings: r.rx.reading, truth: r.rx.truth, log: r.log, logCount: r.logCount, counts: r.counts, sensors: k.sens.map(x => x.id) };
  }
  const thin = (a, n) => { if (a.length <= n) return Array.from(a); const kk = (a.length - 1) / (n - 1), out = []; for (let i = 0; i < n; i++) out.push(a[Math.round(i * kk)]); return out; };

  /** create(device, {seed, faults}) → {run(o?) → {scalars, perSensor, series, readings, truth, log}, measure(probe), analytic()} */
  function create(dev, opts) {
    opts = opts || {};
    const problems = check(dev);
    if (problems.some(p => p.level === 'error')) throw fail('invalid', { problems });
    if (opts.faults !== undefined && checkFaults(dev, opts.faults).length) throw fail('fault', { problems: checkFaults(dev, opts.faults) });
    const faults = JSON.parse(JSON.stringify(opts.faults || [])), seed = (opts.seed === undefined ? 1 : num(opts.seed)) >>> 0;
    const devc = JSON.parse(JSON.stringify(dev));
    let cache = null;
    const run = o => { if (!o && cache) return cache; const k = compile(JSON.parse(JSON.stringify(devc)), faults), r = results(k, simulate(k, seed, o)); if (!o) cache = r; return r; };
    function measure(probe) {
      if (!isObj(probe)) throw fail('probe');
      if (probe.kind === 'V') {
        const r = run(), a = probe.a === undefined ? 'vbat' : probe.a;
        if (a !== 'vbat' && a !== 'vload') throw fail('unknown-node', { ref: a });
        if (probe.at === undefined) return { kind: 'V', value: a === 'vbat' ? r.scalars.vEnd : r.scalars.vMin };
        const i = Math.min(r.series.t.length - 1, Math.max(0, Math.ceil(num(probe.at) / (r.series.t[0] || 1)) - 1));
        return { kind: 'V', value: a === 'vbat' ? r.series.v[i] : r.series.vload[i] };
      }
      if (probe.kind === 'I') return { kind: 'I', value: run().scalars.iAvg / 1000 };   // A, as a meter reads
      if (probe.kind === 'scope') {
        const node = probe.node === undefined ? 'i' : probe.node;
        if (node !== 'i') throw fail('unknown-node', { ref: node });
        const t0 = probe.tStart === undefined ? 0 : num(probe.tStart), t1 = num(probe.tEnd);
        if (!(t1 > t0)) throw fail('bad-args');
        const r = run({ traceFrom: t0, traceTo: t1 }), tt = [], vv = [];
        r.series.traceT.forEach((x, i) => { if (x >= t0 && x <= t1) { tt.push(x); vv.push(r.series.traceI[i] / 1000); } });
        let mn = Infinity, mx = -Infinity, area = 0;
        for (let i = 0; i < vv.length; i++) { mn = Math.min(mn, vv[i]); mx = Math.max(mx, vv[i]); if (i % 2) area += vv[i] * (tt[i] - tt[i - 1]); }
        return { kind: 'scope', unit: 'A', t: thin(tt, MAX_POINTS), v: thin(vv, MAX_POINTS), stats: { pp: mx - mn, mean: tt.length ? area / (t1 - t0) : NaN, min: mn, max: mx, freq: r.scalars.wakes > 1 ? 1 / compile(JSON.parse(JSON.stringify(devc)), faults).S.period : NaN } };
      }
      if (probe.kind === 'log') { const r = run(); return { kind: 'log', events: r.log.slice(), count: r.logCount, counts: { ...r.counts } }; }   // counts: the whole run's, per code (events: the first limits.log)
      if (probe.kind === 'rssi') { const r = run(); return { kind: 'rssi', value: r.scalars.rssiMean, n: r.scalars.delivered }; }
      if (probe.kind === 'T') { const r = run(), s = r.scalars; return { kind: 'T', value: r.series.temp[r.series.temp.length - 1], min: s.tempMin, max: s.tempMax, unit: '°C' }; }   // the device's thermometer
      if (probe.kind === 'clock') { const r = run(), s = r.scalars; return { kind: 'clock', value: s.ppmMean, err: s.clockErrMax }; }   // the clock against a reference: ppm, worst error
      throw fail('probe');
    }
    /** the stepper's run: a paused simulation (a generator: its state cannot be copied) and its clock target */
    function stepGen() { const k = compile(JSON.parse(JSON.stringify(devc)), faults), target = { t: 0 }; return { k, target, g: simGen(k, seed, { traceTo: 0 }, target) }; }
    return Object.freeze({ id: ID, run, measure, stepGen, analytic: () => analytic(compile(JSON.parse(JSON.stringify(devc)), faults)) });
  }

  // ---- the sim-spec@1 adapter: model {device, bindings: [{field, expr}]}, outputs [{id, kind, of?, sensor?}] ----
  function setPath(o, path, v) {
    const ks = path.split('.'); let x = o;
    for (let i = 0; i < ks.length - 1; i++) { if (!isObj(x[ks[i]])) x[ks[i]] = {}; x = x[ks[i]]; }
    x[ks[ks.length - 1]] = v;
  }
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const simEngine = {
    create(spec, opts) {
      const model = (spec && spec.model) || {}, outs = (spec && spec.outputs) || [], seed = (opts && opts.seed) >>> 0, faults = (opts && opts.faults) || [];
      let key = null, sim = null, ST = null;
      function simFor(inp) {
        const binds = inp.$bind || (model.bindings || []).map(b => [b.field, NAME_RE.test(b.expr) ? inp[b.expr] : NaN]), kk = JSON.stringify(binds);
        if (kk !== key) {
          key = kk;
          const dev = JSON.parse(JSON.stringify(model.device || {}));
          for (const [field, v] of binds) if (typeof v === 'number' && Number.isFinite(v)) setPath(dev, field, Number.isInteger(v) || !/(cells|txEvery|retries|samples|maxEvents|sf|cr|payload)$/.test(field) ? v : Math.round(v));
          try { sim = create(dev, { seed, faults }); } catch (e) { sim = null; }
        }
        return sim;
      }
      return {
        run(inp) {
          inp = inp || {};
          let res = null; const s = simFor(inp);
          try { res = s ? s.run() : null; } catch (e) { res = null; }
          const r = {};
          for (const o of outs) {
            const of = o.of !== undefined ? o.of : o.id, si = res ? Math.max(0, o.sensor === undefined ? 0 : res.sensors.indexOf(o.sensor)) : 0;
            if (o.kind === 'series') {
              const a = !res ? [] : of === 'reading' ? res.readings[si] || [] : of === 'truth' ? res.truth[si] || [] : res.series[of] || [];
              r[o.id] = thin(a, MAX_POINTS);
            } else r[o.id] = !res ? NaN : PER_SENSOR.includes(of) ? (res.perSensor[si] ? res.perSensor[si][of] : NaN) : res.scalars[of];
          }
          return r;
        },
        measure(inp, probe) {
          try { const s = simFor(inp || {}); if (!s) return { kind: probe && probe.kind, error: 'invalid' }; return s.measure(probe); }
          catch (e) { return { kind: probe && probe.kind, error: String(e && e.code || 'error') }; }
        },
        // the stepper (docs/INTERACTIVE_LIBRARY.md §1.6): the device as it is at stepInit (later bindings are not read), its clock
        // the co-simulation's minus t0; outputs: the scalars so far, each series its value now. Cannot snapshot (snapshot −1)
        stepInit(inp, t0) {
          try { const s = simFor(inp || {}); if (!s) throw fail('invalid'); ST = s.stepGen(); ST.t0 = Number.isFinite(t0) ? t0 : 0; ST.r = ST.g.next().value; return { out: stepOuts() }; }
          catch (e) { ST = null; return { fail: 'part-failed', out: {} }; }
        },
        stepTo(inp, t, dt) {
          if (!ST) return { fail: 'part-failed', out: {}, dt: 0, events: [] };
          try { ST.target.t = t + dt - ST.t0; ST.r = ST.g.next().value; return { out: stepOuts(), dt, events: [] }; }
          catch (e) { ST = null; return { fail: String(e && e.code === 'budget' ? 'budget' : 'part-failed'), out: {}, dt: 0, events: [] }; }
        },
        snapshot() { return -1; },
        restore() { return false; },
      };
      function stepOuts() {
        const r = ST.r, res = results(ST.k, r), sc = { ...res.scalars, vEnd: r.vNow, socEnd: r.socNow }, o2 = {}, c = r.cnt;
        const now = { t: r.t, soc: r.socNow, v: r.vNow, delivered: c.delivered, resets: c.resets, temp: r.tempNow, current: sc.iAvg, rssi: r.rx.rssi.length ? r.rx.rssi[r.rx.rssi.length - 1] : NaN };
        for (const o of outs) {
          const of = o.of !== undefined ? o.of : o.id, si = Math.max(0, o.sensor === undefined ? 0 : res.sensors.indexOf(o.sensor));
          if (o.kind === 'series') { const rd = of === 'reading' ? res.readings[si] : of === 'truth' ? res.truth[si] : null; o2[o.id] = rd ? (rd.length ? rd[rd.length - 1] : NaN) : has(now, of) ? now[of] : NaN; }
          else o2[o.id] = PER_SENSOR.includes(of) ? (res.perSensor[si] ? res.perSensor[si][of] : NaN) : sc[of];
        }
        return o2;
      }
    },
  };
  const engine = {
    id: ID, bench: true, stepper: true,   // stepper: a part of a co-simulation (stepInit / stepTo on the instance)
    check: spec => checkSpec(spec).filter(p => p.level === 'error').map(p => `${p.path}: ${p.msg}`),
    prepare(spec, compile_) {
      const bs = ((spec && spec.model && spec.model.bindings) || []).map(b => [b.field, compile_(b.expr)]);
      const ev = (fn, env) => { try { return +fn(env); } catch (e) { return NaN; } };
      return env => ({ ...env, $bind: bs.map(([fl, fn]) => [fl, ev(fn, env)]) });
    },
    create: (spec, opts) => simEngine.create(spec, opts),
  };
  const API = Object.freeze({
    id: ID, format: FORMAT, limits: Object.freeze({ sensors: MAX_SENSORS, samples: MAX_SAMPLES, events: MAX_EVENTS, log: MAX_LOG, trace: MAX_TRACE, points: MAX_POINTS, bindings: MAX_BINDINGS }),
    FAULT_KINDS: Object.freeze(FAULT_KINDS.slice()), SCALARS: Object.freeze(SCALARS.slice()), SERIES: Object.freeze(SERIES.slice()), NUM_FIELDS: Object.freeze(NUM_FIELDS.slice()),
    EVENT_CODES: Object.freeze({ ...EVENT_CODES }), CHEMS: Object.freeze(Object.keys(CHEMS)),
    check, checkFaults, checkSpec, create, num, simEngine: Object.freeze(simEngine), engine: Object.freeze(engine),
    radio: Object.freeze({ fspl, logDistance, noiseFloor, loraAirtime, bleAirtime, loraBer, fskBer, per: perOf }),
  });
  export default API;
  /* i18n-ignore-end */
