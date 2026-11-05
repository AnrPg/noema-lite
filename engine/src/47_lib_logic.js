/* ===================== interactive activities — logic@1, logic from truth tables to norms (docs/library/logic.md, docs/INTERACTIVE_LIBRARY.md §1) =====================
   A general engine of the library: one formula language (ASCII and Unicode) parsed with precise error codes and positions, and
   ~22 tasks over it — propositional (truth tables, equivalence, entailment, NNF/CNF/DNF/Tseitin, DPLL/CDCL with a trace, resolution,
   Fitch natural deduction checked line by line, Horn chaining), many-valued (K3, LP, Ł3, Łukasiewicz, Gödel, product), first-order
   (finite models, unification, resolution, prenex/Skolem, syllogisms), modal (Kripke models, frame correspondence, tableaux K/D/T/K4/S4),
   epistemic (multi-agent S5, public announcements, common and distributed knowledge, muddy children, Cheryl's birthday, consecutive
   numbers), temporal (LTL on finite and lasso traces, CTL by fixpoints, mutual exclusion), deontic (SDL = KD and its paradoxes, dyadic
   deontic logic on preference models, input/output logic out1–out4, norms with deadlines over agent traces: evalNorms / normMonitor,
   conflicts by lex superior / specialis / posterior) and abstract argumentation (Dung 1995: grounded, complete, preferred, stable).
   Sources of each method: beside it and in docs/library/logic.md. Pure JS, no DOM, no words for the learner: numbers, codes and the
   model's own formulas as short raw texts (`s`). Deterministic, bounded, never throws for a checked spec. Python twin of checkSpec /
   exprs / keys (with the same parser and its messages): tools/lib_logic.py. Tests: node tests/lib_logic.js, node tests/enginelib.js. */
(function noemaLibLogicModule(root) {
  /* i18n-ignore-start */   // code, not text: only codes, keys, numbers and the model's own formulas leave this engine
  'use strict';
  const C = root.NoemaLibCore;
  const ID = 'logic@1';
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const MAX_LEN = 2000, MAX_DEPTH = 100, MAX_ATOMS = 12, MAX_WORLDS = 32, MAX_STATES = 256, MAX_DOMAIN = 8, MAX_ARGS = 24, MAX_TRACE = 2000;
  const MAX_FORMULAS = 64, MAX_NORMS = 200, MAX_LINES = 200, MAX_DECISIONS = 100000, BUDGET = 200000, MAX_EVENTS = 2000, MAX_CLAUSES = 2000;

  /* =====================================================================================================================
     1. The formula language. One grammar; each task enables a language (a set of operators):
        prop · fol · modal · deontic · dyadic · epistemic · ltl · ctl.  Precedence (loosest first): ↔, → (right), ∨ ⊕, ∧,
        U R W (right, temporal), unary (¬ □ ◇ O P F K_a B_a C E D [φ] <φ> X F G AX… ∀x ∃x). Positions count characters (code points). */
  const LANGS = ['prop', 'fol', 'modal', 'deontic', 'dyadic', 'epistemic', 'ltl', 'ctl'];
  const WORDS = { not: 'not', and: 'and', or: 'or', implies: 'imp', iff: 'iff', xor: 'xor', true: 'top', false: 'bot', top: 'top', bot: 'bot', forall: 'all', exists: 'ex' };
  const SYM3 = { '<->': 'iff', '<=>': 'iff' };
  const SYM2 = { '->': 'imp', '=>': 'imp', '<>': 'dia', '[]': 'box', '/\\': 'and', '\\/': 'or', '!=': 'neq', '&&': 'and', '||': 'or' };
  const SYM1 = { '~': 'not', '!': 'not', '¬': 'not', '∼': 'not', '&': 'and', '∧': 'and', '|': 'or', '∨': 'or', '→': 'imp', '⇒': 'imp', '⊃': 'imp', '↔': 'iff',
    '⇔': 'iff', '≡': 'iff', '⊕': 'xor', '⊤': 'top', '⊥': 'bot', '∀': 'all', '∃': 'ex', '□': 'box', '◇': 'dia', '◊': 'dia', '≠': 'neq',
    '(': '(', ')': ')', '[': '[', ']': ']', '{': '{', '}': '}', ',': ',', '.': '.', ':': ':', '/': '/', '=': '=', '<': '<', '>': '>' };
  const isIdStart = c => /[A-Za-z_]/.test(c), isIdChar = c => /[A-Za-z0-9_]/.test(c), isSpace = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const ATOM_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  /** lex(text) → {toks: [{k: 'id' | 'op' | 'eof', v, raw, pos}]} or {err: {code, pos, msg}} */
  function lex(text) {
    const cs = Array.from(text), toks = [];
    let i = 0;
    while (i < cs.length) {
      const c = cs[i];
      if (isSpace(c)) { i++; continue; }
      if (isIdStart(c)) {
        let j = i; while (j < cs.length && isIdChar(cs[j])) j++;
        const w = cs.slice(i, j).join('');
        if (Object.prototype.hasOwnProperty.call(WORDS, w)) toks.push({ k: 'op', v: WORDS[w], raw: w, pos: i });
        else toks.push({ k: 'id', v: w, raw: w, pos: i });
        i = j; continue;
      }
      const s3 = cs.slice(i, i + 3).join(''), s2 = cs.slice(i, i + 2).join('');
      if (SYM3[s3]) { toks.push({ k: 'op', v: SYM3[s3], raw: s3, pos: i }); i += 3; continue; }
      if (SYM2[s2]) { toks.push({ k: 'op', v: SYM2[s2], raw: s2, pos: i }); i += 2; continue; }
      if (Object.prototype.hasOwnProperty.call(SYM1, c)) { toks.push({ k: 'op', v: SYM1[c], raw: c, pos: i }); i++; continue; }
      return { err: { code: 'parse-char', pos: i, msg: `unknown character "${c}" at ${i}` } };
    }
    toks.push({ k: 'eof', v: '', raw: '', pos: cs.length });
    return { toks };
  }
  const FEAT = {
    prop: {}, fol: { fol: 1 }, modal: { modal: 1 }, deontic: { modal: 1, deon: 1 }, dyadic: { modal: 1, deon: 1, dyad: 1 },
    epistemic: { epi: 1 }, ltl: { ltl: 1 }, ctl: { ctl: 1 },
  };
  const TEMP1 = ['X', 'F', 'G'], TEMP2 = ['U', 'R', 'W'], CTL2 = ['AX', 'AF', 'AG', 'EX', 'EF', 'EG'];
  const EPI_RE = /^(K|B)_([A-Za-z0-9]{1,16})$/, GRP_RE = /^(C|E|D)_([A-Za-z0-9]{1,16})$/;
  /** parse(text, lang) → {ok: true, ast} | {ok: false, code, pos, msg}; the same codes, positions and messages as tools/lib_logic.py */
  function parse(text, lang) {
    lang = lang || 'prop';
    const F = FEAT[lang] || {};
    const bad = (code, pos, msg) => { const e = new Error(code); e.perr = { code, pos, msg }; throw e; };
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, code: 'parse-empty', pos: 0, msg: 'the formula is empty' };
    if (Array.from(text).length > MAX_LEN) return { ok: false, code: 'parse-long', pos: MAX_LEN, msg: `longer than ${MAX_LEN} characters` };
    const L = lex(text);
    if (L.err) return { ok: false, ...L.err };
    const T = L.toks; let p = 0, depth = 0, barStop = false;
    const cur = () => T[p], nx = () => T[p + 1];
    const isOp = (t, v) => t.k === 'op' && t.v === v;
    const unexpected = t => (t.k === 'eof' ? bad('parse-eof', t.pos, `the formula ends too soon at ${t.pos}`) : bad('parse-token', t.pos, `unexpected "${t.raw}" at ${t.pos}`));
    const notHere = t => bad('parse-op', t.pos, `"${t.raw}" is not an operator of the ${lang} language at ${t.pos}`);
    const expect = (v, open) => { const t = cur(); if (isOp(t, v)) { p++; return; } if (t.k === 'eof' || t.k === 'op' || t.k === 'id') bad('parse-paren', t.pos, `"${v}" is missing (to close "${open.raw}" at ${open.pos}) at ${t.pos}`); };
    const enter = t => { if (++depth > MAX_DEPTH) bad('parse-deep', t.pos, `nested deeper than ${MAX_DEPTH} levels at ${t.pos}`); };
    function iff() { let a = imp(); while (isOp(cur(), 'iff')) { const t = cur(); p++; a = { t: 'iff', a, b: imp(), pos: t.pos }; } return a; }
    function imp() { const a = or(); if (isOp(cur(), 'imp')) { const t = cur(); p++; enter(t); const b = imp(); depth--; return { t: 'imp', a, b, pos: t.pos }; } return a; }
    function or() {
      let a = and();
      for (;;) {
        const t = cur();
        if (isOp(t, 'or') && !(barStop && t.raw === '|')) { p++; a = { t: 'or', a, b: and(), pos: t.pos }; }
        else if (isOp(t, 'xor')) { p++; a = { t: 'xor', a, b: and(), pos: t.pos }; }
        else return a;
      }
    }
    function and() { let a = bin(); while (isOp(cur(), 'and')) { const t = cur(); p++; a = { t: 'and', a, b: bin(), pos: t.pos }; } return a; }
    function bin() {
      const a = un(), t = cur();
      if ((F.ltl || F.ctl) && t.k === 'id' && TEMP2.includes(t.v)) { p++; enter(t); const b = bin(); depth--; return { t: t.v, a, b, pos: t.pos }; }
      return a;
    }
    function group(open, close) { const sv = barStop; barStop = false; const a = iff(); barStop = sv; expect(close, open); return a; }
    function un() {
      const t = cur(); enter(t);
      const r = un1(t); depth--; return r;
    }
    function un1(t) {
      if (t.k === 'op') {
        switch (t.v) {
          case 'not': p++; return { t: 'not', a: un(), pos: t.pos };
          case 'top': p++; return { t: 'top', pos: t.pos };
          case 'bot': p++; return { t: 'bot', pos: t.pos };
          case '(': p++; return group(t, ')');
          case 'all': case 'ex': {
            if (!F.fol) notHere(t);
            p++; const v = cur(); if (v.k !== 'id') unexpected(v);
            p++;
            if (isOp(cur(), '.') || isOp(cur(), ':')) { p++; return { t: t.v, v: v.v, a: iff(), pos: t.pos }; }
            return { t: t.v, v: v.v, a: un(), pos: t.pos };
          }
          case 'box': case 'dia': if (!F.modal) notHere(t); p++; return { t: t.v, a: un(), pos: t.pos };
          case '[': case '<': {
            const close = t.v === '[' ? ']' : '>';
            if (F.epi) { p++; const f = group(t, close); return { t: t.v === '[' ? 'ann' : 'annd', f, a: un(), pos: t.pos }; }
            if (F.modal && nx().k === 'id' && isOp(T[p + 2], close)) { p += 3; return { t: t.v === '[' ? 'box' : 'dia', ag: T[p - 2].v, a: un(), pos: t.pos }; }
            if (F.modal || t.v === '<') return unexpected(t);
            return notHere(t);
          }
          default: return unexpected(t);
        }
      }
      if (t.k === 'eof') return unexpected(t);
      const w = t.v;
      if (F.deon && (w === 'O' || w === 'P' || w === 'F')) {
        p++;
        if (F.dyad && isOp(cur(), '(')) {
          const open = cur(); p++;
          const sv = barStop; barStop = true; const a = iff(); barStop = sv;
          let c = null;
          if (isOp(cur(), '/') || (isOp(cur(), 'or') && cur().raw === '|')) { p++; const sv2 = barStop; barStop = true; c = iff(); barStop = sv2; }
          expect(')', open);
          return { t: w, a, c, pos: t.pos };
        }
        return { t: w, a: un(), pos: t.pos };
      }
      if (F.epi) {
        let m = EPI_RE.exec(w);
        if (m) { p++; return { t: m[1], ag: m[2], a: un(), pos: t.pos }; }
        if (w === 'K' || w === 'B') bad('parse-agent', t.pos, `${w} needs an agent (${w}_a) at ${t.pos}`);
        m = GRP_RE.exec(w);
        if (m) { p++; return { t: m[1] + 'K', g: [m[2]], a: un(), pos: t.pos }; }
        if ((w === 'C_' || w === 'E_' || w === 'D_') && isOp(nx(), '{')) {
          const open = nx(); p += 2; const g = [];
          for (;;) { const a = cur(); if (a.k !== 'id') unexpected(a); g.push(a.v); p++; if (isOp(cur(), ',')) { p++; continue; } break; }
          expect('}', open);
          return { t: w[0] + 'K', g, a: un(), pos: t.pos };
        }
        if (w === 'C' || w === 'E' || w === 'D') { p++; return { t: w + 'K', g: null, a: un(), pos: t.pos }; }
      }
      if (F.ltl && TEMP1.includes(w)) { p++; return { t: w === 'F' ? 'Fe' : w, a: un(), pos: t.pos }; }
      if ((F.ltl || F.ctl) && TEMP2.includes(w)) return unexpected(t);
      if (F.ctl) {
        if (CTL2.includes(w)) { p++; const o = w[1]; return { t: w[0] === 'A' ? 'A' : 'E', p: { t: o === 'F' ? 'Fe' : o, a: un(), pos: t.pos }, pos: t.pos }; }
        if (w === 'A' || w === 'E') {
          p++; const n = cur();
          if (n.k === 'id' && TEMP1.includes(n.v)) { p++; return { t: w, p: { t: n.v === 'F' ? 'Fe' : n.v, a: un(), pos: n.pos }, pos: t.pos }; }
          if (isOp(n, '[') || isOp(n, '(')) {
            p++; const inner = group(n, n.v === '[' ? ']' : ')');
            if (!TEMP2.includes(inner.t)) bad('parse-ctl', n.pos, `${w} needs a path formula (X, F, G, or φ U ψ, φ R ψ, φ W ψ) at ${n.pos}`);
            return { t: w, p: inner, pos: t.pos };
          }
          bad('parse-ctl', n.pos, `${w} needs a path formula (X, F, G, or φ U ψ, φ R ψ, φ W ψ) at ${n.pos}`);
        }
        if (TEMP1.includes(w)) bad('parse-ctl', t.pos, `${w} must stand right after A or E in CTL at ${t.pos}`);
      }
      p++;
      if (F.fol) {
        let args = null;
        if (isOp(cur(), '(')) args = termArgs(cur());
        if (isOp(cur(), '=') || isOp(cur(), 'neq')) {
          const op = cur(); p++;
          const r = term();
          const e = { t: 'eq', l: { t: 'fn', n: w, args: args || [] }, r, pos: op.pos };
          return op.v === 'neq' ? { t: 'not', a: e, pos: op.pos } : e;
        }
        return { t: 'pred', n: w, args: args || [], pos: t.pos };
      }
      return { t: 'atom', n: w, pos: t.pos };
    }
    function termArgs(open) {
      p++; const args = [];
      for (;;) { args.push(term()); if (isOp(cur(), ',')) { p++; continue; } break; }
      expect(')', open);
      return args;
    }
    function term() {
      const t = cur(); if (t.k !== 'id') unexpected(t);
      enter(t); p++;
      const r = { t: 'fn', n: t.v, args: isOp(cur(), '(') ? termArgs(cur()) : [] };
      depth--; return r;
    }
    try {
      const ast = iff();
      if (cur().k !== 'eof') unexpected(cur());
      if (F.ctl) ctlCheck(ast, false, bad);
      return { ok: true, ast };
    } catch (e) { if (e.perr) return { ok: false, ...e.perr }; throw e; }
  }
  // CTL: a temporal operator stands only right under A or E (Clarke & Emerson 1981)
  function ctlCheck(f, under, bad) {
    if (!f || typeof f !== 'object') return;
    if (['X', 'Fe', 'G', 'U', 'R', 'W'].includes(f.t) && !under) bad('parse-ctl', f.pos, `${f.t === 'Fe' ? 'F' : f.t} must stand right after A or E in CTL at ${f.pos}`);
    if (f.t === 'A' || f.t === 'E') { const q = f.p; ctlCheck(q.a, false, bad); if (q.b) ctlCheck(q.b, false, bad); return; }
    for (const k of ['a', 'b']) if (f[k]) ctlCheck(f[k], false, bad);
  }

  /* ---------- the AST: printing (Unicode, fewest parentheses), keys, atoms, sizes ---------- */
  const PREC = { iff: 1, imp: 2, or: 3, xor: 3, and: 4, U: 5, R: 5, W: 5 };
  const UN = { not: '¬', box: '□', dia: '◇', X: 'X', Fe: 'F', G: 'G' };
  function termStr(t) { return t.args.length ? t.n + '(' + t.args.map(termStr).join(',') + ')' : t.n; }
  /** show(ast) → its text in Unicode (¬ ∧ ∨ → ↔ ⊕ ⊤ ⊥ ∀ ∃ □ ◇ …) */
  function show(f) {
    const pr = f => (PREC[f.t] !== undefined ? PREC[f.t] : 9);
    const wrap = (g, lvl, right) => { const s = show(g); return pr(g) < lvl || (right && pr(g) === lvl && g.t !== 'and' && g.t !== 'or') ? '(' + s + ')' : s; };
    switch (f.t) {
      case 'atom': return f.n;
      case 'top': return '⊤';
      case 'bot': return '⊥';
      case 'pred': return f.args.length ? f.n + '(' + f.args.map(termStr).join(',') + ')' : f.n;
      case 'eq': return termStr(f.l) + '=' + termStr(f.r);
      case 'and': return wrap(f.a, 4) + ' ∧ ' + wrap(f.b, 4, true);
      case 'or': return wrap(f.a, 3) + ' ∨ ' + wrap(f.b, 3, true);
      case 'xor': return wrap(f.a, 3) + ' ⊕ ' + wrap(f.b, 3, true);
      case 'imp': return wrap(f.a, 3) + ' → ' + wrap(f.b, 2);
      case 'iff': return wrap(f.a, 1) + ' ↔ ' + wrap(f.b, 2);
      case 'U': case 'R': case 'W': return wrap(f.a, 6) + ' ' + f.t + ' ' + wrap(f.b, 5);
      case 'all': return '∀' + f.v + ' ' + wrap(f.a, 9);
      case 'ex': return '∃' + f.v + ' ' + wrap(f.a, 9);
      case 'box': case 'dia': return (f.ag ? (f.t === 'box' ? '[' + f.ag + ']' : '<' + f.ag + '>') : UN[f.t]) + wrap(f.a, 9);
      case 'not': case 'X': case 'Fe': case 'G': return UN[f.t] + wrap(f.a, 9);
      case 'O': case 'P': case 'F': return f.c ? f.t + '(' + show(f.a) + ' / ' + show(f.c) + ')' : f.t + wrap(f.a, 9);
      case 'K': case 'B': return f.t + '_' + f.ag + ' ' + wrap(f.a, 9);
      case 'CK': case 'EK': case 'DK': return f.t[0] + (f.g ? '_{' + f.g.join(',') + '}' : '') + ' ' + wrap(f.a, 9);
      case 'ann': return '[' + show(f.f) + ']' + wrap(f.a, 9);
      case 'annd': return '<' + show(f.f) + '>' + wrap(f.a, 9);
      case 'A': case 'E': { const q = f.p; return TEMP2.includes(q.t) ? f.t + '[' + show(q) + ']' : f.t + show(q); }
      default: return '?';
    }
  }
  const short = s => (Array.from(s).length > 64 ? Array.from(s).slice(0, 63).join('') + '…' : s);
  /** key(ast): a canonical text (structural equality of formulas) */
  const key = f => show(f);
  /** atoms(ast) → the propositional atoms in order of first appearance */
  function atomsOf(f, out) {
    out = out || [];
    (function go(g) {
      if (!g || typeof g !== 'object') return;
      if (g.t === 'atom') { if (!out.includes(g.n)) out.push(g.n); return; }
      for (const k of ['a', 'b', 'c', 'f', 'p']) if (g[k]) go(g[k]);
    })(f);
    return out;
  }
  function sizeOf(f) { let n = 0; (function go(g) { if (!g || typeof g !== 'object' || g.t === 'fn') return; n++; for (const k of ['a', 'b', 'c', 'f', 'p']) if (g[k]) go(g[k]); })(f); return n; }
  const A = n => ({ t: 'atom', n }), NOT = a => ({ t: 'not', a }), AND = (a, b) => ({ t: 'and', a, b }), OR = (a, b) => ({ t: 'or', a, b }), IMP = (a, b) => ({ t: 'imp', a, b });
  const TOP = { t: 'top' }, BOT = { t: 'bot' };
  const bigAnd = fs => (fs.length ? fs.reduce((x, y) => AND(x, y)) : TOP), bigOr = fs => (fs.length ? fs.reduce((x, y) => OR(x, y)) : BOT);
