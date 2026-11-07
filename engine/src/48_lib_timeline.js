/* ===================== timeline@1 — chronology in every calendar: the engine library of sim-spec@1 (docs/library/timeline.md) =====================
   Events and periods on one time axis (Rata Die days, Reingold & Dershowitz), in 33 calendars and eras — none of them "the" calendar:
   any era can be the main axis. Dates may be uncertain (circa, ranges, terminus post/ante quem, radiocarbon), questions are answered
   as numbers (a converted date's fields, durations, probabilities of Allen's relations, statistics of a dating), and every limit of
   validity is a code (a proleptic date, a day that never existed in a region, a table's range, an approximation).
   Sources (every function names its own): E. M. Reingold & N. Dershowitz, Calendrical Calculations, 4th ed. (CUP 2018) — "R&D";
   J. Meeus, Astronomical Algorithms, 2nd ed. (1998); H. F. Fliegel & T. C. Van Flandern, CACM 11 (1968) 657; K. Borkowski, Earth
   Moon Planets 74 (1996) 223; M. Stuiver & H. A. Polach, Radiocarbon 19 (1977) 355; M. G. L. Baillie & J. R. Pilcher, Tree-Ring
   Bulletin 33 (1973) 7; J. F. Allen, CACM 26 (1983) 832. Tables (Chinese and Korean months 1900–2100, Umm al-Qura 1300–1600 AH)
   were generated once from ICU 78 (Unicode License v3) with node's Intl; the Bahá'í Naw-Rúz table 172–221 BE from the March equinox
   (Meeus ch. 27) and the geometric sunset in Tehran, checked against the Bahá'í World Centre dates published for 2024–2031.
   Pure, bounded, deterministic; no DOM, no clock; numbers and codes only. Tests: node tests/lib_timeline.js */
(function noemaLibTimelineModule(root) {
  /* i18n-ignore-start */
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'timeline@1';
  const T = {"CALS":["gregorian","julian","civil","jdn","hebrew","islamic","umalqura","persian","coptic","ethiopic","bahai","french","saka","hindusolar","vikram","chinese","dangi","japanese","roc","thai","buddhist","dangun","juche","holocene","bp","b2k","maya","olympiad","auc","byzantine","nabonassar","seleucid","spanish"],"OUTCALS":["gregorian","julian","civil","jdn","hebrew","islamic","umalqura","persian","coptic","ethiopic","bahai","french","saka","hindusolar","vikram","chinese","dangi","japanese","roc","thai","buddhist","dangun","juche","holocene","bp","b2k","maya","olympiad","auc","byzantine","nabonassar","seleucid","spanish","roman"],"FIELDS":{"gregorian":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century"],"julian":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century"],"civil":["y","m","d","eraYear","era","weekday","isoWeekday","leap","yearLength","monthLength","dayOfYear","century","gregorian"],"jdn":["j","mjd","rd","weekday"],"roman":["ref","count","month","bis"],"hebrew":["y","m","d","leap","yearLength","monthLength","weekday"],"islamic":["y","m","d","leap","yearLength","monthLength","weekday"],"umalqura":["y","m","d","leap","yearLength","monthLength","weekday"],"persian":["y","m","d","leap","yearLength","monthLength","weekday"],"coptic":["y","m","d","leap","yearLength","monthLength","weekday"],"ethiopic":["y","m","d","leap","yearLength","monthLength","weekday","aa"],"bahai":["y","m","d","leap","yearLength","monthLength","weekday","vahid","kull","yearInVahid"],"french":["y","m","d","leap","yearLength","monthLength","weekday","decade","dayOfDecade"],"saka":["y","m","d","leap","yearLength","monthLength","weekday"],"hindusolar":["y","m","d","weekday"],"nabonassar":["y","m","d","weekday"],"vikram":["y"],"seleucid":["y"],"spanish":["y","m","d"],"bp":["y"],"b2k":["y"],"chinese":["y","m","d","leap","monthLength","yearLength","stem","branch","cycle","dayStem","dayBranch","dayCycle"],"japanese":["era","y","m","d"],"roc":["y","m","d"],"thai":["y","m","d"],"buddhist":["y","m","d"],"dangun":["y","m","d"],"juche":["y","m","d"],"holocene":["y","m","d"],"maya":["b","k","tun","w","kin","days","tzNum","tzName","haabMonth","haabDay","lord","round"],"olympiad":["ol","oy"],"auc":["y","m","d"],"byzantine":["y","m","d","indiction"],"dangi":["y","m","d","leap","monthLength","yearLength","stem","branch","cycle","dayStem","dayBranch","dayCycle"]},"IN":{"gregorian":{"req":["y"],"opt":["m","d","era"]},"julian":{"req":["y"],"opt":["m","d","era"]},"civil":{"req":["y"],"opt":["m","d","era"]},"jdn":{"req":["j"],"opt":[]},"hebrew":{"req":["y","m","d"],"opt":[]},"islamic":{"req":["y","m","d"],"opt":[]},"umalqura":{"req":["y","m","d"],"opt":[]},"persian":{"req":["y","m","d"],"opt":[]},"coptic":{"req":["y","m","d"],"opt":[]},"ethiopic":{"req":["y","m","d"],"opt":[]},"bahai":{"req":["y","m","d"],"opt":[]},"french":{"req":["y","m","d"],"opt":[]},"saka":{"req":["y","m","d"],"opt":[]},"hindusolar":{"req":["y","m","d"],"opt":[]},"nabonassar":{"req":["y","m","d"],"opt":[]},"vikram":{"req":["y"],"opt":[]},"seleucid":{"req":["y"],"opt":[]},"bp":{"req":["y"],"opt":[]},"b2k":{"req":["y"],"opt":[]},"spanish":{"req":["y"],"opt":["m","d"]},"roc":{"req":["y"],"opt":["m","d"]},"thai":{"req":["y"],"opt":["m","d"]},"buddhist":{"req":["y"],"opt":["m","d"]},"dangun":{"req":["y"],"opt":["m","d"]},"juche":{"req":["y"],"opt":["m","d"]},"holocene":{"req":["y"],"opt":["m","d"]},"auc":{"req":["y"],"opt":["m","d"]},"byzantine":{"req":["y"],"opt":["m","d"]},"chinese":{"req":["y","m","d"],"opt":["leap"]},"dangi":{"req":["y","m","d"],"opt":["leap"]},"japanese":{"req":["era","y"],"opt":["m","d"]},"maya":{"req":["lc"],"opt":[]},"olympiad":{"req":["ol","oy"],"opt":[]}},"DATEF":["y","m","d","era","leap","lc","ol","oy","j"],"REGIONS":["rome","france","austria","hungary","prussia","protestant","britain","sweden","alaska","bulgaria","russia","romania","greece"],"ALLEN":["before","after","meets","metBy","overlaps","overlappedBy","starts","startedBy","during","contains","finishes","finishedBy","equals"],"MODEL":{"options":{"$obj":{"maya":"numx","auc":"enum:varro|cato|polybius|fabius","islamic":"enum:I|II|III|IV","islamicEpoch":"enum:civil|astronomical","region":"enum:rome|france|austria|hungary|prussia|protestant|britain|sweden|alaska|bulgaria|russia|romania|greece","olympiadMonth":"int:1:12","seleucid":"enum:macedonian|babylonian"}},"events":{"$list":{"$obj":{"id":"id!","date":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"sd":"numx","sdYears":"numx","pm":"numx","pmYears":"numx","between":{"$list":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"min":2,"max":2},"after":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"before":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"horizonYears":"numx","c14":{"$obj":{"age":"numx!","sd":"numx!","curve":"enum:linear|model","reservoir":"numx","reservoirSd":"numx"}},"label":"key","lane":"int:0:9"}},"max":200},"periods":{"$list":{"$obj":{"id":"id!","start":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"end":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"label":"key","lane":"int:0:9"}},"max":100},"reigns":{"$list":{"$obj":{"id":"id!","start":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"mode":"enum:anniversary|accession|nonaccession","newYearM":"int:1:12","newYearD":"int:1:31"}},"max":50},"c14curve":{"$obj":{"calBP":{"$req":true,"$list":"fin","min":2,"max":2000},"age":{"$req":true,"$list":"fin","min":2,"max":2000},"sd":{"$req":true,"$list":"nonneg","min":2,"max":2000}}},"dendro":{"$obj":{"master":{"$list":"fin","min":10,"max":3000},"sample":{"$list":"fin","min":10,"max":3000},"masterStart":"numx","minOverlap":"int:10:3000","synthetic":{"$obj":{"n":"int:30:3000","len":"int:10:3000","offset":"numx","noise":"nonneg"}}}},"axis":{"$obj":{"era":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"bceKey":"key","ceKey":"key"}},"mc":"int:500:50000"},"OUT":{"scalar":{"convert":{"id":"expr","kind":"expr","of":"expr","event":"ref!","to":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish|roman!","field":"expr!","at":"enum:median|mean|lo95|hi95"},"duration":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","unit":"enum:days|years|calendarYears","inclusive":"bool"},"relation":{"id":"expr","kind":"expr","of":"expr","a":"ref!","b":"ref!","rel":"enum:before|after|meets|metBy|overlaps|overlappedBy|starts|startedBy|during|contains|finishes|finishedBy|equals!"},"within":{"id":"expr","kind":"expr","of":"expr","event":"ref!","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"},"$req":true}},"stat":{"id":"expr","kind":"expr","of":"expr","event":"ref!","stat":"enum:mean|median|sd|lo68|hi68|lo95|hi95!","unit":"enum:year|bp|jdn"},"c14age":{"id":"expr","kind":"expr","of":"expr","F":"numx!","Fsd":"numx","year":"numx","field":"enum:age|sd|age5730|d14c|F"},"easter":{"id":"expr","kind":"expr","of":"expr","year":"numx!","rite":"enum:western|orthodox","field":"enum:month|day|jdn|julianMonth|julianDay!"},"gap":{"id":"expr","kind":"expr","of":"expr","year":"numx!"},"crossdate":{"id":"expr","kind":"expr","of":"expr","field":"enum:lag|year|t|r|glk|n!"},"regnal":{"id":"expr","kind":"expr","of":"expr","reign":"ref!","event":"ref!"},"flag":{"id":"expr","kind":"expr","of":"expr","event":"ref!","flag":"enum:proleptic|nonexistent|out-of-range|approx|julian-error|invalid!"}},"series":{"density":{"id":"expr","kind":"expr","of":"expr","event":"ref!","part":"enum:x|y!","unit":"enum:year|bp"},"crossdate":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y!"},"c14curve":{"id":"expr","kind":"expr","of":"expr","part":"enum:x|y|sd!"}},"scene":{"timeline":{"id":"expr","kind":"expr","of":"expr","era":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish","from":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}},"to":{"$obj":{"cal":"enum:gregorian|julian|civil|jdn|hebrew|islamic|umalqura|persian|coptic|ethiopic|bahai|french|saka|hindusolar|vikram|chinese|dangi|japanese|roc|thai|buddhist|dangun|juche|holocene|bp|b2k|maya|olympiad|auc|byzantine|nabonassar|seleucid|spanish!","y":"numx","m":"numx","d":"numx","era":"enum:bce|ce|meiji|taisho|showa|heisei|reiwa","leap":"bool","lc":{"$list":"numx","min":5,"max":5},"ol":"numx","oy":"numx","j":"numx"}}}}}};
  const fl = Math.floor, md = (a, b) => a - b * Math.floor(a / b);
  const isInt = v => typeof v === 'number' && Number.isInteger(v);
  const J0 = 1721425;                          // JDN = RD + 1721425 (RD 1 = Monday 1 January 1 CE, proleptic Gregorian; R&D ch. 1)
  const Y0 = 2451545;                          // JDN of 1 January 2000 (noon = J2000.0)
  const decYear = rd => 2000 + (rd + J0 - Y0) / 365.25;      // a Julian epoch (IAU): 365.25 days a year from J2000.0
  const rdOfYear = y => (y - 2000) * 365.25 + Y0 - J0;

  /* ---------- Gregorian and Julian (R&D ch. 2–3; the floor form of Fliegel & Van Flandern 1968, valid for every astronomical year) ---------- */
  function gToRD(y, m, d) { const a = fl((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + fl((153 * mm + 2) / 5) + 365 * yy + fl(yy / 4) - fl(yy / 100) + fl(yy / 400) - 32045 - J0; }
  function jToRD(y, m, d) { const a = fl((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + fl((153 * mm + 2) / 5) + 365 * yy + fl(yy / 4) - 32083 - J0; }
  function rdToG(rd) {
    const a = rd + J0 + 32044, b = fl((4 * a + 3) / 146097), c = a - fl(146097 * b / 4), d = fl((4 * c + 3) / 1461), e = c - fl(1461 * d / 4), m = fl((5 * e + 2) / 153);
    return { y: 100 * b + d - 4800 + fl(m / 10), m: m + 3 - 12 * fl(m / 10), d: e - fl((153 * m + 2) / 5) + 1 };
  }
  function rdToJ(rd) {
    const c = rd + J0 + 32082, d = fl((4 * c + 3) / 1461), e = c - fl(1461 * d / 4), m = fl((5 * e + 2) / 153);
    return { y: d - 4800 + fl(m / 10), m: m + 3 - 12 * fl(m / 10), d: e - fl((153 * m + 2) / 5) + 1 };
  }
  /** the original Fliegel & Van Flandern (1968) formula with Fortran's truncating division: valid for JD ≥ 0 only (for tests) */
  function fliegel(y, m, d) { const t = Math.trunc; return d - 32075 + t(1461 * (y + 4800 + t((m - 14) / 12)) / 4) + t(367 * (m - 2 - t((m - 14) / 12) * 12) / 12) - t(3 * t((y + 4900 + t((m - 14) / 12)) / 100) / 4); }
  const gLeap = y => md(y, 4) === 0 && (md(y, 100) !== 0 || md(y, 400) === 0);
  const jLeap = y => md(y, 4) === 0;
  const ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const mLen = (m, leap) => (m === 2 && leap ? 29 : ML[m - 1]);
  const ok = (rd, flags) => ({ rd, flags: flags || [] });
  const bad = code => ({ rd: NaN, flags: [code || 'invalid'] });
  const okYMD = (y, m, d, leap) => isInt(y) && isInt(m) && isInt(d) && m >= 1 && m <= 12 && d >= 1 && d <= mLen(m, leap);
  const GREG_START = gToRD(1582, 10, 15), JUL_START = jToRD(-44, 1, 1);   // the bull Inter gravissimas; the first Julian year (45 BCE)
  /* the civil calendar of a region: the first Gregorian day [y, m, d] (Blackburn & Holford-Strevens 1999; Richards 1998) */
  const REGION = { rome: [1582, 10, 15], france: [1582, 12, 20], austria: [1584, 1, 17], hungary: [1587, 11, 1], prussia: [1610, 9, 2], protestant: [1700, 3, 1],
    britain: [1752, 9, 14], sweden: [1753, 3, 1], alaska: [1867, 10, 18], bulgaria: [1916, 4, 14], russia: [1918, 2, 14], romania: [1919, 4, 14], greece: [1923, 3, 1] };
  // Sweden 1700–1712: 29 Feb 1700 left out, then 30 Feb 1712 added (one day ahead of the Julian calendar from 1 Mar 1700 to 30 Feb 1712)
  const SWE_A = jToRD(1700, 2, 29), SWE_B = jToRD(1712, 2, 29);

  /* ---------- Hebrew (R&D ch. 8): molad BaHaRaD, the 19-year cycle, the four dehiyyot ---------- */
  const HEB_EPOCH = -1373427;                               // RD of 1 Tishri AM 1 = Monday 7 October 3761 BCE (Julian)
  const hLeap = y => md(7 * y + 1, 19) < 7;
  function hElapsed(y) { const me = fl((235 * y - 234) / 19), parts = 12084 + 13753 * me; let day = 29 * me + fl(parts / 25920); if (md(3 * (day + 1), 7) < 3) day += 1; return day; }
  function hCorr(y) { const a = hElapsed(y - 1), b = hElapsed(y), c = hElapsed(y + 1); return c - b === 356 ? 2 : b - a === 382 ? 1 : 0; }
  const hNewYear = y => HEB_EPOCH + hElapsed(y) + hCorr(y);
  const hDays = y => hNewYear(y + 1) - hNewYear(y);
  const hLastMonth = y => (hLeap(y) ? 13 : 12);
  function hMonthLen(m, y) {           // months numbered from Nisan = 1 (Tishri = 7); 13 = Adar II
    if ([2, 4, 6, 10, 13].includes(m) || (m === 12 && !hLeap(y)) || (m === 8 && ![355, 385].includes(hDays(y))) || (m === 9 && [353, 383].includes(hDays(y)))) return 29;
    return 30;
  }
  function hToRD(y, m, d) {
    let rd = hNewYear(y) + d - 1;
    if (m < 7) { for (let k = 7; k <= hLastMonth(y); k++) rd += hMonthLen(k, y); for (let k = 1; k < m; k++) rd += hMonthLen(k, y); }
    else for (let k = 7; k < m; k++) rd += hMonthLen(k, y);
    return rd;
  }
  function rdToH(rd) {
    let y = fl((rd - HEB_EPOCH) / (35975351 / 98496)) + 1;
    while (hNewYear(y) > rd) y--; while (hNewYear(y + 1) <= rd) y++;
    let m = rd < hToRD(y, 1, 1) ? 7 : 1;
    while (rd > hToRD(y, m, hMonthLen(m, y))) m++;
    return { y, m, d: rd - hToRD(y, m, 1) + 1 };
  }

  /* ---------- Islamic tabular (R&D ch. 7; R. H. van Gent's four leap-year schemes) and Umm al-Qura (table) ---------- */
  const ISL_L = { I: [2, 5, 7, 10, 13, 15, 18, 21, 24, 26, 29], II: [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29], III: [2, 5, 8, 10, 13, 16, 19, 21, 24, 27, 29], IV: [2, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30] };
  const islEpoch = o => (o.islamicEpoch === 'astronomical' ? 227014 : 227015);   // Thursday 15 / Friday 16 July 622 (Julian)
  const iLeap = (y, o) => ISL_L[o.islamic || 'II'].includes(md(y - 1, 30) + 1);
  const iStart = (y, o) => islEpoch(o) + 354 * (y - 1) + 11 * fl((y - 1) / 30) + ISL_L[o.islamic || 'II'].filter(k => k <= md(y - 1, 30)).length;
  const iMonthLen = (m, y, o) => (m % 2 === 1 || (m === 12 && iLeap(y, o)) ? 30 : 29);
  const UQ_START = 687337, UQ = [1365,683,2359,694,1398,876,2901,2730,2390,1182,2397,698,1461,938,2891,2710,1326,685,1389,2906,1874,3877,3722,3350,2646,2741,1716,3497,2962,2853,1611,2715,858,1753,1492,3493,3402,2709,1334,2421,756,1769,1748,1705,1333,605,1213,2490,948,2921,2858,2645,1197,2653,730,1753,3754,3732,3370,3158,1198,2669,1386,3413,3402,2707,1323,2651,1338,1717,3753,3410,3369,2645,1197,1389,2794,1764,3793,3490,2730,2394,730,1465,2994,1892,1737,1365,683,1243,2746,1460,3497,3410,2725,2349,621,2285,730,2773,2725,2635,1175,2359,694,2421,3433,3410,3221,2347,603,1243,2517,1490,3493,3402,2709,1357,2733,938,3026,3012,2953,2709,1325,1453,2922,1748,3529,3474,2726,2390,686,1389,874,2901,2730,2381,1181,2397,698,1461,1450,3413,2714,2350,622,1373,2778,1748,1701,2855,2637,1197,1389,2906,1876,3913,3730,3366,2646,854,1717,2986,2962,2853,1675,2715,1370,2778,1460,3497,2898,2714,1334,630,1397,2802,1748,1705,1365,685,1213,2490,1396,2921,2898,2709,1325,2653,1242,2777,1714,3733,3626,3222,2350,2733,1386,3429,3402,3349,1579,3163,1338,1717,3506,3428,3369,2645,1197,2413,2794,1768,3793,3492,3402,2666,730,1465,2930,2920,1745,1621,1195,2395,698,1461,3497,3410,3238,2382,1134,2397,1242,2773,2730,2637,1179,2359,1206,2421,3434,3410,2725,2379,683,1371,2777,1490,3525,3474,2853,1365,2741,1460,2985,1954,1861,1427,2731,1238,2518,1490,2981,2890,2709,1197,349,733,2522,1460,1449,1325,603,2231,374,1389,2922,2762,2710,1323,347,699,1462,3498,2964,3398,2701,1325,2717,1370,1877,1865,3859,3658,2710,1366,1717,2986,2964];
  const uqLen = (y, m) => ((UQ[y - 1300] >> (m - 1)) & 1 ? 30 : 29);
  let UQ_Y = null;
  function uqYears() { if (!UQ_Y) { UQ_Y = [UQ_START]; for (let i = 0; i < UQ.length; i++) { let s = 0; for (let m = 1; m <= 12; m++) s += uqLen(1300 + i, m); UQ_Y.push(UQ_Y[i] + s); } } return UQ_Y; }

  /* ---------- Solar Hijri (Persian): K. Borkowski (1996), the break years; matches the astronomical rule (noon at 52.5° E) for 1–3177 AP ---------- */
  const PB = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const tdiv = (a, b) => Math.trunc(a / b), tmod = (a, b) => a - Math.trunc(a / b) * b;
  function jalCal(jy) {
    if (!(jy >= PB[0] && jy < PB[PB.length - 1])) return null;
    const gy = jy + 621; let leapJ = -14, jp = PB[0], jump = 0;
    for (let i = 1; i < PB.length; i++) { const jm = PB[i]; jump = jm - jp; if (jy < jm) break; leapJ += tdiv(jump, 33) * 8 + tdiv(tmod(jump, 33), 4); jp = jm; }
    let n = jy - jp;
    leapJ += tdiv(n, 33) * 8 + tdiv(tmod(n, 33) + 3, 4);
    if (tmod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = tdiv(gy, 4) - tdiv((tdiv(gy, 100) + 1) * 3, 4) - 150, march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + tdiv(jump + 4, 33) * 33;
    let leap = tmod(tmod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
    return { leap: leap === 0, start: gToRD(gy, 3, march) };
  }

  /* ---------- Coptic and Ethiopic (R&D ch. 4) ---------- */
  const COP_EPOCH = 103605, ETH_EPOCH = 2796;              // 29 Aug 284 / 29 Aug 8 (Julian)
  const cToRD = (ep, y, m, d) => ep - 1 + 365 * (y - 1) + fl(y / 4) + 30 * (m - 1) + d;
  function rdToC(ep, rd) { const y = fl((4 * (rd - ep) + 1463) / 1461), m = fl((rd - cToRD(ep, y, 1, 1)) / 30) + 1; return { y, m, d: rd + 1 - cToRD(ep, y, m, 1) }; }

  /* ---------- Bahá'í (Badí'): to 171 BE Naw-Rúz on 21 March; 172–221 BE (2015–2064) from the table; R&D ch. 16 ---------- */
  const BAHAI_T = '10011001100110001000100010001000100010001000000000';  // 1 = Naw-Rúz on 21 March, 0 = on 20 March (172 BE … 221 BE): the Bahá'í World Centre table "Badí' dates 172 to 221 BE" (2014, HM Nautical Almanac Office data), checked 2026-11 — 216 BE is 20 March 2059
  function nawRuz(y) {
    if (y <= 171) return { rd: gToRD(1843 + y, 3, 21), flags: y < 1 ? ['proleptic'] : [] };
    if (y <= 221) return { rd: gToRD(1843 + y, 3, BAHAI_T[y - 172] === '1' ? 21 : 20), flags: [] };
    return { rd: NaN, flags: ['out-of-range'] };
  }

  /* ---------- French Republican: 1 Vendémiaire An I–XIV as observed (the autumn equinox at Paris); otherwise Romme's rule (R&D ch. 17) ---------- */
  const FR_NY = [[1792, 22], [1793, 22], [1794, 22], [1795, 23], [1796, 22], [1797, 22], [1798, 22], [1799, 23], [1800, 23], [1801, 23], [1802, 23], [1803, 24], [1804, 23], [1805, 23]];
  const FR_EPOCH = gToRD(1792, 9, 22);
  const frLeapR = y => md(y, 4) === 0 && ![100, 200, 300].includes(md(y, 400)) && md(y, 4000) !== 0;
  function frStart(y) {
    if (y >= 1 && y <= 14) return { rd: gToRD(FR_NY[y - 1][0], 9, FR_NY[y - 1][1]), flags: [] };
    const k = y - 1; return { rd: FR_EPOCH + 365 * k + fl(k / 4) - fl(k / 100) + fl(k / 400) - fl(k / 4000), flags: ['proleptic'] };
  }
  const frYearLen = y => (y >= 1 && y <= 13 ? frStart(y + 1).rd - frStart(y).rd : y === 14 ? 365 : frLeapR(y) ? 366 : 365);

  /* ---------- Indian national (Śaka) calendar, 1957 ---------- */
  const sakaStart = y => gToRD(y + 78, 3, gLeap(y + 78) ? 21 : 22);
  const sakaMonthLen = (m, y) => (m === 1 ? (gLeap(y + 78) ? 31 : 30) : m <= 6 ? 31 : 30);

  /* ---------- old Hindu solar (Ārya-siddhānta mean model; R&D ch. 10): Kali Yuga elapsed years from 18 Feb 3102 BCE (Julian) ---------- */
  const HINDU_EPOCH = -1132959, ARYA_YEAR = 1577917500 / 4320000, ARYA_MONTH = ARYA_YEAR / 12;
  function rdToHindu(rd) { const sun = rd - HINDU_EPOCH + 0.25; return { y: fl(sun / ARYA_YEAR), m: md(fl(sun / ARYA_MONTH), 12) + 1, d: fl(md(sun, ARYA_MONTH)) + 1 }; }
  const hinduToRD = (y, m, d) => Math.ceil(HINDU_EPOCH + y * ARYA_YEAR + (m - 1) * ARYA_MONTH + d - 1.25);

  /* ---------- Chinese and Korean lunisolar months 1900–2100 (table: New Year offset from 1 Jan | leap month << 6 | 30-day months << 10) ---------- */
  const LUNI = { chinese: [5982750,1919025,3839014,5843292,1649710,2780194,5593368,1419307,2974752,6113429,1919016,7116189,2921520,2698276,5418329,701484,1420321,2991318,3580969,7752159,3819570,3445798,6895003,2709550,710691,5690647,1789995,3843104,8013974,3819560,3447197,1354799,2710564,4905305,2975788,1789986,3876055,1909801,5918174,2772017,1354790,2715034,2798637,1419299,7165208,3051563,2958368,6966421,2774056,5551580,1366063,2798628,5679450,3590188,3575842,7677143,3483690,2774558,2776112,1398822,2807195,2839597,1787939,3839256,3839019,1648672,3300564,2780199,5597661,1419311,2991140,6113626,2967597,2921505,5844246,2698281,5418526,701488,1422373,2991515,3580974,3557411,7640344,3445803,6895264,2709554,710695,1496540,1791023,3843108,8014170,3819565,3446818,2709718,2710568,5462558,878641,1791013,3876187,1909806,1723427,5549335,1354794,2714655,5597333,1419303,7165404,3051568,2958373,6966617,2774060,1356833,2733334,2806824,5679710,1525809,3576870,7678363,3745838,3298339,5552408,1398826,2806815,5687445,1787944,3839388,3970095,1648677,3300697,1223723,1403936,2840790,2991145,6114014,2967601,2921510,6892955,2698285,1223714,1404247,1487914,2992159,7162005,3557416,7640541,3445807,2708516,5420377,1234988,1496096,3582166,3875881,8014367,3819569,3446822,2709915,2710573,1267746,1791255,1922090,1909792,3820756,1723431,5549532,1354799,2714659,5597529,1419308,2987041,6105366,2958377,6968862,2774065,1356837,2799002,2806829,1484835,3052823,3576874,3483680,7492821,3299367,6633948,1398831,2806820,5687641,1787948,3839009,3746071,1715240,3300893,1223728,1403941,2840986,2992173,1919011,6067480,2954282,2763807,5401748,1223719], dangi: [5982750,1919025,3839014,5843292,1649710,2780194,5593368,1419307,2974752,6113429,1919016,7116189,2921520,2698276,4877657,2798636,1419298,2991254,3056681,7162335,3557426,3445798,6894939,2447406,709667,5682455,1789995,3580960,7751830,3819560,3447197,1350703,2710564,4905305,2844716,1789986,3843287,1909801,5918174,2772017,1354790,2715034,2470957,2992163,7164185,3051563,2958368,6966421,2774056,5549532,1356847,2798628,5613914,3590188,3575842,7677143,3483690,6968862,2775089,1398822,2807195,2839597,1787939,3839256,3839019,3745824,3299541,2780199,5593565,1419311,2974756,6113626,1919021,1872929,5844246,2698281,4894238,701488,1420325,2991515,3580974,3557411,7116056,3445803,6895264,2709554,710695,5682588,1790000,3580964,7752026,3819565,3446818,2709718,2710568,4905502,2975793,1789990,3876187,1909806,1723427,5545239,1354794,2714655,5597333,895015,7165404,3051568,2958373,6966617,2774060,1356833,2716886,2798632,5679710,1525809,3576870,7677275,3483694,2774051,5551384,1398826,2806815,5679253,1787944,3839388,3839023,3745829,3299674,3304491,1402913,2839766,2991145,6114014,1919025,2921510,5844379,2698285,1223714,1404247,1422378,2991135,7162005,3557416,7640541,3445807,2700324,5420377,710700,1496096,3581142,3613737,7752223,3819569,3446822,2709915,2710573,1267746,1758487,1791018,3875872,3819733,1723431,5549532,1354799,2714659,5597529,1419308,2970657,6104342,2958377,6966814,2774065,1356837,2799002,2806829,1484835,3052823,3576874,3483680,6968533,3298343,5552604,1398831,2806820,5687641,1787948,3839009,7940375,1648681,3300893,3320880,1402918,2839962,2991149,1919011,3839256,2921514,1649695,5397716,1223719] };
  function luniYear(cal, y) {
    const e = LUNI[cal][y - 1900]; if (e === undefined) return null;
    const leap = (e >> 6) & 15, n = leap ? 13 : 12, lens = [];
    for (let i = 0; i < n; i++) lens.push((e >> (10 + i)) & 1 ? 30 : 29);
    return { start: gToRD(y, 1, 1) + (e & 63), leap, lens, days: lens.reduce((a, b) => a + b, 0) };
  }
  const STEMS = 10, BRANCHES = 12;

  /* ---------- Japanese eras (nengō) since the Gregorian calendar (1 Jan 1873): Meiji, Taishō, Shōwa, Heisei, Reiwa ---------- */
  const JP = ['meiji', 'taisho', 'showa', 'heisei', 'reiwa'];
  const JP_START = [gToRD(1868, 10, 23), gToRD(1912, 7, 30), gToRD(1926, 12, 25), gToRD(1989, 1, 8), gToRD(2019, 5, 1)], JP_Y = [1868, 1912, 1926, 1989, 2019];
  const JP_GREG = gToRD(1873, 1, 1);

  /* ---------- Maya (R&D ch. 11; correlation 584283 = GMT, Kennett et al. 2013) ---------- */
  const LC = [144000, 7200, 360, 20, 1];
  const MAYA_EARLIEST = 1124333, MAYA_LATEST = 1468800;     // 7.16.3.2.13 (Chiapa de Corzo stela 2, 36 BCE) and 10.4.0.0.0 (909 CE)

  /* ---------- the calendars: to(fields, options) → {rd, flags}; from(rd, options) → {fields…, flags} ---------- */
  const g = (f, k, dflt) => (f[k] === undefined ? dflt : f[k]);
  function gjTo(f, julian) {
    let y = f.y; const m = g(f, 'm', 1), d = g(f, 'd', 1);
    if (f.era === 'bce' || f.era === 'ce') { if (!isInt(y) || y < 1) return bad('year-zero'); if (f.era === 'bce') y = 1 - y; }
    if (!okYMD(y, m, d, julian ? jLeap(y) : gLeap(y))) return bad();
    const rd = julian ? jToRD(y, m, d) : gToRD(y, m, d), flags = [];
    if (julian ? rd < JUL_START : rd < GREG_START) flags.push('proleptic');
    if (julian && y >= -44 && y <= 8) flags.push('julian-error');
    return ok(rd, flags);
  }
  function gjFrom(rd, julian) {
    const r = julian ? rdToJ(rd) : rdToG(rd), leap = julian ? jLeap(r.y) : gLeap(r.y);
    const flags = [];
    if (julian ? rd < JUL_START : rd < GREG_START) flags.push('proleptic');
    if (julian && r.y >= -44 && r.y <= 8) flags.push('julian-error');
    return { ...r, eraYear: r.y <= 0 ? 1 - r.y : r.y, era: r.y <= 0 ? 0 : 1, weekday: md(rd, 7), isoWeekday: md(rd - 1, 7) + 1, leap: +leap,
      yearLength: leap ? 366 : 365, monthLength: mLen(r.m, leap), dayOfYear: rd - (julian ? jToRD(r.y, 1, 1) : gToRD(r.y, 1, 1)) + 1,
      century: r.y > 0 ? Math.ceil(r.y / 100) : -Math.ceil((1 - r.y) / 100), flags };
  }
  const regionOf = o => REGION[o.region || 'rome'];
  function civilTo(f, o) {
    let y = f.y; const m = g(f, 'm', 1), d = g(f, 'd', 1), R = regionOf(o), S = gToRD(R[0], R[1], R[2]);
    if (f.era === 'bce' || f.era === 'ce') { if (!isInt(y) || y < 1) return bad('year-zero'); if (f.era === 'bce') y = 1 - y; }
    if ((o.region === 'sweden') && y === 1712 && m === 2 && d === 30) return ok(SWE_B, ['approx']);
    if (!isInt(y) || !isInt(m) || !isInt(d) || m < 1 || m > 12 || d < 1 || d > 31) return bad();
    if (okYMD(y, m, d, gLeap(y)) && gToRD(y, m, d) >= S) return ok(gToRD(y, m, d), []);
    if (o.region === 'sweden' && y === 1700 && m === 2 && d === 29) return bad('nonexistent');
    if (okYMD(y, m, d, jLeap(y)) && jToRD(y, m, d) < S) {
      let rd = jToRD(y, m, d);
      if (o.region === 'sweden' && rd > SWE_A && rd <= SWE_B + 1 && !(y === 1712 && m >= 3)) rd -= 1;
      return ok(rd, rd < JUL_START ? ['proleptic'] : y >= -44 && y <= 8 ? ['julian-error'] : []);
    }
    return bad(okYMD(y, m, d, true) ? 'nonexistent' : 'invalid');
  }
  function civilFrom(rd, o) {
    const R = regionOf(o), S = gToRD(R[0], R[1], R[2]);
    if (rd >= S) return { ...gjFrom(rd, false), flags: [], gregorian: 1 };
    if (o.region === 'sweden' && rd >= SWE_A && rd <= SWE_B) { const r = rd === SWE_B ? { y: 1712, m: 2, d: 30 } : rdToJ(rd + 1); const b = gjFrom(rd, true); return { ...b, ...r, flags: ['approx'], gregorian: 0 }; }
    const b = gjFrom(rd, true);
    const ys = civilTo({ y: b.y, m: 1, d: 1 }, o).rd, ye = civilTo({ y: b.y + 1, m: 1, d: 1 }, o).rd;
    return { ...b, yearLength: Number.isFinite(ys) && Number.isFinite(ye) ? ye - ys : b.yearLength, gregorian: 0 };
  }
  function civilFromFix(rd, o) {      // the switch year: its length from the region's own first days of January
    const r = civilFrom(rd, o);
    if (r.gregorian === 1) { const ys = civilTo({ y: r.y, m: 1, d: 1 }, o).rd, ye = civilTo({ y: r.y + 1, m: 1, d: 1 }, o).rd; if (Number.isFinite(ys) && Number.isFinite(ye)) r.yearLength = ye - ys; }
    return r;
  }
  const ymd = f => [f.y, g(f, 'm', 1), g(f, 'd', 1)];
  const allInt = (...a) => a.every(isInt);
  const CAL = {
    gregorian: { to: f => gjTo(f, false), from: rd => gjFrom(rd, false) },
    julian: { to: f => gjTo(f, true), from: rd => gjFrom(rd, true) },
    civil: { to: civilTo, from: civilFromFix },
    jdn: { to: f => (isInt(f.j) ? ok(f.j - J0) : bad()), from: rd => ({ j: rd + J0, mjd: rd + J0 - 2400001, rd, weekday: md(rd, 7), flags: [] }) },
    roman: { from: rd => ({ ...romanOf(rdToJ(rd)), flags: rd < JUL_START ? ['proleptic'] : [] }) },
    hebrew: {
      to(f) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > hLastMonth(y) || d < 1 || d > hMonthLen(m, y)) return bad(); return ok(hToRD(y, m, d), y < 4119 ? ['proleptic'] : []); },
      from(rd) { const r = rdToH(rd); return { ...r, leap: +hLeap(r.y), yearLength: hDays(r.y), monthLength: hMonthLen(r.m, r.y), weekday: md(rd, 7), flags: r.y < 4119 ? ['proleptic'] : [] }; },
    },
    islamic: {
      to(f, o) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1 || d > iMonthLen(m, y, o)) return bad(); return ok(iStart(y, o) + 29 * (m - 1) + fl(m / 2) + d - 1, y < 1 ? ['proleptic'] : []); },
      from(rd, o) {
        let y = fl((rd - islEpoch(o)) * 30 / 10631) + 1; while (iStart(y, o) > rd) y--; while (iStart(y + 1, o) <= rd) y++;
        let m = 1; while (m < 12 && iStart(y, o) + 29 * m + fl((m + 1) / 2) <= rd) m++;
        const d = rd - (iStart(y, o) + 29 * (m - 1) + fl(m / 2)) + 1, leap = iLeap(y, o);
        return { y, m, d, leap: +leap, yearLength: leap ? 355 : 354, monthLength: iMonthLen(m, y, o), weekday: md(rd, 7), flags: y < 1 ? ['proleptic'] : [] };
      },
    },
    umalqura: {
      to(f) {
        const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1 || d > 30) return bad();
        if (y < 1300 || y > 1600) return bad('out-of-range');
        if (d > uqLen(y, m)) return bad();
        let rd = uqYears()[y - 1300]; for (let k = 1; k < m; k++) rd += uqLen(y, k); return ok(rd + d - 1);
      },
      from(rd) {
        const Y = uqYears(); if (rd < Y[0] || rd >= Y[Y.length - 1]) return { flags: ['out-of-range'] };
        let i = 0; while (Y[i + 1] <= rd) i++;
        const y = 1300 + i; let s = Y[i], m = 1; while (s + uqLen(y, m) <= rd) { s += uqLen(y, m); m++; }
        const yl = Y[i + 1] - Y[i];
        return { y, m, d: rd - s + 1, leap: +(yl === 355), yearLength: yl, monthLength: uqLen(y, m), weekday: md(rd, 7), flags: [] };
      },
    },
    persian: {
      to(f) {
        const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1) return bad();
        const r = jalCal(y); if (!r) return bad('out-of-range');
        if (d > (m <= 6 ? 31 : m <= 11 ? 30 : r.leap ? 30 : 29)) return bad();
        return ok(r.start + (m <= 7 ? 31 * (m - 1) : 186 + 30 * (m - 7)) + d - 1, y < 1304 ? ['proleptic'] : []);
      },
      from(rd) {
        let jy = rdToG(rd).y - 621, r = jalCal(jy);
        if (r && rd < r.start) { jy -= 1; r = jalCal(jy); }
        if (!r) return { flags: ['out-of-range'] };
        const days = rd - r.start, m = days < 186 ? fl(days / 31) + 1 : fl((days - 186) / 30) + 7, d = days - (m <= 7 ? 31 * (m - 1) : 186 + 30 * (m - 7)) + 1;
        return { y: jy, m, d, leap: +r.leap, yearLength: r.leap ? 366 : 365, monthLength: m <= 6 ? 31 : m <= 11 ? 30 : r.leap ? 30 : 29, weekday: md(rd, 7), flags: jy < 1304 ? ['proleptic'] : [] };
      },
    },
    coptic: copticLike(COP_EPOCH, false), ethiopic: copticLike(ETH_EPOCH, true),
    bahai: {
      to(f) {
        const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 0 || m > 19 || d < 1 || d > 19) return bad();
        const a = nawRuz(y), b = nawRuz(y + 1); if (!Number.isFinite(a.rd) || !Number.isFinite(b.rd)) return bad('out-of-range');
        const ayyam = b.rd - 19 - (a.rd + 342);
        if (m === 0 && d > ayyam) return bad();
        const s = m >= 1 && m <= 18 ? a.rd + 19 * (m - 1) : m === 0 ? a.rd + 342 : b.rd - 19;
        return ok(s + d - 1, a.flags);
      },
      from(rd) {
        let y = rdToG(rd).y - 1843; let a = nawRuz(y); if (Number.isFinite(a.rd) && rd < a.rd) { y--; a = nawRuz(y); }
        const b = nawRuz(y + 1); if (!Number.isFinite(a.rd) || !Number.isFinite(b.rd)) return { flags: ['out-of-range'] };
        const k = rd - a.rd; let m, d;
        if (k < 342) { m = fl(k / 19) + 1; d = md(k, 19) + 1; } else if (rd < b.rd - 19) { m = 0; d = k - 342 + 1; } else { m = 19; d = rd - (b.rd - 19) + 1; }
        const yl = b.rd - a.rd;
        return { y, m, d, leap: +(yl === 366), yearLength: yl, monthLength: m === 0 ? yl - 361 : 19, weekday: md(rd, 7), vahid: fl((y - 1) / 19) + 1, kull: fl((y - 1) / 361) + 1, yearInVahid: md(y - 1, 19) + 1, flags: a.flags };
      },
    },
    french: {
      to(f) {
        const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 13 || d < 1 || d > (m === 13 ? frYearLen(y) - 360 : 30)) return bad();
        const s = frStart(y); return ok(s.rd + 30 * (m - 1) + d - 1, s.flags);
      },
      from(rd) {
        let y = rdToG(rd).y - 1791; if (frStart(y).rd > rd) y--; if (frStart(y + 1).rd <= rd) y++;
        const s = frStart(y), k = rd - s.rd, m = fl(k / 30) + 1, d = md(k, 30) + 1, yl = frYearLen(y);
        return { y, m, d, leap: +(yl === 366), yearLength: yl, monthLength: m === 13 ? yl - 360 : 30, weekday: md(rd, 7), decade: m <= 12 ? fl((d - 1) / 10) + 1 : 0, dayOfDecade: m <= 12 ? md(d - 1, 10) + 1 : d, flags: s.flags };
      },
    },
    saka: {
      to(f) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1 || d > sakaMonthLen(m, y)) return bad(); let rd = sakaStart(y); for (let k = 1; k < m; k++) rd += sakaMonthLen(k, y); return ok(rd + d - 1, y < 1879 ? ['proleptic'] : []); },
      from(rd) {
        let y = rdToG(rd).y - 78; if (sakaStart(y) > rd) y--;
        let s = sakaStart(y), m = 1; while (s + sakaMonthLen(m, y) <= rd) { s += sakaMonthLen(m, y); m++; }
        return { y, m, d: rd - s + 1, leap: +gLeap(y + 78), yearLength: gLeap(y + 78) ? 366 : 365, monthLength: sakaMonthLen(m, y), weekday: md(rd, 7), flags: y < 1879 ? ['proleptic'] : [] };
      },
    },
    hindusolar: {
      to(f) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1 || d > 32) return bad(); const rd = hinduToRD(y, m, d), b = rdToHindu(rd); return b.y === y && b.m === m && b.d === d ? ok(rd, ['approx']) : bad(); },
      from: rd => ({ ...rdToHindu(rd), weekday: md(rd, 7), flags: ['approx'] }),
    },
    vikram: {
      to: f => (isInt(f.y) ? ok(gToRD(f.y - 57, 3, gLeap(f.y - 57) ? 21 : 22), ['approx']) : bad()),
      from(rd) { const G = rdToG(rd); return { y: G.y + (rd >= gToRD(G.y, 3, gLeap(G.y) ? 21 : 22) ? 57 : 56), flags: ['approx'] }; },
    },
    chinese: luniCal('chinese'), dangi: luniCal('dangi'),
    japanese: {
      to(f) {
        const e = JP.indexOf(f.era), m = g(f, 'm', 1), d = g(f, 'd', 1); if (e < 0 || !isInt(f.y) || f.y < 1) return bad();
        const gy = JP_Y[e] + f.y - 1; if (!okYMD(gy, m, d, gLeap(gy))) return bad();
        const rd = gToRD(gy, m, d); if (rd < JP_GREG) return bad('out-of-range');
        if (rd < JP_START[e] || (e < 4 && rd >= JP_START[e + 1])) return bad('nonexistent');
        return ok(rd);
      },
      from(rd) { if (rd < JP_GREG) return { flags: ['out-of-range'] }; let e = 4; while (rd < JP_START[e]) e--; const G = rdToG(rd); return { era: e, y: G.y - JP_Y[e] + 1, m: G.m, d: G.d, flags: [] }; },
    },
    roc: offsetCal(-1911, y => y < 1), juche: offsetCal(-1911, y => y < 1), dangun: offsetCal(2333, () => false), holocene: offsetCal(10000, () => false),
    buddhist: offsetCal(544, () => false, ['approx']),
    thai: {
      to(f) {
        const y = f.y, m = g(f, 'm', 1), d = g(f, 'd', 1); if (!isInt(y)) return bad();
        if (y === 2483 && isInt(m) && m < 4) return bad('nonexistent');
        const gy = y >= 2484 ? y - 543 : m >= 4 ? y - 543 : y - 542;
        if (!okYMD(gy, m, d, gLeap(gy))) return bad(); return ok(gToRD(gy, m, d), gy < 1912 ? ['proleptic'] : []);
      },
      from(rd) { const G = rdToG(rd); return { y: G.y >= 1941 ? G.y + 543 : G.m >= 4 ? G.y + 543 : G.y + 542, m: G.m, d: G.d, flags: G.y < 1912 ? ['proleptic'] : [] }; },
    },
    bp: { to: f => (isInt(f.y) ? ok(gToRD(1950 - f.y, 1, 1)) : bad()), from: rd => ({ y: 1950 - rdToG(rd).y, flags: [] }) },
    b2k: { to: f => (isInt(f.y) ? ok(gToRD(2000 - f.y, 1, 1)) : bad()), from: rd => ({ y: 2000 - rdToG(rd).y, flags: [] }) },
    maya: {
      to(f, o) {
        const cor = mayaCorr(o), lc = f.lc; if (!Number.isFinite(cor) || !Array.isArray(lc) || !lc.every(isInt)) return bad();
        if (lc.slice(1).some((v, i) => v < 0 || v >= (i === 2 ? 18 : 20))) return bad();
        const days = lc.reduce((s, v, i) => s + v * LC[i], 0);
        return ok(days + cor - J0, days < MAYA_EARLIEST || days > MAYA_LATEST ? ['proleptic'] : []);
      },
      from(rd, o) {
        const cor = mayaCorr(o); if (!Number.isFinite(cor)) return { flags: ['invalid'] };
        const days = rd + J0 - cor, h = md(days + 348, 365);
        return { b: fl(days / 144000), k: fl(md(days, 144000) / 7200), tun: fl(md(days, 7200) / 360), w: fl(md(days, 360) / 20), kin: md(days, 20), days,
          tzNum: md(days + 3, 13) + 1, tzName: md(days + 19, 20), haabMonth: fl(h / 20), haabDay: md(h, 20), lord: md(days + 8, 9) + 1, round: md(days, 18980),
          flags: days < MAYA_EARLIEST || days > MAYA_LATEST ? ['proleptic'] : [] };
      },
    },
    olympiad: {
      to(f, o) { if (!isInt(f.ol) || !isInt(f.oy) || f.oy < 1 || f.oy > 4) return bad(); const y = -775 + 4 * (f.ol - 1) + (f.oy - 1); return ok(jToRD(y, o.olympiadMonth || 7, 1), f.ol < 1 || f.ol > 293 ? ['proleptic'] : []); },
      from(rd, o) { const J = rdToJ(rd), M = o.olympiadMonth || 7, k = (J.m >= M ? J.y : J.y - 1) + 775, ol = fl(k / 4) + 1; return { ol, oy: md(k, 4) + 1, flags: ol < 1 || ol > 293 ? ['proleptic'] : [] }; },
    },
    auc: {
      to(f, o) { const off = AUC[o.auc || 'varro'], y = f.y - off, m = g(f, 'm', 1), d = g(f, 'd', 1); if (!isInt(f.y) || !okYMD(y, m, d, jLeap(y))) return bad(); return ok(jToRD(y, m, d), y >= -44 && y <= 8 ? ['julian-error'] : []); },
      from(rd, o) { const J = rdToJ(rd); return { y: J.y + AUC[o.auc || 'varro'], m: J.m, d: J.d, flags: J.y >= -44 && J.y <= 8 ? ['julian-error'] : [] }; },
    },
    byzantine: {
      to(f) { const m = g(f, 'm', 9), d = g(f, 'd', 1); if (!isInt(f.y)) return bad(); const y = m >= 9 ? f.y - 5509 : f.y - 5508; if (!okYMD(y, m, d, jLeap(y))) return bad(); return ok(jToRD(y, m, d)); },
      from(rd) { const J = rdToJ(rd); return { y: J.m >= 9 ? J.y + 5509 : J.y + 5508, m: J.m, d: J.d, indiction: J.m >= 9 ? md(J.y + 3, 15) + 1 : md(J.y + 2, 15) + 1, flags: [] }; },
    },
    nabonassar: {
      to(f) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 13 || d < 1 || d > (m === 13 ? 5 : 30)) return bad(); return ok(NAB_EPOCH + 365 * (y - 1) + 30 * (m - 1) + d - 1, y < 1 ? ['proleptic'] : []); },
      from(rd) { const k = rd - NAB_EPOCH, y = fl(k / 365) + 1, r = md(k, 365), m = fl(r / 30) + 1; return { y, m, d: r - 30 * (m - 1) + 1, weekday: md(rd, 7), flags: y < 1 ? ['proleptic'] : [] }; },
    },
    seleucid: {
      to(f, o) { if (!isInt(f.y)) return bad(); return o.seleucid === 'babylonian' ? ok(jToRD(f.y - 311, 4, 1), ['approx']) : ok(jToRD(f.y - 313, 10, 1), ['approx']); },
      from(rd, o) { const J = rdToJ(rd); return { y: o.seleucid === 'babylonian' ? J.y + (J.m >= 4 ? 311 : 310) : J.y + (J.m >= 10 ? 312 : 311), flags: ['approx'] }; },
    },
    spanish: {
      to(f) { const y = f.y - 38, m = g(f, 'm', 1), d = g(f, 'd', 1); if (!isInt(f.y) || !okYMD(y, m, d, jLeap(y))) return bad(); return ok(jToRD(y, m, d)); },
      from(rd) { const J = rdToJ(rd); return { y: J.y + 38, m: J.m, d: J.d, flags: [] }; },
    },
  };
  const NAB_EPOCH = -272787;                                 // 1 Thoth, year 1 of Nabonassar = 26 February 747 BCE (Julian), JD 1448638 (Ptolemy, Almagest)
  const AUC = { varro: 753, cato: 752, polybius: 751, fabius: 748 };   // AUC 1 = 753 / 752 / 751 / 748 BCE (Bickerman 1980)
  function mayaCorr(o) { const v = o.maya === undefined ? 584283 : o.maya; return isInt(v) && v >= 400000 && v <= 700000 ? v : NaN; }
  function copticLike(ep, eth) {
    return {
      to(f) { const [y, m, d] = ymd(f); if (!allInt(y, m, d) || m < 1 || m > 13 || d < 1 || d > (m === 13 ? (md(y, 4) === 3 ? 6 : 5) : 30)) return bad(); return ok(cToRD(ep, y, m, d), y < 1 ? ['proleptic'] : []); },
      from(rd) { const r = rdToC(ep, rd), leap = md(r.y, 4) === 3; return { ...r, leap: +leap, yearLength: leap ? 366 : 365, monthLength: r.m === 13 ? (leap ? 6 : 5) : 30, weekday: md(rd, 7), ...(eth ? { aa: r.y + 5500 } : {}), flags: r.y < 1 ? ['proleptic'] : [] }; },
    };
  }
  function offsetCal(off, prolep, extra) {
    return {
      to(f) { const gy = f.y - off, m = g(f, 'm', 1), d = g(f, 'd', 1); if (!isInt(f.y) || !okYMD(gy, m, d, gLeap(gy))) return bad(); return ok(gToRD(gy, m, d), (prolep(f.y) ? ['proleptic'] : []).concat(extra || [])); },
      from(rd) { const G = rdToG(rd), y = G.y + off; return { y, m: G.m, d: G.d, flags: (prolep(y) ? ['proleptic'] : []).concat(extra || []) }; },
    };
  }
  function luniCal(cal) {
    return {
      to(f) {
        const [y, m, d] = ymd(f), lp = f.leap === true; if (!allInt(y, m, d) || m < 1 || m > 12 || d < 1 || d > 30) return bad();
        const Y = luniYear(cal, y); if (!Y) return bad('out-of-range');
        if (lp && Y.leap !== m) return bad('nonexistent');
        const idx = m - 1 + (Y.leap && (m > Y.leap || (m === Y.leap && lp)) ? 1 : 0);
        if (d > Y.lens[idx]) return bad();
        let rd = Y.start; for (let i = 0; i < idx; i++) rd += Y.lens[i]; return ok(rd + d - 1);
      },
      from(rd) {
        const gy = rdToG(rd).y; let Y = luniYear(cal, gy), y = gy;
        if (Y && rd < Y.start) { y = gy - 1; Y = luniYear(cal, y); }
        if (!Y || rd >= Y.start + Y.days) return { ...dayCycle(rd), flags: ['out-of-range'] };
        let s = Y.start, i = 0; while (s + Y.lens[i] <= rd) { s += Y.lens[i]; i++; }
        const lp = Y.leap && i === Y.leap, m = Y.leap && i >= Y.leap ? i : i + 1;
        return { y, m, d: rd - s + 1, leap: +!!lp, monthLength: Y.lens[i], yearLength: Y.days, stem: md(y - 4, STEMS), branch: md(y - 4, BRANCHES), cycle: md(y - 4, 60) + 1, ...dayCycle(rd), flags: [] };
      },
    };
  }
  /** the sexagenary day: (JDN + 49) mod 60, 0 = jiazi (甲子); 1 Oct 1949 was a jiazi day */
  function dayCycle(rd) { const k = md(rd + J0 + 49, 60); return { dayStem: md(k, 10), dayBranch: md(k, 12), dayCycle: k + 1 }; }
  /** Roman day names (Julian calendar): Kalends (ref 1), Nones (2), Ides (3); count 1 = on the day, 2 = pridie, n = ante diem n (inclusive) */
  function romanOf(J) {
    const { y, m, d } = J, nones = [3, 5, 7, 10].includes(m) ? 7 : 5, ides = nones + 8, leap = jLeap(y);
    if (d === 1) return { ref: 1, count: 1, month: m, bis: 0 };
    if (d < nones) return { ref: 2, count: nones - d + 1, month: m, bis: 0 };
    if (d === nones) return { ref: 2, count: 1, month: m, bis: 0 };
    if (d < ides) return { ref: 3, count: ides - d + 1, month: m, bis: 0 };
    if (d === ides) return { ref: 3, count: 1, month: m, bis: 0 };
    const next = m === 12 ? 1 : m + 1;
    if (m === 2 && leap) { if (d <= 23) return { ref: 1, count: 28 - d + 2, month: 3, bis: 0 }; if (d === 24) return { ref: 1, count: 6, month: 3, bis: 1 }; return { ref: 1, count: 29 - d + 2, month: 3, bis: 0 }; }
    return { ref: 1, count: mLen(m, leap) - d + 2, month: next, bis: 0 };
  }
  /** Easter: the Gregorian computus (Meeus ch. 8, after Butcher 1876) and the Julian one (Meeus ch. 8) → [month, day] */
  function easterG(Y) {
    const a = md(Y, 19), b = fl(Y / 100), c = md(Y, 100), d = fl(b / 4), e = md(b, 4), f = fl((b + 8) / 25), gg = fl((b - f + 1) / 3), h = md(19 * a + b - d - gg + 15, 30);
    const i = fl(c / 4), k = md(c, 4), l = md(32 + 2 * e + 2 * i - h - k, 7), m = fl((a + 11 * h + 22 * l) / 451);
    return [fl((h + l - 7 * m + 114) / 31), md(h + l - 7 * m + 114, 31) + 1];
  }
  function easterJ(Y) { const a = md(Y, 4), b = md(Y, 7), c = md(Y, 19), d = md(19 * c + 15, 30), e = md(2 * a + 4 * b - d + 34, 7); return [fl((d + e + 114) / 31), md(d + e + 114, 31) + 1]; }

  /* ---------- radiocarbon (Stuiver & Polach 1977): conventional age with the Libby half-life 5568 years (mean life 8033) ---------- */
  const LIBBY = 8033, CAMBRIDGE = 5730 / Math.LN2;           // 8267: the mean life of the Cambridge half-life 5730 ± 40
  function c14Age(F) { return F > 0 ? -LIBBY * Math.log(F) : NaN; }
  /** calibration on a calendar grid θ (cal BP): p(θ) ∝ (σ² + σc²)^(-1/2) exp(-(r − μ(θ))² / 2(σ² + σc²)), a uniform prior (Bronk Ramsey 2009) */
  function calibrate(age, sd, curve) {
    let lo, hi, mu, sc;
    if (curve) { lo = Math.ceil(curve.calBP[0]); hi = fl(curve.calBP[curve.calBP.length - 1]); const n = curve.calBP.length;
      let j = 0; const at = th => { while (j < n - 2 && curve.calBP[j + 1] < th) j++; const x0 = curve.calBP[j], x1 = curve.calBP[j + 1], w = (th - x0) / (x1 - x0); return [curve.age[j] + w * (curve.age[j + 1] - curve.age[j]), curve.sd[j] + w * (curve.sd[j + 1] - curve.sd[j])]; };
      mu = []; sc = []; for (let th = lo; th <= hi && mu.length < 60001; th++) { const [a, s] = at(th); mu.push(a); sc.push(s); } hi = lo + mu.length - 1; }
    else { lo = fl(age - 8 * sd); hi = Math.ceil(age + 8 * sd); }
    const xs = [], ps = []; let tot = 0;
    for (let th = lo, i = 0; th <= hi && i < 60001; th++, i++) {
      const m = curve ? mu[i] : th, s2 = sd * sd + (curve ? sc[i] * sc[i] : 0), p = Math.exp(-((age - m) ** 2) / (2 * s2)) / Math.sqrt(s2);
      xs.push(th); ps.push(p); tot += p;
    }
    if (!(tot > 1e-300)) return null;
    // the calibrated density is negligible at the curve's ends? else the age lies (partly) outside the curve
    const edge = (ps[0] + ps[ps.length - 1]) / tot;
    return { calBP: xs, p: ps.map(v => v / tot), outside: curve ? edge > 1e-3 : false };
  }

  /* ---------- dendrochronology: Baillie–Pilcher (1973) t and Gleichläufigkeit (Eckstein & Bauch 1969) ---------- */
  function bpIndex(x) { const out = []; for (let i = 2; i < x.length - 2; i++) { const m = (x[i - 2] + x[i - 1] + x[i] + x[i + 1] + x[i + 2]) / 5; out.push(x[i] > 0 && m > 0 ? Math.log(100 * x[i] / m) : NaN); } return out; }
  function pearson(a, b) { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (!Number.isFinite(x) || !Number.isFinite(y)) continue; n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; } const v = (n * saa - sa * sa) * (n * sbb - sb * sb); return { n, r: v > 0 ? (n * sab - sa * sb) / Math.sqrt(v) : NaN }; }
  function glk(a, b) { let n = 0, s = 0; for (let i = 1; i < a.length; i++) { const da = Math.sign(a[i] - a[i - 1]), db = Math.sign(b[i] - b[i - 1]); n++; s += da === 0 || db === 0 ? 0.5 : da === db ? 1 : 0; } return n ? s / n : NaN; }
  function crossdate(master, sample, minOverlap) {
    const im = bpIndex(master), is = bpIndex(sample), lags = [], ts = [];
    let best = null;
    for (let lag = -(sample.length - minOverlap); lag <= master.length - minOverlap && lags.length < 6001; lag++) {
      const a = [], b = [];
      for (let i = 0; i < is.length; i++) { const j = i + lag; if (j >= 0 && j < im.length) { a.push(im[j]); b.push(is[i]); } }
      if (a.length < minOverlap - 4) continue;
      const { n, r } = pearson(a, b), t = !Number.isFinite(r) ? NaN : r >= 1 - 1e-12 ? 99 : Math.min(99, r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r));
      lags.push(lag); ts.push(t);
      if (Number.isFinite(t) && (!best || t > best.t)) best = { lag, t, r, n };
    }
    if (!best) return { lags, ts, best: null };
    const ra = [], rb = []; for (let i = 0; i < sample.length; i++) { const j = i + best.lag; if (j >= 0 && j < master.length) { ra.push(master[j]); rb.push(sample[i]); } }
    best.glk = glk(ra, rb);
    return { lags, ts, best };
  }
  function synthDendro(sy, seed, env, X) {
    const r = C.rng(seed, 'timeline.dendro'), n = sy.n, len = sy.len, off = X(sy.offset === undefined ? 0 : sy.offset, env), noise = sy.noise === undefined ? 0.05 : sy.noise;
    if (!isInt(off) || off < 0 || off + len > n) return null;
    const master = []; let z = 0; for (let i = 0; i < n; i++) { z = 0.6 * z + 0.4 * C.normal(r); master.push(Math.exp(z)); }
    const sample = master.slice(off, off + len).map(v => v * Math.exp(noise * C.normal(r)));
    return { master, sample };
  }

  /* ---------- the checker (the same codes, paths and messages as tools/lib_timeline.py) ---------- */
  function checkDate(d, p, E, W) {
    if (!C.isObj(d) || typeof d.cal !== 'string' || !C.has(T.IN, d.cal)) return;
    const S = T.IN[d.cal];
    for (const f of S.req) if (d[f] === undefined) E('value', p + '.' + f, 'missing');
    for (const f of T.DATEF) if (d[f] !== undefined && !S.req.includes(f) && !S.opt.includes(f)) W('unused', p + '.' + f, `not used by the ${d.cal} calendar`);
    if (typeof d.era === 'string' && (S.req.includes('era') || S.opt.includes('era'))) {
      const jp = d.cal === 'japanese';
      if (!(jp ? JP.includes(d.era) : ['bce', 'ce'].includes(d.era))) E('enum', p + '.era', jp ? 'one of meiji, taisho, showa, heisei, reiwa' : 'one of bce, ce');
    }
    if ((d.era === 'bce' || d.era === 'ce') && d.y === 0 && ['gregorian', 'julian', 'civil'].includes(d.cal)) E('year-zero', p + '.y', 'there is no year 0 in BCE/CE counting (1 BCE is followed by 1 CE)');
  }
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = C.isObj(spec) ? spec.model : undefined;
    C.walk(m, T.MODEL, 'model', E, W);
    const M = C.isObj(m) ? m : {}, arr = k => (Array.isArray(M[k]) ? M[k] : []);
    const seen = [], ev = [], pe = [], re = [];
    for (const [k, store] of [['events', ev], ['periods', pe], ['reigns', re]]) arr(k).forEach((x, i) => {
      if (!C.isObj(x) || typeof x.id !== 'string') return;
      if (seen.includes(x.id)) E('duplicate', `model.${k}[${i}].id`, `the id ${x.id} is used twice`); else { seen.push(x.id); store.push(x.id); }
    });
    arr('events').forEach((x, i) => {
      if (!C.isObj(x)) return;
      const p = `model.events[${i}]`, kinds = ['date', 'between', 'after', 'before', 'c14'].filter(k => x[k] !== undefined);
      if (kinds.length !== 1) E('value', p, 'needs exactly one of date, between, after, before, c14');
      if (x.date === undefined) for (const k of ['sd', 'sdYears', 'pm', 'pmYears']) if (x[k] !== undefined) W('unused', p + '.' + k, 'only with date');
      if (x.after === undefined && x.before === undefined && x.horizonYears !== undefined) W('unused', p + '.horizonYears', 'only with after or before');
      if (C.isObj(x.c14) && x.c14.curve === 'model' && !C.isObj(M.c14curve)) E('ref', p + '.c14.curve', 'needs model.c14curve');
      checkDate(x.date, p + '.date', E, W);
      if (Array.isArray(x.between)) x.between.forEach((d, j) => checkDate(d, `${p}.between[${j}]`, E, W));
      checkDate(x.after, p + '.after', E, W); checkDate(x.before, p + '.before', E, W);
    });
    arr('periods').forEach((x, i) => { if (C.isObj(x)) { checkDate(x.start, `model.periods[${i}].start`, E, W); checkDate(x.end, `model.periods[${i}].end`, E, W); } });
    arr('reigns').forEach((x, i) => { if (C.isObj(x)) checkDate(x.start, `model.reigns[${i}].start`, E, W); });
    if (C.isObj(M.axis)) { checkDate(M.axis.from, 'model.axis.from', E, W); checkDate(M.axis.to, 'model.axis.to', E, W); }
    const cc = M.c14curve;
    if (C.isObj(cc) && Array.isArray(cc.calBP) && Array.isArray(cc.age) && Array.isArray(cc.sd)) {
      if (cc.calBP.length !== cc.age.length || cc.calBP.length !== cc.sd.length) E('size', 'model.c14curve', 'calBP, age and sd need the same length');
      else if (cc.calBP.every(C.isNum) && cc.calBP.some((v, i) => i > 0 && !(v > cc.calBP[i - 1]))) E('value', 'model.c14curve.calBP', 'must increase');
    }
    if (C.isObj(M.dendro) && !(Array.isArray(M.dendro.master) && Array.isArray(M.dendro.sample)) && M.dendro.synthetic === undefined) E('value', 'model.dendro', 'needs master and sample, or synthetic');
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], (o, at) => {
      const tb = C.has(T.OUT, o.kind) && C.has(T.OUT[o.kind], o.of) ? T.OUT[o.kind][o.of] : null;
      if (!tb) { E('output', at + '.of', `${o.of} is not a ${o.kind} output of ${ID}`); return; }
      C.walk(o, tb, at, E, W);
      for (const k of Object.keys(tb)) {
        const v = o[k]; if (typeof tb[k] !== 'string' || !tb[k].startsWith('ref') || typeof v !== 'string' || !C.ID_RE.test(v)) continue;
        if (k === 'event' && !ev.includes(v)) E('ref', `${at}.${k}`, `no event ${v}`);
        if ((k === 'a' || k === 'b') && !ev.includes(v) && !pe.includes(v)) E('ref', `${at}.${k}`, `no event or period ${v}`);
        if (k === 'reign' && !re.includes(v)) E('ref', `${at}.${k}`, `no reign ${v}`);
      }
      for (const k of ['from', 'to']) if (C.isObj(o[k])) checkDate(o[k], `${at}.${k}`, E, W);
      if (o.of === 'convert' && typeof o.to === 'string' && C.has(T.FIELDS, o.to) && typeof o.field === 'string' && !T.FIELDS[o.to].includes(o.field)) E('enum', at + '.field', 'one of ' + T.FIELDS[o.to].join(', '));
      if (o.of === 'crossdate' && !C.isObj(M.dendro)) E('ref', at + '.of', 'needs model.dendro');
      if (o.of === 'c14curve' && !C.isObj(M.c14curve)) E('ref', at + '.of', 'needs model.c14curve');
    }, E, W);
    return P;
  }
  /** every value of a kind (numx: expressions; key: string keys) along a table, in the table's order (the same walk as the Python twin) */
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
  const keys = spec => gather(spec, 'key');

  /* ---------- run ---------- */
  function prepare(spec) { const cache = new Map(); for (const [src] of exprs(spec)) if (!cache.has(src)) cache.set(src, C.cx(src)); return { cache }; }
  function run(spec, env, opts) {
    const M = spec.model || {}, o = M.options || {}, codes = [], out = {}, cache = (opts && opts.prepared && opts.prepared.cache) || new Map();
    const seed = (opts && opts.seed) >>> 0 || 1;
    const X = (v, e) => { if (typeof v === 'number') return v; if (typeof v !== 'string') return NaN; if (!cache.has(v)) cache.set(v, C.cx(v)); return cache.get(v)(e || env); };
    const opt = { ...o, maya: o.maya === undefined ? undefined : X(o.maya) };
    const flag = (code, of) => { if (!codes.some(c => c.code === code && c.of === of)) codes.push({ code, of }); };
    function dateRD(d, of) {
      if (!C.isObj(d) || !C.has(CAL, d.cal) || !CAL[d.cal].to) { flag('invalid', of); return { rd: NaN, flags: ['invalid'] }; }
      const f = { cal: d.cal }; for (const k of T.DATEF) if (d[k] !== undefined) f[k] = k === 'lc' ? (Array.isArray(d.lc) ? d.lc.map(v => X(v)) : d.lc) : typeof d[k] === 'string' && k !== 'era' ? X(d[k]) : d[k];
      for (const k of ['y', 'm', 'd', 'ol', 'oy', 'j']) if (typeof f[k] === 'number' && Number.isFinite(f[k]) && Math.abs(f[k] - Math.round(f[k])) < 1e-9) f[k] = Math.round(f[k]);
      const r = CAL[d.cal].to(f, opt); for (const c of r.flags) flag(c, of); return r;
    }
    /* each event → a density on a day grid (≤ 4001 cells) and a sampler; points have one cell */
    const EV = new Map();
    for (const e of Array.isArray(M.events) ? M.events : []) {
      if (!C.isObj(e) || typeof e.id !== 'string') continue;
      let D = null;
      if (e.date !== undefined) {
        const r = dateRD(e.date, e.id), sd = e.sd !== undefined ? X(e.sd) : e.sdYears !== undefined ? X(e.sdYears) * 365.25 : 0, pm = e.pm !== undefined ? X(e.pm) : e.pmYears !== undefined ? X(e.pmYears) * 365.25 : 0;
        if (!Number.isFinite(r.rd) || !(sd >= 0) || !(pm >= 0)) D = null;
        else if (sd > 0) D = gridNormal(r.rd, sd);
        else if (pm > 0) D = gridUniform(r.rd - pm, r.rd + pm);
        else D = { xs: [r.rd], ps: [1], point: true };
        if (D) D.flags = r.flags;
      } else if (Array.isArray(e.between)) {
        const a = dateRD(e.between[0], e.id).rd, b = dateRD(e.between[1], e.id).rd;
        D = Number.isFinite(a) && Number.isFinite(b) ? gridUniform(Math.min(a, b), Math.max(a, b)) : null;
      } else if (e.after !== undefined || e.before !== undefined) {
        const b = dateRD(e.after !== undefined ? e.after : e.before, e.id).rd, H = (e.horizonYears !== undefined ? X(e.horizonYears) : 100) * 365.25;
        D = Number.isFinite(b) && H > 0 ? (e.after !== undefined ? gridUniform(b, b + H) : gridUniform(b - H, b)) : null;
      } else if (C.isObj(e.c14)) {
        const age = X(e.c14.age) - (e.c14.reservoir !== undefined ? X(e.c14.reservoir) : 0), s0 = X(e.c14.sd), rs = e.c14.reservoirSd !== undefined ? X(e.c14.reservoirSd) : 0;
        const sd = Math.sqrt(s0 * s0 + rs * rs), curve = e.c14.curve === 'model' ? M.c14curve : null;
        const cal = Number.isFinite(age) && sd > 0 ? calibrate(age, sd, curve) : null;
        if (!cal) flag('out-of-range', e.id);
        else { if (cal.outside) flag('out-of-range', e.id); D = { xs: cal.calBP.map(th => rdOfYear(1950 - th)), ps: cal.p }; D.xs.reverse(); D.ps.reverse(); D.c14 = true; }
      }
      if (!D) flag('invalid', e.id);
      EV.set(e.id, D);
    }
    const PE = new Map();
    for (const p of Array.isArray(M.periods) ? M.periods : []) if (C.isObj(p) && typeof p.id === 'string') { const a = dateRD(p.start, p.id).rd, b = dateRD(p.end, p.id).rd; PE.set(p.id, Number.isFinite(a) && Number.isFinite(b) && b >= a ? [a, b] : null); if (!(b >= a)) flag('invalid', p.id); }
    const stat = (D, s) => statsOf(D)[s];
    const central = D => (D ? (D.point ? D.xs[0] : Math.round(statsOf(D).median)) : NaN);
    const rdOfRef = (id, end) => (EV.has(id) ? central(EV.get(id)) : PE.get(id) ? PE.get(id)[end ? 1 : 0] : NaN);
    const N = M.mc || 20000;
    let dendro;
    const getDendro = () => {
      if (dendro !== undefined) return dendro;
      const dm = M.dendro || {}; let ms = dm.master, ss = dm.sample;
      if (dm.synthetic) { const s = synthDendro(dm.synthetic, seed, env, X); ms = s && s.master; ss = s && s.sample; }
      dendro = Array.isArray(ms) && Array.isArray(ss) && ms.length >= 10 && ss.length >= 10 ? crossdate(ms, ss, Math.min(dm.minOverlap || 30, ss.length)) : null;
      if (!dendro || !dendro.best) flag('invalid', 'dendro');
      return dendro;
    };
    for (const oo of Array.isArray(spec.outputs) ? spec.outputs : []) {
      if (!C.isObj(oo) || typeof oo.id !== 'string') continue;
      const id = oo.id;
      try {
        if (oo.kind === 'scalar') out[id] = scalar(oo);
        else if (oo.kind === 'series') out[id] = series(oo);
        else if (oo.kind === 'scene') out[id] = sceneOf(oo);
      } catch (err) { out[id] = oo.kind === 'scalar' ? NaN : oo.kind === 'series' ? [] : { view: [-1, 1, -1, 1], items: [] }; flag('invalid', id); }
    }
    return { out, codes };

    function scalar(q) {
      const D = q.event !== undefined ? EV.get(q.event) : null;
      switch (q.of) {
        case 'convert': {
          if (!D) return NaN;
          const at = q.at || 'median', rd = D.point ? D.xs[0] : Math.round(at === 'mean' ? statsOf(D).mean : at === 'lo95' ? statsOf(D).lo95 : at === 'hi95' ? statsOf(D).hi95 : statsOf(D).median);
          const c = CAL[q.to]; if (!c || !c.from) return NaN;
          const r = c.from(rd, opt); for (const f of r.flags || []) flag(f, q.id);
          const v = r[q.field]; return typeof v === 'number' ? v : NaN;
        }
        case 'duration': {
          const a = rdOfRef(q.a, false), b = rdOfRef(q.b, true), inc = q.inclusive ? 1 : 0;
          if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
          if (q.unit === 'years') return (b - a + inc) / 365.25;
          if (q.unit === 'calendarYears') { const ya = (a < GREG_START ? rdToJ(a) : rdToG(a)).y, yb = (b < GREG_START ? rdToJ(b) : rdToG(b)).y; return yb - ya + inc; }
          return b - a + inc;
        }
        case 'relation': return relationP(q.a, q.b, q.rel);
        case 'within': {
          if (!D) return NaN; const a = dateRD(q.from, q.id).rd, b = dateRD(q.to, q.id).rd; if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
          let s = 0; D.xs.forEach((x, i) => { if (x >= a && x <= b) s += D.ps[i]; }); return Math.min(1, s);
        }
        case 'stat': {
          if (!D) return NaN; const st = statsOf(D), u = q.unit || 'year';
          const v = st[q.stat];
          if (q.stat === 'sd') return u === 'jdn' ? v : v / 365.25;
          const cv = x => (u === 'jdn' ? x + J0 : u === 'bp' ? 1950 - decYear(x) : decYear(x));
          if (u === 'bp' && /^(lo|hi)/.test(q.stat)) { const lo = cv(st[q.stat.replace('hi', 'lo')]), hi = cv(st[q.stat.replace('lo', 'hi')]); return q.stat.startsWith('lo') ? Math.min(lo, hi) : Math.max(lo, hi); }
          return cv(v);
        }
        case 'c14age': {
          const F = X(q.F), Fs = q.Fsd !== undefined ? X(q.Fsd) : NaN, fld = q.field || 'age';
          if (!(F > 0)) { flag('invalid', q.id); return NaN; }
          if (F > 1) flag('post-bomb', q.id);
          if (fld === 'age') return c14Age(F);
          if (fld === 'sd') return LIBBY * Fs / F;
          if (fld === 'age5730') return -CAMBRIDGE * Math.log(F);
          if (fld === 'd14c') { const y = X(q.year); return (F * Math.exp((1950 - y) / CAMBRIDGE) - 1) * 1000; }
          return F;
        }
        case 'easter': {
          const Y = X(q.year); if (!isInt(Y) || Y < 1) { flag('invalid', q.id); return NaN; }
          const orth = q.rite === 'orthodox', [jm, jd] = easterJ(Y);
          if (!orth && Y < 1583) flag('proleptic', q.id);
          const rd = orth ? jToRD(Y, jm, jd) : gToRD(Y, ...easterG(Y)), G = rdToG(rd);
          return { month: G.m, day: G.d, jdn: rd + J0, julianMonth: rdToJ(rd).m, julianDay: rdToJ(rd).d }[q.field];
        }
        case 'gap': { const Y = X(q.year); return isInt(Y) ? jToRD(Y, 3, 1) - gToRD(Y, 3, 1) : NaN; }
        case 'crossdate': {
          const dd = getDendro(); if (!dd || !dd.best) return NaN; const b = dd.best, ms = M.dendro && M.dendro.masterStart !== undefined ? X(M.dendro.masterStart) : 0;
          return { lag: b.lag, year: ms + b.lag, t: b.t, r: b.r, glk: b.glk, n: b.n }[q.field];
        }
        case 'regnal': return regnal(q);
        case 'flag': { const fl2 = D && D.flags ? D.flags : []; return +(fl2.includes(q.flag) || codes.some(c => c.of === q.event && c.code === q.flag)); }
      }
      return NaN;
    }
    function series(q) {
      if (q.of === 'density') { const D = EV.get(q.event); if (!D) return []; const u = q.unit || 'year';
        if (q.part === 'x') return C.thin(D.xs.map(x => (u === 'bp' ? 1950 - decYear(x) : decYear(x))), C.MAX_POINTS);
        const step = D.xs.length > 1 ? (D.xs[D.xs.length - 1] - D.xs[0]) / (D.xs.length - 1) / 365.25 : 1;
        return C.thin(D.ps.map(p => p / step), C.MAX_POINTS); }
      if (q.of === 'crossdate') { const dd = getDendro(); if (!dd) return []; return C.thin(q.part === 'x' ? dd.lags : dd.ts, C.MAX_POINTS); }
      if (q.of === 'c14curve') { const cc = M.c14curve || {}; return C.thin((q.part === 'x' ? cc.calBP : q.part === 'y' ? cc.age : cc.sd) || [], C.MAX_POINTS); }
      return [];
    }
    function relationP(a, b, rel) {
      const ia = EV.has(a) ? EV.get(a) : null, ib = EV.has(b) ? EV.get(b) : null, pa = PE.get(a), pb = PE.get(b);
      if ((EV.has(a) && !ia) || (EV.has(b) && !ib) || (!EV.has(a) && !pa) || (!EV.has(b) && !pb)) return NaN;
      const exact = (!ia || ia.point) && (!ib || ib.point), n = exact ? 1 : N;
      const r = C.rng(seed, 'timeline.mc.' + a + '.' + b), sa = ia ? sampler(ia) : null, sb = ib ? sampler(ib) : null;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const A = ia ? Math.round(sa(r)) : null, B = ib ? Math.round(sb(r)) : null;
        if (allen(ia ? A : pa[0], ia ? A : pa[1], ib ? B : pb[0], ib ? B : pb[1], rel)) k++;
      }
      return k / n;
    }
    function regnal(q) {
      const R = (M.reigns || []).find(x => x && x.id === q.reign), D = EV.get(q.event); if (!R || !D) return NaN;
      const S = dateRD(R.start, R.id).rd, x = central(D); if (!Number.isFinite(S) || !Number.isFinite(x) || x < S) return NaN;
      const cal = rd => (rd < GREG_START ? rdToJ(rd) : rdToG(rd)), to = (y, m, d) => { const j = jToRD(y, m, d); return j < GREG_START ? j : gToRD(y, m, d); };
      const s = cal(S), X2 = cal(x), mode = R.mode || 'anniversary';
      const anniv = y => { const j = jToRD(y, 3, 1) < GREG_START; return to(y, s.m, Math.min(s.d, mLen(s.m, j ? jLeap(y) : gLeap(y)))); };
      if (mode === 'anniversary') { let n = X2.y - s.y; if (x < anniv(X2.y)) n--; return n + 1; }
      const nm = R.newYearM || 1, nd = R.newYearD || 1, ny = y => to(y, nm, nd);
      const firstNY = S < ny(s.y) ? ny(s.y) : ny(s.y + 1);   // the first New Year after the accession
      if (x < firstNY) return mode === 'accession' ? 0 : 1;
      let y = cal(firstNY).y, n = 0; while (ny(y + 1) <= x && n < 5000) { y++; n++; }
      return mode === 'accession' ? n + 1 : n + 2;
    }
    function sceneOf(q) {
      const ax = M.axis || {}, era = q.era || ax.era || 'civil';
      const fromD = q.from || ax.from, toD = q.to || ax.to;
      let x0 = fromD ? dateRD(fromD, q.id).rd : NaN, x1 = toD ? dateRD(toD, q.id).rd : NaN;
      if (!Number.isFinite(x0) || !Number.isFinite(x1)) {
        let lo = Infinity, hi = -Infinity;
        for (const D of EV.values()) if (D) { const s = statsOf(D); lo = Math.min(lo, s.lo95); hi = Math.max(hi, s.hi95); }
        for (const p of PE.values()) if (p) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[1]); }
        if (!Number.isFinite(lo)) { lo = 0; hi = 365; }
        const pad = Math.max((hi - lo) * 0.08, 365.25);
        if (!Number.isFinite(x0)) x0 = lo - pad; if (!Number.isFinite(x1)) x1 = hi + pad;
      }
      if (x1 <= x0) x1 = x0 + 365;
      const Y0d = decYear(x0), Y1d = decYear(x1), span = Y1d - Y0d, lh = span / 12;
      let lanes = 1; for (const e of M.events || []) if (e && isInt(e.lane)) lanes = Math.max(lanes, e.lane + 1); for (const p of M.periods || []) if (p && isInt(p.lane)) lanes = Math.max(lanes, p.lane + 1);
      const sc = C.scene([Y0d, Y1d, -lh * 1.6, lh * (lanes + 0.6)]);
      sc.seg(Y0d, 0, Y1d, 0, { c: 'base', w: 1.5 });
      for (const t of ticks(era, x0, x1)) { const xx = decYear(t.rd); sc.seg(xx, 0, xx, -lh * 0.25, { c: t.muted ? 'muted' : 'base' }); sc.txt(xx, -lh * 0.75, { v: t.v, c: t.muted ? 'muted' : 'base', anchor: 'middle' }); }
      if (ax.bceKey && x0 < GREG_START && rdToJ(x0).y <= 0) sc.txt(Y0d, -lh * 1.35, { key: ax.bceKey, c: 'muted', anchor: 'start' });
      if (ax.ceKey && rdToG(x1).y > 0) sc.txt(Y1d, -lh * 1.35, { key: ax.ceKey, c: 'muted', anchor: 'end' });
      (M.periods || []).forEach(p => { const r = p && PE.get(p.id); if (!r) return; const y = lh * ((p.lane || 0) + 0.5), a = decYear(r[0]), b = decYear(r[1]);
        sc.poly([a, y - lh * 0.3, b, y - lh * 0.3, b, y + lh * 0.3, a, y + lh * 0.3], { c: 'info', fill: true, closed: true });
        if (p.label) sc.txt(a, y + lh * 0.38, { key: p.label, c: 'info', anchor: 'start' }); });
      (M.events || []).forEach(e => { const D = e && EV.get(e.id); if (!D) return; const y = lh * ((e.lane || 0) + 0.5), st = statsOf(D), x = decYear(D.point ? D.xs[0] : st.median);
        if (!D.point) {
          sc.seg(decYear(st.lo95), y, decYear(st.hi95), y, { c: 'muted', w: 6 });
          let mx = 0; for (const p of D.ps) mx = Math.max(mx, p);
          const k = Math.max(1, Math.ceil(D.xs.length / 200)), pts = [decYear(D.xs[0]), y];
          for (let i = 0; i < D.xs.length; i += k) pts.push(decYear(D.xs[i]), y + lh * 0.8 * D.ps[i] / mx);
          pts.push(decYear(D.xs[D.xs.length - 1]), y); sc.poly(pts, { c: 'hi', fill: true, closed: true });
        }
        sc.pt(x, y, { c: 'hi', r: 4, ...(e.label ? { key: e.label } : {}) }); });
      return sc.done();
    }
    function ticks(era, x0, x1) {
      const spanY = (x1 - x0) / 365.25, steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
      const s = steps.find(v => spanY / v <= 10) || 100000, out = [];
      if (era === 'jdn') { const sd = Math.max(1, Math.round(s * 365.25)); for (let k = Math.ceil((x0 + J0) / sd) * sd; k - J0 <= x1 && out.length < 40; k += sd) out.push({ rd: k - J0, v: k }); return out; }
      if (era === 'maya') { const cor = mayaCorr(opt); if (!Number.isFinite(cor)) return out; const u = [1, 20, 360, 7200, 144000].find(v => spanY * 365.25 / v <= 12) || 144000;
        for (let k = Math.ceil((x0 + J0 - cor) / u) * u; k + cor - J0 <= x1 && out.length < 40; k += u) out.push({ rd: k + cor - J0, v: k / u }); return out; }
      if (['gregorian', 'julian', 'civil'].includes(era)) {
        const cal = CAL[era], y0 = cal.from(x0, opt).y, y1 = cal.from(x1, opt).y;
        for (let ey = Math.ceil(y0 / s) * s; ey <= y1 + s && out.length < 40; ey += s) {
          const astro = ey <= 0 ? ey + 1 : ey;     // multiples of s in BCE/CE counting: 500 BCE = astronomical −499
          const yr = ey === 0 ? 1 : astro, rd = cal.to({ y: yr, m: 1, d: 1 }, opt).rd;
          if (Number.isFinite(rd) && rd >= x0 && rd <= x1) out.push({ rd, v: yr <= 0 ? 1 - yr : yr, muted: yr <= 0 });
        }
        return out;
      }
      const c = CAL[era]; if (!c || !c.to || !c.from) return out;
      if (era === 'olympiad') { const a = c.from(x0, opt).ol, b = c.from(x1, opt).ol, so = Math.max(1, Math.round(s / 4)); for (let k = Math.ceil(a / so) * so; k <= b && out.length < 40; k += so) { const rd = c.to({ ol: k, oy: 1 }, opt).rd; if (rd >= x0 && rd <= x1) out.push({ rd, v: k }); } return out; }
      const a = c.from(x0, opt).y, b = c.from(x1, opt).y; if (!Number.isFinite(a) || !Number.isFinite(b)) return out;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let k = Math.ceil(lo / s) * s; k <= hi && out.length < 40; k += s) {
        const f = era === 'hebrew' ? { y: k, m: 7, d: 1 } : era === 'byzantine' ? { y: k, m: 9, d: 1 } : era === 'japanese' ? null : { y: k, m: 1, d: 1 };
        if (!f) break; const rd = c.to(f, opt).rd; if (Number.isFinite(rd) && rd >= x0 && rd <= x1) out.push({ rd, v: k });
      }
      return out;
    }
  }
  /* densities on a day grid */
  function gridNormal(mu, sd) { const n = 801, lo = mu - 6 * sd, st = 12 * sd / (n - 1), xs = [], ps = []; let t = 0; for (let i = 0; i < n; i++) { const x = lo + i * st, p = Math.exp(-0.5 * ((x - mu) / sd) ** 2); xs.push(x); ps.push(p); t += p; } return { xs, ps: ps.map(p => p / t), normal: [mu, sd] }; }
  function gridUniform(a, b) { if (b <= a) return { xs: [a], ps: [1], point: true }; const n = Math.min(801, Math.max(2, Math.round(b - a) + 1)), xs = [], ps = []; for (let i = 0; i < n; i++) { xs.push(a + (b - a) * i / (n - 1)); ps.push(1 / n); } return { xs, ps, uniform: [a, b] }; }
  function sampler(D) {
    if (D.point) return () => D.xs[0];
    if (D.normal) return r => D.normal[0] + D.normal[1] * C.normal(r);
    if (D.uniform) return r => D.uniform[0] + (D.uniform[1] - D.uniform[0]) * r();
    const cdf = []; let s = 0; for (const p of D.ps) { s += p; cdf.push(s); }
    return r => { const u = r() * s; let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return D.xs[lo]; };
  }
  const STATS_CACHE = new WeakMap();
  function statsOf(D) {
    if (STATS_CACHE.has(D)) return STATS_CACHE.get(D);
    let m = 0, s2 = 0; D.xs.forEach((x, i) => { m += x * D.ps[i]; }); D.xs.forEach((x, i) => { s2 += (x - m) ** 2 * D.ps[i]; });
    let c = 0, median = D.xs[0]; for (let i = 0; i < D.xs.length; i++) { c += D.ps[i]; if (c >= 0.5) { median = D.xs[i]; break; } }
    const hpd = lev => { const idx = D.ps.map((p, i) => i).sort((a, b) => D.ps[b] - D.ps[a] || a - b); let acc = 0, lo = Infinity, hi = -Infinity; for (const i of idx) { if (acc >= lev - 1e-12) break; acc += D.ps[i]; lo = Math.min(lo, D.xs[i]); hi = Math.max(hi, D.xs[i]); } return [lo, hi]; };
    const [lo68, hi68] = D.point ? [D.xs[0], D.xs[0]] : hpd(0.6827), [lo95, hi95] = D.point ? [D.xs[0], D.xs[0]] : hpd(0.9545);
    const r = { mean: m, median, sd: Math.sqrt(s2), lo68, hi68, lo95, hi95 };
    STATS_CACHE.set(D, r); return r;
  }
  /** Allen's thirteen relations of intervals [s1, e1] and [s2, e2] (a point is an interval with s = e) */
  function allen(s1, e1, s2, e2, rel) {
    switch (rel) {
      case 'before': return e1 < s2; case 'after': return s1 > e2; case 'meets': return e1 === s2 && s1 < e1; case 'metBy': return s1 === e2 && s2 < e2;
      case 'overlaps': return s1 < s2 && s2 < e1 && e1 < e2; case 'overlappedBy': return s2 < s1 && s1 < e2 && e2 < e1;
      case 'starts': return s1 === s2 && e1 < e2; case 'startedBy': return s1 === s2 && e1 > e2; case 'during': return s1 > s2 && e1 < e2; case 'contains': return s1 < s2 && e1 > e2;
      case 'finishes': return e1 === e2 && s1 > s2; case 'finishedBy': return e1 === e2 && s1 < s2; case 'equals': return s1 === s2 && e1 === e2;
    }
    return false;
  }
  const convert = (rd, cal, options) => (CAL[cal] && CAL[cal].from ? CAL[cal].from(rd, options || {}) : null);
  const toRD = (fields, options) => (CAL[fields.cal] && CAL[fields.cal].to ? CAL[fields.cal].to(fields, options || {}) : { rd: NaN, flags: ['invalid'] });
  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
  engine.workerSource = C.workerSource(noemaLibTimelineModule, 'NoemaLibTimeline', { kit: true });
  root.NoemaLibTimeline = Object.freeze({
    table: { model: T.MODEL, outputs: T.OUT },   // the form of the activity author (46_lib_schema.js)
    id: ID, checkSpec, exprs, keys, run, prepare, engine: Object.freeze(engine), simEngine, TABLES: T,
    gToRD, jToRD, rdToG, rdToJ, fliegel, J0, decYear, rdOfYear, convert, toRD, CALENDARS: Object.keys(CAL), hNewYear, hDays, jalCal, nawRuz, romanOf,
    easterG, easterJ, c14Age, calibrate, crossdate, bpIndex, glk, allen, luniYear, dayCycle,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
