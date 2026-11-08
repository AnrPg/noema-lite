/* ===================== craft@1 — handcrafts: the engine library of sim-spec@1 (docs/INTERACTIVE_LIBRARY.md, chapter docs/library/craft.md) =====================
   One general engine with sub-modes (model.mode): fiber (knitting and crochet arithmetic), chart (stitch and colourwork charts),
   weave (drafts, drawdowns, floats, satins, sett and warp plans, basket stakes), stitch (cross-stitch / canvas sizing and floss),
   quilt (patchwork cutting math), symmetry (the 17 wallpaper and 7 frieze groups, orbifold costs, Archimedean vertex types), sew
   (circle skirts, gathers, pleats, ease, convex seam allowance, grading, shelf packing), wood (board feet, movement, EMC, shelf sag,
   cut lists, dovetails), ceramic (shrinkage, Orton cones, glaze UMF and batches, calculated expansion), metal (ring sizes, AWG/SWG,
   fineness and alloying, weights), book (signatures, imposition, grain), leather (thickness, saddle-stitch thread) and dye (depth of
   shade, stock solutions, mordants). Every model and constant cites its source beside the code and in the chapter; values marked
   (verify) there were transcribed from secondary sources and must be checked against the primary source.
   Pure, bounded, deterministic JS: no DOM, no network, no clock; numbers, codes and the model's own short texts only. */
import NoemaLibCore from '../kernel/core.ts';
import type { Emit, NumFn, Rec, SceneData, Table, TableNode } from '../kernel/core.ts';
import type { Problem, Spec } from '../types.ts';
/* i18n-ignore-start */ // code, not text: only codes, numbers and the model's own symbols leave this module
const C = NoemaLibCore;
const ID = 'craft@1';
/** what one mode computes, by output kind (DATA.outs) */
interface ModeOuts {
  readonly scalar: readonly string[];
  readonly series: readonly string[];
  readonly scene: readonly string[];
  readonly issues: readonly string[];
  readonly prefix?: Readonly<Record<string, readonly string[]>>;
}
/** the schema of every mode, its outputs and the name lists (DATA) */
interface CraftData {
  readonly custom: Readonly<Record<string, readonly string[]>>;
  readonly modes: readonly string[];
  readonly schema: Readonly<Record<string, Table>>;
  readonly outs: Readonly<Record<string, ModeOuts>>;
  readonly cones: readonly string[];
  readonly wallpaper: readonly string[];
  readonly frieze: readonly string[];
  readonly species: readonly string[];
  readonly metals: readonly string[];
  readonly materials: readonly string[];
  readonly oxides: readonly string[];
}
/** an output of the spec, after the common checks (C.checkOutputs): its id, kind and what it shows */
type Output = Rec & { readonly id: string; readonly kind: string; readonly of: string };
/** the number of a field of a model part: dflt when absent, NaN when it does not compute */
type Getter = (o: unknown, k: string, d?: number) => number;
/** the issues of a run, by code: how often each was met */
interface Issues {
  add(c: string): void;
  readonly out: Record<string, number>;
}
/** what a mode computes: scalars, series and scenes by name */
interface ModeResult {
  o: Record<string, number>;
  sr: Record<string, number[]>;
  sc: Record<string, SceneData>;
}
/** the model compiled once: each expression's function by its source */
interface Prepared {
  readonly fns: Map<string, NumFn>;
}
/** a chart token: its stitch, what it consumes (in) and produces (out), its cells (w) and repeat (n) */
interface Token {
  readonly sym: string;
  readonly in: number;
  readonly out: number;
  readonly w: number;
  readonly n: number;
  readonly cable?: boolean;
}
/* the schema of every mode, the outputs each mode computes and the name lists — JSON its former Python twin embedded (its golden outputs: tests/fixtures/parity/lib_craft.json)
     (tests/lib_craft.js checks that the two copies are identical) */
// prettier-ignore
const DATA: CraftData = {"custom":{"chart":["rows"],"symmetry":["orbifold"]},"modes":["fiber","chart","weave","stitch","quilt","symmetry","sew","wood","ceramic","metal","book","leather","dye"],"schema":{"fiber":{"craft":"enum:knit|crochet","unit":"enum:cm|in","sts":"numx!","rows":"numx","over":"numx","width":"numx","length":"numx","mult":"numx","plus":"numx","round":"enum:nearest|up|down|even","patternSts":"numx","category":"int:0:7","distribute":{"$obj":{"from":"numx!","change":"numx!","kind":"enum:inc|dec|dec2","work":"enum:flat|round"}},"shape":{"$obj":{"fromSts":"numx!","toSts":"numx!","overRows":"numx!","perEvent":"numx","rsOnly":"bool"}},"yarn":{"$obj":{"swatchGrams":"numx!","swatchArea":"numx!","projectArea":"numx!","metersPerGram":"numx","skeinMeters":"numx","safety":"numx"}},"circle":{"$obj":{"start":"numx","rounds":"numx!"}}},"chart":{"kind":"enum:stitch|color","work":"enum:flat|round","castOn":"numx","maxFloat":"numx","gauge":"numx","maxFloatCm":"numx","repeat":"numx"},"weave":{"shafts":"numx","treadles":"numx","threading":{"$list":"int:1:32","max":2000},"tieup":{"$list":{"$list":"int:1:32","max":32},"max":64},"treadling":{"$list":{"$list":"int:1:64","max":64},"max":2000},"liftplan":{"$list":{"$list":"int:1:32","max":32},"max":2000},"structure":{"$obj":{"type":"enum:plain|twill|satin!","up":"numx","down":"numx","shafts":"numx","move":"numx","face":"enum:warp|weft","ends":"numx","picks":"numx"}},"shed":"enum:rising|sinking","repeat":"bool","maxFloat":"numx","wpi":"numx","colors":{"$obj":{"warp":{"$list":"int:0:7","max":2000},"weft":{"$list":"int:0:7","max":2000}}},"warp":{"$obj":{"unit":"enum:in|cm","width":"numx!","length":"numx!","epi":"numx!","drawIn":"numx","shrink":"numx","takeUp":"numx","waste":"numx","pieces":"numx","ppi":"numx"}},"basket":{"$obj":{"stakes":"numx","diameter":"numx","spacing":"numx"}}},"stitch":{"w":"numx!","h":"numx!","count":"numx!","over":"numx","unit":"enum:in|cm","margin":"numx","fabricW":"numx","fabricH":"numx","strands":"numx","skein":"numx","waste":"numx","stitches":"numx"},"quilt":{"finished":"numx","sa":"numx","cols":"numx","rows":"numx","block":"numx","sashing":"numx","border":"numx","binding":{"$obj":{"extra":"numx","strip":"numx","wof":"numx"}},"cut":{"$obj":{"count":"numx!","w":"numx!","h":"numx!","wof":"numx"}},"backing":{"$obj":{"margin":"numx","wof":"numx"}},"bias":{"$obj":{"square":"numx!","strip":"numx!"}},"geese":"numx"},"symmetry":{"group":"enum:p1|p2|pm|pg|cm|pmm|pmg|pgg|cmm|p4|p4m|p4g|p3|p3m1|p31m|p6|p6m|hop|step|sidle|spinning-hop|spinning-sidle|jump|spinning-jump","groupIndex":"numx","motif":{"$list":"fin","max":128},"cells":"numx","b":"numx","angle":"numx","classify":{"$obj":{"rot":"numx!","mirrors":"numx","twoDirs":"numx","onMirrors":"numx","glide":"numx"}},"classifyFrieze":{"$obj":{"vmirror":"numx","hmirror":"numx","turn":"numx","glide":"numx"}},"vertex":{"$list":"int:3:42","max":8}},"sew":{"skirt":{"$obj":{"waist":"numx!","length":"numx!","fraction":"numx"}},"gather":{"$obj":{"finished":"numx!","ratio":"numx!"}},"pleats":{"$obj":{"finished":"numx!","depth":"numx!","count":"numx!"}},"ease":{"$obj":{"body":"numx!","ease":"numx!","stretch":"numx"}},"piece":{"$obj":{"pts":{"$req":true,"$list":"fin","max":128,"min":6},"sa":"numx!"}},"grade":{"$obj":{"rule":{"$req":true,"$list":"fin","max":128},"steps":"numx"}},"pack":{"$obj":{"width":"numx!","rects":{"$req":true,"$list":{"$list":"fin","max":2,"min":2},"max":60,"min":1}}}},"wood":{"species":"enum:ash-white|basswood|beech|birch-yellow|cherry-black|hickory-shagbark|maple-sugar|maple-red|oak-red|oak-white|walnut-black|yellow-poplar|douglas-fir|pine-white|pine-ponderosa|redwood|cedar-western-red|spruce-sitka|mahogany|teak","width":"numx","mcFrom":"numx","mcTo":"numx","cut":"enum:flat|quarter","board":{"$obj":{"t":"numx!","w":"numx!","l":"numx!"}},"emc":{"$obj":{"tempF":"numx!","rh":"numx!"}},"shelf":{"$obj":{"t":"numx!","w":"numx!","span":"numx!","load":"numx!","e":"numx","creep":"numx"}},"cutlist":{"$obj":{"stock":"numx!","kerf":"numx","pieces":{"$req":true,"$list":"numx","max":60,"min":1}}},"dovetail":"numx"},"ceramic":{"fired":"numx","shrink":"numx","dry":"numx","fire":"numx","cone":"enum:022|021|020|019|018|017|016|015|014|013|012|011|010|09|08|07|06|05.5|05|04|03|02|01|1|2|3|4|5|5.5|6|7|8|9|10|11|12|13|14","coneIndex":"numx","rate":"numx","type":"enum:ss|ssfe|large|largefe|small","tempC":"numx","recipe":{"$list":{"$obj":{"mat":"id!","w":"numx!"}},"max":16},"materials":{"$map":{"$map":"fin","max":20},"max":16},"target":{"$map":"numx","max":20},"batch":{"$list":"id","max":8},"expansion":"enum:et|appen","bodyCoe":"numx"},"metal":{"size":"numx","scale":"enum:us|uk|iso|jp|ch|mm","thickness":"numx","width":"numx","metal":"enum:fine-gold|22k|18k|14k|9k|fine-silver|britannia|sterling|platinum950|palladium950|copper|brass|bronze|titanium|steel","density":"numx","awg":"numx","swg":"numx","wireLength":"numx","karat":"numx","alloy":{"$obj":{"mass":"numx!","from":"numx!","to":"numx!","add":"numx"}}},"book":{"pages":"numx!","folds":"numx","sheetsPerSig":"numx","caliper":"numx","swell":"numx","grain":"enum:long|short","sheet":"numx"},"leather":{"oz":"numx","seam":"numx","pitch":"numx","thickness":"numx","tail":"numx"},"dye":{"wof":"numx!","dos":"numx","stock":"numx","mordant":"numx","liquor":"numx"}},"outs":{"fiber":{"scalar":["castOnRaw","castOn","achievedWidth","widthError","rowCount","gauge10","cycMin","cycMax","gaugeInRange","sizeFactor","distResult","distGapMin","distGapMax","shapeEvents","shapeEveryA","shapeTimesA","shapeEveryB","shapeTimesB","grams","meters","skeins","circleSts","circleTotal"],"series":["gaps","positions","shapeRows","shapeSts","circleRounds"],"scene":["distribution","shaping"],"issues":["consumes-too-many","impossible","non-integer","range","rounded"]},"chart":{"scalar":["rowsCount","width","stitchesStart","stitchesEnd","unbalancedRows","firstUnbalanced","maxFloat","longFloats","colorsMax","floatLimit"],"series":["rowNo","rowIn","rowOut","rowFloat"],"scene":["chart"],"issues":["unbalanced-row","float-too-long","consumes-too-many"]},"weave":{"scalar":["ends","picks","warpFloat","weftFloat","warpFaced","noInterlace","longFloats","regular","satins","interlace","sett","widthInReed","warpEnds","wovenLength","warpLength","warpTotal","warpTotalLong","weftTotal","stakesNeeded","parityOk"],"series":[],"scene":["drawdown"],"issues":["float-too-long","no-interlace","impossible","parity"]},"stitch":{"scalar":["effCount","widthIn","heightIn","widthCm","heightCm","cutW","cutH","fits","perStitchMm","stitchesPerSkein","skeins"],"series":[],"scene":["layout"],"issues":["impossible","range"]},"quilt":{"scalar":["square","hst2","hst2Exact","hst4","hst4Exact","hst8","qst","qstExact","diagonal","sideSetting","sideSettingExact","corner","cornerExact","geeseLarge","geeseSmall","quiltW","quiltH","bindingLength","bindingStrips","bindingYards","perStrip","strips","cutYards","backingYards","backingPanels","biasLength"],"series":[],"scene":["hst","layout"],"issues":["impossible","range"]},"symmetry":{"scalar":["groupIdx","copies","cost","isPlane","classified","frieze","vertexSum","angleOk","tiles","chiral"],"series":[],"scene":["pattern"],"issues":["not-a-group"]},"sew":{"scalar":["skirtRadius","skirtW","skirtH","hem","gather","pleats","garment","easeOk","area","saArea","perimeter","concave","packLength","packEfficiency","packLower"],"series":[],"scene":["piece","pack"],"issues":["concave","impossible","range"]},"wood":{"scalar":["boardFeet","cubicMeters","cR","cT","movement","movementFull","shrinkAt","emc","sag","sagLimit","sagOk","boards","boardsOpt","lowerBound","utilisation","dovetailDeg"],"series":["emcRh","emcCurve"],"scene":["cutlist","movement"],"issues":["beyond-fsp","extrapolated","impossible","range","out-of-table"]},"ceramic":{"scalar":["wet","totalShrink","volShrink","coneTemp","coneAt","coneFrac","fluxSum","siAl","firedYield","expansion","glazeMinusBody","batchResidual"],"prefix":{"umf.":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"],"wt.":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"],"batch.":["0","1","2","3","4","5","6","7"]},"series":["coneNo","coneTemps"],"scene":["stull"],"issues":["unity-off","negative-batch","out-of-table","extrapolated","impossible"]},"metal":{"scalar":["diameter","circumference","us","uk","iso","jp","ch","blank","bandVolume","bandMass","density","awgMm","swgMm","wireMass","fineness","alloyAdd"],"series":[],"scene":["ring"],"issues":["out-of-table","impossible","rounded"]},"book":{"scalar":["pagesPerSig","signatures","blanks","leaves","sheets","spine","creep","needGrain","grainOk"],"series":[],"scene":["imposition"],"issues":["grain-wrong","range"]},"leather":{"scalar":["mm","holes","adjustedPitch","thread","ruleOfThumb","spi"],"series":[],"scene":[],"issues":["non-integer","range"]},"dye":{"scalar":["dyeGrams","stockMl","mordantGrams","bathLitres"],"series":[],"scene":[],"issues":["range"]}},"cones":["022","021","020","019","018","017","016","015","014","013","012","011","010","09","08","07","06","05.5","05","04","03","02","01","1","2","3","4","5","5.5","6","7","8","9","10","11","12","13","14"],"wallpaper":["p1","p2","pm","pg","cm","pmm","pmg","pgg","cmm","p4","p4m","p4g","p3","p3m1","p31m","p6","p6m"],"frieze":["hop","step","sidle","spinning-hop","spinning-sidle","jump","spinning-jump"],"species":["ash-white","basswood","beech","birch-yellow","cherry-black","hickory-shagbark","maple-sugar","maple-red","oak-red","oak-white","walnut-black","yellow-poplar","douglas-fir","pine-white","pine-ponderosa","redwood","cedar-western-red","spruce-sitka","mahogany","teak"],"metals":["fine-gold","22k","18k","14k","9k","fine-silver","britannia","sterling","platinum950","palladium950","copper","brass","bronze","titanium","steel"],"materials":["silica","whiting","wollastonite","kaolin","potash_feldspar","soda_feldspar","talc","dolomite","zinc_oxide","magnesium_carbonate","strontium_carbonate","barium_carbonate","lithium_carbonate","spodumene"],"oxides":["SiO2","Al2O3","B2O3","Li2O","Na2O","K2O","MgO","CaO","SrO","BaO","ZnO","PbO","TiO2","ZrO2","Fe2O3"]};
const isObj = C.isObj,
  isNum = C.isNum;
const fmtN = (v: number) => String(v);
const SQ2 = Math.SQRT2;

/* ---------- the stitch symbols of chart mode: consumed (in), produced (out), cells (w). Craft Yarn Council "Knit and Crochet Chart
     Symbols" and B. G. Walker, Charted Knitting Designs (1972). A cable cN/ML or cN/MR (e.g. c2/2l = C4F = 2/2 LC) takes N+M cells. ---------- */
const SYM: Readonly<Record<string, readonly [number, number]>> = {
  k: [1, 1],
  p: [1, 1],
  yo: [0, 1],
  k2tog: [2, 1],
  ssk: [2, 1],
  skp: [2, 1],
  p2tog: [2, 1],
  k3tog: [3, 1],
  sssk: [3, 1],
  sk2p: [3, 1],
  s2kp: [3, 1],
  cdd: [3, 1],
  m1: [0, 1],
  m1l: [0, 1],
  m1r: [0, 1],
  kfb: [1, 2],
  sl: [1, 1],
  ns: [0, 0],
  bobble: [1, 1],
  ch: [0, 1],
  slst: [1, 1],
  sc: [1, 1],
  hdc: [1, 1],
  dc: [1, 1],
  tr: [1, 1],
  sc2tog: [2, 1],
  dc2tog: [2, 1],
  inc: [1, 2],
};
const CABLE_RE = /^c([1-6])\/([1-6])(l|r)$/;
/** a chart token → {sym, in, out, w, n} or null; "k*3" repeats a stitch 3 times */
function token(t: string): Token | null {
  const m = /^([a-z0-9/]+)(?:\*([1-9][0-9]?))?$/.exec(t);
  if (!m) return null;
  const n = m[2] ? +m[2] : 1,
    s = m[1]!;
  if (Object.prototype.hasOwnProperty.call(SYM, s)) return { sym: s, in: SYM[s]![0], out: SYM[s]![1], w: 1, n };
  const c = CABLE_RE.exec(s);
  if (c) {
    const w = +c[1]! + +c[2]!;
    return { sym: s, in: w, out: w, w, n, cable: true };
  }
  return null;
}

/* ---------- the model checker ---------- */
function checkSpec(spec: unknown): Problem[] {
  const { P, E, W } = C.problems();
  const m = isObj(spec) ? spec.model : undefined;
  if (!isObj(m)) {
    E('format', 'model', 'not an object');
    C.checkOutputs(spec, ID, ['scalar', 'series', 'scene'], () => {}, E, W);
    return P;
  }
  const mode = DATA.modes.includes(m.mode as string) ? (m.mode as string) : null;
  const T: Table = Object.assign({ mode: 'enum:' + DATA.modes.join('|') + '!' }, mode ? DATA.schema[mode] : {});
  const own = (mode && DATA.custom[mode]) || []; // fields checked by extra(), not by the table
  const mm: Record<string, unknown> = {};
  for (const k of Object.keys(m)) if (!own.includes(k)) mm[k] = m[k];
  C.walk(mm, T, 'model', E, W);
  if (mode) extra(mode, m, E);
  C.checkOutputs(
    spec,
    ID,
    ['scalar', 'series', 'scene'],
    (o, at) => {
      if (!mode) return;
      const O = DATA.outs[mode]!,
        of = o.of;
      let okOf = false;
      if (o.kind === 'scalar')
        okOf =
          O.scalar.includes(of) ||
          (of.startsWith('issue.') && O.issues.includes(of.slice(6))) ||
          Object.keys(O.prefix || {}).some(pf => of.startsWith(pf) && O.prefix![pf]!.includes(of.slice(pf.length)));
      else okOf = O[o.kind as 'series' | 'scene'].includes(of);
      if (!okOf) E('output', at + '.of', `${mode} computes no ${o.kind} "${of}"`);
    },
    E,
    W,
  );
  return P;
}
/** the checks a table cannot say (the same order and messages as the former Python twin extra (tests/fixtures/parity/lib_craft.json)) */
function extra(mode: string, m: Rec, E: Emit): void {
  if (mode === 'chart') {
    const rs = m.rows;
    if (!Array.isArray(rs) || rs.length < 1 || rs.length > 60) {
      E('value', 'model.rows', 'needs a list of 1–60 rows (texts)');
      return;
    }
    const color = m.kind === 'color';
    rs.forEach((r: unknown, i) => {
      const p = `model.rows[${i}]`;
      if (typeof r !== 'string' || !r.trim()) {
        E('value', p, 'needs a text');
        return;
      }
      if (color) {
        if (!/^[A-H.]+$/.test(r)) E('value', p, 'colours are the letters A–H (or . for none)');
        else if (r.length > 120) E('size', p, 'more than 120 cells');
        return;
      }
      let cells = 0;
      for (const t of r.trim().split(/\s+/)) {
        const k = token(t);
        if (!k) {
          E('unknown-symbol', p, `unknown stitch "${t.slice(0, 16)}"`);
          return;
        }
        cells += k.w * k.n;
      }
      if (cells > 120) E('size', p, 'more than 120 cells');
    });
  } else if (mode === 'weave') {
    const hasS = isObj(m.structure),
      th = Array.isArray(m.threading) && m.threading.length > 0;
    const hasT = Array.isArray(m.tieup) && Array.isArray(m.treadling),
      hasL = Array.isArray(m.liftplan);
    if (!hasS && !(th && (hasT || hasL)))
      E('value', 'model', 'needs a structure, a threading with a tie-up and a treadling, or a threading with a liftplan');
    if (isNum(m.shafts)) {
      const beyond = (arr: unknown, p: string) => {
        if (!Array.isArray(arr)) return;
        for (let i = 0; i < arr.length; i++) {
          const v: unknown = arr[i];
          if (isNum(v) && v > (m.shafts as number)) {
            E('value', `${p}[${i}]`, `shaft ${fmtN(v)} is beyond the ${fmtN(m.shafts as number)} shafts`);
            return;
          }
        }
      };
      beyond(m.threading, 'model.threading');
      if (Array.isArray(m.tieup))
        m.tieup.forEach((t: unknown, i) => {
          beyond(t, `model.tieup[${i}]`);
        });
      if (Array.isArray(m.liftplan))
        m.liftplan.forEach((t: unknown, i) => {
          beyond(t, `model.liftplan[${i}]`);
        });
    }
    if (Array.isArray(m.treadling)) {
      const nt = isNum(m.treadles) ? m.treadles : Array.isArray(m.tieup) ? m.tieup.length : Infinity;
      for (let i = 0; i < m.treadling.length; i++) {
        const t: unknown = m.treadling[i];
        if (!Array.isArray(t)) continue;
        const bad = (t as unknown[]).find(v => isNum(v) && v > nt) as number | undefined;
        if (bad !== undefined) {
          E('value', `model.treadling[${i}]`, `treadle ${fmtN(bad)} is not in the tie-up`);
          break;
        }
      }
    }
  } else if (mode === 'ceramic') {
    const own = isObj(m.materials) ? m.materials : {};
    const known = (n: unknown) => typeof n === 'string' && (DATA.materials.includes(n) || Object.prototype.hasOwnProperty.call(own, n));
    if (Array.isArray(m.recipe))
      m.recipe.forEach((r: unknown, i) => {
        if (isObj(r) && typeof r.mat === 'string' && C.ID_RE.test(r.mat) && !known(r.mat))
          E('unknown-material', `model.recipe[${i}].mat`, 'not a built-in material or one of model.materials');
      });
    if (Array.isArray(m.batch))
      m.batch.forEach((b: unknown, i) => {
        if (typeof b === 'string' && C.ID_RE.test(b) && !known(b))
          E('unknown-material', `model.batch[${i}]`, 'not a built-in material or one of model.materials');
      });
    for (const [mn, an] of Object.entries(own))
      if (isObj(an))
        for (const ox of Object.keys(an))
          if (!DATA.oxides.includes(ox) && ox !== 'LOI') E('unknown-oxide', `model.materials.${mn}.${ox}`, 'not a known oxide');
    if (isObj(m.target))
      for (const ox of Object.keys(m.target)) if (!DATA.oxides.includes(ox)) E('unknown-oxide', `model.target.${ox}`, 'not a known oxide');
    if (isObj(m.target) && !Array.isArray(m.batch)) E('value', 'model.batch', 'needs the materials of the batch (model.target is set)');
  } else if (mode === 'sew') {
    const pc = isObj(m.piece) ? m.piece : null;
    if (pc && Array.isArray(pc.pts) && pc.pts.length % 2) E('value', 'model.piece.pts', 'needs x, y pairs');
    if (isObj(m.grade)) {
      if (!pc) E('value', 'model.grade', 'needs model.piece');
      else if (Array.isArray(m.grade.rule) && Array.isArray(pc.pts) && m.grade.rule.length !== pc.pts.length)
        E('value', 'model.grade.rule', 'needs one dx, dy pair per point of model.piece.pts');
    }
  } else if (mode === 'symmetry') {
    if (m.orbifold !== undefined && !(typeof m.orbifold === 'string' && /^[ox*1-9∞]{1,16}$/.test(m.orbifold)))
      E('value', 'model.orbifold', 'needs an orbifold signature such as *632 or 22x');
    if (Array.isArray(m.motif) && (m.motif.length < 6 || m.motif.length % 2)) E('value', 'model.motif', 'needs at least 3 x, y pairs');
  }
}

/** every expression of the model: [source, path, local names] in the schema's order (the same as the former Python twin exprs (tests/fixtures/parity/lib_craft.json)) */
function exprs(spec: unknown): Array<[string, string, string[]]> {
  const out: Array<[string, string, string[]]> = [],
    m = isObj(spec) ? spec.model : null;
  if (!isObj(m) || !DATA.modes.includes(m.mode as string)) return out;
  const visit = (v: unknown, kd: TableNode | undefined, p: string): void => {
    if (v === undefined || kd === undefined) return;
    if (typeof kd === 'string') {
      if (kd.replace('!', '') === 'numx' && typeof v === 'string') out.push([v, p, []]);
      return;
    }
    if (kd.$obj) {
      if (isObj(v)) for (const k of Object.keys(kd.$obj)) visit(v[k], kd.$obj[k], p + '.' + k);
      return;
    }
    if (kd.$map) {
      if (isObj(v)) for (const k of Object.keys(v)) visit(v[k], kd.$map, p + '.' + k);
      return;
    }
    if (kd.$list !== undefined && Array.isArray(v))
      v.forEach((x: unknown, i) => {
        visit(x, kd.$list, `${p}[${i}]`);
      });
  };
  const T = DATA.schema[m.mode as string]!;
  for (const k of Object.keys(T)) visit(m[k], T[k], 'model.' + k);
  return out;
}
/** craft@1 names no string keys: its labels are numbers (v) or the model's own symbols (s) */
function keys(): Array<[string, string]> {
  return [];
}

/* ---------- evaluation of the model's numbers: compiled once (prepare), evaluated per run ---------- */
function prepare(spec: Spec): Prepared {
  const fns = new Map<string, NumFn>();
  for (const [src] of exprs(spec)) if (!fns.has(src)) fns.set(src, C.cx(src));
  return { fns };
}
function resolver(prepared: Prepared | null | undefined, env: Rec) {
  const fns = prepared ? prepared.fns : new Map<string, NumFn>();
  return (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? (fns.get(v) || C.cx(v))(env) : NaN);
}
/** g(o, key, dflt): the number of a field (dflt when absent; NaN when it does not compute) */
const getter =
  (R: (v: unknown) => number): Getter =>
  (o, k, d) =>
    isObj(o) && o[k] !== undefined ? R(o[k]) : d === undefined ? NaN : d;

/* ---------- small helpers ---------- */
const up8 = (x: number) => Math.ceil(x * 8 - 1e-9) / 8;
const fin = Number.isFinite;
function issueBag(): Issues {
  const b: Record<string, number> = {};
  return {
    add(c) {
      b[c] = (b[c] || 0) + 1;
    },
    out: b,
  };
}
function gcd(a: number, b: number) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function phi(n: number) {
  let r = 0;
  for (let i = 1; i <= n; i++) if (gcd(i, n) === 1) r++;
  return r;
}
const rnd = (x: number) => Math.sign(x) * Math.round(Math.abs(x)); // round half away from zero

/* =====================================================================================================================
     fiber — knitting and crochet arithmetic. Craft Yarn Council "Standard Yarn Weight System" (craftyarncouncil.com, fetched
     2026-11-05): knit stitches per 4 in / 10 cm in stockinette and crochet sc per 4 in, guidelines only.
     ===================================================================================================================== */
const CYC_KNIT = [
  [33, 40],
  [27, 32],
  [23, 26],
  [21, 24],
  [16, 20],
  [12, 15],
  [7, 11],
  [0, 6],
];
const CYC_CROCHET = [
  [32, 42],
  [21, 32],
  [16, 20],
  [12, 17],
  [11, 14],
  [8, 11],
  [7, 9],
  [0, 6],
]; // cat 0: double crochets (CYC note)
/** even distribution of k changes over N stitches. Round: Bresenham gaps ⌊(i+1)N/k⌋ − ⌊iN/k⌋. Flat: centred positions
      round((i+½)N/k), so the selvedges get half gaps. → {positions, gaps} */
function distribute(N: number, k: number, work: unknown): { positions: number[]; gaps: number[] } {
  if (!(N >= 1 && k >= 1)) return { positions: [], gaps: [] };
  const pos: number[] = [],
    gaps: number[] = [];
  if (work === 'round') {
    for (let i = 0; i < k; i++) {
      pos.push(Math.floor(((i + 1) * N) / k));
      gaps.push(Math.floor(((i + 1) * N) / k) - Math.floor((i * N) / k));
    }
  } else {
    let last = 0;
    for (let i = 0; i < k; i++) {
      const p = Math.round(((i + 0.5) * N) / k);
      pos.push(p);
      gaps.push(p - last);
      last = p;
    }
    gaps.push(N - last);
  }
  return { positions: pos, gaps };
}
/** shaping: d events over R rows → b events every (a+1) rows and d−b every a rows (b(a+1) + (d−b)a = R) */
function shaping(R: number, d: number) {
  const a = Math.floor(R / d),
    b = R - a * d;
  return { a, timesA: d - b, b: a + 1, timesB: b };
}
function runFiber(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sr: ModeResult['sr'] = {},
    sc: ModeResult['sc'] = {};
  const sts = g(m, 'sts'),
    over = g(m, 'over', 10),
    rows = g(m, 'rows');
  const sg = sts / over;
  if (!(sts > 0 && over > 0)) I.add('impossible');
  o.gauge10 = m.unit === 'in' ? sg * 4 : sg * 10; // per 4 in or per 10 cm (the CYC treats them alike)
  if (m.category !== undefined) {
    const r = (m.craft === 'crochet' ? CYC_CROCHET : CYC_KNIT)[m.category as number]!;
    o.cycMin = r[0]!;
    o.cycMax = r[1]!;
    o.gaugeInRange = o.gauge10 >= r[0]! && o.gauge10 <= r[1]! ? 1 : 0;
    if (!o.gaugeInRange) I.add('range');
  }
  const width = g(m, 'width');
  if (fin(width)) {
    const raw = width * sg,
      mult = g(m, 'mult', 1),
      plus = g(m, 'plus', 0);
    o.castOnRaw = raw;
    if (!(mult >= 1) || !Number.isInteger(mult) || raw < plus) {
      I.add('impossible');
      o.castOn = NaN;
    } else {
      const q = (raw - plus) / mult,
        md = m.round || 'nearest';
      let k = md === 'up' ? Math.ceil(q - 1e-9) : md === 'down' ? Math.floor(q + 1e-9) : rnd(q);
      if (md === 'even') {
        // the nearest count of the repeat that is even (a tie goes up)
        let best = NaN;
        for (const c of [k - 2, k - 1, k, k + 1, k + 2]) {
          const v = mult * c + plus;
          if (
            c >= 0 &&
            v % 2 === 0 &&
            (!fin(best) ||
              Math.abs(v - raw) < Math.abs(mult * best + plus - raw) - 1e-9 ||
              (Math.abs(Math.abs(v - raw) - Math.abs(mult * best + plus - raw)) <= 1e-9 && c > best))
          )
            best = c;
        }
        k = best;
      }
      o.castOn = mult * k + plus;
      if (Math.abs(raw - o.castOn) > 1e-9) I.add('rounded');
    }
    o.achievedWidth = o.castOn / sg;
    o.widthError = o.achievedWidth - width;
  }
  const length = g(m, 'length');
  if (fin(length) && fin(rows)) o.rowCount = rnd((length * rows) / over);
  const ps = g(m, 'patternSts');
  if (fin(ps)) o.sizeFactor = ps / sts;
  const D = m.distribute;
  if (isObj(D)) {
    const N = g(D, 'from'),
      k = g(D, 'change'),
      kind = D.kind || 'inc',
      work = D.work || 'round';
    if (!(Number.isInteger(N) && Number.isInteger(k) && N >= 1 && k >= 0)) I.add('non-integer');
    const Ni = Math.round(N),
      ki = Math.round(k);
    const per = kind === 'dec2' ? 3 : kind === 'dec' ? 2 : 0;
    if (kind === 'inc' && ki > Ni) I.add('impossible');
    const r = distribute(Ni, ki, work);
    const bad = per && r.gaps.slice(0, ki).some(x => x < per); // each decrease consumes `per` stitches ending at its position
    if (bad || (per && ki * per > Ni)) I.add('consumes-too-many');
    o.distResult = kind === 'inc' ? Ni + ki : kind === 'dec' ? Ni - ki : Ni - 2 * ki;
    o.distGapMin = r.gaps.length ? Math.min(...r.gaps) : NaN;
    o.distGapMax = r.gaps.length ? Math.max(...r.gaps) : NaN;
    sr.gaps = r.gaps;
    sr.positions = r.positions;
    sc.distribution = sceneDistribution(Ni, r.positions, kind);
  }
  const S = m.shape;
  if (isObj(S)) {
    const from = g(S, 'fromSts'),
      to = g(S, 'toSts'),
      R0 = g(S, 'overRows'),
      pe = g(S, 'perEvent', 2);
    let d = Math.abs(from - to) / pe;
    if (!Number.isInteger(d)) {
      I.add('non-integer');
      d = Math.round(d);
    }
    let R = Math.round(R0);
    if (S.rsOnly) {
      if (R % 2) I.add('rounded');
      R = Math.floor(R / 2);
    }
    if (!(d >= 1) || d > R) {
      I.add('impossible');
      o.shapeEvents = d;
    } else {
      const f = S.rsOnly ? 2 : 1,
        s = shaping(R, d);
      o.shapeEvents = d;
      o.shapeEveryA = s.a * f;
      o.shapeTimesA = s.timesA;
      o.shapeEveryB = s.b * f;
      o.shapeTimesB = s.timesB;
      const rowsAt = [0],
        stsAt = [from];
      let row = 0,
        st = from;
      const dir = to < from ? -1 : 1;
      for (let i = 0; i < s.timesA + s.timesB && i < 1000; i++) {
        row += (i < s.timesA ? s.a : s.b) * f;
        st += dir * pe;
        rowsAt.push(row);
        stsAt.push(st);
      }
      sr.shapeRows = rowsAt;
      sr.shapeSts = stsAt;
      sc.shaping = sceneShaping(rowsAt, stsAt, R0);
    }
  }
  const Y = m.yarn;
  if (isObj(Y)) {
    o.grams = (g(Y, 'swatchGrams') * g(Y, 'projectArea')) / g(Y, 'swatchArea');
    o.meters = o.grams * g(Y, 'metersPerGram');
    const sk = g(Y, 'skeinMeters'),
      sf = g(Y, 'safety', 0);
    o.skeins = Math.ceil((o.meters * (1 + sf / 100)) / sk - 1e-9);
  }
  const Ci = m.circle;
  if (isObj(Ci)) {
    // a flat circle: s0 stitches more every round (sc 6, hdc 8, dc 12): round n has n·s0
    const s0 = g(Ci, 'start', 6),
      n = Math.round(g(Ci, 'rounds'));
    o.circleSts = n * s0;
    o.circleTotal = (s0 * n * (n + 1)) / 2;
    sr.circleRounds = Array.from({ length: Math.max(0, Math.min(n, 2000)) }, (_, i) => (i + 1) * s0);
  }
  return { o, sr, sc };
}
function sceneDistribution(N: number, pos: readonly number[], kind: unknown) {
  const s = C.scene([-0.05 * N - 1, N * 1.05 + 1, (-0.25 * N) / 4 - 2, (0.25 * N) / 4 + 2]);
  const h = Math.max(1, N / 40);
  s.poly([0, -h, N, -h, N, h, 0, h], { c: 'muted' });
  let last = 0;
  for (const p of pos.slice(0, 600)) {
    s.seg(p, -2 * h, p, 2 * h, { c: kind === 'inc' ? 'ok' : 'warn', w: 2 });
    s.txt((last + p) / 2, 2.6 * h, { v: p - last, c: 'muted' });
    last = p;
  }
  return s.done();
}
function sceneShaping(rows: number[], sts: number[], R: number) {
  const xs = rows.concat([0, R]),
    ys = sts.concat([sts[0]!, sts[sts.length - 1]!]);
  const s = C.scene(C.fitView(xs, ys, 0.08));
  s.seg(0, sts[0]!, R, sts[sts.length - 1]!, { c: 'muted', dash: true });
  const pts = [rows[0]!, sts[0]!];
  for (let i = 1; i < rows.length && i < 900; i++) pts.push(rows[i]!, sts[i - 1]!, rows[i]!, sts[i]!);
  s.poly(pts, { c: 'hi', closed: false });
  return s.done();
}

/* ===================================================================================================================== */
/* chart — stitch charts (in/out per row, cables, no-stitch) and stranded colourwork floats                               */
/* ===================================================================================================================== */
const COLOR_ROLE: Readonly<Record<string, string>> = { A: 'base', B: 'hi', C: 'info', D: 'ok', E: 'warn', F: 'bad', G: 'muted', H: 'base' };
/** the longest run of cells != colour c in a row (cyclic in the round): the float of c behind the work */
function runs<T>(arr: readonly T[], pred: (x: T) => boolean, cyclic: boolean): { max: number; list: Array<[number, number]> } {
  const n = arr.length;
  let best = 0,
    start = -1,
    cur = 0;
  const out: Array<[number, number]> = [];
  if (!n) return { max: 0, list: [] };
  if (arr.every(pred)) return { max: n, list: [[0, n]] };
  let off = 0;
  if (cyclic) {
    let last = n - 1;
    while (pred(arr[last]!)) last--;
    off = (last + 1) % n;
  } // start right after a cell outside every run
  for (let j = 0; j <= n; j++) {
    const i = (off + j) % n,
      inRun = j < n && pred(arr[i]!);
    if (inRun) {
      if (cur === 0) start = i;
      cur++;
    } else {
      if (cur > 0) {
        out.push([start, cur]);
        if (cur > best) best = cur;
      }
      cur = 0;
    }
  }
  return { max: best, list: out };
}
function runChart(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sr: ModeResult['sr'] = {},
    sc: ModeResult['sc'] = {};
  const rows = m.rows as string[],
    work = m.work || 'flat';
  if (m.kind === 'color') {
    const gauge = g(m, 'gauge'),
      cm = g(m, 'maxFloatCm');
    let lim = g(m, 'maxFloat', 5);
    if (fin(gauge) && fin(cm)) lim = Math.min(lim, Math.floor((cm * gauge) / 10 + 1e-9));
    o.floatLimit = lim;
    const rep = Math.max(1, Math.round(g(m, 'repeat', 1)));
    let maxF = 0,
      longs = 0,
      colsMax = 0;
    const fl: number[] = [],
      marks: Array<[number, number, number]> = [];
    rows.forEach((r, ri) => {
      const cells = Array.from(r.repeat(Math.min(rep, 8)));
      const cols = [...new Set(cells.filter(c => c !== '.'))];
      colsMax = Math.max(colsMax, cols.length);
      let rowMax = 0;
      for (const c of cols) {
        const R = runs(cells, x => x !== c, work === 'round');
        for (const [st, len] of R.list)
          if (len > lim) {
            longs++;
            marks.push([ri, st, len]);
          }
        rowMax = Math.max(rowMax, R.max);
      }
      fl.push(rowMax);
      maxF = Math.max(maxF, rowMax);
    });
    if (longs) for (let i = 0; i < longs; i++) I.add('float-too-long');
    Object.assign(o, { rowsCount: rows.length, width: rows[0]!.length, maxFloat: maxF, longFloats: longs, colorsMax: colsMax });
    sr.rowNo = rows.map((_, i) => i + 1);
    sr.rowFloat = fl;
    sc.chart = sceneColor(rows, marks);
    return { o, sr, sc };
  }
  // stitch chart: row r consumes in_r stitches, which must equal out_{r−1} (the first row: castOn when given)
  const parsed = rows.map(r => r.trim().split(/\s+/).map(token) as Token[]);
  const ins: number[] = [],
    outs: number[] = [];
  let unb = 0,
    first = NaN;
  parsed.forEach((toks, i) => {
    let a = 0,
      b = 0;
    for (const t of toks) {
      a += t.in * t.n;
      b += t.out * t.n;
    }
    ins.push(a);
    outs.push(b);
    const prev = i ? outs[i - 1] : g(m, 'castOn', a);
    if (a !== prev) {
      unb++;
      I.add('unbalanced-row');
      if (!fin(first)) first = i + 1;
    }
  });
  Object.assign(o, {
    rowsCount: rows.length,
    width: Math.max(...parsed.map(t => t.reduce((s, x) => s + x.w * x.n, 0))),
    stitchesStart: ins[0],
    stitchesEnd: outs[outs.length - 1],
    unbalancedRows: unb,
    firstUnbalanced: unb ? first : 0,
  });
  sr.rowNo = rows.map((_, i) => i + 1);
  sr.rowIn = ins;
  sr.rowOut = outs;
  sc.chart = sceneStitch(parsed, work);
  return { o, sr, sc };
}
function sceneColor(rows: readonly string[], marks: ReadonlyArray<readonly [number, number, number]>) {
  const h = rows.length,
    w = Math.max(...rows.map(r => r.length));
  const s = C.scene([-2, w + 1, -2, h + 1]);
  rows.forEach((r, y) => {
    let x = 0;
    while (x < r.length) {
      let e = x;
      while (e < r.length && r[e] === r[x]) e++;
      if (r[x] !== '.') s.poly([x, y, e, y, e, y + 1, x, y + 1], { c: COLOR_ROLE[r[x]!] || 'base', fill: true });
      x = e;
    }
    s.txt(-1, y + 0.5, { v: y + 1, c: 'muted' });
  });
  for (const [ri, st, len] of marks.slice(0, 300)) {
    const e = st + len;
    s.seg(st, ri + 0.1, Math.min(e, w), ri + 0.1, { c: 'bad', w: 3 });
    if (e > w) s.seg(0, ri + 0.1, e - w, ri + 0.1, { c: 'bad', w: 3 });
  }
  return s.done();
}
function sceneStitch(parsed: readonly Token[][], work: unknown) {
  const h = parsed.length,
    w = Math.max(...parsed.map(t => t.reduce((s, x) => s + x.w * x.n, 0)));
  const s = C.scene([-2, w + 2, -1, h + 1]);
  for (let y = 0; y <= h; y++) s.seg(0, y, w, y, { c: 'muted', w: 1 });
  for (let x = 0; x <= w; x++) s.seg(x, 0, x, h, { c: 'muted', w: 1 });
  parsed.forEach((toks, y) => {
    // charts are read right→left on RS (odd) rows; the cells are drawn in chart order, the row number on the side it starts
    const rs = work === 'round' || y % 2 === 0;
    s.txt(rs ? w + 1 : -1, y + 0.5, { v: y + 1, c: 'muted' });
    let x = 0;
    const seq: Token[] = [];
    for (const t of toks) for (let k = 0; k < t.n; k++) seq.push(t);
    const ordered = rs ? seq.slice().reverse() : seq; // the first token is worked first: on RS rows it sits at the right
    for (const t of ordered) {
      const cx = x + t.w / 2,
        cy = y + 0.5;
      if (t.sym === 'p') s.pt(cx, cy, { r: 2, c: 'base' });
      else if (t.sym === 'yo') s.circ(cx, cy, 0.3, { c: 'base' });
      else if (['k2tog', 'k3tog', 'p2tog', 'sc2tog', 'dc2tog'].includes(t.sym)) s.seg(x + 0.2, y + 0.2, x + 0.8, y + 0.8, { c: 'base' });
      else if (['ssk', 'skp', 'sssk'].includes(t.sym)) s.seg(x + 0.2, y + 0.8, x + 0.8, y + 0.2, { c: 'base' });
      else if (['sk2p', 's2kp', 'cdd'].includes(t.sym)) {
        s.seg(x + 0.2, y + 0.2, cx, y + 0.8, { c: 'base' });
        s.seg(cx, y + 0.8, x + 0.8, y + 0.2, { c: 'base' });
      } else if (t.sym === 'ns') s.poly([x, y, x + 1, y, x + 1, y + 1, x, y + 1], { c: 'muted', fill: true });
      else if (t.cable) {
        const lf = t.sym.endsWith('l');
        s.seg(x + 0.1, y + 0.1, x + t.w - 0.1, y + 0.9, { c: lf ? 'muted' : 'hi', w: 3 });
        s.seg(x + 0.1, y + 0.9, x + t.w - 0.1, y + 0.1, { c: lf ? 'hi' : 'muted', w: 3 });
      } else if (t.sym !== 'k') s.txt(cx, cy, { s: t.sym.slice(0, 6), c: 'base' });
      x += t.w;
    }
  });
  return s.done();
}

/* ===================================================================================================================== */
/* weave — drafts (threading, tie-up, treadling or liftplan) → drawdown; structures plain / twill a/b / satin n, s;         */
/* floats, Ashenhurst's sett rule EPI = WPI·E/(E+I), warp plans, basket stake parity.                                        */
/* Conventions: W. Oelsner, A Handbook of Weaves (1915); D. Strickler, A Weaver's Book of 8-Shaft Patterns (1991); WIF 1.1.   */
/* ===================================================================================================================== */
/** a draft woven out: the drawdown D (picks x ends, 1 = warp up), a structure's one repeat, the threading and the lifts */
interface Drawdown {
  readonly D: number[][];
  readonly rep?: number[][];
  readonly threading: number[];
  readonly lift: number[][];
  readonly n: number;
  readonly mv?: number;
  readonly type: string;
}
function drawdownOf(m: Rec, g: Getter, I: Issues): Drawdown | null {
  let D: number[][] | null = null,
    threading: number[] | null = null,
    lift: number[][] | null = null;
  const S = m.structure;
  if (isObj(S)) {
    const type = S.type as string;
    let n: number,
      up = 0,
      mv = 1;
    if (type === 'plain') n = 2;
    else if (type === 'twill') {
      up = Math.round(g(S, 'up', 2));
      n = up + Math.round(g(S, 'down', 2));
    } else {
      n = Math.round(g(S, 'shafts', 5));
      mv = Math.round(g(S, 'move', 2));
    }
    if (!(n >= 2 && n <= 32) || (type === 'twill' && !(up >= 1 && up < n))) {
      I.add('impossible');
      return null;
    }
    const E = Math.min(400, Math.max(1, Math.round(g(S, 'ends', n)))),
      Pk = Math.min(400, Math.max(1, Math.round(g(S, 'picks', n))));
    D = [];
    const cell = (e: number, p: number) =>
      type === 'plain'
        ? (e + p) % 2 === 0
          ? 1
          : 0
        : type === 'twill'
          ? (((e - p) % n) + n) % n < up
            ? 1
            : 0
          : (S.face === 'weft') === ((((e - mv * p) % n) + n) % n === 0)
            ? 1
            : 0;
    const rep = Array.from({ length: n }, (_, p) => Array.from({ length: n }, (_, e) => cell(e, p))); // one repeat: the floats are measured on it
    for (let p = 0; p < Pk; p++) {
      const row: number[] = [];
      for (let e = 0; e < E; e++) {
        let v: number;
        if (type === 'plain') v = (e + p) % 2 === 0 ? 1 : 0;
        else if (type === 'twill') v = (((e - p) % n) + n) % n < up ? 1 : 0;
        else {
          const pt = (((e - mv * p) % n) + n) % n === 0;
          v = (S.face === 'weft') === pt ? 1 : 0;
        }
        row.push(v);
      }
      D.push(row);
    }
    threading = Array.from({ length: E }, (_, e) => (e % n) + 1);
    lift = D.map((row, p) => {
      const sh: number[] = [];
      for (let s = 0; s < n; s++) if (rep[p % n]![s]) sh.push(s + 1);
      return sh;
    });
    return { D, rep, threading, lift, n, mv, type };
  }
  threading = ((m.threading || []) as number[]).slice(0, 400);
  if (Array.isArray(m.liftplan)) lift = (m.liftplan as number[][]).slice(0, 400).map(r => r.slice());
  else
    lift = ((m.treadling || []) as number[][]).slice(0, 400).map(ts => {
      const set = new Set<number>();
      for (const t of ts) for (const s of (m.tieup as number[][])[t - 1] || []) set.add(s);
      return [...set];
    });
  const sinking = m.shed === 'sinking';
  D = lift.map(sh => threading.map(s => (sh.includes(s) !== sinking ? 1 : 0)));
  return { D, threading, lift, n: isNum(m.shafts) ? m.shafts : Math.max(1, ...threading), type: 'draft' };
}
function runWeave(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sr: ModeResult['sr'] = {},
    sc: ModeResult['sc'] = {};
  const W = drawdownOf(m, g, I);
  if (W && W.D.length && W.D[0]!.length) {
    const D = W.rep || W.D,
      P = D.length,
      E = D[0]!.length,
      cyc = W.rep ? true : m.repeat !== false; // a structure: its repeat, cyclic
    let wf = 0,
      ef = 0,
      none = 0,
      longs = 0,
      trans = 0,
      ones = 0;
    const lim = g(m, 'maxFloat', Infinity);
    const marks: Array<[string, number, number, number]> = [];
    for (let e = 0; e < E; e++) {
      const col = D.map(r => r[e]!);
      const R = runs(col, v => v === 1, cyc),
        R0 = runs(col, v => v === 0, cyc);
      if (R.max === P || R0.max === P) none++;
      wf = Math.max(wf, R.max);
      for (const [st, len] of R.list)
        if (len > lim) {
          longs++;
          marks.push(['w', e, st, len]);
        }
    }
    for (let p = 0; p < P; p++) {
      const row = D[p]!;
      const R = runs(row, v => v === 0, cyc),
        R1 = runs(row, v => v === 1, cyc);
      if (R.max === E || R1.max === E) none++;
      ef = Math.max(ef, R.max);
      for (const [st, len] of R.list)
        if (len > lim) {
          longs++;
          marks.push(['f', p, st, len]);
        }
      for (let e = 0; e < E; e++) {
        ones += row[e]!;
        if (row[e] !== row[(e + 1) % E] && (cyc || e + 1 < E)) trans++;
      }
    }
    for (let i = 0; i < longs; i++) I.add('float-too-long');
    for (let i = 0; i < none; i++) I.add('no-interlace');
    Object.assign(o, {
      ends: W.D[0]!.length,
      picks: W.D.length,
      warpFloat: wf,
      weftFloat: ef,
      warpFaced: ones / (E * P),
      noInterlace: none,
      longFloats: longs,
      interlace: trans / P,
    });
    const wpi = g(m, 'wpi');
    if (fin(wpi)) o.sett = (wpi * E) / (E + trans / P); // Ashenhurst: EPI = WPI·E/(E+I), I = interlacements of one pick over the repeat
    if (W.type === 'satin') {
      const n = W.n,
        s = ((W.mv! % n) + n) % n;
      o.regular = n >= 5 && gcd(s, n) === 1 && s !== 1 && s !== n - 1 ? 1 : 0;
      o.satins = n >= 5 ? (phi(n) - 2) / 2 : 0;
      if (!o.regular) I.add('impossible');
    }
    const colors = isObj(m.colors) ? m.colors : null;
    sc.drawdown = sceneDrawdown(W, marks, colors);
  } else Object.assign(o, { ends: NaN, picks: NaN });
  const Wp = m.warp;
  if (isObj(Wp)) {
    const pct = (k: string, d?: number) => g(Wp, k, d) / 100;
    const wir = g(Wp, 'width') / ((1 - pct('drawIn', 0)) * (1 - pct('shrink', 0)));
    const woven = (g(Wp, 'length') * g(Wp, 'pieces', 1)) / ((1 - pct('takeUp', 0)) * (1 - pct('shrink', 0)));
    o.widthInReed = wir;
    o.warpEnds = Math.ceil(wir * g(Wp, 'epi') - 1e-9);
    o.wovenLength = woven;
    o.warpLength = woven + g(Wp, 'waste', 0);
    o.warpTotal = o.warpEnds * o.warpLength;
    o.warpTotalLong = o.warpTotal / (Wp.unit === 'cm' ? 100 : 36);
    const ppi = g(Wp, 'ppi');
    if (fin(ppi)) o.weftTotal = ppi * woven * wir * (1 + pct('takeUp', 0));
    if ([o.widthInReed, o.wovenLength].some(v => !(v > 0))) I.add('impossible');
  }
  const B = m.basket;
  if (isObj(B)) {
    // randing with one weaver needs an odd number of stakes
    let st = g(B, 'stakes');
    if (!fin(st) && fin(g(B, 'diameter'))) {
      st = Math.ceil((Math.PI * g(B, 'diameter')) / g(B, 'spacing', 1) - 1e-9);
      if (st % 2 === 0) st++;
    }
    o.stakesNeeded = st;
    o.parityOk = Math.round(st) % 2 === 1 ? 1 : 0;
    if (!o.parityOk) I.add('parity');
  }
  return { o, sr, sc };
}
function sceneDrawdown(W: Drawdown, marks: ReadonlyArray<readonly [string, number, number, number]>, colors: Rec | null) {
  const D = W.D,
    P = Math.min(D.length, 64),
    E = Math.min(D[0]!.length, 64),
    nS = Math.min(W.n || 1, 32);
  const s = C.scene([-1, E + nS + 3, -1, P + nS + 3]);
  const wc = colors && Array.isArray(colors.warp) ? (colors.warp as number[]) : null,
    fc = colors && Array.isArray(colors.weft) ? (colors.weft as number[]) : null;
  const role = (i: number) => ['base', 'hi', 'info', 'ok', 'warn', 'bad', 'muted', 'base'][i] || 'base';
  for (let p = 0; p < P; p++) {
    const y = P - 1 - p; // the first pick at the top, under the threading (North American layout)
    let e = 0;
    while (e < E) {
      const v = D[p]![e],
        cr = v ? (wc ? role(wc[e % wc.length]!) : 'base') : fc ? role(fc[p % fc.length]!) : null;
      let f = e + 1;
      while (f < E && D[p]![f] === v && (v ? (wc ? wc[f % wc.length] === wc[e % wc.length] : true) : fc ? true : true)) f++;
      if (cr) s.poly([e, y, f, y, f, y + 1, e, y + 1], { c: cr, fill: true });
      e = f;
    }
  }
  s.poly([0, 0, E, 0, E, P, 0, P], { c: 'muted' });
  for (let e = 0; e < E; e++) {
    const sh = W.threading[e]!;
    if (sh <= nS) s.poly([e, P + 1 + sh - 1, e + 1, P + 1 + sh - 1, e + 1, P + sh + 1, e, P + sh + 1], { c: 'hi', fill: true });
  }
  for (let p = 0; p < P; p++)
    for (const sh of W.lift[p] || [])
      if (sh <= nS) {
        const x = E + 1 + sh - 1,
          y = P - 1 - p;
        s.poly([x, y, x + 1, y, x + 1, y + 1, x, y + 1], { c: 'info', fill: true });
      }
  for (const [k, i, st, len] of marks.slice(0, 200)) {
    if (k === 'w') {
      const x = i + 0.5;
      for (const [a, b] of splitRun(st, len, D.length)) if (a < P) s.seg(x, P - a, x, P - Math.min(b, P), { c: 'bad', w: 3 });
    } else if (i < P) {
      const y = P - 1 - i + 0.5;
      for (const [a, b] of splitRun(st, len, D[0]!.length)) if (a < E) s.seg(a, y, Math.min(b, E), y, { c: 'bad', w: 3 });
    }
  }
  return s.done();
}
const splitRun = (st: number, len: number, n: number): Array<[number, number]> =>
  st + len <= n
    ? [[st, st + len]]
    : [
        [st, n],
        [0, st + len - n],
      ];

/* ===================================================================================================================== */
/* stitch — cross-stitch and canvas: size = stitches / count (over 2: count/2); floss per full cross (2√2 + 2)·s per strand  */
/* (front: two diagonals, back: two verticals); a 6-strand skein of 8 m (DMC / Anchor stranded cotton).                       */
/* ===================================================================================================================== */
function runStitch(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  const over = g(m, 'over', 1),
    eff = g(m, 'count') / over,
    w = g(m, 'w'),
    h = g(m, 'h');
  if (!(eff > 0)) I.add('impossible');
  const cm = m.unit === 'cm'; // count per 10 cm when cm
  const unitLen = cm ? 10 : 1;
  o.effCount = eff;
  const W = (w / eff) * unitLen,
    H = (h / eff) * unitLen; // in the fabric's unit (in, or cm)
  o.widthIn = cm ? W / 2.54 : W;
  o.heightIn = cm ? H / 2.54 : H;
  o.widthCm = cm ? W : W * 2.54;
  o.heightCm = cm ? H : H * 2.54;
  const mg = g(m, 'margin', cm ? 7.5 : 3);
  o.cutW = W + 2 * mg;
  o.cutH = H + 2 * mg;
  const fw = g(m, 'fabricW'),
    fh = g(m, 'fabricH');
  if (fin(fw) && fin(fh)) {
    o.fits = o.cutW <= fw + 1e-9 && o.cutH <= fh + 1e-9 ? 1 : 0;
    if (!o.fits) I.add('impossible');
  }
  const s = cm ? 100 / eff : 25.4 / eff; // the stitch size in mm
  o.perStitchMm = (2 * SQ2 + 2) * s;
  const strands = g(m, 'strands', 2),
    skein = g(m, 'skein', 8),
    waste = g(m, 'waste', 50) / 100;
  o.stitchesPerSkein = (6 * skein * 1000) / (strands * o.perStitchMm * (1 + waste));
  const n = g(m, 'stitches');
  if (fin(n)) o.skeins = Math.ceil(n / o.stitchesPerSkein - 1e-9);
  if (eff > 40 || eff < 3) I.add('range');
  const sn = C.scene(C.fitView([0, fin(fw) ? fw : o.cutW], [0, fin(fh) ? fh : o.cutH], 0.06));
  if (fin(fw) && fin(fh)) sn.poly([0, 0, fw, 0, fw, fh, 0, fh], { c: 'muted' });
  sn.poly([0, 0, o.cutW, 0, o.cutW, o.cutH, 0, o.cutH], { c: o.fits === 0 ? 'bad' : 'base', dash: true });
  sn.poly([mg, mg, mg + W, mg, mg + W, mg + H, mg, mg + H], { c: 'hi', fill: true });
  sn.txt(mg + W / 2, mg + H / 2, { v: W, c: 'base' });
  sc.layout = sn.done();
  return { o, sr: {}, sc };
}

/* ===================================================================================================================== */
/* quilt — patchwork cutting. Seam allowance sa (¼ in). Exact additions from offsetting the finished shapes by sa:           */
/* HST f + sa(2+√2) (→ 7/8), QST f + sa(2+2√2) (→ 1¼), side setting f√2 + sa(2+2√2), corner f/√2 + sa(2+√2); cuts are rounded  */
/* up to the next 1/8 in (a rotary-ruler mark). H. & C. Hargrave, Quilter's Academy (2009–); standard quilting practice.        */
/* ===================================================================================================================== */
function runQuilt(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  const f = g(m, 'finished', 3),
    sa = g(m, 'sa', 0.25);
  if (!(f > 0) || !(sa > 0)) I.add('range');
  o.square = f + 2 * sa;
  o.hst2Exact = f + sa * (2 + SQ2);
  o.hst2 = up8(o.hst2Exact);
  o.hst4Exact = SQ2 * o.hst2Exact;
  o.hst4 = up8(SQ2 * o.hst2);
  o.hst8 = 2 * o.hst2;
  o.qstExact = f + sa * (2 + 2 * SQ2);
  o.qst = up8(o.qstExact);
  o.diagonal = f * SQ2;
  o.sideSettingExact = f * SQ2 + sa * (2 + 2 * SQ2);
  o.sideSetting = up8(o.sideSettingExact);
  o.cornerExact = f / SQ2 + sa * (2 + SQ2);
  o.corner = up8(o.cornerExact);
  const gh = g(m, 'geese', f / 2); // flying geese 4-at-a-time ("no waste"), goose W×H with W = 2H
  o.geeseLarge = up8(2 * gh + sa * (2 + 2 * SQ2));
  o.geeseSmall = up8(gh + sa * (2 + SQ2));
  const cols = g(m, 'cols'),
    rows = g(m, 'rows'),
    block = g(m, 'block', f),
    sash = g(m, 'sashing', 0),
    border = g(m, 'border', 0);
  if (fin(cols) && fin(rows)) {
    o.quiltW = cols * block + (cols - 1) * sash + 2 * border;
    o.quiltH = rows * block + (rows - 1) * sash + 2 * border;
    sc.layout = sceneLayout(cols, rows, block, sash, border);
  }
  const Bd = m.binding;
  if (isObj(Bd) && fin(o.quiltW)) {
    o.bindingLength = 2 * (o.quiltW! + o.quiltH!) + g(Bd, 'extra', 12);
    const wof = g(Bd, 'wof', 40);
    o.bindingStrips = Math.ceil(o.bindingLength / wof - 1e-9);
    o.bindingYards = up8((o.bindingStrips * g(Bd, 'strip', 2.5)) / 36);
  }
  const Ct = m.cut;
  if (isObj(Ct)) {
    const wof = g(Ct, 'wof', 40),
      cw = g(Ct, 'w'),
      ch = g(Ct, 'h'),
      n = g(Ct, 'count');
    const opt = (a: number, b: number) => {
      const per = Math.floor(wof / a + 1e-9);
      if (per < 1) return null;
      const st = Math.ceil(n / per - 1e-9);
      return { per, st, inch: st * b };
    };
    const r1 = opt(cw, ch),
      r2 = opt(ch, cw),
      best = !r1 ? r2 : !r2 ? r1 : r2.inch < r1.inch ? r2 : r1;
    if (!best) {
      I.add('impossible');
      o.perStrip = 0;
    } else {
      o.perStrip = best.per;
      o.strips = best.st;
      o.cutYards = up8(best.inch / 36);
    }
  }
  const Bk = m.backing;
  if (isObj(Bk) && fin(o.quiltW)) {
    const mg = g(Bk, 'margin', 4),
      wof = g(Bk, 'wof', 40),
      W = o.quiltW! + 2 * mg,
      H = o.quiltH! + 2 * mg;
    const pv = Math.ceil(W / wof - 1e-9),
      ph = Math.ceil(H / wof - 1e-9);
    const lv = pv * H,
      lh = ph * W;
    o.backingPanels = lh < lv ? ph : pv;
    o.backingYards = up8(Math.min(lv, lh) / 36);
  }
  const Bi = m.bias;
  if (isObj(Bi)) o.biasLength = g(Bi, 'square') ** 2 / g(Bi, 'strip');
  // the HST scene: the finished square, its seam line, the cut square
  const c = o.hst2,
    s = C.scene([-0.2 * c, 1.2 * c, -0.2 * c, 1.2 * c]);
  s.poly([0, 0, c, 0, c, c, 0, c], { c: 'base' });
  s.seg(0, 0, c, c, { c: 'muted', dash: true });
  const d = sa * SQ2;
  s.seg(d, 0, c, c - d, { c: 'hi' });
  s.seg(0, d, c - d, c, { c: 'hi' });
  s.txt(c / 2, -0.1 * c, { v: c, c: 'base' });
  sc.hst = s.done();
  return { o, sr: {}, sc };
}
function sceneLayout(cols: number, rows: number, block: number, sash: number, border: number) {
  const W = cols * block + (cols - 1) * sash + 2 * border,
    H = rows * block + (rows - 1) * sash + 2 * border;
  const s = C.scene(C.fitView([0, W], [0, H], 0.05));
  s.poly([0, 0, W, 0, W, H, 0, H], { c: 'muted', fill: true });
  for (let i = 0; i < Math.min(cols, 30); i++)
    for (let j = 0; j < Math.min(rows, 30); j++) {
      const x = border + i * (block + sash),
        y = border + j * (block + sash);
      s.poly([x, y, x + block, y, x + block, y + block, x, y + block], { c: (i + j) % 2 ? 'hi' : 'info', fill: true });
    }
  return s.done();
}

/* ===================================================================================================================== */
/* symmetry — the 17 plane groups (general positions, International Tables for Crystallography Vol. A, plane groups 1–17),  */
/* the 7 frieze groups (Conway's nicknames, J. H. Conway, H. Burgiel, C. Goodman-Strauss, The Symmetries of Things, 2008),    */
/* the orbifold cost ("magic theorem": a Euclidean group costs exactly 2), the classification flowchart of D. Washburn &      */
/* D. Crowe, Symmetries of Culture (1988), and the 11 uniform (Archimedean) tilings (B. Grünbaum & G. C. Shephard, Tilings     */
/* and Patterns, 1987, §2.1). An op [a, b, c, d, tx, ty]: x' = a·x + b·y + tx, y' = c·x + d·y + ty (fractional coordinates).  */
/* ===================================================================================================================== */
/** a symmetry operation [a, b, c, d, tx, ty] */
type Op = readonly number[];
/** a plane or frieze group: its operations, its lattice and its orbifold signature */
interface Group {
  readonly ops: readonly Op[];
  readonly lat: string;
  readonly orb: string;
}
const I0: Op = [1, 0, 0, 1, 0, 0];
const P3: Op[] = [I0, [0, -1, 1, -1, 0, 0], [-1, 1, -1, 0, 0, 0]];
const P3M1: Op[] = [
  [0, -1, -1, 0, 0, 0],
  [-1, 1, 0, 1, 0, 0],
  [1, 0, 1, -1, 0, 0],
];
const P31M: Op[] = [
  [0, 1, 1, 0, 0, 0],
  [1, -1, 0, -1, 0, 0],
  [-1, 0, -1, 1, 0, 0],
];
const P6X: Op[] = [
  [-1, 0, 0, -1, 0, 0],
  [0, 1, -1, 1, 0, 0],
  [1, -1, 1, 0, 0, 0],
];
const P4: Op[] = [I0, [-1, 0, 0, -1, 0, 0], [0, -1, 1, 0, 0, 0], [0, 1, -1, 0, 0, 0]];
const PMM: Op[] = [I0, [-1, 0, 0, -1, 0, 0], [-1, 0, 0, 1, 0, 0], [1, 0, 0, -1, 0, 0]];
const CEN = (ops: Op[]) => ops.concat(ops.map(o => [o[0]!, o[1]!, o[2]!, o[3]!, o[4]! + 0.5, o[5]! + 0.5]));
/** name → {ops, lattice, orbifold}; lattice: oblique | rect | crect | square | hex | frieze */
const GROUPS: Readonly<Record<string, Group>> = {
  p1: { ops: [I0], lat: 'oblique', orb: 'o' },
  p2: { ops: [I0, [-1, 0, 0, -1, 0, 0]], lat: 'oblique', orb: '2222' },
  pm: { ops: [I0, [-1, 0, 0, 1, 0, 0]], lat: 'rect', orb: '**' },
  pg: { ops: [I0, [-1, 0, 0, 1, 0, 0.5]], lat: 'rect', orb: 'xx' },
  cm: { ops: CEN([I0, [-1, 0, 0, 1, 0, 0]]), lat: 'crect', orb: '*x' },
  pmm: { ops: PMM, lat: 'rect', orb: '*2222' },
  pmg: { ops: [I0, [-1, 0, 0, -1, 0, 0], [-1, 0, 0, 1, 0.5, 0], [1, 0, 0, -1, 0.5, 0]], lat: 'rect', orb: '22*' },
  pgg: { ops: [I0, [-1, 0, 0, -1, 0, 0], [-1, 0, 0, 1, 0.5, 0.5], [1, 0, 0, -1, 0.5, 0.5]], lat: 'rect', orb: '22x' },
  cmm: { ops: CEN(PMM), lat: 'crect', orb: '2*22' },
  p4: { ops: P4, lat: 'square', orb: '442' },
  p4m: {
    ops: P4.concat([
      [-1, 0, 0, 1, 0, 0],
      [1, 0, 0, -1, 0, 0],
      [0, 1, 1, 0, 0, 0],
      [0, -1, -1, 0, 0, 0],
    ]),
    lat: 'square',
    orb: '*442',
  },
  p4g: {
    ops: P4.concat([
      [-1, 0, 0, 1, 0.5, 0.5],
      [1, 0, 0, -1, 0.5, 0.5],
      [0, 1, 1, 0, 0.5, 0.5],
      [0, -1, -1, 0, 0.5, 0.5],
    ]),
    lat: 'square',
    orb: '4*2',
  },
  p3: { ops: P3, lat: 'hex', orb: '333' },
  p3m1: { ops: P3.concat(P3M1), lat: 'hex', orb: '*333' },
  p31m: { ops: P3.concat(P31M), lat: 'hex', orb: '3*3' },
  p6: { ops: P3.concat(P6X), lat: 'hex', orb: '632' },
  p6m: { ops: P3.concat(P6X, P3M1, P31M), lat: 'hex', orb: '*632' },
  hop: { ops: [I0], lat: 'frieze', orb: '∞∞' },
  step: { ops: [I0, [1, 0, 0, -1, 0.5, 0]], lat: 'frieze', orb: '∞x' },
  sidle: { ops: [I0, [-1, 0, 0, 1, 0, 0]], lat: 'frieze', orb: '*∞∞' },
  'spinning-hop': { ops: [I0, [-1, 0, 0, -1, 0, 0]], lat: 'frieze', orb: '22∞' },
  'spinning-sidle': { ops: [I0, [-1, 0, 0, -1, 0, 0], [-1, 0, 0, 1, 0.5, 0], [1, 0, 0, -1, 0.5, 0]], lat: 'frieze', orb: '2*∞' },
  jump: { ops: [I0, [1, 0, 0, -1, 0, 0]], lat: 'frieze', orb: '∞*' },
  'spinning-jump': { ops: PMM, lat: 'frieze', orb: '*22∞' },
};
const GNAMES = DATA.wallpaper.concat(DATA.frieze);
/** the orbifold cost: o 2, * 1, x 1; a digit n before any * (n−1)/n, after a * (n−1)/(2n); ∞ 1 before, ½ after */
function orbifoldCost(sig: string) {
  let c = 0,
    after = false;
  for (const ch of sig) {
    if (ch === '*') {
      c += 1;
      after = true;
    } else if (ch === 'x') c += 1;
    else if (ch === 'o') c += 2;
    else if (ch === '∞') c += after ? 0.5 : 1;
    else {
      const n = +ch;
      c += after ? (n - 1) / (2 * n) : (n - 1) / n;
    }
  }
  return c;
}
/** Washburn & Crowe's flowchart → the index of the wallpaper group (DATA.wallpaper), or −1 (not a plane group) */
function classifyWallpaper(q: Readonly<Record<string, number>>) {
  const n = q.rot,
    mir = !!q.mirrors,
    on = !!q.onMirrors,
    two = !!q.twoDirs,
    gl = !!q.glide;
  const W = DATA.wallpaper,
    at = (s: string) => W.indexOf(s);
  if (n === 6) return at(mir ? 'p6m' : 'p6');
  if (n === 4) return at(mir ? (on ? 'p4m' : 'p4g') : 'p4');
  if (n === 3) return at(mir ? (on ? 'p3m1' : 'p31m') : 'p3');
  if (n === 2) return at(mir ? (two ? (on ? 'pmm' : 'cmm') : 'pmg') : gl ? 'pgg' : 'p2');
  if (n === 1) return at(mir ? (gl ? 'cm' : 'pm') : gl ? 'pg' : 'p1');
  return -1;
}
function classifyFrieze(q: Readonly<Record<string, number>>) {
  const F = DATA.frieze,
    at = (s: string) => DATA.wallpaper.length + F.indexOf(s);
  if (q.hmirror) return at(q.vmirror ? 'spinning-jump' : 'jump');
  if (q.vmirror) return at(q.turn || q.glide ? 'spinning-sidle' : 'sidle');
  if (q.turn) return at('spinning-hop');
  return at(q.glide ? 'step' : 'hop');
}
const UNIFORM = [
  '3.3.3.3.3.3',
  '4.4.4.4',
  '6.6.6',
  '3.3.3.3.6',
  '3.3.3.4.4',
  '3.3.4.3.4',
  '3.4.6.4',
  '3.6.3.6',
  '3.12.12',
  '4.6.12',
  '4.8.8',
];
/** the canonical name of a vertex type: the smallest of its rotations and reflections */
function canonVertex(v: readonly number[]) {
  let best: number[] | null = null;
  const n = v.length;
  const less = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
    return false;
  };
  for (const seq of [v, v.slice().reverse()])
    for (let r = 0; r < n; r++) {
      const c = seq.slice(r).concat(seq.slice(0, r));
      if (!best || less(c, best)) best = c;
    }
  return best!.join('.');
}
function basis(lat: string, b: number, ang: number): number[][] {
  if (lat === 'square')
    return [
      [1, 0],
      [0, 1],
    ];
  if (lat === 'hex')
    return [
      [1, 0],
      [-0.5, Math.sqrt(3) / 2],
    ];
  if (lat === 'rect' || lat === 'crect')
    return [
      [1, 0],
      [0, b],
    ];
  if (lat === 'frieze')
    return [
      [1, 0],
      [0, b],
    ];
  const a = (ang * Math.PI) / 180;
  return [
    [1, 0],
    [b * Math.cos(a), b * Math.sin(a)],
  ];
}
function runSymmetry(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  let name = m.group as string | undefined;
  const gi = g(m, 'groupIndex');
  if (name === undefined && fin(gi)) name = GNAMES[Math.round(gi)];
  if (name !== undefined && !GROUPS[name]) {
    I.add('not-a-group');
    name = undefined;
  }
  if (name) {
    const G = GROUPS[name]!;
    o.groupIdx = GNAMES.indexOf(name);
    o.copies = G.ops.length;
    o.frieze = G.lat === 'frieze' ? 1 : 0;
    o.cost = orbifoldCost(G.orb);
    o.isPlane = Math.abs(o.cost - 2) < 1e-12 ? 1 : 0;
    sc.pattern = scenePattern(G, m, g);
  }
  if (typeof m.orbifold === 'string') {
    o.cost = orbifoldCost(m.orbifold);
    o.isPlane = Math.abs(o.cost - 2) < 1e-12 ? 1 : 0;
    if (!o.isPlane) I.add('not-a-group');
  }
  if (isObj(m.classify)) {
    const q: Record<string, number> = {};
    for (const k of ['rot', 'mirrors', 'twoDirs', 'onMirrors', 'glide']) q[k] = Math.round(g(m.classify, k, 0));
    o.classified = classifyWallpaper(q);
    if (o.classified < 0) I.add('not-a-group');
  } else if (isObj(m.classifyFrieze)) {
    const q: Record<string, number> = {};
    for (const k of ['vmirror', 'hmirror', 'turn', 'glide']) q[k] = Math.round(g(m.classifyFrieze, k, 0));
    o.classified = classifyFrieze(q);
  }
  if (Array.isArray(m.vertex) && m.vertex.length) {
    const v = m.vertex as number[];
    o.vertexSum = v.reduce((s, n) => s + ((n - 2) * 180) / n, 0);
    o.angleOk = Math.abs(o.vertexSum - 360) < 1e-9 ? 1 : 0;
    const cn = canonVertex(v);
    o.tiles = UNIFORM.includes(cn) ? 1 : 0;
    o.chiral = cn === '3.3.3.3.6' ? 1 : 0;
  }
  return { o, sr: {}, sc };
}
const MOTIF = [0.08, 0.06, 0.36, 0.1, 0.3, 0.18, 0.16, 0.2, 0.12, 0.34];
function scenePattern(G: Group, m: Rec, g: Getter) {
  const cells = Math.max(1, Math.min(6, Math.round(g(m, 'cells', 3))));
  const fr = G.lat === 'frieze';
  const B = basis(G.lat, g(m, 'b', fr ? 0.6 : G.lat === 'oblique' ? 0.8 : 0.7), g(m, 'angle', 75));
  const mot =
    Array.isArray(m.motif) && m.motif.length >= 6 ? (m.motif as number[]) : fr ? MOTIF.map((v, i) => (i % 2 ? v + 0.02 : v)) : MOTIF;
  const xs: number[] = [],
    ys: number[] = [],
    polys: Array<[number[], string]> = [];
  const toXY = (u: number, v: number): [number, number] => [u * B[0]![0]! + v * B[1]![0]!, u * B[0]![1]! + v * B[1]![1]!];
  const ny = fr ? 1 : cells;
  for (let ci = 0; ci < (fr ? cells * 2 : cells); ci++)
    for (let cj = 0; cj < ny; cj++)
      G.ops.forEach(op => {
        const img: number[] = [];
        for (let i = 0; i + 1 < mot.length; i += 2) {
          const u = op[0]! * mot[i]! + op[1]! * mot[i + 1]! + op[4]!,
            v = op[2]! * mot[i]! + op[3]! * mot[i + 1]! + op[5]!;
          img.push(u, v);
        }
        let cu = 0,
          cv = 0;
        for (let i = 0; i < img.length; i += 2) {
          cu += img[i]!;
          cv += img[i + 1]!;
        }
        cu /= img.length / 2;
        cv /= img.length / 2;
        const du = ci - Math.floor(cu),
          dv = fr ? 0 : cj - Math.floor(cv);
        const pts: number[] = [];
        for (let i = 0; i < img.length; i += 2) {
          const [x, y] = toXY(img[i]! + du, img[i + 1]! + dv);
          pts.push(x, y);
          xs.push(x);
          ys.push(y);
        }
        polys.push([pts, op[0]! * op[3]! - op[1]! * op[2]! < 0 ? 'hi' : 'info']);
      });
  const s = C.scene(C.fitView(xs, ys, 0.05));
  if (fr) {
    const L = cells * 2;
    s.seg(0, 0, L, 0, { c: 'muted', dash: true });
  } else
    for (let i = 0; i <= cells; i++) {
      const [x1, y1] = toXY(i, 0),
        [x2, y2] = toXY(i, cells),
        [x3, y3] = toXY(0, i),
        [x4, y4] = toXY(cells, i);
      s.seg(x1, y1, x2, y2, { c: 'muted', w: 1 });
      s.seg(x3, y3, x4, y4, { c: 'muted', w: 1 });
    }
  for (const [pts, c] of polys) s.poly(pts, { c, fill: true }); // mirror images (det < 0) in another role: the eye sees the reflections
  return s.done();
}

/* ===================================================================================================================== */
/* sew — circle skirts (r = W/(2πf)), gathers, knife pleats, ease, convex seam-allowance offsets (exact mitred; a concave     */
/* piece is reported, its offset approximate: no polygon-clipping library), point grading, first-fit-decreasing-height shelf */
/* packing (a rectangle estimate of a marker, not a nest).                                                                  */
/* ===================================================================================================================== */
function area(p: readonly number[]) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
  }
  return a / 2;
}
function isConvex(p: readonly number[]) {
  const n = p.length / 2;
  let sg = 0;
  for (let i = 0; i < n; i++) {
    const a = i,
      b = (i + 1) % n,
      c = (i + 2) % n;
    const cr = (p[2 * b]! - p[2 * a]!) * (p[2 * c + 1]! - p[2 * b + 1]!) - (p[2 * b + 1]! - p[2 * a + 1]!) * (p[2 * c]! - p[2 * b]!);
    if (Math.abs(cr) < 1e-12) continue;
    if (!sg) sg = Math.sign(cr);
    else if (Math.sign(cr) !== sg) return false;
  }
  return true;
}
/** the mitred outward offset of a polygon by d (exact for a convex polygon) */
function offset(p: readonly number[], d: number) {
  let q = p.slice();
  if (area(q) < 0) {
    const r: number[] = [];
    for (let i = q.length - 2; i >= 0; i -= 2) r.push(q[i]!, q[i + 1]!);
    q = r;
  }
  const n = q.length / 2,
    lines: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n,
      dx = q[2 * j]! - q[2 * i]!,
      dy = q[2 * j + 1]! - q[2 * i + 1]!,
      L = Math.hypot(dx, dy) || 1;
    const nx = dy / L,
      ny = -dx / L; // outward for a counter-clockwise polygon
    lines.push([q[2 * i]! + nx * d, q[2 * i + 1]! + ny * d, dx, dy]);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const A = lines[(i + n - 1) % n]!,
      B = lines[i]!;
    const den = A[2] * B[3] - A[3] * B[2];
    if (Math.abs(den) < 1e-12) {
      out.push(B[0], B[1]);
      continue;
    }
    const t = ((B[0] - A[0]) * B[3] - (B[1] - A[1]) * B[2]) / den;
    out.push(A[0] + t * A[2], A[1] + t * A[3]);
  }
  return out;
}
function runSew(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  const Sk = m.skirt;
  if (isObj(Sk)) {
    const W = g(Sk, 'waist'),
      L = g(Sk, 'length'),
      f = g(Sk, 'fraction', 1);
    if (!(f > 0 && f <= 1)) I.add('range');
    const r = W / (2 * Math.PI * f),
      R = r + L;
    o.skirtRadius = r;
    o.hem = 2 * Math.PI * R * f;
    // the bounding box of the annular sector of angle 2πf (opening centred on the x axis)
    const th = 2 * Math.PI * f;
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let i = 0; i <= 720; i++) {
      const a = -th / 2 + (th * i) / 720;
      for (const rr of [r, R]) {
        const x = rr * Math.cos(a),
          y = rr * Math.sin(a);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    o.skirtW = x1 - x0;
    o.skirtH = y1 - y0;
  }
  const Ga = m.gather;
  if (isObj(Ga)) o.gather = g(Ga, 'finished') * g(Ga, 'ratio');
  const Pl = m.pleats;
  if (isObj(Pl)) o.pleats = g(Pl, 'finished') + 2 * g(Pl, 'depth') * g(Pl, 'count');
  const Ea = m.ease;
  if (isObj(Ea)) {
    const b = g(Ea, 'body'),
      e = g(Ea, 'ease'),
      st = g(Ea, 'stretch', 0);
    o.garment = b + e;
    o.easeOk = e >= (-st / 100) * b - 1e-9 ? 1 : 0;
    if (!o.easeOk) I.add('range');
  }
  const Pc = m.piece;
  if (isObj(Pc) && Array.isArray(Pc.pts) && Pc.pts.length >= 6) {
    const p = (Pc.pts as number[]).slice(0, Pc.pts.length - (Pc.pts.length % 2)),
      sa = g(Pc, 'sa');
    o.area = Math.abs(area(p));
    let per = 0;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      per += Math.hypot(p[j]! - p[i]!, p[j + 1]! - p[i + 1]!);
    }
    o.perimeter = per;
    const cv = isConvex(p);
    o.concave = cv ? 0 : 1;
    if (!cv) I.add('concave');
    const q = offset(p, sa);
    o.saArea = Math.abs(area(q));
    const s = C.scene(
      C.fitView(
        q.filter((_, i) => i % 2 === 0),
        q.filter((_, i) => i % 2 === 1),
        0.08,
      ),
    );
    s.poly(q, { c: cv ? 'hi' : 'warn', dash: true });
    s.poly(p, { c: 'base', fill: true });
    const Gr = m.grade;
    if (isObj(Gr) && Array.isArray(Gr.rule) && Gr.rule.length === p.length) {
      const steps = Math.max(0, Math.min(8, Math.round(g(Gr, 'steps', 2))));
      for (let k = 1; k <= steps; k++)
        s.poly(
          p.map((v, i) => v + k * (Gr.rule as number[])[i]!),
          { c: 'info' },
        );
    }
    sc.piece = s.done();
  }
  const Pk = m.pack;
  if (isObj(Pk) && Array.isArray(Pk.rects)) {
    const W = g(Pk, 'width'),
      rs = (Pk.rects as number[][]).map((r, i) => ({ w: r[0]!, h: r[1]!, i })).sort((a, b) => b.h - a.h || b.w - a.w || a.i - b.i);
    const shelves: Array<{ y: number; h: number; used: number }> = [];
    let tot = 0,
      ok = true;
    const placed: Array<[number, number, number, number]> = [];
    for (const r of rs) {
      if (r.w > W + 1e-9) {
        ok = false;
        continue;
      }
      tot += r.w * r.h;
      let sh = shelves.find(s => s.used + r.w <= W + 1e-9);
      if (!sh) {
        sh = { y: shelves.reduce((s, x) => s + x.h, 0), h: r.h, used: 0 };
        shelves.push(sh);
      }
      placed.push([sh.used, sh.y, r.w, r.h]);
      sh.used += r.w;
    }
    if (!ok) I.add('impossible');
    o.packLength = shelves.reduce((s, x) => s + x.h, 0);
    o.packEfficiency = tot / (W * o.packLength);
    o.packLower = tot / W;
    const s = C.scene(C.fitView([0, W], [0, Math.max(o.packLength, 1e-9)], 0.05));
    s.poly([0, 0, W, 0, W, o.packLength, 0, o.packLength], { c: 'muted' });
    for (const [x, y, w, h] of placed) s.poly([x, y, x + w, y, x + w, y + h, x, y + h], { c: 'hi', fill: true });
    sc.pack = s.done();
  }
  return { o, sr: {}, sc };
}

/* ===================================================================================================================== */
/* wood — USDA Forest Products Laboratory, Wood Handbook, FPL-GTR-282 (2021): shrinkage S_R, S_T green→oven-dry (%), the       */
/* dimensional change coefficients C_R, C_T (per % MC, valid 6–14 % MC: ΔD = D·C·ΔM), E (Mpsi, 12 % MC); the EMC equation of  */
/* W. T. Simpson (1973, Hailwood–Horrobin; Handbook eq. 4-5); S_M = S_0(30 − M)/30 below the fibre saturation point (~30 %).   */
/* Checked 2026-11 against the 2021 chapter PDFs (research.fs.usda.gov/treesearch/62243, 62244, 62261): S from Tables 4-3 and */
/* 4-4, C from Table 13-5 (= eq. 13-2 with FSP 30, M_I 10), E from Tables 5-3b and 5-5b. Corrected then: red oak C 0.00137/  */
/* 0.00304, white oak 0.00194/0.00376, ponderosa C_R 0.00133 (the old values were the 2010 edition's), teak S_T 5.8.          */
/* ===================================================================================================================== */
const WOOD: Readonly<Record<string, readonly number[]>> = {
  // [S_R, S_T, S_V, C_R, C_T, E Mpsi]
  'ash-white': [4.9, 7.8, 13.3, 0.00169, 0.00274, 1.74],
  basswood: [6.6, 9.3, 15.8, 0.0023, 0.0033, 1.46],
  beech: [5.5, 11.9, 17.2, 0.0019, 0.00431, 1.72],
  'birch-yellow': [7.3, 9.5, 16.8, 0.00256, 0.00338, 2.01],
  'cherry-black': [3.7, 7.1, 11.5, 0.00126, 0.00248, 1.49],
  'hickory-shagbark': [7.0, 10.5, 16.7, 0.00259, 0.00411, 2.16],
  'maple-sugar': [4.8, 9.9, 14.7, 0.00165, 0.00353, 1.83],
  'maple-red': [4.0, 8.2, 12.6, 0.00137, 0.00289, 1.64],
  'oak-red': [4.0, 8.6, 13.7, 0.00137, 0.00304, 1.82],
  'oak-white': [5.6, 10.5, 16.3, 0.00194, 0.00376, 1.78],
  'walnut-black': [5.5, 7.8, 12.8, 0.0019, 0.00274, 1.68],
  'yellow-poplar': [4.6, 8.2, 12.7, 0.00158, 0.00289, 1.58],
  'douglas-fir': [4.8, 7.6, 12.4, 0.00165, 0.00267, 1.95],
  'pine-white': [2.1, 6.1, 8.2, 0.00071, 0.00212, 1.24],
  'pine-ponderosa': [3.9, 6.2, 9.7, 0.00133, 0.00216, 1.29],
  redwood: [2.6, 4.4, 6.8, 0.0012, 0.00205, 1.34],
  'cedar-western-red': [2.4, 5.0, 6.8, 0.00111, 0.00234, 1.11],
  'spruce-sitka': [4.3, 7.5, 11.5, 0.00148, 0.00263, 1.57],
  mahogany: [3.0, 4.1, 7.8, NaN, NaN, 1.5],
  teak: [2.5, 5.8, 7.0, NaN, NaN, 1.55],
};
const FSP = 30;
/** EMC (%) of wood at T (°F) and relative humidity h (0–1): Simpson (1973), Wood Handbook eq. 4-5 */
function emc(T: number, h: number) {
  const W = 330 + 0.452 * T + 0.00415 * T * T,
    K = 0.791 + 4.63e-4 * T - 8.44e-7 * T * T;
  const K1 = 6.34 + 7.75e-4 * T - 9.35e-5 * T * T,
    K2 = 1.09 + 2.84e-2 * T - 9.04e-5 * T * T,
    Kh = K * h;
  if (Kh >= 1) return NaN;
  return (1800 / W) * (Kh / (1 - Kh) + (K1 * Kh + 2 * K1 * K2 * Kh * Kh) / (1 + K1 * Kh + K1 * K2 * Kh * Kh));
}
/** 1-D cutting stock: first-fit decreasing (each cut after the first in a board costs a kerf) */
function ffd(pieces: readonly number[], stock: number, kerf: number) {
  const bins: number[][] = [];
  for (const p of pieces.slice().sort((a, b) => b - a)) {
    let placed = false;
    for (const b of bins) {
      const used = b.reduce((s, x) => s + x, 0) + kerf * b.length;
      if (used + p <= stock + 1e-9) {
        b.push(p);
        placed = true;
        break;
      }
    }
    if (!placed) bins.push([p]);
  }
  return bins;
}
/** the fewest boards (exact, branch and bound) for ≤ 16 pieces, ≤ 200 000 nodes; NaN when the search is cut */
function exactBins(pieces: readonly number[], stock: number, kerf: number, ub: number) {
  const ps = pieces.slice().sort((a, b) => b - a),
    n = ps.length;
  if (n > 16) return NaN;
  let best = ub,
    nodes = 0;
  const loads: Array<{ u: number; c: number }> = [];
  const go = (i: number): void => {
    if (++nodes > 200000) return;
    if (loads.length >= best) return;
    if (i === n) {
      best = loads.length;
      return;
    }
    const seen = new Set();
    for (let b = 0; b < loads.length; b++) {
      const L = loads[b]!;
      if (seen.has(L.u)) continue;
      seen.add(L.u);
      const need = L.c ? ps[i]! + kerf : ps[i]!;
      if (L.u + need <= stock + 1e-9) {
        L.u += need;
        L.c++;
        go(i + 1);
        L.u -= need;
        L.c--;
      }
    }
    loads.push({ u: ps[i]!, c: 1 });
    go(i + 1);
    loads.pop();
  };
  go(0);
  return nodes > 200000 ? NaN : best;
}
function runWood(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sr: ModeResult['sr'] = {},
    sc: ModeResult['sc'] = {};
  const sp = WOOD[m.species as string];
  if (sp) {
    o.cR = sp[3]!;
    o.cT = sp[4]!;
  }
  const Bd = m.board;
  if (isObj(Bd)) {
    o.boardFeet = (g(Bd, 't') * g(Bd, 'w') * g(Bd, 'l')) / 12;
    o.cubicMeters = o.boardFeet * 0.0023597372;
  }
  const wd = g(m, 'width'),
    a0 = g(m, 'mcFrom'),
    b0 = g(m, 'mcTo');
  if (sp && fin(wd) && fin(a0) && fin(b0)) {
    const a = Math.max(0, Math.min(FSP, a0)),
      b = Math.max(0, Math.min(FSP, b0));
    if (a0 > FSP || b0 > FSP) I.add('beyond-fsp');
    if (a0 < 0 || b0 < 0) I.add('range');
    const flat = m.cut !== 'quarter',
      Cc = flat ? sp[4]! : sp[3]!,
      S0 = flat ? sp[1]! : sp[0]!;
    if (!fin(Cc)) {
      I.add('out-of-table');
      o.movement = NaN;
    } else {
      if (Math.min(a, b) < 6 || Math.max(a, b) > 14) I.add('extrapolated');
      o.movement = wd * Cc * (b - a);
    }
    const Sm = (M: number) => (S0 * (FSP - M)) / FSP;
    o.shrinkAt = Sm(b);
    o.movementFull = (wd * (1 - Sm(b) / 100)) / (1 - Sm(a) / 100) - wd;
    const s = C.scene([-0.1 * wd, 1.3 * wd, -0.3 * wd, 0.3 * wd]);
    const h = 0.2 * wd,
      w2 = wd + o.movementFull;
    s.poly([0, -h / 2, wd, -h / 2, wd, h / 2, 0, h / 2], { c: 'base' });
    s.poly([0, -h / 2, w2, -h / 2, w2, h / 2, 0, h / 2], { c: o.movementFull >= 0 ? 'warn' : 'info', dash: true });
    s.txt(wd / 2, h, { v: o.movementFull, c: 'base' });
    sc.movement = s.done();
  }
  const Em = m.emc;
  if (isObj(Em)) {
    const T = g(Em, 'tempF'),
      rh = g(Em, 'rh');
    if (!(rh >= 0 && rh < 100)) I.add('range');
    if (T < 30 || T > 210) I.add('extrapolated');
    o.emc = emc(T, rh / 100);
    const xs: number[] = [],
      ys: number[] = [];
    for (let r = 0; r <= 98; r += 2) {
      xs.push(r);
      ys.push(emc(T, r / 100));
    }
    sr.emcRh = xs;
    sr.emcCurve = ys;
  }
  const Sh = m.shelf;
  if (isObj(Sh)) {
    // simply supported, uniform load: δ = 5wL⁴/(384EI) (lb, in, psi); Sagulator limit 0.02 in per foot of span
    const t = g(Sh, 't'),
      w = g(Sh, 'w'),
      L = g(Sh, 'span'),
      q = g(Sh, 'load') / 12,
      E = g(Sh, 'e', sp ? sp[5]! * 1e6 : NaN),
      cr = g(Sh, 'creep', 1);
    const Iy = (w * t ** 3) / 12;
    o.sag = ((5 * q * L ** 4) / (384 * E * Iy)) * cr;
    o.sagLimit = (0.02 * L) / 12;
    o.sagOk = o.sag <= o.sagLimit + 1e-12 ? 1 : 0;
  }
  const Cl = m.cutlist;
  if (isObj(Cl) && Array.isArray(Cl.pieces)) {
    const stock = g(Cl, 'stock'),
      kerf = g(Cl, 'kerf', 0.125),
      ps = (Cl.pieces as unknown[]).map(v => (typeof v === 'number' ? v : v === undefined ? NaN : g({ v }, 'v')));
    if (ps.some(p => !(p > 0) || p > stock)) {
      I.add('impossible');
      o.boards = NaN;
    } else {
      const bins = ffd(ps, stock, kerf);
      o.boards = bins.length;
      o.lowerBound = Math.ceil((ps.reduce((s, x) => s + x, 0) + kerf * ps.length) / (stock + kerf) - 1e-9);
      o.boardsOpt = o.boards === o.lowerBound ? o.boards : exactBins(ps, stock, kerf, o.boards);
      o.utilisation = ps.reduce((s, x) => s + x, 0) / (o.boards * stock);
      const s = C.scene([-0.05 * stock, 1.05 * stock, -bins.length - 0.5, 0.5]);
      bins.slice(0, 60).forEach((b, i) => {
        const y = -i - 0.4;
        s.poly([0, y, stock, y, stock, y + 0.8, 0, y + 0.8], { c: 'muted' });
        let x = 0;
        for (const p of b) {
          s.poly([x, y, x + p, y, x + p, y + 0.8, x, y + 0.8], { c: 'hi', fill: true });
          s.txt(x + p / 2, y + 0.4, { v: p, c: 'base' });
          x += p + kerf;
        }
      });
      sc.cutlist = s.done();
    }
  }
  const dv = g(m, 'dovetail');
  if (fin(dv)) o.dovetailDeg = (Math.atan(1 / dv) * 180) / Math.PI;
  return { o, sr, sc };
}

/* ===================================================================================================================== */
/* ceramic — shrinkage (wet = fired/(1 − s)); Orton pyrometric cones 022–14 (The Edward Orton Jr. Ceramic Foundation,         */
/* "Temperature Equivalent Chart for Orton Pyrometric Cones", °F chart, heating rates 27/108/270 °F/h = 15/60/150 °C/h over   */
/* the last 100 °C, converted to °C here: (F − 32)/1.8, rounded); glaze unity molecular formula (Seger); calculated expansion  */
/* (English & Turner 1927 by weight, Appen by mole; coefficients via glassproperties.com "Old Thermal Expansion Models").      */
/* Molar masses from the IUPAC 2021 standard atomic weights (abridged).                                                     */
/* ===================================================================================================================== */
/** a cone type that starts at a later cone (index `from`) */
interface OrtonFrom {
  readonly from: number;
  readonly rows: ReadonlyArray<readonly (number | null)[]>;
}
/** the Orton tables by cone type: °C per cone index and heating rate (null: not made) */
interface Orton {
  readonly ss: ReadonlyArray<readonly (number | null)[]>;
  readonly ssfe: OrtonFrom;
  readonly large: ReadonlyArray<readonly (number | null)[]>;
  readonly largefe: OrtonFrom;
  readonly small: readonly (number | null)[];
}
// prettier-ignore
const ORTON: Orton = {   // °C at 15, 60, 150 °C/h (null: not made)
  ss: [[null, 586, 590], [null, 600, 617], [null, 626, 638], [656, 678, 695], [686, 715, 734], [705, 738, 763], [742, 772, 796], [750, 791, 818], [757, 807, 838], [807, 837, 861], [843, 861, 882], [857, 875, 894], [891, 903, 915], [907, 920, 930], [922, 942, 956], [962, 976, 987], [981, 998, 1013], [1004, 1015, 1025], [1021, 1031, 1044], [1046, 1063, 1077], [1071, 1086, 1104], [1078, 1102, 1122], [1093, 1119, 1138], [1109, 1137, 1154], [1112, 1142, 1164], [1115, 1152, 1170], [1141, 1162, 1183], [1159, 1186, 1207], [1167, 1203, 1225], [1185, 1222, 1243], [1201, 1239, 1257], [1211, 1249, 1271], [1224, 1260, 1280], [1251, 1285, 1305], [1272, 1294, 1315], [1285, 1306, 1326], [1309, 1331, 1348], [1351, 1365, 1384]],
  ssfe: { from: 12, rows: [[871, 886, 893], [899, 919, 928], [924, 946, 957], [953, 971, 982], [969, 991, 998], [990, 1012, 1021], [1013, 1037, 1046], [1043, 1061, 1069], [1066, 1088, 1093], [1084, 1105, 1115], [1101, 1123, 1134], [1119, 1139, 1148], [null, null, null], [1130, 1154, 1162]] },
  large: [[null, null], [null, null], [null, null], [676, 693], [712, 732], [736, 761], [769, 794], [788, 816], [807, 836], [837, 859], [858, 880], [873, 892], [898, 913], [917, 928], [942, 954], [973, 985], [995, 1011], [1012, 1023], [1030, 1046], [1060, 1070], [1086, 1101], [1101, 1120], [1117, 1137], [1136, 1154], [1142, 1162], [1152, 1168], [1160, 1181], [1184, 1205], [null, null], [1220, 1241], [1237, 1255], [1247, 1269], [1257, 1278], [1282, 1303], [1293, 1312], [1304, 1324], [1321, 1346], [1388, 1366]],
  largefe: { from: 12, rows: [[884, 891], [917, 926], [945, 955], [970, 980], [991, 996], [1011, 1020], [1032, 1044], [1060, 1067], [1087, 1091], [1102, 1113], [1122, 1132], [1137, 1146], [null, null], [1151, 1160]] },
  small: [630, 643, 666, 723, 752, 784, 825, 843, 870, 880, 900, 915, 919, 955, 983, 1008, 1023, 1043, 1062, 1098, 1131, 1148, 1178, 1184, 1190, 1196, 1209, 1221, null, 1255, 1264, 1300, 1317, 1330, 1336, 1355, null, null],
};
/** the temperature (°C) of cone index i at a heating rate (°C/h) for a cone type, piecewise linear in log(rate) → {T, extrapolated} */
function coneTemp(i: number, rate: number, type: unknown): { T: number; x: boolean } {
  let rates: number[], row: readonly (number | null | undefined)[] | undefined;
  if (type === 'small') {
    rates = [300];
    row = [ORTON.small[i]];
  } else if (type === 'large') {
    rates = [60, 150];
    row = ORTON.large[i];
  } else if (type === 'ssfe' || type === 'largefe') {
    const t = ORTON[type];
    rates = type === 'ssfe' ? [15, 60, 150] : [60, 150];
    row = t.rows[i - t.from];
  } else {
    rates = [15, 60, 150];
    row = ORTON.ss[i];
  }
  if (!row) return { T: NaN, x: false };
  const pts = rates.map((r, k): [number, number | null | undefined] => [Math.log(r), row[k]]).filter(p => p[1] != null) as Array<
    [number, number]
  >;
  if (!pts.length) return { T: NaN, x: false };
  const lr = Math.log(rate);
  if (pts.length === 1) return { T: pts[0]![1], x: Math.abs(lr - pts[0]![0]) > 1e-9 };
  let k = 0;
  while (k < pts.length - 2 && lr > pts[k + 1]![0]) k++;
  const [x0, y0] = pts[k]!,
    [x1, y1] = pts[k + 1]!;
  return { T: y0 + ((y1 - y0) * (lr - x0)) / (x1 - x0), x: lr < pts[0]![0] - 1e-9 || lr > pts[pts.length - 1]![0] + 1e-9 };
}
/** the number of a cone as a signed value: 022 → −22, 05.5 → −5.5, 01 → −1, 1 → 1, 5.5 → 5.5 */
const coneNo = (name: string) => (name.startsWith('0') ? -parseFloat(name.slice(1)) : parseFloat(name));
const AW: Readonly<Record<string, number>> = {
  Si: 28.085,
  O: 15.999,
  Al: 26.982,
  B: 10.81,
  Li: 6.94,
  Na: 22.99,
  K: 39.098,
  Mg: 24.305,
  Ca: 40.078,
  Sr: 87.62,
  Ba: 137.33,
  Zn: 65.38,
  Pb: 207.2,
  Ti: 47.867,
  Zr: 91.224,
  Fe: 55.845,
  C: 12.011,
  H: 1.008,
};
function fw(f: string) {
  let s = 0;
  for (const [, e, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) s += AW[e!]! * (n ? +n : 1);
  return s;
}
const OXM = Object.fromEntries(DATA.oxides.map(o => [o, fw(o)]));
const FLUX = ['Li2O', 'Na2O', 'K2O', 'MgO', 'CaO', 'SrO', 'BaO', 'ZnO', 'PbO'];
/** the built-in theoretical minerals: moles of each oxide per formula unit (volatiles CO2 and H2O lost on firing) */
const MINERALS: Readonly<Record<string, readonly [Readonly<Record<string, number>>, string]>> = {
  silica: [{ SiO2: 1 }, 'SiO2'],
  whiting: [{ CaO: 1 }, 'CaCO3'],
  wollastonite: [{ CaO: 1, SiO2: 1 }, 'CaSiO3'],
  kaolin: [{ Al2O3: 1, SiO2: 2 }, 'Al2Si2O9H4'],
  potash_feldspar: [{ K2O: 1, Al2O3: 1, SiO2: 6 }, 'K2Al2Si6O16'],
  soda_feldspar: [{ Na2O: 1, Al2O3: 1, SiO2: 6 }, 'Na2Al2Si6O16'],
  talc: [{ MgO: 3, SiO2: 4 }, 'Mg3Si4O12H2'],
  dolomite: [{ CaO: 1, MgO: 1 }, 'CaMgC2O6'],
  zinc_oxide: [{ ZnO: 1 }, 'ZnO'],
  magnesium_carbonate: [{ MgO: 1 }, 'MgCO3'],
  strontium_carbonate: [{ SrO: 1 }, 'SrCO3'],
  barium_carbonate: [{ BaO: 1 }, 'BaCO3'],
  lithium_carbonate: [{ Li2O: 1 }, 'Li2CO3'],
  spodumene: [{ Li2O: 1, Al2O3: 1, SiO2: 4 }, 'Li2Al2Si4O12'],
};
/** moles of each oxide in 1 g of a material (a built-in mineral, or an author's analysis in wt %) */
function perGram(name: unknown, own: Rec | null | undefined): Record<string, number> | null {
  if (own && Object.prototype.hasOwnProperty.call(own, name as string)) {
    const r: Record<string, number> = {};
    for (const [ox, pct] of Object.entries(own[name as string] as Readonly<Record<string, number>>))
      if (OXM[ox]) r[ox] = pct / 100 / OXM[ox];
    return r;
  }
  const mn = MINERALS[name as string];
  if (!mn) return null;
  const F = fw(mn[1]),
    r: Record<string, number> = {};
  for (const [ox, n] of Object.entries(mn[0])) r[ox] = n / F;
  return r;
}
const ET: Readonly<Record<string, number>> = {
  SiO2: 0.5,
  Al2O3: 1.4,
  B2O3: -6.53,
  Na2O: 41.6,
  K2O: 39.0,
  CaO: 16.3,
  MgO: 4.5,
  BaO: 14.0,
  ZnO: 7.0,
  PbO: 10.6,
};
const APPEN: Readonly<Record<string, number>> = {
  Al2O3: -3.0,
  B2O3: -5.0,
  Na2O: 39.5,
  K2O: 46.5,
  Li2O: 27,
  CaO: 13,
  MgO: 6,
  BaO: 20,
  SrO: 16,
  ZnO: 5,
  ZrO2: -6,
  Fe2O3: 5.5,
  TiO2: 3.0,
};
/** calculated linear expansion (ppm/K) from moles of oxides: English & Turner (weight fractions) or Appen (mole fractions) */
function expansion(mol: Readonly<Record<string, number>>, set: unknown) {
  let tot = 0,
    totM = 0;
  for (const [ox, n] of Object.entries(mol)) {
    tot += n * OXM[ox]!;
    totM += n;
  }
  if (!(tot > 0)) return NaN;
  if (set === 'appen') {
    let a = 0;
    const pc = (ox: string) => (100 * (mol[ox] || 0)) / totM;
    const si = pc('SiO2'),
      r2o = pc('Li2O') + pc('Na2O') + pc('K2O');
    for (const ox of Object.keys(mol)) {
      let c = APPEN[ox];
      if (ox === 'SiO2') c = si >= 67 ? 10.5 - 0.1 * si : 3.8;
      if (ox === 'K2O' && pc('Na2O') <= 1) c = 42.0;
      if (ox === 'PbO') c = r2o < 3 ? 13.0 : 11.5 + 0.5 * r2o;
      if (c !== undefined) a += (c * pc(ox)) / 100;
    }
    return a;
  }
  let a = 0;
  for (const [ox, n] of Object.entries(mol)) if (ET[ox] !== undefined) a += (ET[ox] * n * OXM[ox]!) / tot;
  return a;
}
/** least squares A·x = b by the normal equations (Gaussian elimination with pivoting); null when singular */
function lsq(A: ReadonlyArray<readonly number[]>, b: readonly number[]): number[] | null {
  const n = A[0]!.length,
    M = Array.from({ length: n }, (_, i) => {
      const r: number[] = [];
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < A.length; k++) s += A[k]![i]! * A[k]![j]!;
        r.push(s);
      }
      let s = 0;
      for (let k = 0; k < A.length; k++) s += A[k]![i]! * b[k]!;
      r.push(s);
      return r;
    });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-14) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const f = M[r]![c]! / M[c]![c]!;
        for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
      }
  }
  return M.map((r, i) => r[n]! / r[i]!);
}
/** non-negative least squares (Lawson & Hanson 1974, active set), ≤ 3n iterations */
function nnls(A: ReadonlyArray<readonly number[]>, b: readonly number[]): number[] {
  const n = A[0]!.length;
  let x = new Array<number>(n).fill(0);
  const Pset = new Set<number>();
  for (let it = 0; it < 3 * n + 3; it++) {
    const r = b.map((bi, k) => bi - A[k]!.reduce((s, a, j) => s + a * x[j]!, 0));
    const w = Array.from({ length: n }, (_, j) => A.reduce((s, row, k) => s + row[j]! * r[k]!, 0));
    let jmax = -1,
      wm = 1e-12;
    for (let j = 0; j < n; j++)
      if (!Pset.has(j) && w[j]! > wm) {
        wm = w[j]!;
        jmax = j;
      }
    if (jmax < 0) break;
    Pset.add(jmax);
    for (let inner = 0; inner < 3 * n; inner++) {
      const idx = [...Pset],
        z =
          lsq(
            A.map(row => idx.map(j => row[j]!)),
            b,
          ) || idx.map(() => 0);
      if (z.every(v => v > 1e-15)) {
        x = new Array<number>(n).fill(0);
        idx.forEach((j, k) => {
          x[j] = z[k]!;
        });
        break;
      }
      let alpha = Infinity;
      idx.forEach((j, k) => {
        if (z[k]! <= 1e-15) {
          const a = x[j]! / (x[j]! - z[k]!);
          if (a < alpha) alpha = a;
        }
      });
      if (!fin(alpha)) alpha = 0;
      idx.forEach((j, k) => {
        x[j]! += alpha * (z[k]! - x[j]!);
      });
      for (const j of idx)
        if (x[j]! <= 1e-12) {
          Pset.delete(j);
          x[j] = 0;
        }
    }
  }
  return x;
}
function runCeramic(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sr: ModeResult['sr'] = {},
    sc: ModeResult['sc'] = {};
  const dry = g(m, 'dry'),
    fire = g(m, 'fire');
  let s = g(m, 'shrink');
  if (!fin(s) && fin(dry) && fin(fire)) s = 100 * (1 - (1 - dry / 100) * (1 - fire / 100));
  if (fin(s)) {
    if (!(s >= 0 && s < 100)) I.add('impossible');
    o.totalShrink = s;
    o.volShrink = 100 * (1 - (1 - s / 100) ** 3);
    const f = g(m, 'fired');
    if (fin(f)) o.wet = f / (1 - s / 100);
  }
  const rate = g(m, 'rate', 60),
    type = m.type || 'ss';
  let ci = m.cone !== undefined ? DATA.cones.indexOf(m.cone as string) : NaN;
  const cix = g(m, 'coneIndex');
  if (!fin(ci) && fin(cix)) {
    ci = Math.round(cix);
    if (ci < 0 || ci >= DATA.cones.length) {
      I.add('out-of-table');
      ci = NaN;
    }
  }
  if (rate < 15 - 1e-9 || rate > 150 + 1e-9) I.add('extrapolated');
  if (fin(ci)) {
    const r = coneTemp(ci, rate, type);
    o.coneTemp = r.T;
    if (!fin(r.T)) I.add('out-of-table');
  }
  const temps = DATA.cones.map((_, i) => coneTemp(i, rate, type).T);
  sr.coneNo = DATA.cones.map(coneNo);
  sr.coneTemps = temps;
  const tc = g(m, 'tempC');
  if (fin(tc)) {
    const idx = temps.map((T, i): [number, number] => [T, i]).filter(p => fin(p[0]));
    if (!idx.length || tc < idx[0]![0] || tc > idx[idx.length - 1]![0]) {
      I.add('out-of-table');
      o.coneAt = NaN;
      o.coneFrac = NaN;
    } else {
      let k = 0;
      while (k < idx.length - 1 && tc >= idx[k + 1]![0]) k++;
      o.coneAt = coneNo(DATA.cones[idx[k]![1]]!);
      o.coneFrac = k < idx.length - 1 ? (tc - idx[k]![0]) / (idx[k + 1]![0] - idx[k]![0]) : 0;
    }
  }
  const own = isObj(m.materials) ? m.materials : null;
  if (Array.isArray(m.recipe) && m.recipe.length) {
    const mol: Record<string, number> = {};
    let raw = 0;
    for (const r of m.recipe as Rec[]) {
      const w = g(r, 'w'),
        pg = perGram(r.mat, own);
      if (!pg) continue;
      raw += w;
      for (const [ox, n] of Object.entries(pg)) mol[ox] = (mol[ox] || 0) + w * n;
    }
    const flux = FLUX.reduce((s, ox) => s + (mol[ox] || 0), 0);
    let tot = 0;
    for (const [ox, n] of Object.entries(mol)) tot += n * OXM[ox]!;
    o.firedYield = (100 * tot) / raw;
    if (!(flux > 0)) {
      I.add('unity-off');
      o.fluxSum = 0;
    } else {
      o.fluxSum = 1;
      for (const ox of DATA.oxides) {
        o['umf.' + ox] = (mol[ox] || 0) / flux;
        o['wt.' + ox] = (100 * (mol[ox] || 0) * OXM[ox]!) / tot;
      }
      o.siAl = (mol.SiO2 || 0) / (mol.Al2O3 || 0);
      o.expansion = expansion(mol, m.expansion || 'et');
      const bc = g(m, 'bodyCoe');
      if (fin(bc)) o.glazeMinusBody = o.expansion - bc;
      const st = C.scene([0, 7, -0.1, 1.2]); // Stull's axes (1912): SiO2 (x) against Al2O3 (y) in the unity formula
      st.seg(0, 0, 7, 0, { c: 'muted', arrow: true });
      st.seg(0, 0, 0, 1.2, { c: 'muted', arrow: true });
      for (let x = 1; x <= 6; x++) st.txt(x, -0.06, { v: x, c: 'muted' });
      st.pt(o['umf.SiO2']!, o['umf.Al2O3']!, { c: 'hi', r: 6 });
      sc.stull = st.done();
    }
  }
  if (isObj(m.target) && Array.isArray(m.batch) && m.batch.length) {
    const mats = (m.batch as string[]).slice(0, 8),
      pgs = mats.map(n => perGram(n, own));
    const oxs = [
      ...new Set(Object.keys(m.target).concat(...(pgs.filter(Boolean) as Array<Record<string, number>>).map(p => Object.keys(p)))),
    ].filter(ox => OXM[ox]);
    const b = oxs.map(ox => ((m.target as Rec)[ox] !== undefined ? g(m.target, ox) : 0));
    const A = oxs.map(ox => pgs.map(p => (p && p[ox]) || 0));
    let x = lsq(A, b),
      neg = false;
    if (!x || x.some(v => v < -1e-9)) {
      neg = true;
      x = nnls(A, b);
    }
    const res =
      Math.sqrt(b.reduce((s, bi, k) => s + (bi - A[k]!.reduce((t, a, j) => t + a * x[j]!, 0)) ** 2, 0)) /
      Math.max(1e-12, Math.sqrt(b.reduce((s, v) => s + v * v, 0)));
    if (neg) I.add('negative-batch');
    const tot = x.reduce((s, v) => s + Math.max(0, v), 0);
    x.forEach((v, j) => {
      o[`batch.${j}`] = (100 * Math.max(0, v)) / tot;
    });
    o.batchResidual = res;
  }
  return { o, sr, sc };
}

/* ===================================================================================================================== */
/* metal — ring sizes: ISO 8653:2016 (inner circumference in mm); US d = 11.63 + 0.8128·n mm (industry convention);         */
/* UK/Ireland/Australia letters (BS 6820:1987, withdrawn 1993 for BS EN 28653 = ISO 8653; one letter = 1.25 mm, C = 40 mm)  */
/* C = 37.5 + 1.25·(i − 1) mm, A = 1 (verify: BS text not seen, only sources citing it); Japan d = 13 + (n−1)/3 mm (verify:  */
/* the trade's JCS convention, no standard found); Switzerland C − 40. AWG (ASTM B258): d = 0.127 mm · 92^((36 − n)/39).     */
/* SWG (Order in Council 23 Aug 1883; BS 3737:1964, withdrawn): all 57 sizes 7/0–50 checked against NBS Circular 31 (1914), */
/* Table X (nvlpubs.nist.gov/nistpubs/Legacy/circ/nbscircular31e3.pdf).                                                      */
/* Fineness k/24·1000; alloying x = m(F1 − F2)/(F2 − Fa); densities (g/cm³, 20 °C; alloys typical: verify).                  */
/* ===================================================================================================================== */
const SWG = [
  0.5, 0.464, 0.432, 0.4, 0.372, 0.348, 0.324, 0.3, 0.276, 0.252, 0.232, 0.212, 0.192, 0.176, 0.16, 0.144, 0.128, 0.116, 0.104, 0.092, 0.08,
  0.072, 0.064, 0.056, 0.048, 0.04, 0.036, 0.032, 0.028, 0.024, 0.022, 0.02, 0.018, 0.0164, 0.0148, 0.0136, 0.0124, 0.0116, 0.0108, 0.01,
  0.0092, 0.0084, 0.0076, 0.0068, 0.006, 0.0052, 0.0048, 0.0044, 0.004, 0.0036, 0.0032, 0.0028, 0.0024, 0.002, 0.0016, 0.0012, 0.001,
]; // 7/0 (index −6) … 50, inches
const DENS: Readonly<Record<string, readonly [number, number]>> = {
  'fine-gold': [19.32, 999],
  '22k': [17.8, 916],
  '18k': [15.5, 750],
  '14k': [13.1, 585],
  '9k': [11.2, 375],
  'fine-silver': [10.49, 999],
  britannia: [10.43, 958],
  sterling: [10.36, 925],
  platinum950: [20.7, 950],
  palladium950: [12.0, 950],
  copper: [8.96, 0],
  brass: [8.5, 0],
  bronze: [8.8, 0],
  titanium: [4.51, 0],
  steel: [7.85, 0],
};
function runMetal(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  const sz = g(m, 'size'),
    scale = m.scale || 'us';
  if (fin(sz)) {
    let d: number;
    if (scale === 'us') {
      d = 11.63 + 0.8128 * sz;
      if (sz < 0 || sz > 16) I.add('out-of-table');
    } else if (scale === 'uk') {
      d = (37.5 + 1.25 * (sz - 1)) / Math.PI;
      if (sz < 1 || sz > 32) I.add('out-of-table');
    } else if (scale === 'iso') {
      d = sz / Math.PI;
      if (sz < 37 || sz > 80) I.add('out-of-table');
    } else if (scale === 'jp') {
      d = 13 + (sz - 1) / 3;
      if (sz < 1 || sz > 35) I.add('out-of-table');
    } else if (scale === 'ch') {
      d = (sz + 40) / Math.PI;
      if (sz < 0 || sz > 40) I.add('out-of-table');
    } else d = sz;
    const Cc = Math.PI * d;
    Object.assign(o, {
      diameter: d,
      circumference: Cc,
      us: (d - 11.63) / 0.8128,
      uk: (Cc - 37.5) / 1.25 + 1,
      iso: Cc,
      jp: (d - 13) * 3 + 1,
      ch: Cc - 40,
    });
    const t = g(m, 'thickness'),
      w = g(m, 'width');
    if (fin(t)) o.blank = Math.PI * (d + t);
    if (fin(t) && fin(w)) o.bandVolume = Math.PI * (d + t) * t * w;
    const s = C.scene([-d, d, -d, d]);
    s.circ(0, 0, d / 2, { c: 'base' });
    if (fin(t)) s.circ(0, 0, d / 2 + t, { c: 'hi' });
    s.seg(-d / 2, 0, d / 2, 0, { c: 'muted', dash: true, v: d });
    sc.ring = s.done();
  }
  const dm = DENS[m.metal as string];
  o.density = g(m, 'density', dm ? dm[0] : NaN);
  if (dm) o.fineness = dm[1];
  if (fin(o.bandVolume)) o.bandMass = (o.bandVolume! * o.density) / 1000;
  const awg = g(m, 'awg'),
    swg = g(m, 'swg');
  if (fin(awg)) {
    o.awgMm = 0.127 * Math.pow(92, (36 - awg) / 39);
    if (awg < -3 || awg > 56) I.add('out-of-table');
  }
  if (fin(swg)) {
    let k = swg;
    if (!Number.isInteger(k)) {
      I.add('rounded');
      k = Math.round(k);
    }
    const v = SWG[k + 6];
    if (v === undefined) {
      I.add('out-of-table');
      o.swgMm = NaN;
    } else o.swgMm = v * 25.4;
  }
  const wl = g(m, 'wireLength'),
    wd = fin(o.awgMm) ? o.awgMm : o.swgMm;
  if (fin(wl) && fin(wd)) o.wireMass = (Math.PI * (wd! / 2) ** 2 * wl * o.density) / 1000;
  const k = g(m, 'karat');
  if (fin(k)) {
    o.fineness = (k / 24) * 1000;
    if (k <= 0 || k > 24) I.add('impossible');
  }
  const Al = m.alloy;
  if (isObj(Al)) {
    const mass = g(Al, 'mass'),
      F1 = g(Al, 'from'),
      F2 = g(Al, 'to');
    const Fa = g(Al, 'add', F2 < F1 ? 0 : 1000);
    const x = F2 < F1 ? (mass * (F1 - F2)) / (F2 - Fa) : (mass * (F2 - F1)) / (Fa - F2);
    if (!(x >= 0) || !fin(x) || (F2 < F1 ? Fa >= F2 : Fa <= F2)) {
      I.add('impossible');
      o.alloyAdd = NaN;
    } else o.alloyAdd = x;
  }
  return { o, sr: {}, sc };
}

/* ===================================================================================================================== */
/* book — a sheet folded f times at right angles: 2^f leaves, 2^(f+1) pages (folio, quarto, octavo, 16mo); the grain must run */
/* parallel to the spine (the last fold): short grain for odd f, long grain for even f; nested folios: front [P−2i | 2i+1],     */
/* back [2i+2 | P−2i−1]; creep ≈ (sheets − 1)·caliper. A. Watson, Hand Bookbinding (1963).                                    */
/* ===================================================================================================================== */
function runBook(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    sc: ModeResult['sc'] = {};
  const P = g(m, 'pages'),
    sps = g(m, 'sheetsPerSig'),
    f = Math.round(g(m, 'folds', 1));
  if (!(f >= 1 && f <= 4)) I.add('range');
  const pps = fin(sps) ? 4 * Math.round(sps) : 2 ** (f + 1);
  o.pagesPerSig = pps;
  o.signatures = Math.ceil(P / pps - 1e-9);
  o.blanks = o.signatures * pps - P;
  o.leaves = Math.ceil(P / 2 - 1e-9);
  o.sheets = pps / 4;
  const cal = g(m, 'caliper', 0.1);
  o.spine = o.leaves * cal + g(m, 'swell', 0) * o.signatures;
  o.creep = (o.sheets - 1) * cal;
  const ff = fin(sps) ? 1 : f;
  o.needGrain = ff % 2 ? 1 : 2; // 1 short grain, 2 long grain (of the full sheet)
  if (m.grain) {
    o.grainOk = (m.grain === 'short' ? 1 : 2) === o.needGrain ? 1 : 0;
    if (!o.grainOk) I.add('grain-wrong');
  }
  const i = Math.max(0, Math.min(o.sheets - 1, Math.round(g(m, 'sheet', 0))));
  const s = C.scene([-0.2, 4.4, -0.4, 2.8]);
  const pages = [
    [pps - 2 * i, 2 * i + 1],
    [2 * i + 2, pps - 2 * i - 1],
  ];
  pages.forEach((pr, side) => {
    const x0 = side * 2.2;
    s.poly([x0, 0, x0 + 2, 0, x0 + 2, 1.4, x0, 1.4], { c: side ? 'muted' : 'base' });
    s.seg(x0 + 1, -0.1, x0 + 1, 1.5, { c: 'hi', dash: true });
    s.txt(x0 + 0.5, 0.7, { v: pr[0], c: 'base' });
    s.txt(x0 + 1.5, 0.7, { v: pr[1], c: 'base' });
  });
  sc.imposition = s.done();
  return { o, sr: {}, sc };
}

/* leather — 1 oz = 1/64 in (veg-tan); saddle stitch: thread = 2(L + N·T) + 2·tail (two needles), rule of thumb 4×L
     (Al Stohlman, The Art of Hand Sewing Leather, 1977) */
function runLeather(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {};
  const oz = g(m, 'oz');
  if (fin(oz)) o.mm = (oz / 64) * 25.4;
  const L = g(m, 'seam'),
    p = g(m, 'pitch'),
    T = g(m, 'thickness', fin(o.mm) ? o.mm : NaN),
    tail = g(m, 'tail', 0);
  if (fin(L) && fin(p)) {
    const raw = L / p + 1;
    let N = raw;
    if (Math.abs(raw - Math.round(raw)) > 1e-9) {
      I.add('non-integer');
      N = Math.round(raw);
    }
    o.holes = N;
    o.adjustedPitch = L / (N - 1);
    o.spi = 25.4 / p;
    o.ruleOfThumb = 4 * L;
    if (fin(T)) {
      o.thread = 2 * (L + N * T) + 2 * tail;
      if (T >= p) I.add('range');
    }
  }
  return { o, sr: {}, sc: {} };
}
/* dye — depth of shade on the weight of fibre: dye g = DOS%·WOF; stock c % (c g per 100 ml): ml = g/(c/100); mordant % WOF;
     liquor ratio L:1 (J. Dean, Wild Color, 2010; C. Boutrup & C. Ellis, The Art and Science of Natural Dyes, 2018) */
function runDye(m: Rec, g: Getter, I: Issues): ModeResult {
  const o: ModeResult['o'] = {},
    wof = g(m, 'wof'),
    dos = g(m, 'dos');
  if (fin(dos)) {
    o.dyeGrams = (wof * dos) / 100;
    if (dos > 100 || dos < 0) I.add('range');
    const st = g(m, 'stock');
    if (fin(st)) o.stockMl = o.dyeGrams / (st / 100);
  }
  const mo = g(m, 'mordant');
  if (fin(mo)) o.mordantGrams = (wof * mo) / 100;
  const lq = g(m, 'liquor');
  if (fin(lq)) o.bathLitres = (wof * lq) / 1000;
  return { o, sr: {}, sc: {} };
}

const RUN: Readonly<Record<string, (m: Rec, g: Getter, I: Issues) => ModeResult>> = {
  fiber: runFiber,
  chart: runChart,
  weave: runWeave,
  stitch: runStitch,
  quilt: runQuilt,
  symmetry: runSymmetry,
  sew: runSew,
  wood: runWood,
  ceramic: runCeramic,
  metal: runMetal,
  book: runBook,
  leather: runLeather,
  dye: runDye,
};
/** compute a model (numbers resolved with env) → {scalars, series, scenes, issues} */
function compute(model: Rec, env: Rec | null | undefined, prepared: Prepared | null | undefined) {
  const R = resolver(prepared, env || {}),
    g = getter(R),
    I = issueBag();
  const f = RUN[model.mode as string];
  const r = f ? f(model, g, I) : { o: {}, sr: {}, sc: {} };
  return { scalars: r.o, series: r.sr, scenes: r.sc, issues: I.out };
}
/** run(spec, env, {prepared}) → {out: {<output id>: value}} */
function run(spec: Spec, env: Rec, opts?: { readonly prepared?: Prepared | null }) {
  const P = checkSpec(spec);
  if (C.hasErrors(P)) return { out: {} };
  const res = compute(spec.model as Rec, env, opts && opts.prepared);
  const out: Record<string, unknown> = {};
  for (const o of spec.outputs as Output[]) {
    if (o.kind === 'scalar')
      out[o.id] = o.of.startsWith('issue.') ? res.issues[o.of.slice(6)] || 0 : fin(res.scalars[o.of]) ? res.scalars[o.of] : NaN;
    else if (o.kind === 'series') out[o.id] = (res.series[o.of] || []).slice(0, C.MAX_POINTS);
    else out[o.id] = res.scenes[o.of] || { view: [-1, 1, -1, 1], items: [] };
  }
  return { out };
}
const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, prepare, scenes: true });
const API = Object.freeze({
  table: {
    model: { $by: 'mode', $cases: DATA.schema },
    outputs: {
      $by: 'mode',
      $cases: Object.fromEntries(
        DATA.modes.map(m => {
          const O = DATA.outs[m]!;
          return [
            m,
            {
              scalar: O.scalar.concat(
                O.issues.map(i => 'issue.' + i),
                ...Object.entries(O.prefix || {}).map(([p, l]) => l.map(x => p + x)),
              ),
              series: O.series,
              scene: O.scene,
            },
          ];
        }),
      ),
    },
  }, // the form of the activity author (src/engines/kernel/schema.ts)
  id: ID,
  DATA,
  checkSpec,
  exprs,
  keys,
  run,
  compute,
  engine: Object.freeze(engine),
  simEngine,
  // the engine's own functions and tables, for the tests
  distribute,
  shaping,
  runs,
  token,
  orbifoldCost,
  classifyWallpaper,
  classifyFrieze,
  canonVertex,
  GROUPS,
  emc,
  ffd,
  exactBins,
  coneTemp,
  coneNo,
  MINERALS,
  OXM,
  perGram,
  expansion,
  lsq,
  nnls,
  offset,
  area,
  isConvex,
  WOOD,
  ORTON,
  SWG,
  DENS,
});
export default API;
/* i18n-ignore-end */
