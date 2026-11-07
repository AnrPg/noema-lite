/* The radio engine rf@1 (engine/src/41_engine_rf.js, docs/INTERACTIVE_ENGINES.md §4) against known values:
   1. path loss: Friis (2.4 GHz, 100 m = 80.05 dB), two-ray crossover, log-distance, Okumura–Hata (hand-worked example),
      ITU-R P.1238 indoor, walls; Fresnel radius and knife-edge;
   2. the receiver: kTB + NF, LoRa sensitivity, link margin, the maximum range (bisection against the closed form);
   3. error rates (BPSK 1e-5 at 9.6 dB, FSK, LoRa) and airtimes (Semtech calculator values, BLE, Wi-Fi), duty cycle;
   4. seeded shadowing (determinism, its spread), the sim-spec adapter, the worker source, prepare;
   5. check() / checkSpec() codes, speed, and JS ↔ Python (tools/rf.py) parity on 40+ specs.
   Usage: node tests/rf.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const ENGINES = require('./engines.cjs'); ENGINES.core();   // the engine library (src/engines), every engine loaded (globalThis.NoemaCore.engines)
const NoemaRF = ENGINES.mod('rf@1');
const R = NoemaRF;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const codes = (x, level) => R.check(x).filter(p => !level || p.level === level).map(p => p.code);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e.code === code; } };
const acc = {};
const run = (link, seed) => R.create(link, { seed }).run();

ok(R.id === 'rf@1' && Object.isFrozen(R) && Object.isFrozen(R.engine), 'NoemaRF.id is rf@1 and the API is frozen');

// ---------- 1. path loss ----------
{
  const L = R.fspl(100, 2.4e9); acc.fspl = Math.abs(L - 80.05);
  ok(Math.abs(L - 80.05) < 0.005, `Friis: 2.4 GHz over 100 m = ${L.toFixed(3)} dB (80.05)`);
  ok(Math.abs(R.fspl(1000, 868e6) - (20 * Math.log10(1) + 20 * Math.log10(868) + 32.45)) < 0.01, 'Friis = 20·log d(km) + 20·log f(MHz) + 32.45 at 868 MHz, 1 km');
  ok(Math.abs(R.fspl(200, 2.4e9) - L - 20 * Math.log10(2)) < 1e-9, 'Friis: twice the distance, +6.02 dB');
  const dc = R.crossover(900e6, 30, 2);
  ok(Math.abs(dc - 4 * Math.PI * 60 / (299792458 / 900e6)) < 1e-6 && Math.abs(R.twoRay(dc * 0.999, 900e6, 30, 2) - R.twoRay(dc * 1.001, 900e6, 30, 2)) < 0.03, `two-ray: continuous at the crossover d_c = 4π·ht·hr/λ = ${dc.toFixed(0)} m`);
  ok(Math.abs(R.twoRay(20000, 900e6, 30, 2) - (40 * Math.log10(20000) - 20 * Math.log10(60))) < 1e-9 && Math.abs(R.twoRay(4 * dc, 900e6, 30, 2) - R.twoRay(2 * dc, 900e6, 30, 2) - 12.04) < 0.01, 'two-ray: 40·log d − 20·log(ht·hr) beyond it (12 dB per doubling)');
  ok(Math.abs(R.logDistance(100, 868e6, 3, 1) - (R.fspl(1, 868e6) + 60)) < 1e-9 && R.logDistance(0.5, 868e6, 3, 1) === R.fspl(0.5, 868e6), 'log-distance: PL(d0) + 10·n·log(d/d0), free space below d0');
  // Hata, worked by hand: f = 900 MHz, hb = 150 m, hm = 1.5 m, d = 10 km, small/medium city
  // a(hm) = (1.1·2.9542 − 0.7)·1.5 − (1.56·2.9542 − 0.8) = 0.0158; L = 69.55 + 77.283 − 30.072 − 0.016 + 30.647 = 147.39 dB
  const h = R.hata(10000, 900e6, 150, 1.5, 'urban'); acc.hata = Math.abs(h - 147.39);
  ok(Math.abs(h - 147.39) < 0.01, `Okumura–Hata urban (900 MHz, 150 m, 1.5 m, 10 km) = ${h.toFixed(3)} dB (hand: 147.39)`);
  const sub = R.hata(10000, 900e6, 150, 1.5, 'suburban'), op = R.hata(10000, 900e6, 150, 1.5, 'open');
  ok(Math.abs(h - sub - (2 * Math.pow(Math.log10(900 / 28), 2) + 5.4)) < 1e-9 && Math.abs(h - op - (4.78 * Math.pow(Math.log10(900), 2) - 18.33 * Math.log10(900) + 40.94)) < 1e-9, `Hata suburban ${sub.toFixed(2)} dB, open ${op.toFixed(2)} dB (the corrections)`);
  const lg = R.hata(10000, 900e6, 150, 1.5, 'urban-large');
  ok(Math.abs(h + ((1.1 * Math.log10(900) - 0.7) * 1.5 - (1.56 * Math.log10(900) - 0.8)) - (3.2 * Math.pow(Math.log10(11.75 * 1.5), 2) - 4.97) - lg) < 1e-9, 'Hata large city: a(hm) = 3.2·(log 11.75·hm)² − 4.97 above 300 MHz');
  ok(Number.isNaN(R.hata(500, 900e6, 150, 1.5, 'urban')) && Number.isNaN(R.hata(5000, 2.4e9, 150, 1.5, 'urban')), 'Hata outside 1–20 km or 150–1500 MHz → NaN');
  const ind = R.indoor(10, 2.4e9, 'office', 0);
  ok(Math.abs(ind - (20 * Math.log10(2400) + 30 - 28)) < 1e-9 && Math.abs(R.indoor(10, 2.4e9, 'office', 1) - ind - 14) < 1e-9, `ITU-R P.1238 office 2.4 GHz 10 m = ${ind.toFixed(2)} dB, one floor +14 dB`);
  ok(Math.abs(R.indoor(10, 1.9e9, 'residential', 2) - (20 * Math.log10(1900) + 28 - 28 + 8)) < 1e-9, 'P.1238 residential 1.9 GHz: N = 28, Lf = 4·n');
  const w = run({ f: 2.4e9, d: 20, path: { walls: [{ type: 'brick', count: 2 }, { loss: 5 }] } }).scalars;
  ok(w.wallLoss === 21 && Math.abs(w.plMedian - R.fspl(20, 2.4e9) - 21) < 1e-9, 'walls: 2 brick (8 dB) + a 5 dB wall add 21 dB');
}
{
  const r1 = R.fresnelRadius(500, 500, 2.4e9, 1), ex = Math.sqrt((299792458 / 2.4e9) * 250);
  acc.fresnel = Math.abs(r1 - ex);
  ok(Math.abs(r1 - 5.588) < 1e-3 && Math.abs(r1 - ex) < 1e-12, `Fresnel zone 1 at the middle of 1 km, 2.4 GHz: r1 = √(λ·d1·d2/d) = ${r1.toFixed(4)} m (5.588)`);
  ok(Math.abs(R.fresnelRadius(500, 500, 2.4e9, 2) / r1 - Math.SQRT2) < 1e-12, 'zone n: radius ∝ √n');
  ok(Math.abs(R.knifeEdge(0, 500, 500, 2.4e9) - 6.03) < 0.01 && R.knifeEdge(-20, 500, 500, 2.4e9) === 0, 'knife edge grazing the line of sight (v = 0) → 6.03 dB (≈ 6 dB); well below it → 0 dB');
  const s = run({ f: 2.4e9, d: 1000, path: { obstacle: { d1: 500, h: -0.6 * r1 } } }).scalars;
  ok(Math.abs(s.clearance - 0.6) < 1e-9 && s.diffraction < 1 && s.fresnel === r1, `an obstacle 0.6·r1 below the line: clearance 0.60, loss ${s.diffraction.toFixed(2)} dB`);
}

// ---------- 2. the receiver, margin, range ----------
const lora = sf => ({ f: 868e6, d: 2000, tx: { power: 14, gain: 2.15, cable: 0.5 }, rx: { gain: 2.15, cable: 0.5, nf: 6 }, radio: { mod: 'lora', sf, payload: 10 } });
{
  const s = run(lora(12)).scalars;
  ok(Math.abs(s.noiseFloor - (-174 + 10 * Math.log10(125e3) + 6)) < 0.03, `noise floor kTB + NF at 125 kHz, NF 6 dB = ${s.noiseFloor.toFixed(2)} dBm`);
  ok(Math.abs(s.sensitivity - -137) < 0.05, `LoRa SF12/125 kHz sensitivity = ${s.sensitivity.toFixed(2)} dBm (datasheet −137 dBm)`);
  ok(s.eirp === 15.65 && Math.abs(s.prx - (15.65 - R.fspl(2000, 868e6) + 1.65)) < 1e-9 && Math.abs(s.margin - (s.prx - s.sensitivity)) < 1e-12, 'EIRP = P − cable + G; Prx = EIRP − PL + G − cable; margin = Prx − sensitivity');
  const ex = Math.pow(10, (15.65 + 1.65 - s.sensitivity - 20 * Math.log10(4 * Math.PI * 868e6 / 299792458)) / 20);
  acc.range = Math.abs(s.range - ex) / ex;
  ok(acc.range < 1e-9, `maximum range (bisection) ${(s.range / 1000).toFixed(2)} km = the closed form ${(ex / 1000).toFixed(2)} km (rel. error ${acc.range.toExponential(1)})`);
  const s7 = run(lora(7)).scalars;
  ok(Math.abs(s7.sensitivity - s.sensitivity - 12.5) < 1e-9 && s7.range < s.range, 'SF7 is 12.5 dB less sensitive than SF12 and reaches less far');
  const fm = run({ ...lora(12), fadeMargin: 10 }).scalars;
  ok(Math.abs(fm.range / s.range - Math.pow(10, -0.5)) < 1e-6, 'a 10 dB fade margin cuts the free-space range by √10');
  const hr = run({ f: 900e6, d: 5000, path: { model: 'hata', ht: 30, hr: 1.5 }, tx: { power: 30 }, radio: { mod: 'lora', sf: 12 } });
  ok(hr.scalars.range > 1000 && hr.scalars.range <= 20000 && Math.abs(R.create({ f: 900e6, d: 5000, path: { model: 'hata', ht: 30, hr: 1.5 }, tx: { power: 30 }, radio: { mod: 'lora', sf: 12 } }).at(hr.scalars.range < 20000 ? hr.scalars.range : 20000).margin) < (hr.codes.includes('range-open') ? 100 : 1e-6), `Hata range solved inside 1–20 km (${(hr.scalars.range / 1000).toFixed(2)} km${hr.codes.length ? ', ' + hr.codes : ''})`);
  const far = R.create({ f: 900e6, d: 5000, path: { model: 'hata' } });
  const bound = R.simEngine.create({ model: { link: { f: 900e6, d: 5000, path: { model: 'hata' } }, bindings: [{ field: 'd', expr: 'dist' }] }, outputs: [{ id: 'pl', kind: 'scalar' }, { id: 'valid', kind: 'scalar' }] }).run({ dist: 30000 });
  ok(Number.isFinite(far.at(5000).pl) && Number.isNaN(bound.pl) && bound.valid === 0, 'a binding that moves Hata outside its range: pl NaN, valid 0');
}

// ---------- 3. error rates, airtime ----------
{
  const b = R.ber('bpsk', Math.pow(10, 0.96)); acc.bpsk = Math.abs(b - 1.0e-5) / 1e-5;
  ok(Math.abs(b - 1.0e-5) / 1e-5 < 0.05, `BPSK BER at Eb/N0 = 9.6 dB: ${b.toExponential(3)} (1.0e-5)`);
  ok(Math.abs(R.Q(1.96) - 0.025) < 1e-4 && Math.abs(R.erfc(1) - 0.157299) < 1e-6, 'Q(1.96) = 0.025, erfc(1) = 0.157299');
  ok(Math.abs(R.ber('fsk', 10) - 0.5 * Math.exp(-5)) < 1e-15 && R.ber('qpsk', 3) === R.ber('bpsk', 3), 'non-coherent FSK ½·e^(−Eb/2N0); QPSK = BPSK per bit');
  const l7 = [-15, -10, -7.5, -5].map(x => R.ber('lora', Math.pow(10, x / 10), { sf: 7 }));
  ok(l7.every((x, i) => !i || x < l7[i - 1]) && l7[0] > 0.1 && l7[3] < 1e-5, `LoRa SF7 BER falls with SNR (${l7.map(x => x.toExponential(1)).join(', ')} at −15, −10, −7.5, −5 dB)`);
  const p12 = R.ber('lora', Math.pow(10, -20 / 10), { sf: 12 }), p7 = R.ber('lora', Math.pow(10, -20 / 10), { sf: 7 });
  ok(p12 < 1e-4 && p7 > 0.3, 'at −20 dB SNR SF12 still demodulates, SF7 does not');
  const s = run({ f: 868e6, d: 1000, radio: { mod: 'lora', sf: 9, payload: 20 } });
  const per = s.series.per;
  ok(per.length === 81 && per[0] > 0.99 && per[80] < 1e-6 && per.every((x, i) => !i || x <= per[i - 1] + 1e-15), 'PER curve against SNR: 81 points, from ~1 to ~0, never rising');
  const w = R.wifiAirtime(100, 54);
  ok(Math.abs(w - 44e-6) < 1e-12 && Math.abs(R.bleAirtime(31, '1M') - 328e-6) < 1e-12 && Math.abs(R.bleAirtime(31, '2M') - 168e-6) < 1e-12, 'Wi-Fi 54 Mb/s 100 B = 44 µs; BLE 31 B = 328 µs (1M), 168 µs (2M)');
  const bpskReq = run({ f: 433e6, d: 100, radio: { mod: 'bpsk', bitrate: 9600 } }).scalars;
  ok(Math.abs(bpskReq.snrReq - 6.79) < 0.02 && Math.abs(R.ber('bpsk', Math.pow(10, bpskReq.ebn0 / 10)) - bpskReq.ber) < 1e-15, `BPSK required SNR (BER 1e-3, B = R) = ${bpskReq.snrReq.toFixed(2)} dB`);
}
{
  // the Semtech LoRa calculator / TTN airtime calculator: 125 kHz, CR 4/5, 8 preamble symbols, explicit header, CRC on
  const cases = [[7, 10, 41.216], [12, 10, 991.232], [7, 51, 102.656], [12, 51, 2465.792]];
  let worst = 0;
  for (const [sf, pl, ms] of cases) { const a = R.loraAirtime({ sf, payload: pl }).airtime * 1000; worst = Math.max(worst, Math.abs(a - ms)); ok(Math.abs(a - ms) < 1e-6, `LoRa SF${sf} ${pl} B: ${a.toFixed(3)} ms (calculator ${ms} ms)`); }
  acc.air = worst;
  ok(R.loraAirtime({ sf: 11 }).ldro === 1 && R.loraAirtime({ sf: 10 }).ldro === 0 && R.loraAirtime({ sf: 12, bw: 500e3 }).ldro === 0, 'low data rate optimisation on when the symbol is longer than 16 ms');
  const s = run({ f: 868e6, d: 1000, radio: { mod: 'lora', sf: 12, payload: 10, interval: 300, dutyLimit: 0.01 } }).scalars;
  ok(Math.abs(s.dutyCycle - 0.991232 / 300) < 1e-12 && Math.abs(s.minInterval - 99.1232) < 1e-9, `duty cycle at one message in 5 min = ${(100 * s.dutyCycle).toFixed(3)} %; 1 % allows one every ${s.minInterval.toFixed(1)} s`);
  ok(Math.abs(s.bitrate - 12 * 125e3 / 4096 * 0.8) < 1e-9, `LoRa SF12 bit rate ${s.bitrate.toFixed(1)} b/s`);
}

// ---------- 4. shadowing, adapter, worker ----------
{
  const link = { f: 868e6, d: 1000, path: { model: 'log-distance', n: 3, sigma: 8 }, sweep: { from: 10, to: 10000, points: 2000 } };
  const a = run(link, 7), b = run(link, 7), c = run(link, 8);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical results (scalars and series)');
  ok(a.scalars.shadow !== c.scalars.shadow && JSON.stringify(a.series.pl) !== JSON.stringify(c.series.pl), 'another seed → another shadowing');
  const dev = a.series.pl.map((x, i) => x - a.series.plMedian[i]), m = dev.reduce((s, x) => s + x, 0) / dev.length, sd = Math.sqrt(dev.reduce((s, x) => s + (x - m) ** 2, 0) / dev.length);
  acc.sigma = Math.abs(sd - 8) / 8;
  ok(Math.abs(m) < 0.6 && Math.abs(sd - 8) < 0.5, `log-normal shadowing over 2000 points: mean ${m.toFixed(2)} dB, σ ${sd.toFixed(2)} dB (8)`);
  ok(a.series.d.length === 2000 && Math.abs(a.series.d[0] - 10) < 1e-12 && Math.abs(a.series.d[1999] - 10000) < 1e-6, 'the sweep: 2000 log-spaced distances');
  ok(Math.abs(a.scalars.pl - a.scalars.plMedian - a.scalars.shadow) < 1e-12 && a.scalars.rssi === a.scalars.prx, 'pl = median + shadow; rssi = prx');
}
{
  const spec = { model: { link: { f: 868e6, d: 1000, radio: { mod: 'lora', sf: 7 } }, bindings: [{ field: 'd', expr: 'dist' }, { field: 'radio.sf', expr: 'sf' }] },
    outputs: [{ id: 'margin', kind: 'scalar' }, { id: 'air', kind: 'scalar', of: 'airtime' }, { id: 'd', kind: 'series' }, { id: 'rssi', kind: 'series', of: 'prx' }] };
  ok(R.engine.check(spec).length === 0 && R.checkSpec(spec).length === 0, 'a good spec passes engine.check');
  const e = R.engine.create(spec, { seed: 1 }), o = e.run({ dist: 3000, sf: 10 });
  ok(Math.abs(o.air - R.loraAirtime({ sf: 10, payload: 20 }).airtime) < 1e-12 && o.d.length === 200 && o.rssi.length === 200 && Math.abs(o.margin - R.create({ f: 868e6, d: 3000, radio: { mod: 'lora', sf: 10 } }).run().scalars.margin) < 1e-12, 'adapter: bindings set d and SF; outputs by id and of');
  const prep = R.engine.prepare(spec, src => env => env[src] * 2);
  const o2 = e.run(prep({ dist: 1500, sf: 5 }));
  ok(Math.abs(o2.air - R.loraAirtime({ sf: 10, payload: 20 }).airtime) < 1e-12, 'prepare: the expressions are evaluated on the main thread ($bind)');
  const self = {}; (new Function('self', R.engine.workerSource))(self);
  const w = self.noemaEngine.create(spec, { seed: 1 }).run({ dist: 3000, sf: 10 });
  ok(JSON.stringify(w) === JSON.stringify(o) && !('NoemaRF' in self), 'workerSource (its Worker bundle, no global but self.noemaEngine): the same engine in a fresh global gives the same outputs');
  ok(typeof R.engine.create === 'function' && /^[a-z][a-z0-9-]*@\d+$/.test(R.engine.id), 'engine has the registerEngine shape (id, check, prepare, create, workerSource)');
}

// ---------- 5. check(), speed, parity ----------
{
  ok(R.check({ f: 868e6, d: 100 }).length === 0, 'a minimal link has no problems');
  ok(codes(null).includes('format') && codes({ f: 868e6, d: 1, format: 'x' }).includes('format'), 'check: not a link / wrong format');
  ok(codes({ f: 868e6 }).includes('value') && codes({ f: -1, d: 1 }).includes('value'), 'check: d missing, f ≤ 0');
  ok(codes({ f: 868e6, d: 1, path: { model: 'cost231' } }).includes('enum'), 'check: unknown model');
  ok(codes({ f: 2.4e9, d: 5000, path: { model: 'hata' } }).includes('range') && codes({ f: 900e6, d: 500, path: { model: 'hata' } }).includes('range'), 'check: Hata outside its range → "range"');
  ok(codes({ f: 900e6, d: 5000, path: { model: 'hata', env: 'office' } }).includes('enum'), 'check: an indoor environment on Hata → "enum"');
  ok(codes({ f: 10e9, d: 5, path: { model: 'indoor' } }).includes('range'), 'check: P.1238 outside 0.8–6 GHz → "range"');
  ok(codes({ f: 868e6, d: 1, path: { walls: Array(33).fill({ type: 'brick' }) } }).includes('size'), 'check: more than 32 walls → "size"');
  ok(codes({ f: 868e6, d: 1, colour: 'red' }, 'warning').includes('unknown-field'), 'check: an unknown field → warning');
  ok(codes({ f: 868e6, d: 100, radio: { mod: 'lora', sf: 6 } }).includes('value') && codes({ f: 2.4e9, d: 10, radio: { mod: 'wifi', rate: 11 } }).includes('enum'), 'check: SF6, Wi-Fi 11 Mb/s refused');
  ok(throwsCode(() => R.create({ f: 868e6 }), 'invalid'), 'create() refuses a bad link: code "invalid"');
  const sp = R.checkSpec({ model: { link: { f: 868e6, d: 1 }, bindings: [{ field: 'path.colour', expr: 'x' }] }, outputs: [{ id: 'q', kind: 'scalar' }, { id: 'd', kind: 'graph' }] }).map(p => p.code);
  ok(sp.filter(c => c === 'binding').length === 1 && sp.filter(c => c === 'output').length === 2, 'checkSpec: a binding to no field, an unknown scalar, a bad kind');
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) run({ f: 868e6, d: 1000, path: { model: 'log-distance', sigma: 6 }, sweep: { from: 1, to: 1e5, points: 2000 }, snrSweep: { from: -30, to: 10, points: 2000 } }, i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20; acc.ms = ms;
  ok(ms < 50, `a run with 2000-point sweeps and the range solve: ${ms.toFixed(2)} ms (< 50 ms)`);
}
{
  const base = { f: 868e6, d: 1000 };
  const links = [
    base, { ...base, format: 'noema.rf/v1' }, { ...base, format: 'rf' }, null, [], 'x', { f: '868M', d: '1k' }, { f: '868 MHz', d: 1 }, { d: 1 }, { f: 0, d: 1 },
    { ...base, fadeMargin: 'a' }, { ...base, tx: 5 }, { ...base, tx: { power: '14', cable: -1 } }, { ...base, rx: { nf: -2, bw: 0, snr: 'x' } },
    { ...base, path: { model: 'hata' } }, { f: 900e6, d: 5000, path: { model: 'hata', ht: 10, hr: 20 } }, { f: 900e6, d: 5000, path: { model: 'hata', env: 'office' } },
    { f: 2.4e9, d: 10, path: { model: 'indoor', env: 'urban', floors: 2 } }, { f: 2.4e9, d: 0.5, path: { model: 'indoor' } }, { ...base, path: { floors: 1.5 } },
    { ...base, path: { walls: [{ type: 'paper' }, {}, { loss: 3, count: 0 }] } }, { ...base, path: { walls: 'brick' } }, { ...base, path: { obstacle: { d1: 2000, h: 1 } } },
    { ...base, path: { obstacle: { h: 1 } } }, { ...base, radio: { mod: 'lora', bw: 1e6 } }, { ...base, radio: { mod: 'wifi', rate: 11 } }, { ...base, radio: { mod: 'wifi', rate: 54 } },
    { ...base, radio: { mod: 'ble', phy: '3M', header: 'yes' } }, { ...base, radio: { sf: 13, cr: 0, payload: 300, preamble: 2.5 } }, { ...base, radio: { dutyLimit: 2, interval: 0 } },
    { ...base, sweep: { from: 10, to: 1 } }, { ...base, sweep: { from: 1, to: 10, points: 5000, scale: 'sqrt' } }, { ...base, snrSweep: { from: 0, to: -5 } },
    { ...base, path: { model: 'two-ray', ht: 0 } }, { ...base, meta: { a: 1 }, extra: 1 }, { f: 2e11, d: 1 }, { ...base, path: { env: 'urban', sigma: -1 } },
  ];
  const ok1 = { f: 868e6, d: 1000 };
  const specs = [
    { model: { link: ok1 }, outputs: [] }, { model: 5, outputs: [] }, { outputs: [] }, { model: { link: ok1, x: 1 }, outputs: [{ id: 'margin', kind: 'scalar' }] },
    { model: { link: ok1, bindings: 'd' }, outputs: [] }, { model: { link: ok1, bindings: [{ field: 'd' }, { field: 'path.n', expr: ' ' }, 5, { field: 'path.walls', expr: 'w' }] }, outputs: [] },
    { model: { link: ok1 }, outputs: [{ id: 'per', kind: 'series' }, { id: 'x', kind: 'series', of: 'range' }, { id: 'y', kind: 'table' }, 3] }, { model: { link: ok1 }, outputs: 'x' },
    { model: { link: { f: 1 } }, outputs: [] }, { model: { link: ok1, bindings: Array(25).fill({ field: 'd', expr: 'd' }) }, outputs: [] },
  ];
  ok(links.length + specs.length >= 30, `parity corpus: ${links.length} links + ${specs.length} specs`);
  const tmp = path.join(os.tmpdir(), 'noema-rf-parity.json'); fs.writeFileSync(tmp, JSON.stringify({ links, specs }));
  const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import rf
d = json.load(open(sys.argv[1], encoding='utf-8')); print(json.dumps({'links': [rf.check(x) for x in d['links']], 'specs': [rf.check_spec(x) for x in d['specs']]}))`, tmp], { encoding: 'utf8' }));
  const js = { links: links.map(x => R.check(JSON.parse(JSON.stringify(x)))), specs: specs.map(x => R.checkSpec(JSON.parse(JSON.stringify(x)))) };
  let same = 0, total = 0;
  for (const k of ['links', 'specs']) js[k].forEach((r, i) => { total++; if (JSON.stringify(r) === JSON.stringify(py[k][i])) same++; else console.log('  ≠ ' + k + '[' + i + ']\n    js ' + JSON.stringify(r) + '\n    py ' + JSON.stringify(py[k][i])); });
  const found = js.links.concat(js.specs).reduce((s, r) => s + r.length, 0);
  ok(same === total && found > 40, `JS ↔ Python check()/checkSpec(): ${same}/${total} identical (${found} findings)`);
}

console.log(`\naccuracy: FSPL ${acc.fspl.toFixed(4)} dB · Hata ${acc.hata.toFixed(4)} dB · Fresnel ${acc.fresnel.toExponential(1)} m · range rel ${acc.range.toExponential(1)} · BPSK 1e-5 ${(100 * acc.bpsk).toFixed(2)} % · LoRa airtime ${acc.air.toExponential(1)} ms · σ ${(100 * acc.sigma).toFixed(1)} % · run ${acc.ms.toFixed(2)} ms`);
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
