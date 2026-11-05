/* craft@1 — handcrafts (docs/library/craft.md): published reference values (source in each message), the edge cases and their
   codes, the checker's codes, the sim adapter, the Worker source in a fresh context, speed, and the twin data of tools/lib_craft.py.
   Run: node tests/lib_craft.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'engine', 'src');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log('✓ ' + m); else { fails++; console.log('✗ ' + m); } };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
globalThis.window = globalThis;
require(path.join(SRC, '35_simexpr.js'));
require(path.join(SRC, '46_lib_core.js'));
require(path.join(SRC, '48_lib_craft.js'));
const M = globalThis.NoemaLibCraft;
const X = (model, env) => M.compute(model, env || {}, null);   // → {scalars, series, scenes, issues}
const S = (model, env) => X(model, env).scalars;
const iss = (model, code) => X(model).issues[code] || 0;
const eqA = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===== fiber: knitting and crochet arithmetic =====
{
  ok(S({ mode: 'fiber', sts: 20, over: 4, unit: 'in', width: 38 }).castOnRaw === 190, 'F1 20 sts / 4 in over 38 in → 190 sts (arithmetic)');
  const f2 = S({ mode: 'fiber', sts: 22, over: 10, width: 54 });
  ok(near(f2.castOnRaw, 118.8, 1e-9) && f2.castOn === 119 && near(f2.achievedWidth, 54.09, 0.01), 'F2 22 sts/10 cm, 54 cm → 118.8, cast on 119, achieved 54.09 cm');
  ok(iss({ mode: 'fiber', sts: 22, over: 10, width: 54 }, 'rounded') === 1, 'F2 a non-integer count is reported (rounded), never truncated silently');
  ok(S({ mode: 'fiber', sts: 22, width: 54, mult: 4, plus: 2 }).castOn === 118, 'F3 repeat 4n+2 → 118 ((118.8−2)/4 = 29.2 → 29)');
  ok(S({ mode: 'fiber', sts: 22, width: 54, mult: 4, plus: 2, round: 'up' }).castOn === 122 && S({ mode: 'fiber', sts: 22, width: 54, round: 'even' }).castOn === 118, 'rounding modes: up → 122 (4n+2); even → 118');
  const r4 = X({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 8, work: 'round' } });
  ok(eqA(r4.series.gaps, [12, 13, 12, 13, 12, 13, 12, 13]) && r4.scalars.distResult === 108, 'F4 8 increases over 100 in the round: gaps 12,13,… (Bresenham), 108 sts');
  const r5 = X({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 8, work: 'flat' } });
  ok(eqA(r5.series.positions, [6, 19, 31, 44, 56, 69, 81, 94]) && r5.series.gaps[0] === 6 && r5.series.gaps[8] === 6, 'F5 flat: centred positions round((i+½)·12.5) = 6,19,…,94; end gaps 6 and 6');
  const g6 = X({ mode: 'fiber', sts: 20, distribute: { from: 87, change: 10 } }).series.gaps;
  ok(g6.reduce((a, b) => a + b, 0) === 87 && g6.every(g => g === 8 || g === 9) && g6.filter(g => g === 9).length === 7, 'F6 10 over 87: gaps sum to 87, each 8 or 9, seven 9s');
  const r7 = X({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 8, kind: 'dec' } });
  ok(eqA(r7.series.gaps, [12, 13, 12, 13, 12, 13, 12, 13]) && r7.scalars.distResult === 92 && !r7.issues['consumes-too-many'], 'F7 8 k2tog over 100: segments (K10, k2tog), (K11, k2tog) ×4 → 92');
  ok(iss({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 60, kind: 'dec' } }, 'consumes-too-many') === 1, 'F8 60 single decreases over 100 sts: consumes-too-many (> N/2)');
  ok(iss({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 30, kind: 'dec2' } }, 'consumes-too-many') === 0 && X({ mode: 'fiber', sts: 20, distribute: { from: 100, change: 30, kind: 'dec2' } }).scalars.distResult === 40, 'double decreases: 30 sk2p over 100 → 40 sts, allowed (≤ N/3)');
  ok(iss({ mode: 'fiber', sts: 20, distribute: { from: 10, change: 12 } }, 'impossible') === 1, 'more single increases than stitches: impossible');
  const f9 = S({ mode: 'fiber', sts: 20, shape: { fromSts: 116, toSts: 100, overRows: 50 } });
  ok(f9.shapeEvents === 8 && f9.shapeEveryA === 6 && f9.shapeTimesA === 6 && f9.shapeEveryB === 7 && f9.shapeTimesB === 2, 'F9 8 events over 50 rows: 6 × every 6 rows + 2 × every 7 rows (36 + 14 = 50)');
  const f10 = S({ mode: 'fiber', sts: 20, shape: { fromSts: 10, toSts: 0, overRows: 36 } });
  ok(f10.shapeEveryA === 7 && f10.shapeTimesA === 4 && f10.shapeEveryB === 8 && f10.shapeTimesB === 1, 'F10 5 events over 36 rows: 4 × every 7 + 1 × every 8');
  const rs = S({ mode: 'fiber', sts: 20, shape: { fromSts: 60, toSts: 48, overRows: 36, rsOnly: true } });
  ok(rs.shapeEveryA === 6 && rs.shapeTimesA === 6 && rs.shapeTimesB === 0, 'shaping on RS rows only: 6 events over 36 rows → every 6th row (even intervals)');
  ok(iss({ mode: 'fiber', sts: 20, shape: { fromSts: 61, toSts: 48, overRows: 36 } }, 'non-integer') === 1, 'asymmetric shaping (13 sts, 2 per event): non-integer');
  ok(iss({ mode: 'fiber', sts: 20, shape: { fromSts: 60, toSts: 20, overRows: 10 } }, 'impossible') === 1, 'more events than rows: impossible');
  ok(S({ mode: 'fiber', craft: 'crochet', sts: 14, circle: { rounds: 10 } }).circleSts === 60 && S({ mode: 'fiber', sts: 14, circle: { start: 12, rounds: 5 } }).circleSts === 60, 'F11 a flat circle: sc round 10 = 60 sts; dc (12 per round) round 5 = 60');
  const y = S({ mode: 'fiber', sts: 20, yarn: { swatchGrams: 10, swatchArea: 225, projectArea: 12000, metersPerGram: 2.2, skeinMeters: 200 } });
  ok(near(y.grams, 533.33, 0.01) && near(y.meters, 1173.33, 0.01) && y.skeins === 6, 'F12 swatch 10 g on 225 cm², 12 000 cm², 2.2 m/g: 533.3 g, 1173.3 m, 6 skeins of 200 m');
  ok(S({ mode: 'fiber', sts: 20, yarn: { swatchGrams: 10, swatchArea: 225, projectArea: 12000, metersPerGram: 2.2, skeinMeters: 200, safety: 10 } }).skeins === 7, 'F12 with a 10 % margin: 7 skeins');
  const f13 = X({ mode: 'fiber', sts: 18, category: 4 });
  ok(f13.scalars.gaugeInRange === 1 && f13.scalars.cycMin === 16 && f13.scalars.cycMax === 20 && !f13.issues.range, 'F13 18 sts/10 cm is in CYC category 4 (16–20 sts per 4 in / 10 cm, CYC Standard Yarn Weight System)');
  ok(iss({ mode: 'fiber', sts: 30, category: 5 }, 'range') === 1, 'F14 30 sts/10 cm declared category 5 (12–15): range');
  ok(near(S({ mode: 'fiber', sts: 18, unit: 'in', over: 4, patternSts: 20 }).sizeFactor, 1.1111, 1e-4), 'F15 a pattern at 20 sts/4 in worked at 18: size factor 1.111');
  ok(iss({ mode: 'fiber', sts: 0, width: 10 }, 'impossible') >= 1, 'a gauge of 0 stitches: impossible');
}

// ===== chart: stitch charts and colourwork =====
{
  const c = (rows, extra) => X(Object.assign({ mode: 'chart', rows }, extra || {}));
  const c1 = c(['k k yo k2tog k k']);
  ok(c1.scalars.stitchesStart === 6 && c1.scalars.stitchesEnd === 6 && c1.scalars.unbalancedRows === 0, 'C1 "k k yo k2tog k k": in 6, out 6, balanced');
  ok(c(['k yo k yo k']).scalars.stitchesEnd === 5, 'C2 "k yo k yo k" on 3 sts: out 5');
  ok(c(['ssk k k k2tog']).scalars.stitchesEnd === 4, 'C3 "ssk k k k2tog" on 6: out 4');
  const c4 = c(['k yo k yo k', 'k*6']);
  ok(c4.scalars.unbalancedRows === 1 && c4.scalars.firstUnbalanced === 2 && c4.issues['unbalanced-row'] === 1, 'C4 a row that needs 6 sts after a row giving 5: unbalanced-row at row 2');
  ok(c(['k*4'], { castOn: 5 }).issues['unbalanced-row'] === 1, 'the first row is checked against castOn');
  ok(c(['c2/2l k k']).scalars.width === 6 && c(['c2/2l k k']).scalars.stitchesEnd === 6, 'a 2/2 left cable (C4F) takes 4 cells, 4 in, 4 out');
  const c7 = c(['AABBBBBBAA'], { kind: 'color', work: 'round' });
  ok(c7.scalars.maxFloat === 6 && c7.scalars.longFloats === 1 && c7.issues['float-too-long'] === 1, 'C7 A A B×6 A A in the round: A floats 6 sts > 5 (float-too-long once)');
  ok(c(['AABBBBBBAA'], { kind: 'color', work: 'round', maxFloat: 9, gauge: 28, maxFloatCm: 2.5 }).scalars.floatLimit === 7 && !c(['AABBBBBBAA'], { kind: 'color', work: 'round', maxFloat: 9, gauge: 28, maxFloatCm: 2.5 }).issues['float-too-long'], 'C8 at 28 sts/10 cm a 2.5 cm limit is 7 sts: no long float');
  ok(c(['ABAB'], { kind: 'color', work: 'round' }).scalars.maxFloat === 1, 'C9 A B A B: the longest float is 1');
  const c10 = X({ mode: 'chart', kind: 'color', work: 'round', rows: ['BAAAAAAB'] });
  ok(c10.scalars.maxFloat === 6 && c10.issues['float-too-long'] === 1, 'C10 B A×6 B in the round: B floats 6 behind the As, A 2 across the seam (cyclic)');
  ok(X({ mode: 'chart', kind: 'color', work: 'flat', rows: ['BAAAAAAB'] }).scalars.maxFloat === 6 && M.runs(['A', 'B', 'B', 'A'], v => v === 'A', true).max === 2 && M.runs(['A', 'B', 'B', 'A'], v => v === 'A', false).max === 1, 'the run checker: cyclic runs wrap the seam, flat ones do not');
  ok(c(['ABC'], { kind: 'color' }).scalars.colorsMax === 3, 'colours per row counted (stranded knitting normally uses 2)');
  const sc = c(['k p yo k2tog ssk cdd ns c1/1r'], {}).scenes.chart;
  ok(sc.items.length > 0 && sc.items.length <= 2000, 'the chart scene is drawn within the scene budget');
}

// ===== weave: drafts, drawdowns, floats, satins, sett, warp plans, baskets =====
{
  const W = (model, env) => X(Object.assign({ mode: 'weave' }, model), env);
  const twill = { threading: [1, 2, 3, 4], tieup: [[1, 2], [2, 3], [3, 4], [4, 1]], treadling: [[1], [2], [3], [4]] };
  const w1 = W(twill);
  ok(w1.scalars.warpFloat === 2 && w1.scalars.weftFloat === 2 && w1.scalars.warpFaced === 0.5, 'W1–W2 a 2/2 twill draft: warp and weft floats 2, half warp-faced');
  const t31 = W({ structure: { type: 'twill', up: 3, down: 1 } }).scalars;
  ok(t31.warpFloat === 3 && t31.weftFloat === 1 && t31.warpFaced === 0.75, 'W3 3/1 twill: warp float 3, weft float 1, 0.75 warp-faced');
  const pl = W({ structure: { type: 'plain' } }).scalars;
  ok(pl.warpFloat === 1 && pl.weftFloat === 1 && pl.warpFaced === 0.5, 'W4 plain weave: every float 1');
  const sat = (n, s) => W({ structure: { type: 'satin', shafts: n, move: s } });
  ok(sat(5, 2).scalars.regular === 1 && sat(5, 3).scalars.regular === 1 && sat(5, 1).scalars.regular === 0 && sat(5, 2).scalars.satins === 1, 'W5 5-shaft satin: moves 2 and 3 are regular, 1 is a twill; 1 distinct satin (gcd rule)');
  ok(sat(7, 2).scalars.satins === 2 && sat(8, 3).scalars.satins === 1 && sat(12, 5).scalars.satins === 1, 'W6 distinct regular satins (φ(n) − 2)/2: n = 7 → 2, 8 → 1, 12 → 1');
  ok(sat(6, 2).issues.impossible === 1 && sat(6, 5).scalars.regular === 0 && sat(4, 3).scalars.regular === 0, 'W7 no regular satin on 4 or 6 shafts (impossible)');
  const s5 = sat(5, 2).scalars;
  ok(s5.warpFloat === 4 && s5.weftFloat === 1 && near(s5.warpFaced, 0.8, 1e-12), 'W8 5-shaft warp satin: warp float 4, weft float 1, 0.8 warp-faced');
  ok(near(W({ structure: { type: 'satin', shafts: 5, move: 2, face: 'weft' } }).scalars.warpFaced, 0.2, 1e-12), 'a sateen (weft face) is 0.2 warp-faced');
  const w9 = W({ threading: [1, 2, 3, 4], tieup: twill.tieup, treadling: [[1, 3], [2]] });
  ok(w9.scalars.noInterlace >= 1 && w9.issues['no-interlace'] >= 1, 'W9 treadles 1 and 3 together raise every shaft: that pick does not interlace');
  const sett = st => W({ structure: st, wpi: 24 }).scalars.sett;
  ok(near(sett({ type: 'plain' }), 12, 1e-9) && near(sett({ type: 'twill', up: 2, down: 2 }), 16, 1e-9) && near(sett({ type: 'twill', up: 2, down: 1 }), 14.4, 1e-9) && near(sett({ type: 'satin', shafts: 5, move: 2 }), 17.142857, 1e-5), 'W10 WPI 24: plain 12, 2/2 twill 16, 2/1 twill 14.4, 5-satin 17.14 EPI (Ashenhurst E/(E+I))');
  const wp = W({ structure: { type: 'plain' }, warp: { width: 20, length: 72, epi: 12, drawIn: 10, shrink: 10, takeUp: 10, waste: 27 } }).scalars;
  ok(near(wp.widthInReed, 24.691, 0.001) && wp.warpEnds === 297, 'W11 20 in finished, 10 % draw-in and shrinkage, 12 EPI: 24.69 in in the reed, 297 ends');
  ok(near(wp.wovenLength, 88.889, 0.001) && near(wp.warpLength, 115.889, 0.001) && near(wp.warpTotalLong, 956.08, 0.1), 'W12 72 in finished, 10 % take-up and shrinkage, 27 in loom waste: 88.89 in woven, 115.89 in warp, 956.1 yd');
  ok(W({ structure: { type: 'plain' }, basket: { stakes: 16 } }).issues.parity === 1 && W({ structure: { type: 'plain' }, basket: { stakes: 17 } }).scalars.parityOk === 1, 'W15 randing with one weaver: 16 stakes → parity; 17 fine');
  ok(W({ structure: { type: 'plain' }, basket: { diameter: 10, spacing: 1 } }).scalars.stakesNeeded === 33, 'stakes for a 10 in base at 1 in spacing: ⌈31.4⌉ = 32 → 33 (odd)');
  const w16a = W(twill), w16b = W(Object.assign({ shed: 'sinking' }, twill));
  ok(w16b.scalars.warpFaced === 0.5 && w16a.scenes.drawdown.items.length > 0, 'W16 the same tie-up read as sinking-shed is the complement (still 0.5 for a 2/2 twill)');
  const lf = W({ structure: { type: 'satin', shafts: 8, move: 3 }, maxFloat: 5 });
  ok(lf.scalars.longFloats === 8 && lf.issues['float-too-long'] === 8, 'an 8-shaft satin with floats limited to 5: 8 warp floats of 7 too long');
  ok(W({ threading: [1, 2, 3, 4], liftplan: [[1, 2], [2, 3], [3, 4], [4, 1]] }).scalars.warpFloat === 2, 'a liftplan gives the same drawdown as tie-up + treadling');
}

// ===== stitch: cross-stitch sizing and floss =====
{
  const s1 = S({ mode: 'stitch', w: 140, h: 100, count: 14 });
  ok(near(s1.widthIn, 10, 1e-9) && near(s1.heightIn, 7.142857, 1e-6) && near(s1.cutW, 16, 1e-9) && near(s1.cutH, 13.142857, 1e-6), 'S1/S4 140 × 100 on 14-count Aida: 10 × 7.14 in; with 3 in margins 16 × 13.14 in');
  ok(near(S({ mode: 'stitch', w: 140, h: 1, count: 28, over: 2 }).widthIn, 10, 1e-9) && near(S({ mode: 'stitch', w: 140, h: 1, count: 18 }).widthIn, 7.7778, 1e-4), 'S2/S3 28-count over two = 14 per inch: 10 in; 18-count: 7.78 in');
  ok(near(s1.perStitchMm, 8.7601, 1e-4), 'S5 floss per full cross on 14-count, per strand: (2√2 + 2)·25.4/14 = 8.760 mm');
  ok(near(S({ mode: 'stitch', w: 1, h: 1, count: 14, waste: 0 }).stitchesPerSkein, 2739.7, 0.1) && near(s1.stitchesPerSkein, 1826.5, 0.1), 'S6 an 8 m six-strand skein, 2 strands: 2740 crosses without waste, 1826 with 50 % (≈ the 1800 rule of thumb)');
  ok(near(S({ mode: 'stitch', w: 1, h: 1, count: 14, strands: 1 }).stitchesPerSkein, 3652.9, 0.1), 'S7 one strand, 50 % waste: 3653');
  ok(iss({ mode: 'stitch', w: 200, h: 50, count: 14, fabricW: 16, fabricH: 16 }, 'impossible') === 1, 'S9 200 sts on 14-count with 3 in margins does not fit a 16 in fabric: impossible');
  ok(near(S({ mode: 'stitch', w: 100, h: 100, count: 10 }).widthIn, 10, 1e-9), 'S8 10-mesh canvas, 100 stitches: 10 in');
  ok(near(S({ mode: 'stitch', w: 55, h: 55, count: 55, unit: 'cm' }).widthCm, 10, 1e-9), 'a metric count (stitches per 10 cm): 55 stitches at 55/10 cm = 10 cm');
}

// ===== quilt =====
{
  const q = S({ mode: 'quilt', finished: 3 });
  ok(q.square === 3.5 && q.hst2 === 3.875 && near(q.hst2Exact, 3.85355, 1e-5) && q.hst8 === 7.75, 'Q1/Q2/Q4 3 in finished: square 3½, HST 2-at-a-time 3⅞ (exact 3.8536 = f + ¼(2+√2)), 8-at-a-time 7¾');
  ok(near(q.hst4Exact, 5.4497, 1e-4) && q.hst4 === 5.5, 'HST 4-at-a-time: exact √2(f + ¼(2+√2)) = 5.4497, cut 5½');
  const q4 = S({ mode: 'quilt', finished: 4 });
  ok(q4.qst === 5.25 && near(q4.qstExact, 5.2071, 1e-4), 'Q3 QST 4 in finished: cut 5¼ (exact 5.2071 = f + ¼(2+2√2))');
  const q12 = S({ mode: 'quilt', finished: 12 });
  ok(near(q12.diagonal, 16.9706, 1e-4) && q12.sideSetting === 18.25 && q12.corner === 9.375, 'Q5–Q7 a 12 in block on point: diagonal 16.97, side setting square 18¼, corner square 9⅜');
  const qb = S({ mode: 'quilt', finished: 12, cols: 5, rows: 6, block: 12, sashing: 2, border: 4 });
  ok(qb.quiltW === 76 && qb.quiltH === 90, 'Q11 5 × 6 blocks of 12 in, 2 in sashing, 4 in border: 76 × 90 in');
  const bd = S({ mode: 'quilt', cols: 5, rows: 6, block: 12, binding: { extra: 12, strip: 2.5, wof: 42 } });
  ok(bd.quiltW === 60 && bd.bindingLength === 276 && bd.bindingStrips === 7 && bd.bindingYards === 0.5, 'Q8 binding for 60 × 72: 276 in, 7 strips of 42 in, 0.486 yd → ½ yd');
  const ct = S({ mode: 'quilt', cut: { count: 40, w: 4.5, h: 4.5, wof: 40 } });
  ok(ct.perStrip === 8 && ct.strips === 5 && ct.cutYards === 0.625, 'Q9 40 squares cut 4½ in, 40 in usable WOF: 8 per strip, 5 strips, ⅝ yd');
  ok(near(S({ mode: 'quilt', bias: { square: 36, strip: 2.5 } }).biasLength, 518.4, 1e-9), 'Q10 continuous bias from a 36 in square, 2½ in strips: 518.4 in');
  const bk = S({ mode: 'quilt', cols: 5, rows: 6, block: 12, backing: { margin: 4, wof: 40 } });
  ok(bk.backingPanels === 2 && bk.backingYards === 3.875, 'Q12 backing for 60 × 72 (+4 in per side): 2 panels across, 3.78 yd → 3⅞ yd');
  ok(iss({ mode: 'quilt', cut: { count: 4, w: 45, h: 45, wof: 40 } }, 'impossible') === 1, 'a piece wider than the fabric: impossible');
}

// ===== symmetry =====
{
  const sigs = ['o', '2222', '**', 'xx', '*x', '*2222', '22*', '22x', '2*22', '442', '*442', '4*2', '333', '*333', '3*3', '632', '*632'];
  ok(sigs.every(s => Math.abs(M.orbifoldCost(s) - 2) < 1e-12), 'G1 every one of the 17 wallpaper signatures costs exactly 2 (Conway, Burgiel, Goodman-Strauss 2008, the magic theorem)');
  ok(['∞∞', '∞x', '*∞∞', '22∞', '2*∞', '∞*', '*22∞'].every(s => Math.abs(M.orbifoldCost(s) - 2) < 1e-12), 'the 7 frieze signatures cost 2');
  ok(Math.abs(M.orbifoldCost('22222') - 2.5) < 1e-12 && Math.abs(M.orbifoldCost('2*2') - 1.75) < 1e-12, 'G2/G3 22222 costs 5/2 (hyperbolic), 2*2 costs 7/4 (spherical)');
  ok(X({ mode: 'symmetry', orbifold: '22222' }).issues['not-a-group'] === 1, '22222 is not a plane group');
  const cp = g => S({ mode: 'symmetry', group: g }).copies;
  ok(cp('p1') === 1 && cp('pgg') === 4 && cp('cmm') === 8 && cp('p4g') === 8 && cp('p6m') === 12 && cp('p3') === 3, 'G4 copies per conventional cell: p1 1, pgg 4, cmm 8, p4g 8, p6m 12, p3 3 (ITA Vol. A general positions)');
  // every group is closed: the product of two ops is an op modulo the lattice (a strong check of the transcribed tables)
  const mod1 = v => ((v % 1) + 1) % 1;
  const closed = name => {
    const G = M.GROUPS[name], fr = G.lat === 'frieze', key = o => o.slice(0, 4).join(',') + '|' + mod1(o[4]).toFixed(6) + ',' + (fr ? o[5].toFixed(6) : mod1(o[5]).toFixed(6));
    const set = new Set(G.ops.map(key));
    for (const a of G.ops) for (const b of G.ops) {
      const c = [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[0] * b[4] + a[1] * b[5] + a[4], a[2] * b[4] + a[3] * b[5] + a[5]];
      if (!set.has(key(c))) return false;
    }
    return set.size === G.ops.length;
  };
  ok(Object.keys(M.GROUPS).every(closed), 'all 24 op tables (17 wallpaper, 7 frieze) are closed groups modulo the lattice, without duplicates');
  const onMirror = (name, x, y) => M.GROUPS[name].ops.some(o => o[0] * o[3] - o[1] * o[2] < 0 && [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]].some(([i, j]) => Math.abs(o[0] * x + o[1] * y + o[4] + i - x) < 1e-9 && Math.abs(o[2] * x + o[3] * y + o[5] + j - y) < 1e-9));
  ok(onMirror('p3m1', 1 / 3, 2 / 3) && !onMirror('p31m', 1 / 3, 2 / 3) && onMirror('p31m', 0, 0), 'G5 in p3m1 the 3-fold centre (⅓, ⅔) lies on a mirror; in p31m it does not (only (0, 0) does)');
  const cl = q => M.DATA.wallpaper[S({ mode: 'symmetry', classify: q }).classified];
  ok(cl({ rot: 4, mirrors: 1, onMirrors: 1 }) === 'p4m' && cl({ rot: 4, mirrors: 1 }) === 'p4g' && cl({ rot: 2, mirrors: 1 }) === 'pmg' && cl({ rot: 2, mirrors: 1, twoDirs: 1 }) === 'cmm' && cl({ rot: 1, glide: 1 }) === 'pg' && cl({ rot: 3, mirrors: 1 }) === 'p31m', 'G6–G8 the Washburn & Crowe flowchart: p4m, p4g, pmg, cmm, pg, p31m');
  ok(S({ mode: 'symmetry', classify: { rot: 5 } }).classified === -1 && X({ mode: 'symmetry', classify: { rot: 5 } }).issues['not-a-group'] === 1, 'G9 a 5-fold rotation: not a plane group (the crystallographic restriction)');
  const fz = q => [...M.DATA.wallpaper, ...M.DATA.frieze][S({ mode: 'symmetry', classifyFrieze: q }).classified];
  ok(fz({ hmirror: 1 }) === 'jump' && fz({ hmirror: 1, vmirror: 1 }) === 'spinning-jump' && fz({ vmirror: 1, turn: 1 }) === 'spinning-sidle' && fz({ glide: 1 }) === 'step' && fz({}) === 'hop', 'G10 friezes: a horizontal mirror only is a "jump" (p11m), both mirrors a "spinning jump", …');
  const v = vx => S({ mode: 'symmetry', vertex: vx });
  ok(v([4, 8, 8]).vertexSum === 360 && v([4, 8, 8]).tiles === 1 && v([8, 4, 8]).tiles === 1, 'G11 4.8.8: 90 + 135 + 135 = 360°, a uniform tiling (any rotation of the type)');
  ok(near(v([5, 5, 10]).vertexSum, 360, 1e-9) && v([5, 5, 10]).angleOk === 1 && v([5, 5, 10]).tiles === 0, 'G12 5.5.10 sums to 360° but does not tile (Grünbaum & Shephard §2.1)');
  ok(v([3, 3, 3, 3, 6]).tiles === 1 && v([3, 3, 3, 3, 6]).chiral === 1 && v([3, 4, 6, 4]).tiles === 1 && v([3, 3, 4, 3, 4]).tiles === 1 && v([3, 4, 3, 3, 4]).tiles === 1, 'G13 3⁴.6 tiles and is chiral; 3.4.6.4 and 3².4.3.4 tile');
  ok(v([3, 7, 42]).angleOk === 1 && v([3, 7, 42]).tiles === 0, '3.7.42 fits a vertex but does not tile');
  const pmg = M.GROUPS.pmg.ops.map(o => [o[0] * 0.1 + o[1] * 0.2 + o[4], o[2] * 0.1 + o[3] * 0.2 + o[5]].map(z => +z.toFixed(6)));
  ok(eqA(pmg, [[0.1, 0.2], [-0.1, -0.2], [0.4, 0.2], [0.6, -0.2]]), 'G15 pmg images of (0.1, 0.2): (0.1,0.2) (−0.1,−0.2) (0.4,0.2) (0.6,−0.2)');
  const pat = X({ mode: 'symmetry', group: 'p6m', cells: 6 }).scenes.pattern;
  ok(pat.items.length > 400 && pat.items.length <= 2000, 'a p6m pattern of 6 × 6 cells stays within the scene budget');
  ok(S({ mode: 'symmetry', groupIndex: 20 }).groupIdx === 20 && S({ mode: 'symmetry', groupIndex: 20 }).frieze === 1, 'a group picked by index (a slider): 20 = spinning-hop, a frieze');
}

// ===== sew =====
{
  const sk = f => S({ mode: 'sew', skirt: { waist: 28, length: 20, fraction: f } });
  ok(near(sk(1).skirtRadius, 4.4563, 1e-4) && near(sk(0.5).skirtRadius, 8.9127, 1e-4) && near(sk(0.25).skirtRadius, 17.8254, 1e-4), 'P1/P2 a 28 in waist: radius 4.456 (full), 8.913 (half), 17.825 (quarter) = W/(2πf)');
  ok(near(sk(1).skirtW, 48.9127, 1e-3) && near(sk(1).skirtH, 48.9127, 1e-3) && near(sk(1).hem, 2 * Math.PI * 24.4563, 1e-3), 'P3 a full circle 20 in long needs a 48.91 in square; hem 153.7 in');
  ok(S({ mode: 'sew', gather: { finished: 40, ratio: 2.5 } }).gather === 100 && S({ mode: 'sew', pleats: { finished: 30, depth: 1.5, count: 10 } }).pleats === 60, 'P4/P5 gathers 40 × 2.5 = 100 in; 10 knife pleats 1½ deep on 30 in: 60 in');
  const sq = S({ mode: 'sew', piece: { pts: [0, 0, 1, 0, 1, 1, 0, 1], sa: 0.25 } });
  ok(near(sq.saArea, 2.25, 1e-9) && sq.concave === 0 && sq.area === 1 && sq.perimeter === 4, 'P6 a unit square offset by ¼ (mitred): 1.5 square, area 2.25');
  const tri = S({ mode: 'sew', piece: { pts: [0, 0, 1, 0, 0.5, Math.sqrt(3) / 2], sa: 0.1 } });
  ok(near(Math.sqrt(tri.saArea * 4 / Math.sqrt(3)), 1 + 2 * Math.sqrt(3) * 0.1, 1e-9), 'P7 an equilateral triangle of side 1 offset by 0.1: side 1 + 2√3·0.1 = 1.3464');
  ok(near(S({ mode: 'sew', piece: { pts: [0, 1, 1, 1, 1, 0, 0, 0], sa: 0.25 } }).saArea, 2.25, 1e-9), 'a clockwise polygon is offset outwards too');
  ok(iss({ mode: 'sew', piece: { pts: [0, 0, 2, 0, 2, 2, 1, 1, 0, 2], sa: 0.1 } }, 'concave') === 1, 'a concave piece is reported (its offset is approximate: no clipping library)');
  ok(S({ mode: 'sew', ease: { body: 36, ease: 2.5 } }).garment === 38.5 && S({ mode: 'sew', ease: { body: 34, ease: -4, stretch: 40 } }).easeOk === 1 && iss({ mode: 'sew', ease: { body: 34, ease: -4 } }, 'range') === 1, 'P9/P10 bust 36 + 2.5 ease = 38.5; −4 in on a 40 % stretch fabric is fine, on a woven it is not');
  const pk = S({ mode: 'sew', pack: { width: 45, rects: [[20, 30], [20, 30], [25, 10]] } });
  ok(pk.packLength === 40 && near(pk.packEfficiency, 1450 / 1800, 1e-12), 'P11 shelf packing on 45 width: 20+20 (h 30), then 25 (h 10) → length 40');
  const gr = X({ mode: 'sew', piece: { pts: [0, 0, 10, 0, 10, 20, 0, 20], sa: 1 }, grade: { rule: [0, 0, 0.5, 0, 0.5, 0.25, 0, 0.25], steps: 2 } }).scenes.piece;
  ok(gr.items.filter(i => i.k === 'poly').length === 4 && gr.items[3].pts[4] === 11 && gr.items[3].pts[5] === 20.5, 'P8 grading the point (10, 20) by (+0.5, +0.25) per size: (11, 20.5) at +2');
}

// ===== wood =====
{
  ok(S({ mode: 'wood', board: { t: 2, w: 6, l: 8 } }).boardFeet === 8 && near(S({ mode: 'wood', board: { t: 1, w: 5.5, l: 10 } }).boardFeet, 4.5833, 1e-4), 'T1/T2 8/4 × 6 in × 8 ft = 8 BF; 4/4 × 5½ × 10 ft = 4.583 BF');
  ok(near(S({ mode: 'wood', board: { t: 1, w: 12, l: 1 } }).cubicMeters, 0.0023597, 1e-7), 'T13 1 board foot = 0.002 359 7 m³');
  const mv = S({ mode: 'wood', species: 'oak-red', width: 12, mcFrom: 6, mcTo: 12 });
  ok(near(mv.movement, 0.21888, 5e-4), 'T4 northern red oak, 12 in flatsawn, 6 → 12 % MC: +0.2189 in (C_T 0.00304, Wood Handbook FPL-GTR-282 2021 Table 13-5)');
  ok(near(S({ mode: 'wood', species: 'oak-red', width: 12, mcFrom: 6, mcTo: 12, cut: 'quarter' }).movement, 0.09864, 5e-4), 'T5 quartersawn: +0.0986 in (C_R 0.00137, FPL-GTR-282 2021 Table 13-5)');
  ok(near(S({ mode: 'wood', species: 'oak-red', width: 16, mcFrom: 6, mcTo: 12 }).movement, 0.29184, 1e-4), 'T14 a 16 in red oak panel, 6 → 12 %: 0.292 in seasonal movement (C_T 0.00304, GTR-282 Table 13-5)');
  const e = T => S({ mode: 'wood', emc: { tempF: 70, rh: T } }).emc;
  ok(near(e(30), 6.2, 0.05) && near(e(50), 9.2, 0.06) && near(e(65), 12.0, 0.05) && near(e(80), 16.0, 0.05) && near(e(90), 20.5, 0.05), 'T6 EMC at 70 °F, 30/50/65/80/90 % RH: 6.2/9.2/12.0/16.0/20.5 % (Simpson 1973, Wood Handbook eq. 4-5 and its EMC table)');
  ok(near(S({ mode: 'wood', emc: { tempF: 40, rh: 50 } }).emc, 9.52, 0.01) && near(S({ mode: 'wood', emc: { tempF: 100, rh: 50 } }).emc, 8.68, 0.01), 'T7 EMC 40 °F 50 % = 9.5 %, 100 °F 50 % = 8.7 %');
  ok(X({ mode: 'wood', emc: { tempF: 70, rh: 50 } }).series.emcCurve.length === 50, 'the EMC curve over 0–98 % RH');
  ok(near(S({ mode: 'wood', species: 'oak-red', width: 10, mcFrom: 30, mcTo: 12 }).shrinkAt, 5.16, 1e-9), 'T8 red oak tangential shrinkage from green at 12 %: 8.6·(30 − 12)/30 = 5.16 %');
  const fsp = X({ mode: 'wood', species: 'oak-red', width: 10, mcFrom: 35, mcTo: 32 });
  ok(fsp.issues['beyond-fsp'] === 1 && fsp.scalars.movement === 0 && fsp.scalars.movementFull === 0, 'T9 above the fibre saturation point: beyond-fsp, no movement');
  ok(X({ mode: 'wood', species: 'oak-red', width: 10, mcFrom: 4, mcTo: 20 }).issues.extrapolated === 1, 'the coefficient form outside 6–14 % MC: extrapolated');
  ok(X({ mode: 'wood', species: 'teak', width: 10, mcFrom: 6, mcTo: 12 }).issues['out-of-table'] === 1, 'a species without coefficients (teak): out-of-table for the C form');
  const sh = S({ mode: 'wood', species: 'oak-red', shelf: { t: 0.75, w: 10, span: 36, load: 20 } });
  ok(near(sh.sag, 0.0570, 1e-4) && near(sh.sagLimit, 0.06, 1e-12) && sh.sagOk === 1, 'T10 a ¾ × 10 in red oak shelf, 36 in span, 20 lb/ft: 0.057 in (limit 0.06: 0.02 in per foot)');
  const cl = S({ mode: 'wood', cutlist: { stock: 96, kerf: 0.125, pieces: [30, 30, 30, 24, 24, 18, 18, 18, 12, 12] } });
  ok(cl.boards === 3 && cl.lowerBound === 3 && cl.boardsOpt === 3, 'T11 a cut list in 96 in boards, ⅛ kerf: 3 boards by FFD = the lower bound');
  ok(M.exactBins([6, 6, 5, 5, 4, 4], 15, 0, 9) === 2 && M.ffd([6, 6, 5, 5, 4, 4], 15, 0).length === 3 && M.exactBins([7, 5, 5, 4, 3, 3, 3], 15, 0, 4) === 2, 'first-fit decreasing needs 3 boards for 6,6,5,5,4,4 in 15; the exact search finds 2 (6+5+4 twice)');
  ok(iss({ mode: 'wood', cutlist: { stock: 96, pieces: [100] } }, 'impossible') === 1, 'a piece longer than the stock: impossible');
  const dv = n => S({ mode: 'wood', dovetail: n }).dovetailDeg;
  ok(near(dv(6), 9.46, 0.01) && near(dv(8), 7.13, 0.01) && near(dv(7), 8.13, 0.01), 'T12 dovetail 1:6 = 9.46°, 1:8 = 7.13°, 1:7 = 8.13°');
}

// ===== ceramic =====
{
  const k1 = S({ mode: 'ceramic', fired: 10, shrink: 12 });
  ok(near(k1.wet, 11.3636, 1e-4) && near(k1.volShrink, 31.85, 0.01), 'K1/K2 10 cm fired at 12 % shrinkage: 11.364 cm wet (not 11.2); 31.85 % by volume');
  ok(near(S({ mode: 'ceramic', dry: 6, fire: 7 }).totalShrink, 12.58, 1e-9), 'K3 6 % drying then 7 % firing: 12.58 % in total');
  const ct = (cone, rate, type) => S({ mode: 'ceramic', cone, rate, type }).coneTemp;
  ok(ct('6', 60) === 1222 && ct('10', 60) === 1285, 'K4/K5 Orton self-supporting cone 6 at 60 °C/h: 1222 °C (2232 °F); cone 10: 1285 °C (2345 °F)');
  ok(ct('04', 60) === 1063 && ct('04', 150) === 1077 && ct('6', 15) === 1185 && ct('6', 150) === 1243, 'K6/K7 cone 04: 1063 / 1077 °C; cone 6 at 15 / 150 °C/h: 1185 / 1243 °C (Orton chart)');
  ok(near(ct('6', Math.sqrt(60 * 150)), (1222 + 1243) / 2, 1e-9), 'between two rates the chart is interpolated in log(rate)');
  ok(ct('05.5', 60) === 1015 && ct('5.5', 60) === 1203 && ct('022', 60) === 586 && ct('14', 150) === 1384, 'half cones and the ends of the chart: 05½ 1015, 5½ 1203, 022 586, 14 at 150 °C/h 1384 °C');
  ok(ct('6', 60, 'large') === 1220 && ct('010', 60, 'ssfe') === 886 && ct('6', 300, 'small') === 1255, 'large, iron-free and small cones: 1220, 886, 1255 °C');
  const k8 = S({ mode: 'ceramic', tempC: 1230, rate: 60 });
  ok(k8.coneAt === 6 && near(k8.coneFrac, 8 / 17, 1e-9), 'K8 1230 °C at 60 °C/h: past cone 6 (1222), 8/17 of the way to cone 7 (1239)');
  ok(X({ mode: 'ceramic', tempC: 1500, rate: 60 }).issues['out-of-table'] === 1 && X({ mode: 'ceramic', coneIndex: 40 }).issues['out-of-table'] === 1, 'K9 beyond cone 14 (or a cone index past the chart): out-of-table');
  ok(X({ mode: 'ceramic', cone: '6', rate: 300 }).issues.extrapolated === 1, 'a rate beyond 150 °C/h: extrapolated');
  ok(X({ mode: 'ceramic', cone: '6' }).series.coneTemps.length === 38 && M.ORTON.ss.length === 38 && M.ORTON.large.length === 38 && M.ORTON.small.length === 38, 'the cone table holds 38 cones (022–14) for every type');
  const temps = X({ mode: 'ceramic', rate: 60, cone: '6' }).series.coneTemps; ok(temps.every((t, i) => !i || t > temps[i - 1]), 'self-supporting cones at 60 °C/h rise monotonically from 022 to 14');
  const leach = S({ mode: 'ceramic', recipe: [{ mat: 'potash_feldspar', w: 40 }, { mat: 'silica', w: 30 }, { mat: 'whiting', w: 20 }, { mat: 'kaolin', w: 10 }] });
  ok(near(leach['umf.K2O'], 0.2645, 1e-3) && near(leach['umf.CaO'], 0.7355, 1e-3) && near(leach['umf.Al2O3'], 0.4071, 1e-3) && near(leach['umf.SiO2'], 3.710, 1e-3) && near(leach.siAl, 9.114, 1e-3) && near(leach.firedYield, 89.81, 0.01), 'K10 Leach 4321 (theoretical materials): K2O 0.2645, CaO 0.7355, Al2O3 0.4071, SiO2 3.710, Si:Al 9.11, fired yield 89.8 %');
  const sp = S({ mode: 'ceramic', recipe: [{ mat: 'potash_feldspar', w: 100 }] });
  ok(near(sp['umf.SiO2'], 6, 1e-9) && near(sp['wt.K2O'], 16.92, 0.01) && near(sp['wt.Al2O3'], 18.32, 0.01) && near(sp['wt.SiO2'], 64.76, 0.01), 'K11 potash feldspar K2O·Al2O3·6SiO2: 16.92 / 18.32 / 64.76 wt %');
  const bt = S({ mode: 'ceramic', target: { K2O: 0.3, CaO: 0.7, Al2O3: 0.4, SiO2: 3.5 }, batch: ['potash_feldspar', 'whiting', 'kaolin', 'silica'] });
  ok(near(bt['batch.0'], 47.31, 0.01) && near(bt['batch.1'], 19.85, 0.01) && near(bt['batch.2'], 7.31, 0.01) && near(bt['batch.3'], 25.53, 0.01) && bt.batchResidual < 1e-9, 'K12 UMF K2O 0.3 CaO 0.7 Al2O3 0.4 SiO2 3.5 → feldspar 47.31, whiting 19.85, kaolin 7.31, silica 25.53 %');
  const k13 = X({ mode: 'ceramic', target: { K2O: 0.5, CaO: 0.5, Al2O3: 0.4, SiO2: 3 }, batch: ['potash_feldspar', 'whiting', 'kaolin', 'silica'] });
  ok(k13.issues['negative-batch'] === 1 && [0, 1, 2, 3].every(j => k13.scalars['batch.' + j] >= 0) && k13.scalars.batchResidual > 0.001, 'K13 a target with less alumina than the feldspar brings: negative-batch; the non-negative best fit is shown with its residual');
  ok(X({ mode: 'ceramic', recipe: [{ mat: 'silica', w: 50 }, { mat: 'kaolin', w: 50 }] }).issues['unity-off'] === 1, 'K14 silica and kaolin only (no flux): unity-off');
  const leachE = S({ mode: 'ceramic', recipe: [{ mat: 'potash_feldspar', w: 40 }, { mat: 'silica', w: 30 }, { mat: 'whiting', w: 20 }, { mat: 'kaolin', w: 10 }], bodyCoe: 6 });
  ok(near(leachE.expansion, 5.486, 0.005) && near(leachE.glazeMinusBody, -0.514, 0.005), 'K15 Leach 4321, English & Turner (1927) by weight: 5.49 ppm/K; 0.51 below a body of 6');
  ok(near(M.expansion({ SiO2: 0.72, Na2O: 0.15, CaO: 0.1, MgO: 0.03 }, 'appen'), 0.72 * 3.3 + 0.15 * 39.5 + 0.1 * 13 + 0.03 * 6, 1e-9), 'Appen by mole: SiO2 72 mol % → 10.5 − 0.1·72 = 3.3 ppm/K per unit fraction');
  const own = S({ mode: 'ceramic', materials: { frit3134: { CaO: 20.1, Na2O: 10.3, B2O3: 23.1, SiO2: 46.5 } }, recipe: [{ mat: 'frit3134', w: 100 }] });
  ok(near(own['umf.CaO'] + own['umf.Na2O'], 1, 1e-12) && own['umf.B2O3'] > 0.5, 'an author analysis (wt %) of a frit gives its unity formula');
}

// ===== metal =====
{
  const r = (size, scale) => S({ mode: 'metal', size, scale });
  ok(near(r(7).diameter, 17.32, 0.005) && near(r(7).circumference, 54.41, 0.01), 'M1 US 7: 17.32 mm, 54.41 mm (ISO 8653 ≈ 54)');
  ok(near(r(5).diameter, 15.69, 0.01) && near(r(9).diameter, 18.95, 0.01), 'M2 US 5 / 9: 15.69 / 18.95 mm');
  ok(near(r(14.5, 'uk').circumference, 54.375, 1e-9), 'M3 UK N½ (14.5): 54.375 mm ≈ US 7');
  ok(near(r(52, 'iso').us, 6.06, 0.01), 'M4 ISO 52 → US 6.06');
  ok(near(S({ mode: 'metal', size: 7, thickness: 1.5 }).blank, 59.12, 0.01), 'M5 a blank for US 7 in 1.5 mm stock: π(d + t) = 59.12 mm');
  const awg = a => S({ mode: 'metal', awg: a }).awgMm;
  ok([[10, 2.588], [12, 2.053], [14, 1.628], [18, 1.024], [20, 0.812], [22, 0.644], [24, 0.511], [-3, 11.684], [36, 0.127]].every(([g, d]) => near(awg(g), d, 0.001)), 'M6/M7 AWG (ASTM B258) 10, 12, 14, 18, 20, 22, 24, 0000, 36: 2.588 … 0.127 mm');
  ok(near(S({ mode: 'metal', swg: 18 }).swgMm, 1.2192, 1e-4) && near(S({ mode: 'metal', swg: 20 }).swgMm, 0.9144, 1e-4) && near(S({ mode: 'metal', swg: -6 }).swgMm, 12.7, 1e-9), 'M8 SWG (BS 3737) 18 = 0.048 in, 20 = 0.036 in, 7/0 = 0.500 in');
  ok(X({ mode: 'metal', swg: 51 }).issues['out-of-table'] === 1 && X({ mode: 'metal', swg: 18.5 }).issues.rounded === 1, 'SWG 51: out-of-table; a half gauge is rounded');
  ok(S({ mode: 'metal', karat: 18 }).fineness === 750 && near(S({ mode: 'metal', karat: 14 }).fineness, 583.33, 0.01) && S({ mode: 'metal', karat: 9 }).fineness === 375, 'M9 18 k 750, 14 k 583.3 (hallmark 585), 9 k 375');
  const al = (mass, from, to, add) => S({ mode: 'metal', alloy: { mass, from, to, ...(add !== undefined ? { add } : {}) } }).alloyAdd;
  ok(near(al(10, 1000, 750), 3.3333, 1e-4) && near(al(10, 750, 585), 2.8205, 1e-4) && near(al(10, 585, 750), 6.6, 1e-9), 'M10–M12 10 g fine → 18 k: add 3.333 g alloy; 18 k → 585: 2.821 g; 585 → 750 with fine: 6.6 g');
  ok(iss({ mode: 'metal', alloy: { mass: 10, from: 750, to: 585, add: 600 } }, 'impossible') === 1, 'lowering with an alloy finer than the target: impossible');
  const band = S({ mode: 'metal', size: 7, thickness: 1.5, width: 4, metal: 'sterling' });
  ok(near(band.bandVolume, 354.75, 0.01) && near(band.bandMass, 3.675, 0.005), 'M14 a US 7 sterling band 1.5 × 4 mm: 354.75 mm³, 3.675 g');
  ok(near(S({ mode: 'metal', awg: 18, wireLength: 1000, metal: 'copper' }).wireMass, 7.375, 0.005), 'M15 1 m of AWG 18 copper: 7.375 g');
  ok(X({ mode: 'metal', size: 20 }).issues['out-of-table'] === 1, 'US 20: out of the table');
}

// ===== book, leather, dye =====
{
  const b = S({ mode: 'book', pages: 200, folds: 3 });
  ok(b.pagesPerSig === 16 && b.signatures === 13 && b.blanks === 8 && b.needGrain === 1, 'B1/B2 octavo: 16 pages per signature; 200 pages → 13 signatures, 8 blanks; short grain');
  const im = i => X({ mode: 'book', pages: 16, folds: 3, sheet: i }).scenes.imposition.items.filter(x => x.k === 'txt').map(x => x.v);
  ok(eqA(im(0), [16, 1, 2, 15]) && eqA(im(3), [10, 7, 8, 9]), 'B3/B4 16 pages nested: sheet 0 front 16|1, back 2|15; sheet 3 front 10|7, back 8|9');
  ok(eqA(X({ mode: 'book', pages: 8, folds: 2, sheet: 1 }).scenes.imposition.items.filter(x => x.k === 'txt').map(x => x.v), [6, 3, 4, 5]), 'B5 8 pages: sheet 1 front 6|3, back 4|5');
  ok(S({ mode: 'book', pages: 4, folds: 1, grain: 'short' }).grainOk === 1 && S({ mode: 'book', pages: 8, folds: 2, grain: 'long' }).grainOk === 1 && iss({ mode: 'book', pages: 4, folds: 1, grain: 'long' }, 'grain-wrong') === 1, 'B6/B7 the grain parallel to the spine: folio short grain, quarto long; a long-grain folio is grain-wrong');
  ok(near(S({ mode: 'book', pages: 320, caliper: 0.1 }).spine, 16, 1e-9) && near(S({ mode: 'book', pages: 32, sheetsPerSig: 8, caliper: 0.1 }).creep, 0.7, 1e-9), 'B8/B9 320 pages at 0.1 mm: 16 mm spine; an 8-sheet saddle signature creeps 0.7 mm');
  const l = S({ mode: 'leather', oz: 4, seam: 300, pitch: 4, thickness: 4, tail: 150 });
  ok(near(l.mm, 1.5875, 1e-9) && l.holes === 76 && l.thread === 1508 && l.ruleOfThumb === 1200 && near(l.spi, 6.35, 1e-9), 'L1/L2 4 oz = 1.59 mm; a 300 mm seam at 4 mm, 4 mm thick, 150 mm tails: 76 holes, 1508 mm of thread (rule of thumb 4× = 1200)');
  const l4 = X({ mode: 'leather', seam: 301, pitch: 4 });
  ok(l4.issues['non-integer'] === 1 && near(l4.scalars.adjustedPitch, 4.0133, 1e-4), 'L4 a 301 mm seam at 4 mm: non-integer; 76 holes at 4.013 mm');
  ok(near(S({ mode: 'leather', seam: 100, pitch: 3.38 }).spi, 7.515, 0.001), 'L3 a 3.38 mm iron: 7.51 stitches per inch');
  const d = S({ mode: 'dye', wof: 100, dos: 2, stock: 1, mordant: 12, liquor: 30 });
  ok(near(d.dyeGrams, 2, 1e-12) && near(d.stockMl, 200, 1e-9) && near(d.mordantGrams, 12, 1e-12) && near(d.bathLitres, 3, 1e-12), 'D1/D3/D4 100 g at 2 % DOS: 2 g dye = 200 ml of a 1 % stock; 12 % alum = 12 g; liquor 30:1 = 3 L');
  ok(near(S({ mode: 'dye', wof: 250, dos: 0.5, stock: 1 }).stockMl, 125, 1e-9) && iss({ mode: 'dye', wof: 100, dos: 120 }, 'range') === 1, 'D2 250 g at 0.5 %: 125 ml; a DOS over 100 %: range');
}

// ===== the checker =====
{
  const base = model => ({ format: 'noema.sim-spec/v1', engine: 'craft@1', model, outputs: [{ id: 'a', kind: 'scalar', of: 'castOn' }] });
  const codes = s => M.checkSpec(s).filter(p => p.level === 'error').map(p => p.code + '@' + p.path);
  ok(codes(base({ mode: 'fiber', sts: 20 })).length === 0, 'a good spec has no errors');
  ok(eqA(codes(base({ mode: 'knot' })), ['enum@model.mode', 'output@outputs[0].of'].slice(0, 1)), 'an unknown mode: enum at model.mode');
  ok(codes(base({ mode: 'fiber' })).includes('value@model.sts'), 'a missing required number: value at model.sts');
  ok(codes({ ...base({ mode: 'fiber', sts: 20 }), outputs: [{ id: 'a', kind: 'scalar', of: 'nope' }] }).includes('output@outputs[0].of'), 'an output the mode does not compute: output');
  ok(codes({ ...base({ mode: 'fiber', sts: 20 }), outputs: [{ id: 'a', kind: 'series', of: 'castOn' }] }).includes('output@outputs[0].of'), 'a scalar asked as a series: output');
  ok(codes({ ...base({ mode: 'fiber', sts: 20 }), outputs: [{ id: 'a', kind: 'scalar', of: 'issue.range' }] }).length === 0, 'issue counts are scalars (issue.<code>)');
  ok(codes(base({ mode: 'chart', rows: ['k k zz'] })).includes('unknown-symbol@model.rows[0]'), 'an unknown stitch: unknown-symbol');
  ok(codes(base({ mode: 'chart', rows: [] })).includes('value@model.rows'), 'a chart without rows');
  ok(codes(base({ mode: 'weave', shafts: 4 })).includes('value@model'), 'a weave without a structure or a draft');
  ok(codes(base({ mode: 'weave', shafts: 4, threading: [1, 2, 5], liftplan: [[1]] })).includes('value@model.threading[2]'), 'a threading on shaft 5 of a 4-shaft loom');
  ok(codes(base({ mode: 'weave', threading: [1, 2], tieup: [[1], [2]], treadling: [[3]] })).includes('value@model.treadling[0]'), 'a treadle that is not in the tie-up');
  ok(codes(base({ mode: 'ceramic', recipe: [{ mat: 'unobtainium', w: 1 }] })).includes('unknown-material@model.recipe[0].mat'), 'an unknown glaze material');
  ok(codes(base({ mode: 'ceramic', materials: { fritX: { Xy2O: 3 } } })).includes('unknown-oxide@model.materials.fritX.Xy2O'), 'an unknown oxide in an analysis');
  ok(codes(base({ mode: 'ceramic', target: { K2O: 1 } })).includes('value@model.batch'), 'a target without batch materials');
  ok(codes(base({ mode: 'sew', piece: { pts: [0, 0, 1, 0, 1], sa: 1 }, grade: { rule: [0] } })).includes('value@model.piece.pts') && codes(base({ mode: 'sew', piece: { pts: [0, 0, 1, 0, 1, 1], sa: 1 }, grade: { rule: [0] } })).includes('value@model.grade.rule'), 'odd point lists and a grade rule of the wrong length');
  ok(codes(base({ mode: 'symmetry', orbifold: '2q' })).includes('value@model.orbifold') && codes(base({ mode: 'symmetry', motif: [0, 0, 1] })).includes('value@model.motif'), 'a bad orbifold signature and a motif of fewer than 3 points');
  ok(M.checkSpec(base({ mode: 'fiber', sts: 20, zz: 1 })).some(p => p.level === 'warning' && p.code === 'unknown-field'), 'an unknown field is a warning');
  const ex = M.exprs({ model: { mode: 'wood', width: 'w', cutlist: { stock: 96, pieces: [30, 'p'] } } });
  ok(eqA(ex, [['w', 'model.width', []], ['p', 'model.cutlist.pieces[1]', []]]), 'exprs lists every expression of the model with its path');
  ok(eqA(M.keys({}), []), 'craft@1 names no string keys');
}

// ===== the adapter, the Worker, speed, the Python twin's data =====
{
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'activities_examples', 'satin-move', 'spec.json'), 'utf8'));
  ok(M.checkSpec(spec).filter(p => p.level === 'error').length === 0, 'the reference activity satin-move has a valid spec');
  const sim = M.engine.create(spec), r3 = sim.run({ n: 8, s: 3 }), r2 = sim.run({ n: 8, s: 2 });
  ok(r3.regular === 1 && r3.warpFloat === 7 && r2.regular === 0 && Array.isArray(r3.drawdown.items), 'the adapter: create(spec).run(inputs) gives the declared outputs (8 shafts: move 3 regular, move 2 not)');
  ok(M.engine.check({ format: 'noema.sim-spec/v1', engine: 'craft@1', model: { mode: 'x' }, outputs: [] }).length === 1, 'engine.check gives the errors as messages');
  const ctx = { self: {} }; ctx.self.self = ctx.self; vm.createContext(ctx);
  vm.runInContext('var self = this.self;' + M.engine.workerSource, ctx);
  const wr = ctx.self.noemaEngine.create(spec).run({ n: 8, s: 3 });
  ok(wr.regular === 1 && wr.warpFloat === 7 && JSON.stringify(wr.drawdown) === JSON.stringify(r3.drawdown), 'the Worker source in a fresh context gives the same outputs');
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) sim.run({ n: 8, s: 3 + (i % 2) * 2 });
  const typ = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  ok(typ < 50, `a typical run < 50 ms (${typ.toFixed(2)} ms)`);
  const big = { format: 'noema.sim-spec/v1', engine: 'craft@1', model: { mode: 'weave', structure: { type: 'satin', shafts: 32, move: 5, ends: 400, picks: 400 }, maxFloat: 3, wpi: 30 }, outputs: [{ id: 'f', kind: 'scalar', of: 'warpFloat' }, { id: 'd', kind: 'scene', of: 'drawdown' }] };
  const big2 = { format: 'noema.sim-spec/v1', engine: 'craft@1', model: { mode: 'wood', cutlist: { stock: 97, kerf: 0.125, pieces: [31, 29, 23, 23, 19, 17, 17, 13, 11, 11, 7, 7, 5, 5, 3, 3] } }, outputs: [{ id: 'b', kind: 'scalar', of: 'boardsOpt' }, { id: 'c', kind: 'scene', of: 'cutlist' }] };
  const big3 = { format: 'noema.sim-spec/v1', engine: 'craft@1', model: { mode: 'symmetry', group: 'p6m', cells: 6 }, outputs: [{ id: 'p', kind: 'scene', of: 'pattern' }] };
  t0 = process.hrtime.bigint();
  const rb = M.engine.create(big).run({}); M.engine.create(big2).run({}); M.engine.create(big3).run({});
  const worst = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(worst < 2000 && rb.f === 31 && rb.d.items.length <= 2000, `the worst allowed runs (400 × 400 drawdown, 16-piece exact cut list, 6 × 6 p6m) < 2 s (${worst.toFixed(0)} ms)`);
  ok(Number.isNaN(M.engine.create({ ...big, model: { mode: 'weave', structure: { type: 'twill', up: 'q', down: 2 } } }).run({}).f), 'a number that does not compute gives NaN, never throws');
  const pyData = JSON.parse(execFileSync('python3', ['-c', 'import json,lib_craft as M; print(json.dumps(M.DATA))'], { cwd: path.join(ROOT, 'tools'), encoding: 'utf8' }));
  ok(JSON.stringify(pyData) === JSON.stringify(M.DATA), 'tools/lib_craft.py carries the same DATA (schema, outputs, names) as the JS module');
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
