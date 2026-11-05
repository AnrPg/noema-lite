/* timeline@1 (engine/src/48_lib_timeline.js, docs/library/timeline.md): published reference values (the source in each message),
   the calendars against ICU (node's Intl, an independent implementation) on thousands of days, the edge cases and their codes, the
   checker's codes, the sim adapter, the Worker source in a fresh global, speed.  Run: node tests/lib_timeline.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js')); require(path.join(SRC, '46_lib_core.js')); require(path.join(SRC, '48_lib_timeline.js'));
const L = globalThis.NoemaLibTimeline, J0 = L.J0;
const G = (y, m, d) => L.gToRD(y, m, d), J = (y, m, d) => L.jToRD(y, m, d);
const cv = (rd, cal, o) => L.convert(rd, cal, o);
const to = (f, o) => L.toRD(f, o);

// ---- 1. Julian Day and the two Christian calendars ----
ok(G(2000, 1, 1) + J0 === 2451545 && cv(G(2000, 1, 1), 'gregorian').weekday === 6, 'JDN of 1 Jan 2000 = 2451545, a Saturday (Meeus 1998, ch. 7)');
ok(J(1582, 10, 4) + J0 === 2299160 && G(1582, 10, 15) + J0 === 2299161, 'Julian 4 Oct 1582 = JDN 2299160, Gregorian 15 Oct 1582 = 2299161 (Meeus ch. 7)');
ok(J(-4712, 1, 1) + J0 === 0 && G(-4713, 11, 24) + J0 === 0, 'JDN 0 = 1 Jan 4713 BCE Julian = 24 Nov 4714 BCE Gregorian (definition; Meeus ch. 7)');
ok(J(333, 1, 27) + J0 === 1842713 && G(1858, 11, 17) + J0 === 2400001 && G(1970, 1, 1) + J0 === 2440588, 'JDN of 27 Jan 333 (Meeus example 7.b, JD 1842713.0), MJD 0 and the Unix epoch');
{ let same = true; for (let y = 1; y <= 3000; y += 7) for (const m of [1, 2, 3, 7, 12]) if (L.fliegel(y, m, 15) !== G(y, m, 15) + J0) same = false;
  ok(same, 'the floor formulas agree with the original Fliegel & Van Flandern (1968, CACM 11:657) for JD ≥ 0'); }
{ let rt = true; for (let rd = -2000000; rd < 1200000; rd += 997) { const g = L.rdToG(rd), j = L.rdToJ(rd); if (G(g.y, g.m, g.d) !== rd || J(j.y, j.m, j.d) !== rd) rt = false; } ok(rt, 'Gregorian and Julian round trips over 8 700 years, BCE included'); }
ok(cv(G(1900, 6, 1), 'gregorian').leap === 0 && cv(J(1900, 6, 1), 'julian').leap === 1 && cv(G(2000, 6, 1), 'gregorian').leap === 1 && cv(J(0, 6, 1), 'julian').leap === 1, 'leap rules: 1900 Gregorian common, Julian leap; 2000 leap; 1 BCE (year 0) leap in the proleptic Julian calendar');
ok(cv(J(-43, 3, 15), 'julian').eraYear === 44 && cv(J(-43, 3, 15), 'julian').era === 0 && cv(J(-43, 3, 15), 'julian').century === -1, 'year 0 does not exist in BCE/CE: astronomical −43 = 44 BCE, 1st century BCE');

// ---- 2. regions, Old Style / New Style ----
const br = { region: 'britain' };
ok(to({ cal: 'civil', y: 1752, m: 9, d: 2 }, br).rd + 1 === to({ cal: 'civil', y: 1752, m: 9, d: 14 }, br).rd, 'Britain: Wednesday 2 Sep 1752 is followed by Thursday 14 Sep 1752 (Calendar Act 1750)');
ok(Number.isNaN(to({ cal: 'civil', y: 1752, m: 9, d: 10 }, br).rd) && to({ cal: 'civil', y: 1752, m: 9, d: 10 }, br).flags[0] === 'nonexistent', '10 Sep 1752 never existed in Britain: NaN + nonexistent');
ok(cv(to({ cal: 'civil', y: 1752, m: 6, d: 1 }, br).rd, 'civil', br).yearLength === 355, 'the British year 1752 had 355 days');
ok(cv(J(1918, 1, 31) + 1, 'civil', { region: 'russia' }).d === 14 && cv(J(1918, 1, 31) + 1, 'civil', { region: 'russia' }).m === 2, 'Russia: 31 Jan 1918 (Julian) → 14 Feb 1918 (Gregorian)');
{ const sw = { region: 'sweden' }, f30 = to({ cal: 'civil', y: 1712, m: 2, d: 30 }, sw);
  ok(Number.isFinite(f30.rd) && f30.rd === J(1712, 2, 29) && Number.isNaN(to({ cal: 'civil', y: 1700, m: 2, d: 29 }, sw).rd) && cv(J(1712, 2, 29), 'civil', sw).d === 30, 'Sweden: 29 Feb 1700 left out, 30 Feb 1712 = Julian 29 Feb 1712'); }
ok(L.run({ model: {}, outputs: [{ id: 'g', kind: 'scalar', of: 'gap', year: 1700 }, { id: 'h', kind: 'scalar', of: 'gap', year: 2026 }] }, {}, {}).out.g === 11 && L.run({ model: {}, outputs: [{ id: 'h', kind: 'scalar', of: 'gap', year: 2026 }] }, {}, {}).out.h === 13, 'Gregorian − Julian: 11 days in 1700, 13 days in 2026');

// ---- 3. Easter (Meeus ch. 8; USNO) ----
const easter = (Y, rite) => { const o = f => ({ id: f, kind: 'scalar', of: 'easter', year: Y, rite, field: f }); const r = L.run({ model: {}, outputs: [o('month'), o('day')] }, {}, {}).out; return [r.month, r.day]; };
ok(['2024:3,31', '2025:4,20', '2038:4,25', '1818:3,22', '2285:3,22', '2008:3,23', '2000:4,23'].every(s => { const [Y, md] = s.split(':'); return easter(+Y, 'western').join(',') === md; }), 'Gregorian Easter 2024 31 Mar, 2025 20 Apr, 2038 25 Apr (latest), 1818 and 2285 22 Mar (earliest), 2008 23 Mar, 2000 23 Apr');
ok(easter(2024, 'orthodox').join(',') === '5,5' && easter(2025, 'orthodox').join(',') === '4,20' && easter(2026, 'orthodox').join(',') === '4,12', 'Orthodox Easter 2024 5 May, 2025 20 Apr, 2026 12 Apr (Gregorian dates of the Julian computus)');

// ---- 4. Hebrew, Islamic, Persian, Coptic, Ethiopian, Bahá'í, French, Śaka against references ----
ok(L.hNewYear(5785) === G(2024, 10, 3) && L.hDays(5785) === 355 && L.hNewYear(5786) === G(2025, 9, 23) && L.hDays(5786) === 354 && L.hNewYear(5787) === G(2026, 9, 12) && L.hDays(5787) === 385, 'Rosh Hashanah 5785 / 5786 / 5787 = 3 Oct 2024 (355 d) / 23 Sep 2025 (354 d) / 12 Sep 2026 (385 d) (R&D 2018 ch. 8)');
ok(L.hNewYear(1) + J0 === 347998 && cv(L.hNewYear(1), 'julian').y === -3760 && cv(L.hNewYear(1), 'julian').m === 10 && cv(L.hNewYear(1), 'julian').d === 7 && cv(L.hNewYear(1), 'gregorian').weekday === 1, 'the Hebrew epoch: Monday 7 Oct 3761 BCE (Julian), JDN 347998');
{ let lens = true, days = true; for (let y = 5000; y < 6500; y++) { const d = L.hDays(y); if (![353, 354, 355, 383, 384, 385].includes(d)) lens = false; if ([0, 3, 5].includes(cv(L.hNewYear(y), 'gregorian').weekday)) days = false; }
  ok(lens && days, 'Hebrew years 5000–6499: every length is 353–355 or 383–385, and 1 Tishri is never a Sunday, Wednesday or Friday (lo ADU Rosh)'); }
ok(to({ cal: 'hebrew', y: 5786, m: 1, d: 15 }).rd === G(2026, 4, 2), 'the 1st day of Passover 5786 = 2 Apr 2026');
ok(to({ cal: 'islamic', y: 1, m: 1, d: 1 }).rd + J0 === 1948440 && to({ cal: 'islamic', y: 1, m: 1, d: 1 }, { islamicEpoch: 'astronomical' }).rd + J0 === 1948439, 'the Islamic civil epoch Friday 16 Jul 622 = JDN 1948440 (astronomical: Thursday 15 Jul)');
ok(to({ cal: 'islamic', y: 1446, m: 1, d: 1 }).rd === G(2024, 7, 8) && to({ cal: 'umalqura', y: 1446, m: 1, d: 1 }).rd === G(2024, 7, 7), '1 Muharram 1446: tabular 8 Jul 2024, Umm al-Qura 7 Jul 2024');
{ const lp = []; for (let y = 1; y <= 30; y++) if (cv(to({ cal: 'islamic', y, m: 1, d: 1 }).rd, 'islamic').leap) lp.push(y); ok(lp.join(',') === '2,5,7,10,13,16,18,21,24,26,29', 'tabular Islamic leap years (type II): 2,5,7,10,13,16,18,21,24,26,29 of 30'); }
ok(to({ cal: 'persian', y: 1403, m: 1, d: 1 }).rd === G(2024, 3, 20) && to({ cal: 'persian', y: 1404, m: 1, d: 1 }).rd === G(2025, 3, 21) && to({ cal: 'persian', y: 1405, m: 1, d: 1 }).rd === G(2026, 3, 21) && cv(G(2024, 6, 1), 'persian').leap === 1, 'Nowruz 1403 / 1404 / 1405 = 20 Mar 2024 (a leap year) / 21 Mar 2025 / 21 Mar 2026 (Borkowski 1996; the 2820-year rule would give 20 Mar 2025)');
ok(to({ cal: 'ethiopic', y: 2018, m: 1, d: 1 }).rd === G(2025, 9, 11) && to({ cal: 'coptic', y: 1742, m: 1, d: 1 }).rd === G(2025, 9, 11) && to({ cal: 'ethiopic', y: 2016, m: 1, d: 1 }).rd === G(2023, 9, 12), 'Enkutatash 2018 E.C. = 1 Thout 1742 A.M. = 11 Sep 2025; 2016 E.C. began 12 Sep 2023 (2015 was leap)');
ok(to({ cal: 'bahai', y: 182, m: 1, d: 1 }).rd === G(2025, 3, 20) && to({ cal: 'bahai', y: 183, m: 1, d: 1 }).rd === G(2026, 3, 21) && ['2024:20', '2027:21', '2028:20', '2029:20', '2030:20', '2031:21'].every(s => { const [y, d] = s.split(':').map(Number); return to({ cal: 'bahai', y: y - 1843, m: 1, d: 1 }).rd === G(y, 3, d); }), 'Naw-Rúz 2024–2031 = 20, 20, 21, 21, 20, 20, 20, 21 March (Bahá\'í World Centre dates)');
ok(to({ cal: 'bahai', y: 171, m: 1, d: 1 }).rd === G(2014, 3, 21) && to({ cal: 'bahai', y: 1, m: 1, d: 1 }).rd === G(1844, 3, 21) && to({ cal: 'bahai', y: 222, m: 1, d: 1 }).flags[0] === 'out-of-range', 'Bahá\'í: 1 BE = 21 Mar 1844; 171 BE on 21 Mar; beyond 221 BE: out-of-range');
{ const W = '21 20 20 21 21 20 20 21 21 20 20 21 21 20 20 20 21 20 20 20 21 20 20 20 21 20 20 20 21 20 20 20 21 20 20 20 21 20 20 20 21 20 20 20 20 20 20 20 20 20'.split(' ').map(Number);
  ok(W.every((d, i) => L.nawRuz(172 + i).rd === G(2015 + i, 3, d)) && W.slice(0, 49).every((d, i) => to({ cal: 'bahai', y: 172 + i, m: 1, d: 1 }).rd === G(2015 + i, 3, d)), 'Bahá\'í Naw-Rúz 172–221 BE = 2015–2064, every year as in the Bahá\'í World Centre table "Badí\' dates 172 to 221 BE" (2014; e.g. 216 BE = 20 Mar 2059, 212 BE = 21 Mar 2055)'); }
ok(to({ cal: 'french', y: 8, m: 2, d: 18 }).rd === G(1799, 11, 9) && to({ cal: 'french', y: 2, m: 11, d: 9 }).rd === G(1794, 7, 27), '18 Brumaire VIII = 9 Nov 1799; 9 Thermidor II = 27 Jul 1794');
ok(to({ cal: 'saka', y: 1947, m: 1, d: 1 }).rd === G(2025, 3, 22) && to({ cal: 'saka', y: 1946, m: 1, d: 1 }).rd === G(2024, 3, 21), '1 Chaitra 1947 Śaka = 22 Mar 2025; 1946 = 21 Mar 2024 (a Gregorian leap year)');

// ---- 5. the calendars against ICU (node's Intl: an independent implementation) ----
{
  const fmt = c => new Intl.DateTimeFormat('en-u-ca-' + c, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const parts = (f, rd) => Object.fromEntries(f.formatToParts(new Date((rd - 719163) * 86400000)).map(p => [p.type, p.value]));
  const HEBM = ['Nisan', 'Iyar', 'Sivan', 'Tamuz', 'Av', 'Elul', 'Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar'];
  const cases = { 'islamic-civil': 'islamic', 'islamic-umalqura': 'umalqura', persian: 'persian', coptic: 'coptic', ethiopic: 'ethiopic', indian: 'saka', hebrew: 'hebrew', chinese: 'chinese', dangi: 'dangi', roc: 'roc' };
  for (const [icu, cal] of Object.entries(cases)) {
    const f = fmt(icu); let bad = 0, tot = 0, first = '';
    for (let rd = G(cal === 'roc' ? 1912 : 1900, 3, 1); rd < G(2099, 12, 1); rd += 37) {
      const p = parts(f, rd), r = cv(rd, cal); tot++;
      let y = +(p.year || p.relatedYear), m = p.month, d = +p.day, mm;
      if (cal === 'hebrew') { mm = p.month === 'Adar I' ? 12 : p.month === 'Adar II' || p.month === 'Adar' && r.leap ? (p.month === 'Adar' ? 12 : 13) : HEBM.indexOf(p.month) + 1; if (p.month === 'Adar' && r.leap) mm = 13; }
      else mm = parseInt(m, 10);
      const lp = /bis/.test(m) ? 1 : 0;
      const same = r.y === y && r.m === mm && r.d === d && ((cal !== 'chinese' && cal !== 'dangi') || r.leap === lp);
      if (!same) { bad++; if (!first) first = `${rd} ICU ${JSON.stringify(p)} ours ${JSON.stringify(r)}`; }
    }
    ok(bad === 0, `${cal}: the same dates as ICU (${icu}) on ${tot} days 1900–2099 ${first}`);
  }
}

// ---- 6. eras of the ancient world ----
const at = (cal, rd, o) => cv(rd, cal, o);
ok(at('olympiad', J(-479, 8, 20)).ol === 75 && at('olympiad', J(-479, 8, 20)).oy === 1 && at('olympiad', J(-775, 8, 1)).ol === 1 && at('olympiad', J(393, 8, 1)).ol === 293, 'Ol. 75.1 = summer 480 BCE (Salamis); Ol. 1.1 = 776 BCE; Ol. 293 = 393 CE (the last one)');
ok(at('auc', J(-43, 3, 15)).y === 710 && at('auc', J(1, 6, 1)).y === 754 && at('auc', J(-43, 3, 15), { auc: 'cato' }).y === 709, 'AUC (Varro): 44 BCE = 710, 1 CE = 754; Cato: 709');
ok(at('byzantine', J(1453, 5, 29)).y === 6961 && at('byzantine', J(2025, 9, 1)).indiction === 4 && at('byzantine', J(2025, 8, 31)).indiction === 3, 'Anno Mundi 6961 = 29 May 1453; indiction 4 from 1 Sep 2025 (3 before)');
ok(to({ cal: 'nabonassar', y: 1, m: 1, d: 1 }).rd + J0 === 1448638 && at('nabonassar', J(139, 7, 20)).y === 887 && at('nabonassar', J(139, 7, 20)).m === 1 && at('nabonassar', J(139, 7, 20)).d === 1, 'Era of Nabonassar: 1 Thoth year 1 = JD 1448638 (26 Feb 747 BCE); 1 Thoth 887 = 20 Jul 139 CE (Censorinus\' Sothic year)');
ok(at('seleucid', J(-311, 10, 15)).y === 1 && at('seleucid', J(-310, 4, 15), { seleucid: 'babylonian' }).y === 1, 'Seleucid era 1: autumn 312 BCE (Macedonian), spring 311 BCE (Babylonian)');
ok(at('spanish', J(1062, 6, 1)).y === 1100 && at('holocene', G(1, 6, 1)).y === 10001 && at('bp', G(1950, 6, 1)).y === 0 && at('b2k', G(1950, 6, 1)).y === 50, 'Spanish era 1100 = 1062 CE; 1 CE = 10 001 HE; 1950 = 0 BP = 50 b2k');
{ const r = (m, d, y) => at('roman', J(y || 2001, m, d));
  const s = x => [x.ref, x.count, x.month, x.bis].join(',');
  ok(s(r(3, 15)) === '3,1,3,0' && s(r(3, 2)) === '2,6,3,0' && s(r(2, 14)) === '1,16,3,0' && s(r(12, 25)) === '1,8,1,0' && s(r(12, 31)) === '1,2,1,0' && s(r(1, 1)) === '1,1,1,0' && s(r(3, 6)) === '2,2,3,0',
    'Roman day names: Idibus Martiis, a.d. VI Non. Mart., a.d. XVI Kal. Mart., a.d. VIII Kal. Ian. (25 Dec), pridie Kal. Ian., Kalendis Ianuariis, pridie Non. Mart. (Blackburn & Holford-Strevens 1999)');
  ok(s(r(2, 24, 2004)) === '1,6,3,1' && s(r(2, 25, 2004)) === '1,6,3,0' && s(r(2, 29, 2004)) === '1,2,3,0', 'the bissextile day: 24 Feb of a leap year is a.d. bis VI Kal. Mart.'); }

// ---- 7. world calendars: Chinese, Japanese, Korean, Buddhist, Maya, Hindu ----
ok(at('chinese', G(1984, 6, 1)).cycle === 1 && at('chinese', G(2024, 6, 1)).cycle === 41 && at('chinese', G(2026, 6, 1)).cycle === 43 && at('chinese', G(2025, 1, 28)).y === 2024 && to({ cal: 'chinese', y: 2025, m: 1, d: 1 }).rd === G(2025, 1, 29), 'sexagenary years: 1984 甲子 (1), 2024 甲辰 (41), 2026 丙午 (43); Chinese New Year 2025 = 29 Jan (28 Jan still 2024)');
ok(L.dayCycle(G(1949, 10, 1)).dayCycle === 1 && L.dayCycle(G(2000, 1, 1)).dayCycle === 55, 'sexagenary days: 1 Oct 1949 甲子 (1); 1 Jan 2000 戊午 (55)');
ok(to({ cal: 'chinese', y: 2023, m: 2, d: 1, leap: true }).rd === G(2023, 3, 22) && to({ cal: 'chinese', y: 2033, m: 11, d: 1, leap: true }).rd === G(2033, 12, 22) && to({ cal: 'chinese', y: 2024, m: 2, d: 1, leap: true }).flags[0] === 'nonexistent', 'leap months: 閏二月 2023 from 22 Mar; the leap 11th month of 2033; no leap 2nd month in 2024 (nonexistent)');
ok(to({ cal: 'chinese', y: 1899, m: 1, d: 1 }).flags[0] === 'out-of-range' && at('chinese', G(1850, 1, 1)).flags[0] === 'out-of-range' && at('chinese', G(1850, 1, 1)).dayCycle > 0, 'outside 1900–2100: out-of-range (the sexagenary day stays computable)');
ok(to({ cal: 'japanese', era: 'reiwa', y: 1, m: 5, d: 1 }).rd === G(2019, 5, 1) && at('japanese', G(2019, 4, 30)).era === 3 && at('japanese', G(2019, 4, 30)).y === 31 && to({ cal: 'japanese', era: 'heisei', y: 32, m: 1, d: 1 }).flags[0] === 'nonexistent' && to({ cal: 'japanese', era: 'meiji', y: 5, m: 1, d: 1 }).flags[0] === 'out-of-range', 'Reiwa 1 = 1 May 2019; 30 Apr 2019 = Heisei 31; Heisei 32 never was; Meiji 5 (lunisolar) out-of-range');
ok(at('thai', G(1941, 1, 1)).y === 2484 && at('thai', G(1940, 3, 1)).y === 2482 && at('thai', G(1940, 4, 1)).y === 2483 && to({ cal: 'thai', y: 2483, m: 2, d: 1 }).flags[0] === 'nonexistent' && at('thai', G(2025, 6, 1)).y === 2568, 'Thai BE: 1 Jan 1941 = 2484, 1 Mar 1940 = 2482; BE 2483 had no January–March; 2025 = 2568');
ok(at('dangun', G(2025, 6, 1)).y === 4358 && at('roc', G(2025, 6, 1)).y === 114 && at('juche', G(2025, 6, 1)).y === 114 && at('buddhist', G(2025, 6, 1)).y === 2569, 'Dangi 4358, Minguo 114, Juche 114, Buddhist Era (Sri Lanka) 2569 in 2025');
{ const m0 = at('maya', 584283 - J0), m1 = at('maya', G(2012, 12, 21)), m2 = at('maya', G(2026, 11, 5));
  ok([m0.b, m0.k, m0.tun, m0.w, m0.kin].join('.') === '0.0.0.0.0' && m0.tzNum === 4 && m0.tzName === 19 && m0.haabMonth === 17 && m0.haabDay === 8 && m0.lord === 9, 'Maya creation (GMT 584283): 4 Ajaw 8 Kumk\'u, G9, = 11 Aug 3114 BCE (R&D ch. 11)');
  ok(m1.b === 13 && m1.k === 0 && m1.tzNum === 4 && m1.tzName === 19 && m1.haabMonth === 13 && m1.haabDay === 3 && L.rdToG(584283 - J0).y === -3113 && L.rdToG(584283 - J0).m === 8 && L.rdToG(584283 - J0).d === 11, '21 Dec 2012 = 13.0.0.0.0 4 Ajaw 3 K\'ank\'in');
  ok([m2.b, m2.k, m2.tun, m2.w, m2.kin].join('.') === '13.0.14.1.7' && m2.tzNum === 1 && m2.tzName === 6 && m2.haabMonth === 11 && m2.haabDay === 0, '5 Nov 2026 = 13.0.14.1.7 1 Manik\' 0 Keh');
  { const pk = to({ cal: 'maya', lc: [9, 12, 11, 5, 18] }).rd, pc = at('maya', pk);
    ok(at('maya', G(2012, 12, 21), { maya: 584285 }).kin === 18 && Number.isNaN(to({ cal: 'maya', lc: [9, 12, 11, 5, 18] }, { maya: 12.5 }).rd) && pk === J(683, 8, 26) && to({ cal: 'maya', lc: [9, 12, 11, 5, 18] }, { maya: 584285 }).rd === J(683, 8, 28) && pc.tzNum === 6 && pc.tzName === 17 && pc.haabMonth === 9 && pc.haabDay === 11,
      'the correlation is a parameter: K\'inich Janaab\' Pakal\'s death 9.12.11.5.18 6 Etz\'nab 11 Yax = 26 Aug 683 (Julian, GMT 584283), 28 Aug with 584285 (the date usually quoted; Martin & Grube 2008)'); } }
{ let rt = true; for (let rd = 0; rd < 800000; rd += 331) { const h = at('hindusolar', rd); if (to({ cal: 'hindusolar', y: h.y, m: h.m, d: h.d }).rd !== rd) rt = false; }
  ok(rt && L.rdToJ(-1132959).y === -3101 && L.rdToJ(-1132959).m === 2 && L.rdToJ(-1132959).d === 18 && at('hindusolar', G(2025, 6, 1)).y === 5126, 'old Hindu solar (Ārya-siddhānta, R&D ch. 10): round trip; Kali Yuga epoch 18 Feb 3102 BCE; 5126 years elapsed in mid-2025'); }

// ---- 8. radiocarbon, densities, Allen's relations, durations, regnal years, dendrochronology (whole specs) ----
const R = (model, outputs, env) => L.run({ model, outputs }, env || {}, { seed: 7 });
{ const r = R({}, [{ id: 'a', kind: 'scalar', of: 'c14age', F: 0.5 }, { id: 'b', kind: 'scalar', of: 'c14age', F: 0.9 }, { id: 's', kind: 'scalar', of: 'c14age', F: 0.9, Fsd: 0.003, field: 'sd' }, { id: 'c', kind: 'scalar', of: 'c14age', F: 0.5, field: 'age5730' }, { id: 'p', kind: 'scalar', of: 'c14age', F: 1.1 }]);
  ok(near(r.out.a, 5568, 0.5) && near(r.out.b, 846.4, 0.5) && near(r.out.s, 26.8, 0.2) && near(r.out.c, 5730, 0.5), 'conventional radiocarbon ages: F = 0.5 → 5568 BP, F = 0.9 → 846 BP ± 26.8 (Stuiver & Polach 1977); 5730 with the Cambridge half-life');
  ok(r.out.p < 0 && r.codes.some(c => c.code === 'post-bomb'), 'F¹⁴C > 1: a negative age and the code post-bomb'); }
{ const m = { events: [{ id: 'x', c14: { age: 3000, sd: 30, curve: 'linear' } }] };
  const st = s => ({ id: s, kind: 'scalar', of: 'stat', event: 'x', stat: s, unit: 'bp' });
  const r = R(m, [st('mean'), st('lo95'), st('hi95'), st('lo68'), st('hi68')]).out;
  ok(near(r.mean, 3000, 0.5) && near(r.lo95, 2940, 1) && near(r.hi95, 3060, 1) && near(r.lo68, 2970, 1) && near(r.hi68, 3030, 1), 'calibration on a linear curve: 3000 ± 30 BP → mean 3000, HPD 95.4 % [2940, 3060], 68.3 % [2970, 3030] (analytic)'); }
{ // a curve with a plateau (author-supplied segment): the calibrated range is wide and two-sided
  const calBP = [], age = [], sd = []; for (let th = 2300; th <= 2800; th += 10) { calBP.push(th); age.push(th < 2450 ? th : th > 2700 ? th - 250 : 2450); sd.push(15); }
  const m = { c14curve: { calBP, age, sd }, events: [{ id: 'h', c14: { age: 2450, sd: 25, curve: 'model' } }, { id: 'o', c14: { age: 9000, sd: 25, curve: 'model' } }] };
  const r = R(m, [{ id: 'lo', kind: 'scalar', of: 'stat', event: 'h', stat: 'lo95', unit: 'bp' }, { id: 'hi', kind: 'scalar', of: 'stat', event: 'h', stat: 'hi95', unit: 'bp' }, { id: 'f', kind: 'scalar', of: 'flag', event: 'o', flag: 'out-of-range' }]);
  ok(r.out.hi - r.out.lo > 230 && r.out.f === 1, 'a plateau (like the Hallstatt plateau, 2450 BP) spreads the calibrated date over > 230 years; an age outside the curve → out-of-range'); }
{ const m = { events: [{ id: 'a', between: [{ cal: 'jdn', j: 2400000 }, { cal: 'jdn', j: 2410000 }] }, { id: 'b', between: [{ cal: 'jdn', j: 2405000 }, { cal: 'jdn', j: 2415000 }] }] };
  const r = R(m, [{ id: 'p', kind: 'scalar', of: 'relation', a: 'a', b: 'b', rel: 'before' }]);
  ok(near(r.out.p, 0.875, 0.015), 'Monte Carlo: P(A before B) with A ~ U[0, 10 000], B ~ U[5 000, 15 000] days = 0.875 (analytic; seeded, N = 20 000)'); }
{ const m = { events: [{ id: 'caesar', date: { cal: 'julian', y: 44, era: 'bce', m: 3, d: 15 } }, { id: 'aug', date: { cal: 'julian', y: 14, era: 'ce', m: 8, d: 19 } }],
    periods: [{ id: 'reign', start: { cal: 'julian', y: 27, era: 'bce', m: 1, d: 16 }, end: { cal: 'julian', y: 14, m: 8, d: 19 } }] };
  const r = R(m, [{ id: 'y', kind: 'scalar', of: 'duration', a: 'caesar', b: 'aug', unit: 'calendarYears' }, { id: 'r', kind: 'scalar', of: 'duration', a: 'reign', b: 'reign', unit: 'calendarYears' },
    { id: 'd', kind: 'scalar', of: 'duration', a: 'caesar', b: 'aug' }, { id: 'in', kind: 'scalar', of: 'relation', a: 'caesar', b: 'reign', rel: 'before' }, { id: 'e', kind: 'scalar', of: 'flag', event: 'caesar', flag: 'julian-error' }]);
  ok(r.out.y === 57 && r.out.r === 40 && r.out.d === 20976 && r.out.in === 1 && r.out.e === 1, '44 BCE → 14 CE = 57 years (no year 0); Augustus 27 BCE – 14 CE = 40; 20 976 days; a date of 44 BCE carries julian-error'); }
{ const m = { events: [{ id: 'e', date: { cal: 'julian', y: 1, m: 1, d: 1 }, sdYears: 10 }] };
  const r = R(m, [{ id: 's', kind: 'scalar', of: 'stat', event: 'e', stat: 'sd' }, { id: 'w', kind: 'scalar', of: 'within', event: 'e', from: { cal: 'julian', y: 10, era: 'bce' }, to: { cal: 'julian', y: 10, m: 12, d: 31 } }]);
  ok(near(r.out.s, 10, 0.05) && near(r.out.w, 0.68, 0.02), 'circa: sd 10 years → P(within ±1 sd) ≈ 0.683'); }
{ const m = { reigns: [{ id: 'h8', start: { cal: 'julian', y: 1509, m: 4, d: 22 } }, { id: 'nb', start: { cal: 'julian', y: 605, era: 'bce', m: 9, d: 7 }, mode: 'accession', newYearM: 4, newYearD: 1 }],
    events: [{ id: 'x', date: { cal: 'julian', y: 1513, m: 6, d: 1 } }, { id: 'y', date: { cal: 'julian', y: 604, era: 'bce', m: 2, d: 1 } }, { id: 'z', date: { cal: 'julian', y: 604, era: 'bce', m: 5, d: 1 } }] };
  const r = R(m, [{ id: 'a', kind: 'scalar', of: 'regnal', reign: 'h8', event: 'x' }, { id: 'b', kind: 'scalar', of: 'regnal', reign: 'nb', event: 'y' }, { id: 'c', kind: 'scalar', of: 'regnal', reign: 'nb', event: 'z' }]);
  ok(r.out.a === 5 && r.out.b === 0 && r.out.c === 1, 'regnal years: 1 Jun 1513 = 5 Hen. VIII (from 22 Apr 1509); Babylonian accession year 0, then year 1 from Nisan'); }
{ const r = R({ dendro: { synthetic: { n: 400, len: 80, offset: 100, noise: 0 }, masterStart: 1200 } }, [{ id: 'l', kind: 'scalar', of: 'crossdate', field: 'lag' }, { id: 't', kind: 'scalar', of: 'crossdate', field: 't' }, { id: 'y', kind: 'scalar', of: 'crossdate', field: 'year' }, { id: 'g', kind: 'scalar', of: 'crossdate', field: 'glk' }, { id: 'tt', kind: 'series', of: 'crossdate', part: 'y' }]);
  ok(r.out.l === 100 && r.out.t === 99 && r.out.y === 1300 && r.out.g === 1 && r.out.tt.length > 300, 'cross-dating: a sample cut from the master at ring 100 is found at lag 100 (t capped at 99, Gleichläufigkeit 1)');
  const r2 = R({ dendro: { synthetic: { n: 400, len: 80, offset: 250, noise: 0.15 } } }, [{ id: 'l', kind: 'scalar', of: 'crossdate', field: 'lag' }, { id: 't', kind: 'scalar', of: 'crossdate', field: 't' }]);
  ok(r2.out.l === 250 && r2.out.t > 3.5, `with noise the match still stands at t > 3.5 (Baillie & Pilcher 1973): t = ${r2.out.t.toFixed(1)}`); }

// ---- 9. the checker (codes, paths, messages) ----
const spec = (model, outputs) => ({ format: 'noema.sim-spec/v1', engine: 'timeline@1', params: [], model, outputs: outputs || [] });
const codes = s => L.checkSpec(s).map(p => `${p.level[0]}:${p.code}:${p.path}`);
ok(codes(spec({ events: [{ id: 'a', date: { cal: 'julian', y: 0, era: 'bce' } }] })).includes('e:year-zero:model.events[0].date.y'), 'year 0 with an era: year-zero');
ok(codes(spec({ events: [{ id: 'a', date: { cal: 'hebrew', y: 5785 } }] })).join() === 'e:value:model.events[0].date.m,e:value:model.events[0].date.d', 'a Hebrew date needs y, m, d');
ok(codes(spec({ events: [{ id: 'a', date: { cal: 'maya', lc: [9, 0, 0, 0, 0], y: 3 } }] })).includes('w:unused:model.events[0].date.y'), 'a field the calendar does not use: a warning');
ok(codes(spec({ events: [{ id: 'a' }, { id: 'a', date: { cal: 'jdn', j: 1 }, c14: { age: 1, sd: 1 } }] })).join() === 'e:duplicate:model.events[1].id,e:value:model.events[0],e:value:model.events[1]', 'ids used twice; exactly one kind of date');
ok(codes(spec({ events: [{ id: 'a', c14: { age: 100, sd: 20, curve: 'model' } }] })).includes('e:ref:model.events[0].c14.curve'), 'a model curve needs model.c14curve');
ok(codes(spec({ events: [] }, [{ id: 'x', kind: 'scalar', of: 'convert', event: 'b', to: 'hebrew', field: 'eraYear' }, { id: 'y', kind: 'scalar', of: 'nope' }, { id: 'z', kind: 'series', of: 'crossdate', part: 'x' }])).join() === 'e:ref:outputs[0].event,e:enum:outputs[0].field,e:output:outputs[1].of,e:ref:outputs[2].of', 'outputs: an unknown event, a field the calendar has not, an unknown output, crossdate without model.dendro');
ok(codes(spec({ events: [{ id: 'a', date: { cal: 'japanese', y: 3, era: 'bce' } }] })).includes('e:enum:model.events[0].date.era'), 'a Japanese date needs an era name');
ok(L.checkSpec(spec({ events: [{ id: 'a', date: { cal: 'gregorian', y: 'Y + 1', m: 2 } }] }, [{ id: 'k', kind: 'scalar', of: 'easter', year: 'Y', field: 'day' }])).length === 0
  && JSON.stringify(L.exprs(spec({ events: [{ id: 'a', date: { cal: 'gregorian', y: 'Y + 1', m: 2 } }] }, [{ id: 'k', kind: 'scalar', of: 'easter', year: 'Y', field: 'day' }]))) === '[["Y + 1","model.events[0].date.y",[]],["Y","outputs[0].year",[]]]', 'exprs: every expression of the model and the outputs, with its path');
ok(JSON.stringify(L.keys(spec({ events: [{ id: 'a', date: { cal: 'jdn', j: 1 }, label: 'evA' }], axis: { bceKey: 'bce' } }))) === '[["evA","model.events[0].label"],["bce","model.axis.bceKey"]]', 'keys: every string key the model names');

// ---- 10. the sim adapter, the Worker, speed ----
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'calendar-synchronism', 'spec.json'), 'utf8'));
ok(L.checkSpec(EX).filter(p => p.level === 'error').length === 0, 'the reference activity calendar-synchronism has no errors');
const inst = L.engine.create(EX, { seed: 1 }), env = Object.fromEntries(EX.params.map(p => [p.id, p.default]));
let t0 = Date.now(); const o1 = inst.run(env); const dt = Date.now() - t0;
ok(EX.outputs.every(o => o.id in o1) && Number.isFinite(o1.olYear) && o1.chart && Array.isArray(o1.chart.items) && o1.chart.items.length > 5, 'engine.create(spec).run(inputs) gives every declared output (numbers and the scene)');
ok(dt < 50, `a typical run takes < 50 ms (${dt} ms)`);
{ const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx); vm.runInContext('var self = this.self;' + L.engine.workerSource, ctx);
  const w = ctx.self.noemaEngine.create(EX, { seed: 1 }).run(env);
  ok(JSON.stringify(w) === JSON.stringify(o1), 'the Worker source in a fresh global gives the same outputs'); }
{ const big = spec({ events: Array.from({ length: 200 }, (_, i) => ({ id: 'e' + i, c14: { age: 1000 + 10 * i, sd: 40, curve: 'linear' } })), mc: 50000 },
    [{ id: 'p', kind: 'scalar', of: 'relation', a: 'e0', b: 'e199', rel: 'before' }, { id: 's', kind: 'scene', of: 'timeline' }, ...Array.from({ length: 20 }, (_, i) => ({ id: 'q' + i, kind: 'scalar', of: 'stat', event: 'e' + i * 9, stat: 'lo95' }))]);
  t0 = Date.now(); const r = L.run(big, {}, { seed: 1 }); const d2 = Date.now() - t0;
  ok(d2 < 2000 && r.out.p === 0 && r.out.s.items.length <= 2000, `the worst allowed model (200 calibrated dates, 50 000 draws, a scene) runs in < 2 s (${d2} ms)`); }
ok(Number.isNaN(L.engine.create(spec({ events: [{ id: 'a', date: { cal: 'gregorian', y: 'nope(' } }] }, [{ id: 'x', kind: 'scalar', of: 'convert', event: 'a', to: 'julian', field: 'y' }])).run({}).x), 'a date that cannot be computed gives NaN, never throws');
console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
