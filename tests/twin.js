/* The IoT device twin twin@1 (engine/src/42_engine_twin.js, docs/activities-dev/twin.md):
   1. battery life of a simple duty cycle = capacity / average current (analytic), self-discharge, the voltage curve;
   2. the radio: rf@1's formulas (the duplicated ones agree), losses, acks and retries;
   3. every fault changes the outputs the expected way (sensor stuck / drift, battery ageing, antenna detached, wake period,
      brown-out); brown-out resets from an aged battery;
   4. determinism, the instruments (measure), the sim-spec adapter, the worker source;
   5. check() / checkFaults() / checkSpec() codes, the event budget, speed, and JS ↔ Python (tools/twin.py) parity on 40+ cases.
   Usage: node tests/twin.js */
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'engine', 'src', '41_engine_rf.js'));
require(path.join(ROOT, 'engine', 'src', '42_engine_twin.js'));
const T = globalThis.NoemaTwin, RF = globalThis.NoemaRF;
let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } else console.log('✓ ' + m); };
const codes = (x, level) => T.check(x).filter(p => !level || p.level === level).map(p => p.code);
const throwsCode = (f, code) => { try { f(); return false; } catch (e) { return e.code === code; } };
const clone = o => JSON.parse(JSON.stringify(o));
const acc = {};
const DAY = 86400;
const sim = (dev, faults, seed) => T.create(dev, { faults, seed: seed === undefined ? 1 : seed }).run();

ok(T.id === 'twin@1' && Object.isFrozen(T) && Object.isFrozen(T.engine) && T.engine.bench === true, 'NoemaTwin.id is twin@1, frozen, a bench engine');

// ---------- 1. battery life ----------
// 1000 mAh; every 60 s: 1 s sensing at 10 mA, a 0.5 s transmission at 50 mA; sleep 10 µA → I = (10·1 + 50·0.5 + 0.01·58.5)/60 = 0.593083 mA
const simple = () => ({ battery: { capacity: 1000, chem: 'li-ion' }, power: { sleep: 0.01, active: 10, tx: 50, rx: 15 },
  schedule: { period: 60, sense: 1 }, radio: { tech: 'lora', txTime: 0.5, d: 100 }, sensors: [{ id: 'temp', base: 21, amp: 2, noise: 0.1 }],
  sim: { duration: 100 * DAY, samples: 400, trace: 130 } });
{
  const iEx = (10 * 1 + 50 * 0.5 + 0.01 * 58.5) / 60, lifeEx = 1000 / iEx * 3600;
  const r = sim(simple());
  acc.iAvg = Math.abs(r.scalars.iAvgAnalytic - iEx) / iEx;
  ok(Math.abs(r.scalars.iAvgAnalytic - iEx) < 1e-12 && Math.abs(r.scalars.lifeAnalytic - lifeEx) < 1e-6, `analytic: I = ${iEx.toFixed(6)} mA, life = capacity / I = ${(lifeEx / DAY).toFixed(2)} days`);
  acc.life = Math.abs(r.scalars.tDead - lifeEx) / lifeEx;
  ok(r.scalars.dead === 1 && acc.life < 1e-3, `simulated: the battery is empty after ${(r.scalars.tDead / DAY).toFixed(3)} days (analytic ${(lifeEx / DAY).toFixed(3)}, error ${(100 * acc.life).toFixed(3)} %)`);
  ok(r.log.length === 1 && r.log[0].code === 'dead' && r.series.eventCode[0] === T.EVENT_CODES.dead, 'the event log: one "dead"');
  ok(r.series.soc[0] < 1 && r.series.soc.every((x, i) => !i || x <= r.series.soc[i - 1]) && r.series.v[0] > 4.1 && r.series.v[r.series.v.length - 1] <= 3.0, 'SoC falls, the voltage follows the Li-ion curve from 4.2 V to 3.0 V');
  const cur = r.series.current.slice(0, 50), mean = cur.reduce((a, b) => a + b, 0) / cur.length;
  ok(Math.abs(mean - iEx) / iEx < 0.01 && r.series.t.length === 400, `the current series: ${mean.toFixed(4)} mA per bin (400 bins)`);
  const tr = r.series.traceI.slice(0, 6);
  ok(JSON.stringify(tr) === JSON.stringify([10, 10, 50, 50, 0.01, 0.01]) && r.series.traceT[2] === 1 && r.series.traceT[3] === 1.5 && r.series.traceT[5] === 60, 'the current trace: sense 10 mA for 1 s, TX 50 mA for 0.5 s, sleep until 60 s');
  ok(Math.abs(r.scalars.activeFraction - 1.5 / 60) < 1e-3, `active fraction ${(100 * r.scalars.activeFraction).toFixed(2)} % (1.5 s in 60 s)`);
  const d = simple(); d.battery.selfDischarge = 0.03; d.sim.duration = 30 * DAY;
  const s = sim(d), isd = 0.03 * 1000 / 720;
  ok(Math.abs(s.scalars.iAvgAnalytic - iEx - isd) < 1e-12 && Math.abs(s.scalars.iAvg - s.scalars.iAvgAnalytic) / s.scalars.iAvgAnalytic < 1e-3, `self-discharge 3 %/month adds ${(isd * 1000).toFixed(1)} µA (simulated ${s.scalars.iAvg.toFixed(5)} mA)`);
  ok(Math.abs(s.scalars.lifeSim - s.scalars.lifeAnalytic) / s.scalars.lifeAnalytic < 1e-3, 'a battery still alive at the end: its life is extrapolated from the charge used');
  const two = simple(); two.schedule.txEvery = 2; const r2 = T.create(two).analytic();
  ok(Math.abs(r2.iAvg - (10 + 25 / 2 + 0.01 * (60 - 1 - 0.25)) / 60) < 1e-12, 'transmitting every 2nd wake halves the radio share');
  const alk = simple(); alk.battery = { capacity: 2500, chem: 'alkaline', cells: 2 };
  const ra = sim(alk); ok(ra.series.v[0] > 3.0 && ra.series.v[0] <= 3.1, `two alkaline cells start at ${ra.series.v[0].toFixed(2)} V`);
}

// ---------- 2. the radio ----------
const lossy = () => ({ battery: { capacity: 2000 }, power: { sleep: 0.005, active: 5, tx: 40, rx: 12 },
  schedule: { period: 300, sense: 0.05 }, sensors: [{ id: 'temp', base: 20, amp: 3, noise: 0.2 }],
  radio: { tech: 'lora', sf: 7, f: 868e6, power: 14, gain: 2, d: 10000, n: 2.7, sigma: 4, payload: 12 }, sim: { duration: 10 * DAY, samples: 100 } });
{
  ok(T.radio.loraAirtime(9, 125e3, 1, 20) === RF.loraAirtime({ sf: 9, payload: 20 }).airtime && T.radio.loraAirtime(12, 125e3, 1, 51) === RF.loraAirtime({ sf: 12, payload: 51 }).airtime, 'LoRa airtime: the twin and rf@1 agree');
  ok(T.radio.fspl(1000, 868e6) === RF.fspl(1000, 868e6) && T.radio.logDistance(3000, 868e6, 2.7, 1) === RF.logDistance(3000, 868e6, 2.7, 1) && T.radio.noiseFloor(125e3, 6) === RF.noiseFloor(125e3, 6), 'path loss and noise floor: the same formulas');
  ok([-12, -8, -5].every(x => T.radio.loraBer(Math.pow(10, x / 10), 7) === RF.ber('lora', Math.pow(10, x / 10), { sf: 7 })), 'LoRa BER: the same');
  const r = sim(lossy()), s = r.scalars;
  const prx = 14 + 2 - RF.logDistance(10000, 868e6, 2.7, 1), snrEx = prx - RF.noiseFloor(125e3, 6);
  ok(s.sent === s.wakes && s.delivered + s.lost === s.sent && s.delivered > 0 && s.lost > 0, `a marginal link (median SNR ${snrEx.toFixed(1)} dB, σ 4 dB): ${s.delivered}/${s.sent} delivered`);
  ok(Math.abs(s.per - RF.per(RF.ber('lora', Math.pow(10, snrEx / 10), { sf: 7 }), 12)) < 1e-12, `median PER ${s.per.toFixed(3)} = rf@1's`);
  const ack = lossy(); Object.assign(ack.schedule, { ack: true, retries: 3, rxWindow: 1 });
  const a = sim(ack).scalars;
  ok(a.attempts > a.sent && a.deliveryRatio > s.deliveryRatio && a.iAvg > s.iAvg, `acks and 3 retries: ${(100 * a.deliveryRatio).toFixed(1)} % delivered (vs ${(100 * s.deliveryRatio).toFixed(1)} %), more current (${a.iAvg.toFixed(4)} vs ${s.iAvg.toFixed(4)} mA)`);
  ok(sim(ack).log.every(e => e.code === 'lost'), 'a message lost after all retries is logged "lost" (the device knows: no ack)');
  ok(r.series.rxT.length === s.delivered && r.readings[0].length === s.delivered, 'the server receives one reading per delivered message');
}

// ---------- 3. faults ----------
{
  const base = lossy(); base.radio.sigma = 0; base.radio.d = 1000;
  const h = sim(base);
  ok(h.scalars.deliveryRatio === 1 && h.scalars.resets === 0 && h.log.length === 0, 'healthy device on a good link: every message delivered, no event');
  const ant = sim(base, [{ kind: 'antenna-detached' }]);
  ok(Math.abs(h.scalars.rssiMean - ant.scalars.rssiMean - 20) < 1e-9 || (ant.scalars.delivered === 0), `antenna detached: RSSI ${h.scalars.rssiMean.toFixed(1)} → ${Number.isFinite(ant.scalars.rssiMean) ? ant.scalars.rssiMean.toFixed(1) : '—'} dBm (−20 dB)`);
  const far = lossy(); far.radio.sigma = 0; far.radio.d = 8000;
  const fh = sim(far), fa = sim(far, [{ kind: 'antenna-detached' }]);
  ok(fh.scalars.deliveryRatio > 0.95 && fa.scalars.deliveryRatio < 0.05, `antenna detached at 8 km: delivery ${(100 * fh.scalars.deliveryRatio).toFixed(0)} % → ${(100 * fa.scalars.deliveryRatio).toFixed(0)} %`);
  const life = simple(); life.sim.duration = 30 * DAY;
  const lh = sim(life), la = sim(life, [{ kind: 'battery-ageing', factor: 0.5, rInt: 4 }]);
  ok(Math.abs(la.scalars.lifeSim / lh.scalars.lifeSim - 0.5) < 1e-3 && la.scalars.vMin < lh.scalars.vMin, `battery ageing ×0.5: life ${(lh.scalars.lifeSim / DAY).toFixed(1)} → ${(la.scalars.lifeSim / DAY).toFixed(1)} days, deeper sag (${lh.scalars.vMin.toFixed(3)} → ${la.scalars.vMin.toFixed(3)} V)`);
  const wp = sim(life, [{ kind: 'wake-period', factor: 0.1 }]);
  const iWp = (10 + 25 + 0.01 * 4.5) / 6;
  ok(Math.abs(wp.scalars.iAvg - iWp) / iWp < 1e-3 && Math.abs(wp.scalars.wakes * 6 / wp.scalars.tDead - 1) < 1e-3 && wp.scalars.lifeSim < lh.scalars.lifeSim / 8, `wake period misconfigured (6 s instead of 60 s): ${wp.scalars.iAvg.toFixed(3)} mA instead of ${lh.scalars.iAvg.toFixed(3)} mA, empty after ${(wp.scalars.lifeSim / DAY).toFixed(1)} days`);
  ok(sim(life, [{ kind: 'wake-period', period: 600 }]).scalars.wakes === Math.ceil(30 * DAY / 600), 'wake period set to a value (600 s)');
  const st = sim(base, [{ kind: 'sensor-stuck', sensor: 'temp', at: 2 * DAY }]);
  const after = st.readings[0].filter((_, i) => st.series.rxT[i] > 2 * DAY);
  ok(after.length > 100 && after.every(x => x === after[0]) && st.perSensor[0].readingErr > h.perSensor[0].readingErr * 3, `sensor stuck from day 2: ${after.length} identical readings (${after[0].toFixed(2)}), error ${h.perSensor[0].readingErr.toFixed(2)} → ${st.perSensor[0].readingErr.toFixed(2)}`);
  ok(sim(base, [{ kind: 'sensor-stuck', sensor: 'temp', value: 85 }]).perSensor[0].readingLast === 85, 'sensor stuck at a value (85: a classic DS18B20 power-on reading)');
  const dr = sim(base, [{ kind: 'sensor-drift', sensor: 'temp', rate: 0.5 }]);
  const errs = dr.readings[0].map((x, i) => x - dr.truth[0][i]), early = errs.slice(0, 50), late = errs.slice(-50), m = a => a.reduce((s, x) => s + x, 0) / a.length;
  ok(Math.abs(m(late) - 0.5 * dr.series.rxT[dr.series.rxT.length - 25] / DAY) < 0.1 && Math.abs(m(early)) < 0.15, `sensor drift 0.5 /day: error ${m(early).toFixed(2)} at the start → ${m(late).toFixed(2)} after 10 days`);
  const bo = sim(life, [{ kind: 'brownout', v: 3.85 }]);
  ok(bo.scalars.resets > 0 && bo.log.some(e => e.code === 'reset') && bo.scalars.delivered < lh.scalars.delivered, `brown-out level set too high (3.85 V): ${bo.scalars.resets} resets as the battery falls below it, ${bo.scalars.delivered} messages (healthy ${lh.scalars.delivered})`);
  const aged = simple(); aged.brownout = { v: 3.3 }; aged.power.tx = 120; aged.sim.duration = 20 * DAY;
  const ah = sim(aged), aa = sim(aged, [{ kind: 'battery-ageing', factor: 0.8, rInt: 30 }]);
  ok(ah.scalars.resets === 0 && aa.scalars.resets > 0 && aa.log.find(e => e.code === 'reset').v > 3.3, `an aged battery (×30 internal resistance) sags under 120 mA TX: ${aa.scalars.resets} brown-out resets while the open-circuit voltage is still ${aa.log.find(e => e.code === 'reset').v.toFixed(2)} V`);
  ok(T.checkFaults(base, [{ kind: 'sensor-stuck', sensor: 'hum' }]).length === 1 && throwsCode(() => T.create(base, { faults: [{ kind: 'melt' }] }), 'fault'), 'a fault on no sensor / an unknown fault → code "fault"');
}

// ---------- 4. determinism, instruments, adapter ----------
{
  const d = lossy();
  const a = sim(d, [], 7), b = sim(d, [], 7), c = sim(d, [], 8);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical results (readings, deliveries, series, log)');
  ok(JSON.stringify(a.readings) !== JSON.stringify(c.readings) && a.scalars.delivered !== c.scalars.delivered, 'another seed → other noise and losses');
  const s = T.create(d, { seed: 7 });
  ok(Math.abs(s.measure({ kind: 'V' }).value - a.scalars.vEnd) < 1e-12 && Math.abs(s.measure({ kind: 'I' }).value - a.scalars.iAvg / 1000) < 1e-15, 'measure V (the battery) and I (the average, in A)');
  const sc = s.measure({ kind: 'scope', tStart: 0, tEnd: 900 });
  ok(sc.kind === 'scope' && Math.abs(sc.stats.max - 0.040) < 1e-12 && Math.abs(sc.stats.min - 5e-6) < 1e-12 && Math.abs(sc.stats.freq - 1 / 300) < 1e-12, 'measure scope: the current over 15 minutes, 5 µA to 40 mA, a wake every 300 s');
  ok(s.measure({ kind: 'log' }).kind === 'log' && Math.abs(s.measure({ kind: 'rssi' }).value - a.scalars.rssiMean) < 1e-12 && throwsCode(() => s.measure({ kind: 'Z' }), 'probe'), 'measure log / rssi; an unknown probe → "probe"');
  const spec = { model: { device: d, bindings: [{ field: 'schedule.period', expr: 'period' }, { field: 'radio.sf', expr: 'sf' }] },
    outputs: [{ id: 'life', kind: 'scalar', of: 'lifeSim' }, { id: 'delivered', kind: 'scalar' }, { id: 'err', kind: 'scalar', of: 'readingErr', sensor: 'temp' }, { id: 'soc', kind: 'series' }, { id: 'rd', kind: 'series', of: 'reading' }] };
  ok(T.engine.check(spec).length === 0, 'a good spec passes engine.check');
  const e = T.engine.create(spec, { seed: 3, faults: [{ kind: 'antenna-detached' }] }), o = e.run({ period: 600, sf: 9 });
  const ref = T.create({ ...d, schedule: { ...d.schedule, period: 600 }, radio: { ...d.radio, sf: 9 } }, { seed: 3, faults: [{ kind: 'antenna-detached' }] }).run();
  ok(o.life === ref.scalars.lifeSim && o.delivered === ref.scalars.delivered && o.soc.length === 100 && o.rd.length === Math.min(2000, ref.readings[0].length), 'adapter: bindings, the hidden fault (opts.faults), outputs by of / sensor');
  ok(e.measure({ period: 600, sf: 9 }, { kind: 'V' }).value === ref.scalars.vEnd && e.measure({}, { kind: 'scope', tEnd: -1 }).error === 'bad-args', 'adapter measure (a bench), errors as codes');
  const prep = T.engine.prepare(spec, src => env => env[src] + 0);
  ok(e.run(prep({ period: 600, sf: 9 })).life === o.life, 'prepare: the expressions become numbers ($bind)');
  const self = {}; (new Function('self', T.engine.workerSource))(self);
  ok(JSON.stringify(self.noemaEngine.create(spec, { seed: 3, faults: [{ kind: 'antenna-detached' }] }).run({ period: 600, sf: 9 })) === JSON.stringify(o), 'workerSource: the same results in a fresh global');
}

// ---------- 5. check(), budget, speed, parity ----------
{
  ok(T.check(simple()).length === 0, 'a correct device has no problems');
  ok(codes(null).includes('format') && codes({ ...simple(), format: 'x' }).includes('format'), 'check: not a device / wrong format');
  ok(codes({ schedule: { period: 60 }, sim: { duration: 60 } }).includes('value'), 'check: no battery');
  ok(codes({ ...simple(), sensors: [{ id: 'a' }, { id: 'a' }] }).includes('dup-id') && codes({ ...simple(), sensors: [{ id: '1a' }] }).includes('value'), 'check: duplicate / bad sensor id');
  ok(codes({ ...simple(), battery: { capacity: 100, chem: 'custom', curve: [{ soc: 0, v: 3 }, { soc: 0.5, v: 2 }, { soc: 1, v: 3.3 }] } }).includes('value'), 'check: a custom curve that falls');
  ok(codes({ ...simple(), battery: { capacity: 100, chem: 'li-ion', curve: [] } }, 'warning').includes('unknown-field'), 'check: a curve on a built-in chemistry → warning');
  ok(codes({ ...simple(), schedule: { period: 1, sense: 2 } }).includes('value') && codes({ ...simple(), radio: { tech: 'zigbee' } }).includes('enum'), 'check: sensing longer than the period; unknown tech');
  ok(codes({ ...simple(), sim: { duration: 365 * DAY, maxEvents: 1000 } }).includes('budget'), 'check: more events than sim.maxEvents → "budget"');
  const bd = simple(); bd.battery.rInt = 3; bd.brownout = { v: 4.1 }; bd.sim = { duration: 6000, maxEvents: 300 };
  ok(T.check(bd).length === 0 && throwsCode(() => T.create(bd).run(), 'budget'), 'run: brown-out resets push the events past maxEvents → code "budget"');
  ok(throwsCode(() => T.create({ battery: {} }), 'invalid'), 'create() refuses a bad device: code "invalid"');
  const yr = lossy(); yr.schedule.period = 600; yr.sim.duration = 365 * DAY;
  const t0 = process.hrtime.bigint(); const ry = sim(yr); const ms = Number(process.hrtime.bigint() - t0) / 1e6; acc.ms = ms;
  ok(ry.scalars.wakes === 52560 && ms < 500, `one year at a 10-minute period (52560 wakes): ${ms.toFixed(1)} ms (< 500 ms)`);
  const mo = simple(); mo.sim.duration = 30 * DAY; mo.schedule.period = 10; mo.sim.maxEvents = 2000000;
  const t1 = process.hrtime.bigint(); sim(mo); const ms2 = Number(process.hrtime.bigint() - t1) / 1e6; acc.ms2 = ms2;
  ok(ms2 < 1500, `30 days at a 10 s period (259200 wakes): ${ms2.toFixed(1)} ms`);
}
{
  const d = simple(), dv = { ...d, sensors: [{ id: 'temp' }, { id: 'hum' }] };
  const devices = [
    d, null, 5, { ...d, format: 'noema.twin/v1' }, { ...d, format: 'twin' }, { battery: {}, schedule: {}, sim: {} }, { schedule: { period: 60 }, sim: { duration: 60 } },
    { ...d, battery: { capacity: '2k', chem: 'lead' } }, { ...d, battery: { capacity: 100, cells: 7, soc0: 1.5, selfDischarge: -1, rInt: 'x' } },
    { ...d, battery: { capacity: 100, chem: 'custom' } }, { ...d, battery: { capacity: 100, chem: 'custom', curve: [{ soc: 0, v: 3 }, { soc: 1, v: 4 }] } },
    { ...d, battery: { capacity: 100, chem: 'custom', curve: [{ soc: 0.1, v: 3 }, { soc: 1, v: 4 }] } }, { ...d, battery: { capacity: 100, curve: [{ soc: 0, v: 3 }] } },
    { ...d, battery: { capacity: 100, chem: 'custom', curve: [{ soc: 0 }, 'x'] } }, { ...d, power: { sleep: -1, tx: '40m' } }, { ...d, power: 3 },
    { ...d, schedule: { period: 0 } }, { ...d, schedule: { period: 10, sense: 10 } }, { ...d, schedule: { period: 10, txEvery: 0, retries: 9, ack: 'yes' } },
    { ...d, sensors: 'temp' }, { ...d, sensors: [{ id: 'a' }, { id: 'a' }, { base: 1 }, 5] }, { ...d, sensors: Array.from({ length: 9 }, (_, i) => ({ id: 's' + i })) },
    { ...d, radio: { tech: 'wifi' } }, { ...d, radio: { tech: 'lora', bw: 1e6 } }, { ...d, radio: { tech: 'ble', bw: 1e6, sf: 6, payload: 256 } },
    { ...d, brownout: { v: -1 } }, { ...d, sim: { duration: 365 * DAY, maxEvents: 1000 } }, { ...d, sim: { duration: 10, samples: 1, maxEvents: 6e6 } }, { ...d, colour: 'red', meta: {} },
  ];
  const faults = [
    [], 'x', [5], [{ kind: 'melt' }], [{ kind: 'sensor-stuck' }], [{ kind: 'sensor-stuck', sensor: 'hum', value: 'x' }], [{ kind: 'sensor-drift', sensor: 'temp', rate: 0.1, at: -1 }],
    [{ kind: 'battery-ageing', factor: 1.5 }], [{ kind: 'battery-ageing', factor: 'x', rInt: 0 }], [{ kind: 'antenna-detached', loss: 20, side: 'a' }],
    [{ kind: 'wake-period', period: 0 }, { kind: 'brownout', v: 3.3 }],
  ];
  const ok1 = simple();
  const specs = [
    { model: { device: ok1 }, outputs: [] }, { model: 1, outputs: [] }, { model: { device: ok1, x: 1 }, outputs: 'x' },
    { model: { device: ok1, bindings: [{ field: 'schedule.period', expr: 'p' }, { field: 'sensors', expr: 's' }, { expr: '' }, 2] }, outputs: [] },
    { model: { device: ok1 }, outputs: [{ id: 'lifeSim', kind: 'scalar' }, { id: 'x', kind: 'scalar', of: 'life' }, { id: 'r', kind: 'series', of: 'reading', sensor: 'hum' },
      { id: 'q', kind: 'series', of: 'soc', sensor: 'temp' }, { id: 'z', kind: 'map' }, 7, { id: 'readingErr', kind: 'scalar' }] },
    { model: { device: { ...ok1, sensors: [] } }, outputs: [{ id: 'readingMean', kind: 'scalar' }] }, { model: { device: { battery: 1 } }, outputs: [] },
  ];
  const total0 = devices.length + faults.length + specs.length;
  ok(total0 >= 30, `parity corpus: ${devices.length} devices + ${faults.length} fault lists + ${specs.length} specs`);
  const tmp = path.join(os.tmpdir(), 'noema-twin-parity.json'); fs.writeFileSync(tmp, JSON.stringify({ devices, faults, dv, specs }));
  const py = JSON.parse(cp.execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))}); import twin
d = json.load(open(sys.argv[1], encoding='utf-8')); print(json.dumps({'devices': [twin.check(x) for x in d['devices']], 'faults': [twin.check_faults(d['dv'], f) for f in d['faults']], 'specs': [twin.check_spec(x) for x in d['specs']]}))`, tmp], { encoding: 'utf8' }));
  const js = { devices: devices.map(x => T.check(clone(x))), faults: faults.map(f => T.checkFaults(clone(dv), clone(f))), specs: specs.map(x => T.checkSpec(clone(x))) };
  let same = 0, total = 0, found = 0;
  for (const k of ['devices', 'faults', 'specs']) js[k].forEach((r, i) => { total++; found += r.length; if (JSON.stringify(r) === JSON.stringify(py[k][i])) same++; else console.log('  ≠ ' + k + '[' + i + ']\n    js ' + JSON.stringify(r) + '\n    py ' + JSON.stringify(py[k][i])); });
  ok(same === total && found > 40, `JS ↔ Python check()/checkFaults()/checkSpec(): ${same}/${total} identical (${found} findings)`);
}

console.log(`\naccuracy: average current ${acc.iAvg.toExponential(1)} · battery life (simulated vs capacity / I) ${(100 * acc.life).toFixed(3)} % · 1 year @ 10 min ${acc.ms.toFixed(1)} ms · 30 days @ 10 s ${acc.ms2.toFixed(1)} ms`);
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
