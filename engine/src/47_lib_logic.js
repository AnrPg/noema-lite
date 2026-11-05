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
  const WORDS = { box: 'box', dia: 'dia', not: 'not', and: 'and', or: 'or', implies: 'imp', iff: 'iff', xor: 'xor', true: 'top', false: 'bot', top: 'top', bot: 'bot', forall: 'all', exists: 'ex' };
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
  const sp = (op, s) => op + (s[0] === '(' ? '' : ' ') + s;
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
      case 'not': if (f.a.t === 'eq') return termStr(f.a.l) + '≠' + termStr(f.a.r); return '¬' + wrap(f.a, 9);
      case 'X': case 'Fe': case 'G': return sp(UN[f.t], wrap(f.a, 9));
      case 'O': case 'P': case 'F': return f.c ? f.t + '(' + show(f.a) + ' / ' + show(f.c) + ')' : sp(f.t, wrap(f.a, 9));
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

  /* =====================================================================================================================
     2. Propositional logic */
  /** evalProp(ast, v) → boolean; v: {atom: boolean | 0/1} (an atom missing is false) */
  function evalProp(f, v) {
    switch (f.t) {
      case 'atom': return !!v[f.n];
      case 'top': return true;
      case 'bot': return false;
      case 'not': return !evalProp(f.a, v);
      case 'and': return evalProp(f.a, v) && evalProp(f.b, v);
      case 'or': return evalProp(f.a, v) || evalProp(f.b, v);
      case 'xor': return evalProp(f.a, v) !== evalProp(f.b, v);
      case 'imp': return !evalProp(f.a, v) || evalProp(f.b, v);
      case 'iff': return evalProp(f.a, v) === evalProp(f.b, v);
      default: return false;
    }
  }
  /** the rows of a truth table over atoms (row r: atom i is true when bit (n−1−i) of r is 1 — the textbook order, TT…T first is r = 2^n − 1;
      rows are listed from all-true down to all-false as in Copi / Enderton) */
  function rowsOf(atoms) {
    const n = atoms.length, N = 1 << n, out = [];
    for (let r = N - 1; r >= 0; r--) { const v = {}; atoms.forEach((a, i) => { v[a] = !!((r >> (n - 1 - i)) & 1); }); out.push(v); }
    return out;
  }
  /** truthTable(fs, atoms) → {atoms, rows: [v], cols: [[0|1 per formula]]} */
  function truthTable(fs, atoms) {
    atoms = atoms || fs.reduce((o, f) => atomsOf(f, o), []);
    const rows = rowsOf(atoms);
    return { atoms, rows, cols: fs.map(f => rows.map(v => (evalProp(f, v) ? 1 : 0))) };
  }

  /* ---------- many-valued logics: values in [0, 1] ----------
     K3: strong Kleene (Kleene 1938, Introduction to Metamathematics 1952 §64): ¬x = 1−x, ∧ = min, ∨ = max, x→y = max(1−x, y); designated {1}.
     LP: Priest 1979 (J. Phil. Logic 8:219), the K3 tables with designated {1, ½}.  Ł3 / łukasiewicz: Łukasiewicz 1920, x→y = min(1, 1−x+y).
     gödel: Gödel 1932 / Dummett 1959, x→y = 1 if x ≤ y else y, ¬x = x→0.  product: Hájek 1998 (Metamathematics of Fuzzy Logic),
     x→y = 1 if x ≤ y else y/x, ¬x = x→0.  ↔ = (x→y) ∧ (y→x); ⊕ = |x − y|. ∧ and ∨ are min and max in all of them (the lattice
     connectives; Łukasiewicz's strong ⊗ is x ⊗ y = max(0, x+y−1), not part of the language). */
  const MV = ['k3', 'lp', 'l3', 'lukasiewicz', 'godel', 'product'];
  function mvImp(logic, x, y) {
    if (logic === 'k3' || logic === 'lp') return Math.max(1 - x, y);
    if (logic === 'l3' || logic === 'lukasiewicz') return Math.min(1, 1 - x + y);
    if (logic === 'godel') return x <= y ? 1 : y;
    return x <= y ? 1 : y / x;
  }
  function mvNot(logic, x) { return logic === 'godel' || logic === 'product' ? (x === 0 ? 1 : 0) : 1 - x; }
  function evalMV(f, v, logic) {
    const E = g => evalMV(g, v, logic);
    switch (f.t) {
      case 'atom': { const x = v[f.n]; return isNum(x) ? Math.min(1, Math.max(0, x)) : 0; }
      case 'top': return 1;
      case 'bot': return 0;
      case 'not': return mvNot(logic, E(f.a));
      case 'and': return Math.min(E(f.a), E(f.b));
      case 'or': return Math.max(E(f.a), E(f.b));
      case 'xor': return Math.abs(E(f.a) - E(f.b));
      case 'imp': return mvImp(logic, E(f.a), E(f.b));
      case 'iff': { const x = E(f.a), y = E(f.b); return Math.min(mvImp(logic, x, y), mvImp(logic, y, x)); }
      default: return NaN;
    }
  }
  const mvLevels = (logic, n) => (logic === 'k3' || logic === 'lp' || logic === 'l3' ? [0, 0.5, 1] : Array.from({ length: n }, (_, i) => i / (n - 1)));
  const mvDesignated = (logic, x, thr) => (logic === 'lp' ? x >= 0.5 : x >= (thr == null ? 1 : thr) - 1e-12);

  /* ---------- normal forms ---------- */
  /** nnf(f): negation normal form (→ ↔ ⊕ removed, ¬ only on atoms; Enderton 2001 §1.5); modal / deontic / first-order operators pushed by duality */
  function nnf(f, neg) {
    neg = !!neg;
    switch (f.t) {
      case 'atom': case 'pred': case 'eq': return neg ? NOT(f) : f;
      case 'top': return neg ? BOT : TOP;
      case 'bot': return neg ? TOP : BOT;
      case 'not': return nnf(f.a, !neg);
      case 'and': return neg ? OR(nnf(f.a, true), nnf(f.b, true)) : AND(nnf(f.a), nnf(f.b));
      case 'or': return neg ? AND(nnf(f.a, true), nnf(f.b, true)) : OR(nnf(f.a), nnf(f.b));
      case 'imp': return neg ? AND(nnf(f.a), nnf(f.b, true)) : OR(nnf(f.a, true), nnf(f.b));
      case 'iff': return neg ? OR(AND(nnf(f.a), nnf(f.b, true)), AND(nnf(f.a, true), nnf(f.b))) : AND(OR(nnf(f.a, true), nnf(f.b)), OR(nnf(f.a), nnf(f.b, true)));
      case 'xor': return nnf({ t: 'iff', a: f.a, b: f.b }, !neg);
      case 'all': return { t: neg ? 'ex' : 'all', v: f.v, a: nnf(f.a, neg) };
      case 'ex': return { t: neg ? 'all' : 'ex', v: f.v, a: nnf(f.a, neg) };
      case 'box': return { t: neg ? 'dia' : 'box', ag: f.ag, a: nnf(f.a, neg) };
      case 'dia': return { t: neg ? 'box' : 'dia', ag: f.ag, a: nnf(f.a, neg) };
      case 'O': return f.c ? (neg ? NOT(f) : f) : { t: neg ? 'dia' : 'box', a: nnf(f.a, neg) };   // SDL: O = □, P = ◇, F = □¬ (von Wright 1951; KD)
      case 'P': return f.c ? (neg ? NOT(f) : f) : { t: neg ? 'box' : 'dia', a: nnf(f.a, neg) };
      case 'F': return f.c ? (neg ? NOT(f) : f) : { t: neg ? 'dia' : 'box', a: nnf(f.a, !neg) };
      default: return neg ? NOT(f) : f;
    }
  }
  /** clauses(f, limit) → [[literal]] by distribution over the NNF (literals: {n, s: true|false}); null when more than limit clauses */
  function cnfClauses(f, limit, dual) {
    const g = nnf(f);
    const AN = dual ? 'or' : 'and', OR_ = dual ? 'and' : 'or';
    function go(h) {
      if (h.t === 'top') return dual ? [[]] : [];
      if (h.t === 'bot') return dual ? [] : [[]];
      if (h.t === AN) { const a = go(h.a); if (!a) return null; const b = go(h.b); if (!b) return null; return a.length + b.length > limit ? null : a.concat(b); }
      if (h.t === OR_) {
        const a = go(h.a); if (!a) return null; const b = go(h.b); if (!b) return null;
        if (a.length * b.length > limit) return null;
        const out = []; for (const x of a) for (const y of b) out.push(x.concat(y)); return out;
      }
      if (h.t === 'atom') return [[{ n: h.n, s: true }]];
      if (h.t === 'not' && h.a.t === 'atom') return [[{ n: h.a.n, s: false }]];
      return [[{ n: '?' + show(h), s: true }]];   // a non-propositional subformula is kept as an opaque literal
    }
    const cl = go(g);
    if (!cl) return null;
    // simplify: drop duplicate literals and tautologies (p ∨ ¬p), drop duplicate clauses
    const seen = new Set(), out = [];
    for (const c of cl) {
      const m = new Map(); let taut = false;
      for (const l of c) { if (m.has(l.n) && m.get(l.n) !== l.s) taut = true; m.set(l.n, l.s); }
      if (taut) continue;
      const lits = [...m.entries()].map(([n, s]) => ({ n, s })).sort((x, y) => (x.n < y.n ? -1 : x.n > y.n ? 1 : (x.s ? 1 : 0) - (y.s ? 1 : 0)));
      const k = lits.map(l => (l.s ? '' : '¬') + l.n).join(',');
      if (!seen.has(k)) { seen.add(k); out.push(lits); }
    }
    return out;
  }
  const litStr = l => (l.s ? '' : '¬') + l.n;
  const clauseStr = (c, dual) => (c.length ? (c.length > 1 ? '(' : '') + c.map(litStr).join(dual ? ' ∧ ' : ' ∨ ') + (c.length > 1 ? ')' : '') : (dual ? '⊤' : '⊥'));
  /** tseitin(f) → {clauses, vars: number of new variables}: Tseitin 1968 (Studies in Constructive Mathematics II), one variable per
      connective, three clauses per binary ∧/∨, four per ↔ / ⊕; equisatisfiable with f, linear in its size */
  function tseitin(f) {
    const cl = [], memo = new Map(); let k = 0;
    const L = (n, s) => ({ n, s });
    function go(h) {
      if (h.t === 'atom') return L(h.n, true);
      if (h.t === 'not') { const a = go(h.a); return L(a.n, !a.s); }
      const ky = show(h); if (memo.has(ky)) return memo.get(ky);
      const x = '_t' + (++k), X = L(x, true), nX = L(x, false);
      if (h.t === 'top') cl.push([X]);
      else if (h.t === 'bot') cl.push([nX]);
      else {
        const a = go(h.a), b = go(h.b), na = L(a.n, !a.s), nb = L(b.n, !b.s);
        if (h.t === 'and') cl.push([nX, a], [nX, b], [X, na, nb]);
        else if (h.t === 'or') cl.push([nX, a, b], [X, na], [X, nb]);
        else if (h.t === 'imp') cl.push([nX, na, b], [X, a], [X, nb]);
        else if (h.t === 'iff') cl.push([nX, na, b], [nX, a, nb], [X, a, b], [X, na, nb]);
        else if (h.t === 'xor') cl.push([nX, a, b], [nX, na, nb], [X, na, b], [X, a, nb]);
      }
      memo.set(ky, X); return X;
    }
    const top = go(f); cl.push([top]);
    return { clauses: cl, vars: k };
  }

  /* ---------- SAT: DPLL (Davis, Logemann & Loveland 1962) and CDCL (Marques-Silva & Sakallah 1999, GRASP; first-UIP learning as in
     Chaff, Moskewicz et al. 2001), with a trace the learner can step through. Deterministic: decide the lowest-numbered unassigned
     variable, false first for DPLL's second branch order (true first). Budget: ≤ 10^5 decisions, ≤ 2·10^5 propagation visits. ---------- */
  function toDimacs(clauses) {
    const names = [], idx = new Map();
    const id = n => { if (!idx.has(n)) { idx.set(n, names.length + 1); names.push(n); } return idx.get(n); };
    // variables numbered in order of first appearance
    const cs = clauses.map(c => c.map(l => (l.s ? 1 : -1) * id(l.n)));
    return { cs, names };
  }
  function sat(clauses, solver, D) {
    const { cs, names } = toDimacs(clauses), n = names.length;
    const val = new Int8Array(n + 1), level = new Int32Array(n + 1), reason = new Array(n + 1).fill(null);
    const trail = [], ev = [], st = { decisions: 0, propagations: 0, conflicts: 0, learned: 0, backtracks: 0, ops: 0 };
    const E = e => { if (ev.length < MAX_EVENTS) ev.push(e); else D.add('trace-truncated'); };
    const lv = l => { const x = val[Math.abs(l)]; return x === 0 ? 0 : (l > 0 ? x : -x); };
    const db = cs.map(c => Array.from(new Set(c)));
    if (db.some(c => c.length === 0)) { E({ k: 'conflict', c: [], lvl: 0 }); return { sat: false, model: null, names, ev, st }; }
    let dl = 0;
    const assign = (l, why) => { const v = Math.abs(l); val[v] = l > 0 ? 1 : -1; level[v] = dl; reason[v] = why; trail.push(l); };
    function propagate() {   // naive unit propagation (every clause scanned; n and m are small in a lesson)
      for (let changed = true; changed;) {
        changed = false;
        for (let ci = 0; ci < db.length; ci++) {
          if (++st.ops > BUDGET) return -2;
          const c = db[ci]; let un = 0, unl = 0, satd = false;
          for (const l of c) { const x = lv(l); if (x > 0) { satd = true; break; } if (x === 0) { un++; unl = l; } }
          if (satd) continue;
          if (un === 0) return ci;
          if (un === 1) { assign(unl, ci); st.propagations++; E({ k: 'unit', l: unl, c: ci, lvl: dl }); changed = true; }
        }
      }
      return -1;
    }
    const pickVar = () => { for (let v = 1; v <= n; v++) if (!val[v]) return v; return 0; };
    const undoTo = lvl => { while (trail.length && level[Math.abs(trail[trail.length - 1])] > lvl) { const v = Math.abs(trail.pop()); val[v] = 0; reason[v] = null; } dl = lvl; };
    let result = null;
    if (solver === 'cdcl') {
      for (;;) {
        const cf = propagate();
        if (cf === -2) { D.add('budget'); break; }
        if (cf >= 0) {
          st.conflicts++; E({ k: 'conflict', c: cf, lvl: dl });
          if (dl === 0) { result = false; break; }
          // first-UIP conflict analysis (resolve backwards along the trail until one literal of the current level remains)
          let learnt = new Set(db[cf]);
          const curLvl = () => [...learnt].filter(l => level[Math.abs(l)] === dl).length;
          for (let i = trail.length - 1; i >= 0 && curLvl() > 1; i--) {
            const tl = trail[i], v = Math.abs(tl);
            if (!learnt.has(-tl) || reason[v] === null) continue;
            learnt.delete(-tl); for (const l of db[reason[v]]) if (Math.abs(l) !== v) learnt.add(l);
            if (++st.ops > BUDGET) break;
          }
          const lc = [...learnt].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
          db.push(lc); st.learned++; E({ k: 'learn', c: db.length - 1, lits: lc, lvl: dl });
          const back = lc.reduce((m, l) => (level[Math.abs(l)] < dl ? Math.max(m, level[Math.abs(l)]) : m), 0);
          undoTo(back); st.backtracks++; E({ k: 'back', lvl: back });
          if (db.length > MAX_CLAUSES * 5) { D.add('budget'); break; }
          continue;
        }
        const v = pickVar();
        if (!v) { result = true; break; }
        if (++st.decisions > MAX_DECISIONS) { D.add('budget'); break; }
        dl++; assign(-v, null); E({ k: 'decide', l: -v, lvl: dl });
      }
    } else {
      // DPLL with chronological backtracking: each decision literal remembers whether its other branch was tried
      const flipped = [];
      for (;;) {
        const cf = propagate();
        if (cf === -2) { D.add('budget'); break; }
        if (cf >= 0) {
          st.conflicts++; E({ k: 'conflict', c: cf, lvl: dl });
          while (flipped.length && flipped[flipped.length - 1].done) flipped.pop();
          if (!flipped.length) { result = false; break; }
          const top = flipped[flipped.length - 1]; undoTo(top.lvl - 1); top.done = true;
          st.backtracks++; E({ k: 'back', lvl: dl });
          dl = top.lvl; assign(-top.l, null); E({ k: 'flip', l: -top.l, lvl: dl });
          continue;
        }
        const v = pickVar();
        if (!v) { result = true; break; }
        if (++st.decisions > MAX_DECISIONS) { D.add('budget'); break; }
        while (flipped.length && flipped[flipped.length - 1].lvl > dl) flipped.pop();
        dl++; assign(v, null); flipped.push({ l: v, lvl: dl, done: false }); E({ k: 'decide', l: v, lvl: dl });
      }
    }
    const model = result ? Object.fromEntries(names.map((nm, i) => [nm, val[i + 1] > 0])) : null;
    return { sat: result, model, names, ev, st, db };
  }

  /* ---------- resolution refutation (Robinson 1965; the propositional saturation of Davis & Putnam 1960), with tautology and
     subsumption deletion, the proof of □ extracted from the parents ---------- */
  function resolution(clauses, D, bound) {
    const keyOf = c => c.map(litStr).join(',');
    const norm = c => { const m = new Map(); for (const l of c) { if (m.has(l.n) && m.get(l.n) !== l.s) return null; m.set(l.n, l.s); } return [...m.entries()].map(([n, s]) => ({ n, s })).sort((x, y) => (x.n < y.n ? -1 : x.n > y.n ? 1 : (x.s ? 1 : 0) - (y.s ? 1 : 0))); };
    const all = [], seen = new Map();
    const add = (c, par) => { const k = keyOf(c); if (seen.has(k)) return -1; seen.set(k, all.length); all.push({ c, par }); return all.length - 1; };
    for (const c of clauses) { const n = norm(c); if (n) add(n, null); }
    const subsumed = (c) => all.some(x => x.c.length <= c.length && x.c.every(l => c.some(m => m.n === l.n && m.s === l.s)));
    let empty = all.findIndex(x => x.c.length === 0), ops = 0, done = false;
    const limit = Math.min(bound || MAX_CLAUSES, MAX_CLAUSES);
    for (let i = 0; empty < 0 && !done && i < all.length; i++) {
      for (let j = 0; j < i && empty < 0; j++) {
        for (const l of all[i].c) {
          if (++ops > BUDGET) { D.add('budget'); done = true; break; }
          if (!all[j].c.some(m => m.n === l.n && m.s !== l.s)) continue;
          const r = norm(all[i].c.filter(m => m !== l).concat(all[j].c.filter(m => !(m.n === l.n && m.s !== l.s))));
          if (!r || subsumed(r)) continue;
          if (all.length >= limit) { D.add('bound'); done = true; break; }
          const k = add(r, [j, i, l.n]);
          if (k >= 0 && r.length === 0) { empty = k; break; }
        }
        if (done) break;
      }
    }
    let proof = [];
    if (empty >= 0) {
      const need = new Set(), st = [empty];
      while (st.length) { const k = st.pop(); if (need.has(k)) continue; need.add(k); if (all[k].par) st.push(all[k].par[0], all[k].par[1]); }
      proof = [...need].sort((a, b) => a - b);
    }
    return { refuted: empty >= 0, unknown: empty < 0 && done, all, proof, generated: all.length - clauses.length };
  }

  /* ---------- Horn clauses: forward chaining (the agenda algorithm PL-FC-ENTAILS, Russell & Norvig, AIMA 4th ed. 2020 §7.5.4; linear,
     Dowling & Gallier 1984) and backward chaining (goal-directed, depth-first with a loop check) ---------- */
  /** horn rule from a formula: p, ⊤ → p, a ∧ b → c, a ∧ b → ⊥ (a constraint); null when it is not Horn */
  function hornRule(f) {
    if (f.t === 'atom') return { body: [], head: f.n };
    if (f.t === 'imp') {
      const body = []; let ok = true;
      (function go(g) { if (g.t === 'and') { go(g.a); go(g.b); } else if (g.t === 'atom') body.push(g.n); else if (g.t !== 'top') ok = false; })(f.a);
      if (!ok) return null;
      if (f.b.t === 'atom') return { body, head: f.b.n };
      if (f.b.t === 'bot') return { body, head: null };
    }
    if (f.t === 'not' && f.a.t === 'atom') return { body: [f.a.n], head: null };
    return null;
  }
  function forwardChain(rules, goal, ev) {
    const count = rules.map(r => new Set(r.body).size), inferred = new Set(), agenda = [];
    rules.forEach((r, i) => { if (!count[i] && r.head) agenda.push([r.head, i]); });
    let found = false, contradiction = false, ops = 0;
    while (agenda.length && ops++ < BUDGET) {
      const [p, ri] = agenda.shift();
      if (inferred.has(p)) continue;
      inferred.add(p); if (ev.length < MAX_EVENTS) ev.push({ k: 'infer', a: p, r: ri });
      if (p === goal) found = true;
      rules.forEach((r, i) => {
        if (!new Set(r.body).has(p)) return;
        if (--count[i] === 0) { if (r.head) agenda.push([r.head, i]); else contradiction = true; }
      });
    }
    return { entails: found || inferred.has(goal), inferred: [...inferred], contradiction };
  }
  function backwardChain(rules, goal, ev) {
    let ops = 0;
    const proved = new Set();
    function prove(g, stack) {
      if (++ops > BUDGET) return false;
      if (proved.has(g)) return true;
      if (stack.includes(g)) { if (ev.length < MAX_EVENTS) ev.push({ k: 'loop', a: g }); return false; }
      if (ev.length < MAX_EVENTS) ev.push({ k: 'goal', a: g, d: stack.length });
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i]; if (r.head !== g) continue;
        if (r.body.every(b => prove(b, stack.concat([g])))) { proved.add(g); if (ev.length < MAX_EVENTS) ev.push({ k: 'proved', a: g, r: i, d: stack.length }); return true; }
      }
      if (ev.length < MAX_EVENTS) ev.push({ k: 'fail', a: g, d: stack.length });
      return false;
    }
    const ok = prove(goal, []);
    return { entails: ok, inferred: [...proved] };
  }

  /* ---------- natural deduction, Fitch style (Fitch 1952, Symbolic Logic; the rule names of Barwise & Etchemendy, Language, Proof and
     Logic 1999 / forall x: Calgary 2019): each line {f, rule, refs: [line], boxes: [line of a subproof's assumption], depth}. A line
     at depth d sees an earlier line when every subproof holding that line still holds it; a subproof is cited by its assumption and
     ends at its last line before the depth drops (or before a sibling assumption at the same depth). Each line gets a code. ---------- */
  const ND_RULES = ['premise', 'assume', 'reit', 'andI', 'andE', 'orI', 'orE', 'impI', 'impE', 'iffI', 'iffE', 'notI', 'notE', 'botE', 'dne', 'ip', 'lem', 'topI', 'mt'];
  const ND_ARITY = { premise: [0, 0], assume: [0, 0], reit: [1, 0], andI: [2, 0], andE: [1, 0], orI: [1, 0], orE: [1, 2], impI: [0, 1], impE: [2, 0], iffI: [0, 2],
    iffE: [2, 0], notI: [0, 1], notE: [2, 0], botE: [1, 0], dne: [1, 0], ip: [0, 1], lem: [0, 0], topI: [0, 0], mt: [2, 0] };
  const ND_CODES = ['nd-ok', 'nd-premise', 'nd-depth', 'nd-refs', 'nd-ref-later', 'nd-ref-closed', 'nd-box', 'nd-box-open', 'nd-rule', 'nd-parse'];
  function checkProof(lines, goal) {
    const n = lines.length, boxes = [], codes = [];
    // the stack of open subproofs (assumption line numbers, 1-based) at each line
    let stack = [];
    const ends = {};
    for (let i = 0; i < n; i++) {
      const L = lines[i], d = L.depth || 0;
      if (L.rule === 'assume') { if (d < 1 || d > stack.length + 1) { boxes.push(null); continue; } while (stack.length >= d) { ends[stack.pop()] = i; } stack.push(i + 1); }
      else { if (d > stack.length) { boxes.push(null); continue; } while (stack.length > d) ends[stack.pop()] = i; }
      boxes.push(stack.slice());
    }
    for (const a of stack) ends[a] = n;   // still open at the end
    const prefix = (a, b) => a.length <= b.length && a.every((x, k) => b[k] === x);
    const eq = (a, b) => a && b && key(a) === key(b);
    const tt = (f, ...k) => f && k.includes(f.t);
    let firstPremiseDone = false;
    for (let i = 0; i < n; i++) {
      const L = lines[i], f = L.ast, refs = L.refs || [], bx = L.boxes || [];
      const code = (() => {
        if (!f) return 'nd-parse';
        if (boxes[i] === null) return 'nd-depth';
        if (L.rule === 'premise') { if (firstPremiseDone || boxes[i].length) return 'nd-premise'; return 'nd-ok'; }
        firstPremiseDone = true;
        const [nr, nb] = ND_ARITY[L.rule];
        if (refs.length !== nr || bx.length !== nb) return 'nd-refs';
        const R = [];
        for (const j of refs) {
          if (j > i) return 'nd-ref-later';
          if (!lines[j - 1].ast || boxes[j - 1] === null || !prefix(boxes[j - 1], boxes[i])) return 'nd-ref-closed';
          R.push(lines[j - 1].ast);
        }
        const B = [];
        for (const a of bx) {
          if (a > i) return 'nd-ref-later';
          const la = lines[a - 1];
          if (!la || la.rule !== 'assume' || boxes[a - 1] === null || boxes[a - 1][boxes[a - 1].length - 1] !== a) return 'nd-box';
          if (ends[a] > i) return 'nd-box-open';
          if (!prefix(boxes[a - 1].slice(0, -1), boxes[i])) return 'nd-ref-closed';
          const last = lines[ends[a] - 1];
          if (!la.ast || !last.ast) return 'nd-box';
          B.push([la.ast, last.ast]);
        }
        const r = R[0], s = R[1];
        let good = false;
        switch (L.rule) {
          case 'assume': good = true; break;
          case 'reit': good = eq(f, r); break;
          case 'andI': good = tt(f, 'and') && ((eq(f.a, r) && eq(f.b, s)) || (eq(f.a, s) && eq(f.b, r))); break;
          case 'andE': good = tt(r, 'and') && (eq(f, r.a) || eq(f, r.b)); break;
          case 'orI': good = tt(f, 'or') && (eq(f.a, r) || eq(f.b, r)); break;
          case 'orE': good = tt(r, 'or') && eq(B[0][1], f) && eq(B[1][1], f) && ((eq(B[0][0], r.a) && eq(B[1][0], r.b)) || (eq(B[0][0], r.b) && eq(B[1][0], r.a))); break;
          case 'impI': good = tt(f, 'imp') && eq(B[0][0], f.a) && eq(B[0][1], f.b); break;
          case 'impE': good = (tt(r, 'imp') && eq(r.a, s) && eq(r.b, f)) || (tt(s, 'imp') && eq(s.a, r) && eq(s.b, f)); break;
          case 'iffI': good = tt(f, 'iff') && ((eq(B[0][0], f.a) && eq(B[0][1], f.b) && eq(B[1][0], f.b) && eq(B[1][1], f.a)) || (eq(B[1][0], f.a) && eq(B[1][1], f.b) && eq(B[0][0], f.b) && eq(B[0][1], f.a))); break;
          case 'iffE': good = [[r, s], [s, r]].some(([x, y]) => tt(x, 'iff') && ((eq(x.a, y) && eq(x.b, f)) || (eq(x.b, y) && eq(x.a, f)))); break;
          case 'notI': good = tt(f, 'not') && eq(B[0][0], f.a) && tt(B[0][1], 'bot'); break;
          case 'notE': good = tt(f, 'bot') && ((tt(s, 'not') && eq(s.a, r)) || (tt(r, 'not') && eq(r.a, s))); break;
          case 'botE': good = tt(r, 'bot'); break;
          case 'dne': good = tt(r, 'not') && tt(r.a, 'not') && eq(r.a.a, f); break;
          case 'ip': good = tt(B[0][0], 'not') && eq(B[0][0].a, f) && tt(B[0][1], 'bot'); break;
          case 'lem': good = tt(f, 'or') && tt(f.b, 'not') && eq(f.b.a, f.a); break;
          case 'topI': good = tt(f, 'top'); break;
          case 'mt': good = [[r, s], [s, r]].some(([x, y]) => tt(x, 'imp') && tt(y, 'not') && eq(y.a, x.b) && tt(f, 'not') && eq(f.a, x.a)); break;
          default: good = false;
        }
        return good ? 'nd-ok' : 'nd-rule';
      })();
      codes.push(code);
    }
    const errors = codes.filter(c => c !== 'nd-ok').length;
    const last = lines[n - 1];
    let concl = 'nd-ok';
    if (!n) concl = 'nd-empty';
    else if (boxes[n - 1] === null || boxes[n - 1].length) concl = 'nd-open';
    else if (goal && !eq(last.ast, goal)) concl = 'nd-goal';
    const first = codes.findIndex(c => c !== 'nd-ok');
    return { codes, errors, valid: !errors && concl === 'nd-ok', concl, firstError: first < 0 ? 0 : first + 1, boxes };
  }

  /* =====================================================================================================================
     3. First-order logic */
  /** free variables of a formula: identifiers of terms bound by no quantifier and not constants of the structure */
  function freeVars(f, consts) {
    const out = [];
    (function go(g, bound) {
      if (!g || typeof g !== 'object') return;
      if (g.t === 'fn') { if (!g.args.length) { if (!bound.includes(g.n) && !consts.has(g.n) && !out.includes(g.n)) out.push(g.n); } else g.args.forEach(a => go(a, bound)); return; }
      if (g.t === 'pred') { g.args.forEach(a => go(a, bound)); return; }
      if (g.t === 'eq') { go(g.l, bound); go(g.r, bound); return; }
      if (g.t === 'all' || g.t === 'ex') { go(g.a, bound.concat([g.v])); return; }
      for (const k of ['a', 'b']) if (g[k]) go(g[k], bound);
    })(f, []);
    return out;
  }
  /** a finite structure: {dom: [ids], preds: Map name → Set of tuple keys, funcs: Map name → Map key → element, consts: Map name → element} */
  function structure(m) {
    const dom = Array.isArray(m.domain) ? m.domain.slice() : Array.from({ length: m.size || 0 }, (_, i) => 'd' + i);
    const preds = new Map(), funcs = new Map(), consts = new Map();
    for (const p of m.preds || []) preds.set(p.name, new Set((p.tuples || []).map(t => t.join(','))));
    for (const fn of m.funcs || []) { const mp = new Map(); for (const row of fn.map || []) mp.set(row.slice(0, -1).join(','), row[row.length - 1]); funcs.set(fn.name, mp); }
    for (const c of m.consts || []) consts.set(c.name, c.value);
    for (const d of dom) if (!consts.has(d)) consts.set(d, d);   // every element names itself
    return { dom, preds, funcs, consts };
  }
  function evalTerm(t, S, env) {
    if (!t.args.length) return Object.prototype.hasOwnProperty.call(env, t.n) ? env[t.n] : S.consts.has(t.n) ? S.consts.get(t.n) : undefined;
    const fm = S.funcs.get(t.n); if (!fm) return undefined;
    return fm.get(t.args.map(a => evalTerm(a, S, env)).join(','));
  }
  /** evalFol(f, S, env, ctr) → boolean (Tarski 1933 satisfaction; quantifiers range over the finite domain) */
  function evalFol(f, S, env, ctr) {
    if (++ctr.ops > BUDGET * 5) { ctr.over = true; return false; }
    switch (f.t) {
      case 'pred': { const P = S.preds.get(f.n); if (!P) return false; return P.has(f.args.map(a => evalTerm(a, S, env)).join(',')); }
      case 'eq': { const a = evalTerm(f.l, S, env), b = evalTerm(f.r, S, env); return a !== undefined && a === b; }
      case 'top': return true;
      case 'bot': return false;
      case 'not': return !evalFol(f.a, S, env, ctr);
      case 'and': return evalFol(f.a, S, env, ctr) && evalFol(f.b, S, env, ctr);
      case 'or': return evalFol(f.a, S, env, ctr) || evalFol(f.b, S, env, ctr);
      case 'xor': return evalFol(f.a, S, env, ctr) !== evalFol(f.b, S, env, ctr);
      case 'imp': return !evalFol(f.a, S, env, ctr) || evalFol(f.b, S, env, ctr);
      case 'iff': return evalFol(f.a, S, env, ctr) === evalFol(f.b, S, env, ctr);
      case 'all': return S.dom.every(d => evalFol(f.a, S, { ...env, [f.v]: d }, ctr));
      case 'ex': return S.dom.some(d => evalFol(f.a, S, { ...env, [f.v]: d }, ctr));
      default: return false;
    }
  }
  /* ---------- unification: Robinson 1965 (J. ACM 12:23), in the Martelli & Montanari 1982 (ACM TOPLAS 4:258) rule form, with the
     occurs check. Variables: the names listed in vars (default: names that start with u, v, w, x, y or z). ---------- */
  const defaultVar = n => /^[u-z]/.test(n);
  function substT(t, s) { if (!t.args.length && s.has(t.n)) return substT(s.get(t.n), s); return t.args.length ? { t: 'fn', n: t.n, args: t.args.map(a => substT(a, s)) } : t; }
  function occurs(v, t, s) { t = substT(t, s); if (!t.args.length) return t.n === v; return t.args.some(a => occurs(v, a, s)); }
  function unify(pairs, isVar, ev) {
    const s = new Map(), work = pairs.slice(); let ops = 0;
    while (work.length) {
      if (++ops > BUDGET) return { ok: false, code: 'budget', s };
      let [a, b] = work.shift(); a = substT(a, s); b = substT(b, s);
      const va = !a.args.length && isVar(a.n), vb = !b.args.length && isVar(b.n);
      if (va && vb && a.n === b.n) { ev.push({ k: 'delete', a: termStr(a) }); continue; }
      if (!va && vb) { [a, b] = [b, a]; }
      if (!a.args.length && isVar(a.n)) {
        if (occurs(a.n, b, s)) { ev.push({ k: 'occurs', a: a.n, b: termStr(b) }); return { ok: false, code: 'occurs', s }; }
        s.set(a.n, b); ev.push({ k: 'bind', a: a.n, b: termStr(b) }); continue;
      }
      if (a.n !== b.n || a.args.length !== b.args.length) { ev.push({ k: 'clash', a: termStr(a), b: termStr(b) }); return { ok: false, code: 'clash', s }; }
      ev.push({ k: 'decompose', a: termStr(a), b: termStr(b) });
      a.args.forEach((x, i) => work.push([x, b.args[i]]));
    }
    const out = new Map(); for (const k of s.keys()) out.set(k, substT(s.get(k), s));
    return { ok: true, s: out };
  }
  /* ---------- prenex and Skolem normal forms (Skolem 1920; Enderton 2001 §2.6, Fitting 1996 §8): rename bound variables apart, NNF,
     pull quantifiers out left to right, replace each ∃ by a Skolem function of the ∀-variables before it ---------- */
  function renameApart(f) {
    let k = 0;
    const rnT = (t, m) => (!t.args.length && m.has(t.n) ? { t: 'fn', n: m.get(t.n), args: [] } : t.args.length ? { t: 'fn', n: t.n, args: t.args.map(a => rnT(a, m)) } : t);
    function go(g, m) {
      if (g.t === 'pred') return { t: 'pred', n: g.n, args: g.args.map(a => rnT(a, m)) };
      if (g.t === 'eq') return { t: 'eq', l: rnT(g.l, m), r: rnT(g.r, m) };
      if (g.t === 'all' || g.t === 'ex') { const nv = g.v + (++k); const m2 = new Map(m); m2.set(g.v, nv); return { t: g.t, v: nv, a: go(g.a, m2) }; }
      const o = { ...g }; for (const q of ['a', 'b']) if (g[q]) o[q] = go(g[q], m); return o;
    }
    return go(f, new Map());
  }
  function prenex(f) {
    const g = nnf(renameApart(f)), qs = [];
    function strip(h) {
      if (h.t === 'all' || h.t === 'ex') { qs.push([h.t, h.v]); return strip(h.a); }
      if (h.t === 'and' || h.t === 'or') return { t: h.t, a: strip(h.a), b: strip(h.b) };
      return h;
    }
    const m = strip(g);
    return { qs, matrix: m, ast: qs.reduceRight((acc, [q, v]) => ({ t: q, v, a: acc }), m) };
  }
  function skolem(f) {
    const { qs, matrix } = prenex(f), univ = [], s = new Map(); let k = 0;
    for (const [q, v] of qs) {
      if (q === 'all') univ.push(v);
      else { k++; s.set(v, { t: 'fn', n: 'sk' + k, args: univ.map(u => ({ t: 'fn', n: u, args: [] })) }); }
    }
    const sb = h => {
      if (h.t === 'pred') return { t: 'pred', n: h.n, args: h.args.map(a => substT(a, s)) };
      if (h.t === 'eq') return { t: 'eq', l: substT(h.l, s), r: substT(h.r, s) };
      const o = { ...h }; for (const q of ['a', 'b']) if (h[q]) o[q] = sb(h[q]); return o;
    };
    const m = sb(matrix);
    return { univ, matrix: m, ast: univ.reduceRight((acc, v) => ({ t: 'all', v, a: acc }), m), skolems: k };
  }
  /** first-order clauses of a sentence: Skolem form, CNF of the matrix; literals {p: pred AST, s} */
  function folClauses(f, tag) {
    const sk = skolem(f);
    const ren = new Map(sk.univ.map(v => [v, v.toUpperCase() + '_' + tag]));   // variables of a clause in upper case, apart per formula
    const rnT = t => (!t.args.length && ren.has(t.n) ? { t: 'fn', n: ren.get(t.n), args: [] } : t.args.length ? { t: 'fn', n: t.n, args: t.args.map(rnT) } : t);
    function go(h) {
      if (h.t === 'top') return [];
      if (h.t === 'bot') return [[]];
      if (h.t === 'and') { const a = go(h.a), b = go(h.b); return a && b && a.length + b.length <= 500 ? a.concat(b) : null; }
      if (h.t === 'or') { const a = go(h.a), b = go(h.b); if (!a || !b || a.length * b.length > 500) return null; const o = []; for (const x of a) for (const y of b) o.push(x.concat(y)); return o; }
      const neg = h.t === 'not', at = neg ? h.a : h;
      const p = at.t === 'eq' ? { t: 'pred', n: '=', args: [at.l, at.r] } : at;
      return [[{ p: { t: 'pred', n: p.n, args: p.args.map(rnT) }, s: !neg }]];
    }
    return go(sk.matrix);
  }
  const folLitStr = l => (l.s ? '' : '¬') + (l.p.args.length ? l.p.n + '(' + l.p.args.map(termStr).join(',') + ')' : l.p.n);
  const fvar = n => /^[A-Z]/.test(n) && n.includes('_');
  function tdepth(t) { return t.args.length ? 1 + Math.max(...t.args.map(tdepth)) : 0; }
  /** binary resolution with factoring (Robinson 1965), given-clause loop with a bound on clauses and term depth (≤ 4) */
  function folResolution(clauses, D, bound) {
    const all = [], seen = new Set();
    const ck = c => c.map(folLitStr).sort().join(' ∨ ');
    let ren = 0;
    const add = (c, par) => {
      if (c.some(l => l.p.args.some(a => tdepth(a) > 4))) return -1;
      for (const l of c) for (const m of c) if (l.s !== m.s && folLitStr({ ...l, s: true }) === folLitStr({ ...m, s: true })) return -1;   // a tautology
      const k = ck(c); if (seen.has(k)) return -1; seen.add(k); all.push({ c, par }); return all.length - 1;
    };
    clauses.forEach(c => add(c, null));
    const renameC = c => { ren++; const m = new Map(); const rt = t => (!t.args.length && fvar(t.n) ? (m.has(t.n) ? m.get(t.n) : (m.set(t.n, { t: 'fn', n: t.n.split('_')[0] + '_r' + ren, args: [] }), m.get(t.n))) : t.args.length ? { t: 'fn', n: t.n, args: t.args.map(rt) } : t); return c.map(l => ({ p: { t: 'pred', n: l.p.n, args: l.p.args.map(rt) }, s: l.s })); };
    const app = (c, s) => c.map(l => ({ p: { t: 'pred', n: l.p.n, args: l.p.args.map(a => substT(a, s)) }, s: l.s }));
    const dedupe = c => { const o = [], ks = new Set(); for (const l of c) { const k = folLitStr(l); if (!ks.has(k)) { ks.add(k); o.push(l); } } return o; };
    let empty = all.findIndex(x => !x.c.length), ops = 0, done = false;
    const limit = Math.min(bound || 500, MAX_CLAUSES);
    for (let i = 0; empty < 0 && !done && i < all.length; i++) {
      for (let j = 0; j <= i && empty < 0 && !done; j++) {
        const ci = all[i].c, cj = renameC(all[j].c);
        for (let a = 0; a < ci.length && empty < 0 && !done; a++) for (let b = 0; b < cj.length; b++) {
          if (++ops > BUDGET) { D.add('budget'); done = true; break; }
          const la = ci[a], lb = cj[b];
          if (la.s === lb.s || la.p.n !== lb.p.n || la.p.args.length !== lb.p.args.length) continue;
          const u = unify(la.p.args.map((x, k) => [x, lb.p.args[k]]), fvar, []);
          if (!u.ok) continue;
          const r = dedupe(app(ci.filter((_, k) => k !== a).concat(cj.filter((_, k) => k !== b)), u.s));
          if (all.length >= limit) { D.add('bound'); done = true; break; }
          const k = add(r, [j, i]);
          if (k >= 0 && !r.length) { empty = k; break; }
        }
      }
    }
    let proof = [];
    if (empty >= 0) { const need = new Set(), st = [empty]; while (st.length) { const k = st.pop(); if (need.has(k)) continue; need.add(k); if (all[k].par) st.push(...all[k].par); } proof = [...need].sort((a, b) => a - b); }
    return { refuted: empty >= 0, unknown: empty < 0, all, proof, generated: all.length - clauses.length, str: c => c.map(folLitStr).join(' ∨ ') || '□' };
  }
  /* ---------- categorical syllogisms: the Boolean (modern, Venn 1880) and the traditional (existential import, Aristotle, Prior
     Analytics) readings, decided over the 8 regions of the Venn diagram of S, M, P (2^8 cases). Figures (premise order major, minor):
     1 M-P S-M · 2 P-M S-M · 3 M-P M-S · 4 P-M M-S; conclusion S-P. 15 forms are valid without import, 24 with it. ---------- */
  const FIG = { 1: [['M', 'P'], ['S', 'M']], 2: [['P', 'M'], ['S', 'M']], 3: [['M', 'P'], ['M', 'S']], 4: [['P', 'M'], ['M', 'S']] };
  const TERMS = { S: 0, M: 1, P: 2 };
  function region(r, t) { return (r >> TERMS[t]) & 1; }
  function holdsCat(type, x, y, ne) {   // ne: bitmask of non-empty regions
    let some = false, someNot = false;
    for (let r = 0; r < 8; r++) if ((ne >> r) & 1) { if (region(r, x) && region(r, y)) some = true; if (region(r, x) && !region(r, y)) someNot = true; }
    return type === 'A' ? !someNot : type === 'E' ? !some : type === 'I' ? some : someNot;
  }
  function syllogism(mood, figure, existential) {
    const pr = FIG[figure], m = mood.split('');
    let valid = true, forcedEmpty = 255, forcedFull = 255, any = false;
    for (let ne = 0; ne < 256; ne++) {
      if (!holdsCat(m[0], pr[0][0], pr[0][1], ne) || !holdsCat(m[1], pr[1][0], pr[1][1], ne)) continue;
      if (existential && !['S', 'M', 'P'].every(t => { for (let r = 0; r < 8; r++) if (((ne >> r) & 1) && region(r, t)) return true; return false; })) continue;
      any = true; forcedEmpty &= ~ne; forcedFull &= ne;
      if (!holdsCat(m[2], 'S', 'P', ne)) valid = false;
    }
    return { valid: any && valid, empty: forcedEmpty, full: any ? forcedFull : 0 };
  }

  /* =====================================================================================================================
     4. Kripke models: modal, deontic (SDL), epistemic (multi-agent, with public announcements) and dyadic deontic (preference) */
  /** a model {n, ids, rel: {agent: Uint8Array(n·n)}, val: {atom: Uint8Array(n)}, rank: [n]}; '' is the agent of the plain □ / O */
  function kmodel(worlds, edges, opts) {
    const n = worlds.length, ids = worlds.map(w => w.id), idx = new Map(ids.map((s, i) => [s, i])), rel = {}, val = {};
    const R = ag => rel[ag] || (rel[ag] = new Uint8Array(n * n));
    for (const ag of (opts && opts.agents) || []) R(ag);
    R('');
    for (const e of edges) { const u = idx.get(e.u), v = idx.get(e.v); if (u === undefined || v === undefined) continue; R(e.ag || '')[u * n + v] = 1; if (opts && opts.sym) R(e.ag || '')[v * n + u] = 1; }
    worlds.forEach((w, i) => { for (const a of w.holds || []) (val[a] || (val[a] = new Uint8Array(n)))[i] = 1; });
    return { n, ids, idx, rel, val, rank: worlds.map(w => (isNum(w.rank) ? w.rank : 0)) };
  }
  /** close a relation into an equivalence (reflexive, symmetric, transitive closure: Warshall 1962) */
  function equivClose(r, n) {
    for (let i = 0; i < n; i++) { r[i * n + i] = 1; for (let j = 0; j < n; j++) if (r[i * n + j]) r[j * n + i] = 1; }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (r[i * n + k]) for (let j = 0; j < n; j++) if (r[k * n + j]) r[i * n + j] = 1;
    return r;
  }
  function transClose(r, n) { const t = r.slice(); for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (t[i * n + k]) for (let j = 0; j < n; j++) if (t[k * n + j]) t[i * n + j] = 1; return t; }
  /** frame properties (Blackburn, de Rijke & Venema, Modal Logic 2001, §3.1 and table 4.1) */
  function frameProps(r, n) {
    let refl = true, ser = true, sym = true, tr = true, euc = true;
    for (let i = 0; i < n; i++) {
      if (!r[i * n + i]) refl = false;
      let any = false; for (let j = 0; j < n; j++) if (r[i * n + j]) { any = true; if (!r[j * n + i]) sym = false; }
      if (!any) ser = false;
      for (let j = 0; j < n; j++) if (r[i * n + j]) for (let k = 0; k < n; k++) if (r[i * n + k] && !r[j * n + k]) euc = false;
      for (let j = 0; j < n; j++) if (r[i * n + j]) for (let k = 0; k < n; k++) if (r[j * n + k] && !r[i * n + k]) tr = false;
    }
    return { reflexive: refl, serial: ser, symmetric: sym, transitive: tr, euclidean: euc };
  }
  /* the axioms and the frame conditions they define (Sahlqvist 1975; BdRV 2001 Thm 3.54): T □p→p reflexive · D □p→◇p serial ·
     4 □p→□□p transitive · 5 ◇p→□◇p euclidean · B p→□◇p symmetric. axiomValid checks a schema on the frame by every valuation of p
     (n ≤ 14 worlds: 2^n valuations); beyond that the engine answers by the correspondence (code correspondence). */
  const AXIOMS = { axT: 'box p -> p', axD: 'box p -> dia p', ax4: 'box p -> box box p', ax5: 'dia p -> box dia p', axB: 'p -> box dia p' };
  const AX_PROP = { axT: 'reflexive', axD: 'serial', ax4: 'transitive', ax5: 'euclidean', axB: 'symmetric' };
  function axiomValid(name, r, n, D) {
    if (n > 14) { D.add('correspondence'); return frameProps(r, n)[AX_PROP[name]]; }
    const f = parse(AXIOMS[name], 'modal').ast, M = { n, rel: { '': r }, val: { p: new Uint8Array(n) }, rank: [] };
    for (let v = 0; v < (1 << n); v++) {
      for (let i = 0; i < n; i++) M.val.p[i] = (v >> i) & 1;
      const s = satK(f, M, null);
      for (let i = 0; i < n; i++) if (!s[i]) return false;
    }
    return true;
  }
  /** satK(f, M, ctx) → Uint8Array of the worlds where f holds (model checking by subformulas, BdRV 2001 §1.3; Fagin, Halpern, Moses &
      Vardi, Reasoning About Knowledge 1995 for K_a, E_G, C_G (transitive closure of the union), D_G (intersection); Plaza 1989 /
      van Ditmarsch, van der Hoek & Kooi, Dynamic Epistemic Logic 2007 for [φ]ψ: true at w iff φ fails at w or ψ holds at w in the
      model restricted to the φ-worlds; dyadic O(b / a): Hansson 1969, Åqvist 1987 (system E): every best a-world (lowest rank) is a
      b-world — the same at every world; O b alone = O(b / ⊤) there) */
  function satK(f, M, ctx) {
    const n = M.n, out = new Uint8Array(n), S = g => satK(g, M, ctx);
    const relOf = ag => (ag === '*' ? new Uint8Array(n * n).fill(1) : M.rel[ag || ''] || new Uint8Array(n * n));
    const boxR = (r, s) => { for (let i = 0; i < n; i++) { let ok = 1; for (let j = 0; j < n; j++) if (r[i * n + j] && !s[j]) { ok = 0; break; } out[i] = ok; } return out; };
    const diaR = (r, s) => { for (let i = 0; i < n; i++) { let ok = 0; for (let j = 0; j < n; j++) if (r[i * n + j] && s[j]) { ok = 1; break; } out[i] = ok; } return out; };
    const group = g => (g && g.length ? g : Object.keys(M.rel).filter(a => a !== ''));
    if (ctx && ++ctx.ops > BUDGET) { ctx.over = true; return out; }
    switch (f.t) {
      case 'atom': { const v = M.val[f.n]; if (v) out.set(v); return out; }
      case 'top': out.fill(1); return out;
      case 'bot': return out;
      case 'not': { const a = S(f.a); for (let i = 0; i < n; i++) out[i] = 1 - a[i]; return out; }
      case 'and': case 'or': case 'imp': case 'iff': case 'xor': {
        const a = S(f.a), b = S(f.b);
        for (let i = 0; i < n; i++) out[i] = +(f.t === 'and' ? a[i] && b[i] : f.t === 'or' ? a[i] || b[i] : f.t === 'imp' ? !a[i] || b[i] : f.t === 'iff' ? a[i] === b[i] : a[i] !== b[i]);
        return out;
      }
      case 'box': return boxR(relOf(f.ag), S(f.a));
      case 'dia': return diaR(relOf(f.ag), S(f.a));
      case 'O': case 'P': case 'F': {
        if (f.c !== undefined && (f.c !== null || (ctx && ctx.dyadic))) {
          const a = f.c ? S(f.c) : new Uint8Array(n).fill(1), b = S(f.a);
          let best = Infinity; for (let i = 0; i < n; i++) if (a[i]) best = Math.min(best, M.rank[i]);
          if (best === Infinity && ctx) ctx.D.add('vacuous');
          const all = want => { for (let i = 0; i < n; i++) if (a[i] && M.rank[i] === best && !!b[i] !== want) return false; return true; };
          const v = f.t === 'O' ? all(true) : f.t === 'F' ? all(false) : !all(false);
          out.fill(v ? 1 : 0); return out;
        }
        const r = relOf(''), s = S(f.a);
        if (f.t === 'O') return boxR(r, s);
        if (f.t === 'P') return diaR(r, s);
        const ns = s.map(x => 1 - x); return boxR(r, ns);
      }
      case 'K': case 'B': return boxR(relOf(f.ag), S(f.a));
      case 'EK': case 'CK': case 'DK': {
        const G = group(f.g), r = new Uint8Array(n * n);
        if (f.t === 'DK') { r.fill(1); for (const a of G) { const ra = relOf(a); for (let i = 0; i < n * n; i++) r[i] &= ra[i]; } }
        else for (const a of G) { const ra = relOf(a); for (let i = 0; i < n * n; i++) r[i] |= ra[i]; }
        return boxR(f.t === 'CK' ? transClose(r, n) : r, S(f.a));
      }
      case 'ann': case 'annd': {
        const s = S(f.f), sub = restrict(M, s), t = satK(f.a, sub.M, ctx);
        for (let i = 0; i < n; i++) out[i] = f.t === 'ann' ? +(!s[i] || t[sub.map[i]]) : +(!!s[i] && !!t[sub.map[i]]);
        return out;
      }
      default: return out;
    }
  }
  /** the submodel on the worlds of keep (a public announcement) → {M, map: old index → new index} */
  function restrict(M, keep) {
    const old = []; for (let i = 0; i < M.n; i++) if (keep[i]) old.push(i);
    const n = old.length, map = new Int32Array(M.n).fill(-1); old.forEach((o, k) => { map[o] = k; });
    const rel = {}; for (const [ag, r] of Object.entries(M.rel)) { const q = new Uint8Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) q[i * n + j] = r[old[i] * M.n + old[j]]; rel[ag] = q; }
    const val = {}; for (const [a, v] of Object.entries(M.val)) val[a] = Uint8Array.from(old.map(o => v[o]));
    return { M: { n, ids: old.map(o => M.ids[o]), rel, val, rank: old.map(o => M.rank[o]), orig: old.map(o => (M.orig ? M.orig[o] : o)) }, map };
  }

  /* ---------- epistemic puzzles as models (each world names its atoms; agents' relations are partitions) ---------- */
  function partitionRel(n, cls) { const r = new Uint8Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (cls[i] === cls[j]) r[i * n + j] = 1; return r; }
  /** puzzle(pz) → {M, actual, announce: [text], agents, lang} */
  function puzzle(pz) {
    if (pz.kind === 'muddy') {
      // Muddy children (Littlewood 1953; Fagin, Halpern, Moses & Vardi 1995 §1.1): worlds = who is muddy; child i sees all but herself
      const n = pz.n || 3, N = 1 << n, worlds = [], agents = [];
      for (let w = 0; w < N; w++) worlds.push({ id: 'w' + Array.from({ length: n }, (_, i) => (w >> i) & 1).join(''), holds: Array.from({ length: n }, (_, i) => ((w >> i) & 1 ? 'm' + (i + 1) : null)).filter(Boolean) });
      const M = kmodel(worlds, []); M.rel = {};
      for (let i = 0; i < n; i++) { agents.push('c' + (i + 1)); M.rel['c' + (i + 1)] = partitionRel(N, Array.from({ length: N }, (_, w) => w & ~(1 << i))); }
      M.rel[''] = new Uint8Array(N * N);
      const mud = (pz.muddy || 1), act = (1 << Math.min(mud, n)) - 1;
      const someone = Array.from({ length: n }, (_, i) => 'm' + (i + 1)).join(' | ');
      const nobody = Array.from({ length: n }, (_, i) => `~(K_c${i + 1} m${i + 1} | K_c${i + 1} ~m${i + 1})`).join(' & ');
      return { M, actual: act, announce: [someone].concat(Array.from({ length: n }, () => nobody)), agents };
    }
    if (pz.kind === 'cheryl') {
      // Cheryl's birthday (Singapore and Asian Schools Math Olympiad 2015, Q24); Albert is told the month, Bernard the day
      const D = [['may', 15], ['may', 16], ['may', 19], ['june', 17], ['june', 18], ['july', 14], ['july', 16], ['august', 14], ['august', 15], ['august', 17]];
      const worlds = D.map(([m, d]) => ({ id: m + d, holds: [m, 'd' + d, m + d] }));
      const M = kmodel(worlds, []); const n = D.length;
      M.rel = { '': new Uint8Array(n * n), a: partitionRel(n, D.map(x => x[0])), b: partitionRel(n, D.map(x => String(x[1]))) };
      const ka = D.map(([m, d]) => 'K_a ' + m + d).join(' | '), kb = D.map(([m, d]) => 'K_b ' + m + d).join(' | ');
      return { M, actual: 6, announce: [`~(${ka}) & K_a ~(${kb})`, `${kb}`, `${ka}`], agents: ['a', 'b'] };
    }
    if (pz.kind === 'consecutive') {
      // Consecutive numbers (Littlewood 1953; van Ditmarsch, van der Hoek & Kooi 2007 §4.13): Anne and Bill hold n and n ± 1,
      // each sees only their own; cut at max (the boundary pairs are flagged)
      const top = pz.n || 8, worlds = [], A = [], B = [];
      for (let a = 0; a <= top; a++) for (const b of [a - 1, a + 1]) if (b >= 0 && b <= top) { worlds.push({ id: 'a' + a + 'b' + b, holds: ['a' + a, 'b' + b] }); A.push(a); B.push(b); }
      const M = kmodel(worlds, []), n = worlds.length;
      M.rel = { '': new Uint8Array(n * n), a: partitionRel(n, A), b: partitionRel(n, B) };
      const va = pz.a !== undefined ? pz.a : 2, vb = pz.b !== undefined ? pz.b : 3;
      const act = worlds.findIndex(w => w.id === 'a' + va + 'b' + vb);
      const knowsA = Array.from({ length: top + 1 }, (_, b) => 'K_a b' + b).join(' | '), knowsB = Array.from({ length: top + 1 }, (_, a) => 'K_b a' + a).join(' | ');
      const ann = []; for (let k = 0; k < 6; k++) ann.push(k % 2 ? `~(${knowsB})` : `~(${knowsA})`);
      return { M, actual: act < 0 ? 0 : act, announce: ann, agents: ['a', 'b'] };
    }
    return null;
  }

  /* ---------- modal tableaux for K, D, T, K4, S4 (Fitting 1983, Proof Methods for Modal and Intuitionistic Logics; Goré 1999, Handbook of
     Tableau Methods ch. 6): formulas in NNF; α (∧), β (∨, by backtracking), T (□φ ⇒ φ, reflexive systems), π (each ◇ψ opens a world
     with ψ and every φ of □φ; K4/S4 also carry □φ itself), D (a world with □s and no ◇ still gets a successor), and for K4/S4
     ancestor blocking (a new world whose set is included in an ancestor's is not expanded). Budget: 20 000 nodes. ---------- */
  const SYSTEMS = ['K', 'D', 'T', 'K4', 'S4'];
  function tableau(fs, system, D) {
    const refl = system === 'T' || system === 'S4', trans = system === 'K4' || system === 'S4', serial = system === 'D' || refl;
    const ev = []; let nodes = 0, worlds = 0, over = false;
    const E = e => { if (ev.length < MAX_EVENTS) ev.push(e); else D.add('trace-truncated'); };
    const K = f => key(f);
    function satSet(init, anc, wid) {
      if (++nodes > 20000) { over = true; return false; }
      const set = new Map(), todo = init.slice(), ors = [];
      while (todo.length) {
        const f = todo.pop(), k = K(f);
        if (set.has(k)) continue;
        set.set(k, f);
        if (f.t === 'and') todo.push(f.b, f.a);
        else if (f.t === 'or') ors.push(f);
        else if (f.t === 'box' && refl) todo.push(f.a);
      }
      for (const f of set.values()) {
        if (f.t === 'bot' || (f.t === 'not' && f.a.t === 'top')) { E({ k: 'clash', w: wid, s: '⊥' }); return false; }
        if (f.t === 'not' && set.has(K(f.a))) { E({ k: 'clash', w: wid, s: show(f.a) }); return false; }
      }
      const open = ors.find(f => !set.has(K(f.a)) && !set.has(K(f.b)));
      if (open) {
        for (const side of [open.a, open.b]) {
          E({ k: 'branch', w: wid, s: show(side) });
          if (satSet([...set.values()].filter(f => f !== open).concat([side]), anc, wid)) return true;
          if (over) return false;
        }
        return false;
      }
      const all = [...set.values()], boxes = all.filter(f => f.t === 'box'), dias = all.filter(f => f.t === 'dia');
      const succ = dias.map(f => f.a);
      if (!succ.length && serial && boxes.length && !refl) succ.push(TOP);
      const keys = new Set(set.keys()), chain = anc.concat([keys]);
      for (const s of succ) {
        const lab = [s].concat(boxes.map(b => b.a), trans ? boxes : []);
        if (trans) {
          const lk = lab.map(K);
          if (chain.some(a => lk.every(k => a.has(k)))) { E({ k: 'block', w: wid, s: show(s) }); continue; }
        }
        const id = ++worlds; E({ k: 'world', w: id, from: wid, s: show(s) });
        if (!satSet(lab, chain, id)) return false;
      }
      return true;
    }
    const ok = satSet(fs.map(f => nnf(f)), [], 0);
    if (over) D.add('budget');
    return { sat: over ? null : ok, nodes, worlds, ev };
  }

  /* =====================================================================================================================
     5. Temporal logic */
  /** CTL model checking by fixpoints (Clarke, Emerson & Sistla 1986, ACM TOPLAS 8:244; Huth & Ryan, Logic in Computer Science 2004
      §3.6): EX, E[φ U ψ] (least fixpoint), EG (greatest); the others by duality. A state without successors gets a loop (deadlock). */
  function ctlSat(f, M, ctx) {
    const n = M.n, r = M.rel[''], out = new Uint8Array(n), S = g => ctlSat(g, M, ctx);
    if (++ctx.ops > BUDGET) { ctx.over = true; return out; }
    const pre = s => { const o = new Uint8Array(n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r[i * n + j] && s[j]) { o[i] = 1; break; } return o; };
    const neg = s => s.map(x => 1 - x), and = (a, b) => a.map((x, i) => x & b[i]), or = (a, b) => a.map((x, i) => x | b[i]);
    const EU = (a, b) => { let z = b.slice(); for (let it = 0; it <= n + 1; it++) { const z2 = or(b, and(a, pre(z))); if (z2.every((x, i) => x === z[i])) break; z = z2; } return z; };
    const EG = a => { let z = a.slice(); for (let it = 0; it <= n + 1; it++) { const z2 = and(a, pre(z)); if (z2.every((x, i) => x === z[i])) break; z = z2; } return z; };
    const ONE = new Uint8Array(n).fill(1);
    switch (f.t) {
      case 'atom': { const v = M.val[f.n]; if (v) out.set(v); return out; }
      case 'top': return ONE;
      case 'bot': return out;
      case 'not': return neg(S(f.a));
      case 'and': case 'or': case 'imp': case 'iff': case 'xor': {
        const a = S(f.a), b = S(f.b);
        for (let i = 0; i < n; i++) out[i] = +(f.t === 'and' ? a[i] && b[i] : f.t === 'or' ? a[i] || b[i] : f.t === 'imp' ? !a[i] || b[i] : f.t === 'iff' ? a[i] === b[i] : a[i] !== b[i]);
        return out;
      }
      case 'E': case 'A': {
        const q = f.p, a = S(q.a), b = q.b ? S(q.b) : null, E = f.t === 'E';
        switch (q.t) {
          case 'X': return E ? pre(a) : neg(pre(neg(a)));
          case 'Fe': return E ? EU(ONE, a) : neg(EG(neg(a)));
          case 'G': return E ? EG(a) : neg(EU(ONE, neg(a)));
          case 'U': return E ? EU(a, b) : and(neg(EU(neg(b), and(neg(a), neg(b)))), neg(EG(neg(b))));
          case 'R': return E ? or(EU(b, and(a, b)), EG(b)) : neg(EU(neg(a), neg(b)));
          case 'W': { const ab = or(a, b); return E ? or(EU(ab, b), EG(ab)) : neg(EU(neg(b), and(neg(a), neg(b)))); }
          default: return out;
        }
      }
      default: return out;
    }
  }
  /** LTL on a trace (Pnueli 1977): a lasso s0 … s(n−1) → s(loop) (an infinite word u·v^ω) or, without a loop, a finite trace under the
      LTLf semantics of De Giacomo & Vardi 2013 (X is strong: false at the last position; G and R hold at the end). Values by
      fixpoints over the positions (U, F least; G, R, W greatest). */
  function ltlVals(f, n, succ, val) {
    const go = g => ltlVals(g, n, succ, val), out = new Uint8Array(n);
    const fix = (init, step) => { const v = new Uint8Array(n).fill(init); for (let it = 0; it < 2 * n + 2; it++) { let ch = false; for (let i = n - 1; i >= 0; i--) { const x = step(i, v); if (x !== v[i]) { v[i] = x; ch = true; } } if (!ch) break; } return v; };
    const nx = (v, i, weak) => (succ[i] < 0 ? (weak ? 1 : 0) : v[succ[i]]);
    switch (f.t) {
      case 'atom': for (let i = 0; i < n; i++) out[i] = val[i].has(f.n) ? 1 : 0; return out;
      case 'top': return out.fill(1);
      case 'bot': return out;
      case 'not': { const a = go(f.a); return a.map(x => 1 - x); }
      case 'and': case 'or': case 'imp': case 'iff': case 'xor': {
        const a = go(f.a), b = go(f.b);
        for (let i = 0; i < n; i++) out[i] = +(f.t === 'and' ? a[i] && b[i] : f.t === 'or' ? a[i] || b[i] : f.t === 'imp' ? !a[i] || b[i] : f.t === 'iff' ? a[i] === b[i] : a[i] !== b[i]);
        return out;
      }
      case 'X': { const a = go(f.a); for (let i = 0; i < n; i++) out[i] = nx(a, i, false); return out; }
      case 'Fe': { const a = go(f.a); return fix(0, (i, v) => a[i] | nx(v, i, false)); }
      case 'G': { const a = go(f.a); return fix(1, (i, v) => a[i] & nx(v, i, true)); }
      case 'U': { const a = go(f.a), b = go(f.b); return fix(0, (i, v) => b[i] | (a[i] & nx(v, i, false))); }
      case 'R': { const a = go(f.a), b = go(f.b); return fix(1, (i, v) => b[i] & (a[i] | nx(v, i, true))); }
      case 'W': { const a = go(f.a), b = go(f.b); return fix(1, (i, v) => b[i] | (a[i] & nx(v, i, true))); }
      default: return out;
    }
  }

  /* =====================================================================================================================
     6. Deontic logic beyond SDL */
  /* ---------- input/output logic (Makinson & van der Torre 2000, J. Phil. Logic 29:383): norms (a, x), an input A, the outputs
     out1 simple-minded Cn(G(Cn A)) · out2 basic ∩{Cn G(V) : V ⊇ A complete} · out3 reusable ∩{Cn G(B) : A ⊆ B = Cn B ⊇ G(B)} ·
     out4 basic reusable ∩{Cn G(V) : A ⊆ V ⊇ G(V), V complete}; with throughput (out⁺) the identity pairs (a, a) are added.
     Decided exactly over the valuations of the atoms (≤ 12): a complete set is a valuation or the whole language. ---------- */
  const IO_OPS = ['out1', 'out2', 'out3', 'out4'];
  function ioLogic(G, A, x, op, through, atoms) {
    const rows = rowsOf(atoms), all = rows.map((_, i) => i);
    const sat = (fs, r) => fs.every(f => evalProp(f, rows[r]));
    const modelsOf = fs => all.filter(r => sat(fs, r));
    const ent = (fs, extraRows, q) => { const ms = (extraRows || all).filter(r => sat(fs, r)); return ms.every(r => evalProp(q, rows[r])); };
    const heads = trig => G.filter(trig).map(g => g.x);
    let result, triggered = [], codes = [];
    const MA = modelsOf(A);
    if (!MA.length) codes.push('inconsistent-input');
    if (op === 'out1') {
      triggered = G.filter(g => ent(A, null, g.a));
      const H = triggered.map(g => g.x).concat(through ? A : []);
      result = ent(H, null, x);
    } else if (op === 'out3') {
      let H = [], B = A.slice();
      for (let it = 0; it <= G.length; it++) {
        const T = G.filter(g => ent(B, null, g.a));
        if (T.length === triggered.length) break;
        triggered = T; H = T.map(g => g.x); B = A.concat(H);
      }
      result = ent(H.concat(through ? A : []), null, x);
    } else {
      // out2 / out4: every valuation v of A (out4: those that also satisfy what they trigger) — a complete set V = the formulas true at v
      let any = false; result = true; const trig = new Set();
      for (const r of MA) {
        const T = G.filter(g => evalProp(g.a, rows[r])), H = T.map(g => g.x);
        if (op === 'out4' && !H.every(h => evalProp(h, rows[r]))) continue;
        any = true; T.forEach(g => trig.add(g));
        // Cn(G(V)) (with throughput Cn(V ∪ G(V))): with V a valuation, V ∪ H is either v (when consistent) or inconsistent (= L)
        const ok = through ? (H.every(h => evalProp(h, rows[r])) ? evalProp(x, rows[r]) : true) : ent(H, null, x);
        if (!ok) { result = false; }
      }
      if (!any) { codes.push('vacuous'); result = ent(G.map(g => g.x), null, x); triggered = G.slice(); }   // only V = L: Cn(G(L))
      else triggered = G.filter(g => trig.has(g));
    }
    return { entails: !!result, triggered, codes };
  }

  /* ---------- norms over an agent's trace: conditional obligations with deadlines (Dignum, Broersen, Dignum & Meyer 2004, "Meeting the
     deadline", LNCS 3236; Governatori 2015, "Thou shalt is not you will", ICAIL), maintenance obligations and prohibitions
     (Governatori & Rotolo 2010), permissions as exceptions; conflicts at a step resolved by lex superior (rank), lex specialis (the
     condition's conjuncts strictly include the other's) and lex posterior (issued later), in the order given (Alchourrón & Makinson
     1981; Sartor 2005, Legal Reasoning ch. 7). Contrary-to-duty norms name viol_<id> / fulf_<id> in their condition (Prakken &
     Sergot 1996). The public API for agents@1: evalNorms(norms, trace, opts) and the incremental normMonitor(norms, opts). ---------- */
  const NORM_KINDS = ['O', 'F', 'P'], NORM_MODES = ['achieve', 'maintain'], LEX = ['superior', 'specialis', 'posterior'];
  function conjuncts(f) { const o = []; (function go(g) { if (!g) return; if (g.t === 'and') { go(g.a); go(g.b); } else if (g.t !== 'top') o.push(key(g)); })(f); return o; }
  function normMonitor(norms, opts) {
    opts = opts || {};
    const order = Array.isArray(opts.order) && opts.order.length ? opts.order.filter(x => LEX.includes(x)) : LEX;
    const codes = new Set(), P = [];
    norms = (Array.isArray(norms) ? norms : []).slice(0, MAX_NORMS);
    for (const nm of norms) {
      if (!isObj(nm) || typeof nm.id !== 'string' || !NORM_KINDS.includes(nm.kind)) { codes.add('norm'); continue; }
      const pp = (s, lang) => { if (s === undefined || s === null || s === '') return { ok: true, ast: null }; return typeof s === 'string' ? parse(s, 'prop') : { ok: false }; };
      const act = pp(nm.act), cond = pp(nm.cond), dl = pp(nm.deadline), un = pp(nm.until);
      if (!act.ok || !act.ast || !cond.ok || !dl.ok || !un.ok) { codes.add('parse'); continue; }
      const hasDl = !!dl.ast || isNum(nm.within) || isNum(nm.by);
      const mode = nm.kind === 'O' ? (NORM_MODES.includes(nm.mode) ? nm.mode : hasDl ? 'achieve' : 'maintain') : 'maintain';
      const an = nnf(act.ast);
      P.push({ id: nm.id, kind: nm.kind, mode, act: act.ast, actK: key(an), negK: key(nnf(act.ast, true)), cond: cond.ast || TOP, dl: dl.ast, within: isNum(nm.within) ? nm.within : null,
        by: isNum(nm.by) ? nm.by : null, until: un.ast, agent: typeof nm.agent === 'string' ? nm.agent : null, each: nm.scope === 'each' || (opts.perAgent === true && typeof nm.agent !== 'string'),
        rank: isNum(nm.rank) ? nm.rank : 0, issued: isNum(nm.issued) ? nm.issued : 0, conj: new Set(conjuncts(cond.ast)), s: short(show(act.ast)), on: nm.on === undefined ? true : !!nm.on });
    }
    const live = new Map(), prev = new Map(), viol = new Set(), fulf = new Set(), agentsSeen = [];
    const V = [], Fu = [], CF = [], perStep = [], activePerStep = [], cfLive = new Set();
    let step = 0, nV = 0, nF = 0, nC = 0;
    const listOf = x => (Array.isArray(x) ? x.filter(a => typeof a === 'string') : []);
    function stepFn(st) {
      st = isObj(st) ? st : {};
      const t = isNum(st.t) ? st.t : step, newV = [], newF = [];
      if (step >= MAX_TRACE * 10) { codes.add('size'); return { violations: newV, fulfilments: newF }; }
      const fm = isObj(st.facts) ? st.facts : null, am = isObj(st.acts) ? st.acts : null;
      for (const ag of Object.keys(am || {}).concat(Object.keys(fm || {}))) if (ag !== '*' && !agentsSeen.includes(ag) && agentsSeen.length < 1000) agentsSeen.push(ag);
      const shared = new Set(fm ? listOf(fm['*']) : listOf(st.facts));
      const unionAll = new Set(shared); if (fm) for (const k of Object.keys(fm)) listOf(fm[k]).forEach(a => unionAll.add(a));
      if (am) for (const k of Object.keys(am)) listOf(am[k]).forEach(a => unionAll.add(a)); else listOf(st.acts).forEach(a => unionAll.add(a));
      const truth = ag => {
        let s;
        if (ag === '') s = unionAll;
        else { s = new Set(shared); if (fm) listOf(fm[ag]).forEach(a => s.add(a)); if (am) listOf(am[ag]).forEach(a => s.add(a)); else listOf(st.acts).forEach(a => s.add(a)); }
        return f => evalProp(f, new Proxy({}, { get: (_, nm) => {
          if (typeof nm !== 'string') return false;
          if (nm.startsWith('viol_')) return viol.has(nm.slice(5) + '|' + ag) || viol.has(nm.slice(5) + '|');
          if (nm.startsWith('fulf_')) return fulf.has(nm.slice(5) + '|' + ag) || fulf.has(nm.slice(5) + '|');
          return s.has(nm);
        } }));
      };
      const tf = new Map(); const T = ag => { if (!tf.has(ag)) tf.set(ag, truth(ag)); return tf.get(ag); };
      // 1. activation: which instances are in force at this step
      const act = [];
      for (const n of P) {
        if (!n.on) continue;
        const ctxs = n.agent !== null ? [n.agent] : n.each ? agentsSeen.slice() : [''];
        for (const ag of ctxs) {
          const k = n.id + '|' + ag, ev = T(ag), c = ev(n.cond), was = prev.get(k) || false; prev.set(k, c);
          let inst = live.get(k);
          if (!inst && c && !was) { inst = { since: step, t0: t, violated: false }; live.set(k, inst); }
          if (inst && n.mode === 'maintain' && n.kind !== 'P' && !c && inst.since !== step) { endMaintain(n, ag, k, inst, t, newF); inst = null; }
          if (inst) act.push({ n, ag, k, inst, ev });
        }
      }
      // 2. conflicts (O p vs F p, O p vs O ¬p, P p vs F p in the same context) and their resolution
      const suppressed = new Set(), nowCf = new Set();
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const x = act[i], y = act[j]; if (x.ag !== y.ag) continue;
        const kinds = [x.n.kind, y.n.kind].sort().join('');
        const same = x.n.actK === y.n.actK, opp = x.n.actK === y.n.negK;
        const clash = (same && (kinds === 'FO' || kinds === 'FP')) || (opp && kinds === 'OO');
        if (!clash) continue;
        let win = null, by = null;
        for (const crit of order) {
          if (crit === 'superior' && x.n.rank !== y.n.rank) { win = x.n.rank > y.n.rank ? x : y; by = crit; break; }
          if (crit === 'specialis') {
            const sup = (a, b) => a.size > b.size && [...b].every(k => a.has(k));
            if (sup(x.n.conj, y.n.conj)) { win = x; by = crit; break; } if (sup(y.n.conj, x.n.conj)) { win = y; by = crit; break; }
          }
          if (crit === 'posterior' && x.n.issued !== y.n.issued) { win = x.n.issued > y.n.issued ? x : y; by = crit; break; }
        }
        codes.add('conflict');
        if (win) suppressed.add(win === x ? y.k : x.k); else codes.add('unresolved');
        const ck = x.k + '#' + y.k; nowCf.add(ck);
        if (!cfLive.has(ck)) { nC++; if (CF.length < MAX_EVENTS) CF.push({ step, t, a: x.n.id, b: y.n.id, agent: x.ag || undefined, winner: win ? win.n.id : null, by }); }
      }
      cfLive.clear(); nowCf.forEach(k => cfLive.add(k));
      // 3. fulfilment and violation
      let vHere = 0;
      for (const { n, ag, k, inst, ev } of act) {
        if (n.kind === 'P') { if (n.until && ev(n.until)) live.delete(k); continue; }
        if (suppressed.has(k)) { if (n.mode === 'achieve') live.delete(k); continue; }
        const holds = ev(n.act);
        const rec = o => (ag ? Object.assign({ norm: n.id, agent: ag }, o) : Object.assign({ norm: n.id }, o));
        const dlNow = (n.dl && ev(n.dl)) || (n.within !== null && step - inst.since >= n.within) || (n.by !== null && t >= n.by);
        if (n.mode === 'achieve') {
          if (holds) { const r = rec({ step, t, since: inst.since }); newF.push(r); fulf.add(k); live.delete(k); }
          else if (dlNow) { const r = rec({ step, t, act: n.s, kind: 'deadline', since: inst.since }); newV.push(r); viol.add(k); live.delete(k); vHere++; }
          else if (n.until && ev(n.until)) live.delete(k);
        } else {
          const bad = n.kind === 'F' ? holds : !holds;
          if (bad) { const r = rec({ step, t, act: n.s, kind: n.kind === 'F' ? 'forbidden' : 'maintain', since: inst.since }); newV.push(r); viol.add(k); inst.violated = true; vHere++; }
          if ((n.until && ev(n.until)) || dlNow) endMaintain(n, ag, k, inst, t, newF);
        }
      }
      for (const r of newV) { nV++; if (V.length < MAX_EVENTS) V.push(r); }
      for (const r of newF) { nF++; if (Fu.length < MAX_EVENTS) Fu.push(r); }
      if (perStep.length < MAX_TRACE) { perStep.push(vHere); activePerStep.push(act.length); }
      step++;
      return { violations: newV, fulfilments: newF };
    }
    function endMaintain(n, ag, k, inst, t, newF) {
      if (!inst.violated) { const r = ag ? { norm: n.id, agent: ag, step, t, since: inst.since } : { norm: n.id, step, t, since: inst.since }; newF.push(r); fulf.add(k); }
      live.delete(k);
    }
    function result() {
      const pending = [];
      for (const [k, inst] of live) { const [id, ag] = k.split('|'); const n = P.find(x => x.id === id); if (n && n.kind !== 'P') pending.push(ag ? { norm: id, agent: ag, since: inst.since } : { norm: id, since: inst.since }); }
      if (nV > V.length || nF > Fu.length) codes.add('trace-truncated');
      return { violations: V.slice(), fulfilments: Fu.slice(), pending, conflicts: CF.slice(), codes: [...codes].sort(),
        counts: { violations: nV, fulfilments: nF, pending: pending.length, conflicts: nC }, perStep: perStep.slice(), activePerStep: activePerStep.slice() };
    }
    return { step: stepFn, result };
  }
  /** evalNorms(norms, trace, opts) → {violations, fulfilments, pending, conflicts, codes, counts, perStep, activePerStep} */
  function evalNorms(norms, trace, opts) {
    const m = normMonitor(norms, opts);
    for (const st of (Array.isArray(trace) ? trace : []).slice(0, MAX_TRACE * 10)) m.step(st);
    return m.result();
  }

  /* =====================================================================================================================
     7. Abstract argumentation (Dung 1995, Artificial Intelligence 77:321): the grounded extension (the least fixpoint of the
     characteristic function), the complete labellings (Caminada 2006; Modgil & Caminada 2009, search with propagation), preferred
     (⊆-maximal complete), stable (complete with nothing undecided); credulous / skeptical acceptance. ---------- */
  const SEMANTICS = ['grounded', 'complete', 'preferred', 'stable'];
  function afSolve(n, att, D) {
    const atk = Array.from({ length: n }, () => []);   // attackers of each argument
    for (const [a, b] of att) atk[b].push(a);
    // grounded: F^k(∅), each iteration recorded
    let IN = new Uint8Array(n), OUT = new Uint8Array(n); const iters = [];
    for (let it = 0; it <= n; it++) {
      let ch = false;
      for (let b = 0; b < n; b++) if (!IN[b] && atk[b].every(a => OUT[a])) { IN[b] = 1; ch = true; }
      for (let b = 0; b < n; b++) if (!OUT[b] && atk[b].some(a => IN[a])) { OUT[b] = 1; ch = true; }
      iters.push(Array.from(IN, (x, i) => (x ? 1 : OUT[i] ? 0 : 0.5)));
      if (!ch) break;
    }
    const grounded = Array.from(IN, (x, i) => (x ? 1 : OUT[i] ? 0 : 0.5));
    // complete labellings: 1 in, 0 out, 0.5 undec; search with the grounded labels fixed
    const exts = []; let nodes = 0, over = false;
    const lab = new Float64Array(n).fill(-1); grounded.forEach((v, i) => { if (v !== 0.5) lab[i] = v; });
    const legal = (L, b) => {
      const v = L[b]; if (v < 0) return true;
      let allOut = true, someIn = false, undecided = false;
      for (const a of atk[b]) { if (L[a] < 0) { undecided = true; allOut = false; } else { if (L[a] !== 0) allOut = false; if (L[a] === 1) someIn = true; } }
      if (v === 1) return atk[b].every(a => L[a] < 0 || L[a] === 0);
      if (v === 0) return someIn || undecided;
      return !someIn && !allOut;
    };
    const succ = Array.from({ length: n }, () => []); for (const [a, b] of att) succ[a].push(b);
    function rec(i) {
      if (++nodes > BUDGET) { over = true; return; }
      if (i === n) { if (exts.length < 4096) exts.push(Array.from(lab)); else over = true; return; }
      if (lab[i] >= 0 && grounded[i] !== 0.5) { rec(i + 1); return; }
      for (const v of [1, 0, 0.5]) {
        lab[i] = v;
        if (legal(lab, i) && succ[i].every(b => legal(lab, b))) rec(i + 1);
        if (over) break;
      }
      lab[i] = -1;
    }
    rec(0);
    if (over) D.add('budget');
    const inSet = l => l.map((v, i) => (v === 1 ? i : -1)).filter(i => i >= 0);
    const complete = exts;
    const sub = (a, b) => inSet(a).every(i => b[i] === 1);
    const preferred = complete.filter(a => !complete.some(b => b !== a && sub(a, b) && inSet(b).length > inSet(a).length));
    const stable = complete.filter(a => a.every(v => v !== 0.5));
    return { grounded, iters, complete, preferred, stable, atk };
  }

  /* =====================================================================================================================
     8. The spec: the model format (the same table in tools/lib_logic.py), the checks, the expressions and keys */
  const TASKS = ['truth-table', 'equivalent', 'entails', 'normal-form', 'sat', 'resolution', 'proof', 'horn', 'many-valued', 'fol-eval', 'unify',
    'fol-resolution', 'syllogism', 'kripke', 'tableau', 'epistemic', 'ltl', 'ctl', 'dyadic', 'io', 'norms', 'af'];
  const FORMS = ['nnf', 'cnf', 'dnf', 'tseitin', 'prenex', 'skolem', 'clausal'];
  const FOL_FORMS = ['prenex', 'skolem', 'clausal'];
  const ATOMV_T = { atom: 'id!', value: 'numx!' };
  const WORLD_T = { id: 'id!', holds: { $list: 'id', max: 64 }, x: 'numx', y: 'numx', rank: 'int:0:1000', label: 'key' };
  const EDGE_T = { u: 'ref!', v: 'ref!', ag: 'id', on: 'numx' };
  const STEP_T = { holds: { $list: 'id', max: 64 }, facts: { $list: 'id', max: 64 }, acts: { $list: 'id', max: 64 }, t: 'fin' };
  const PRED_T = { name: 'id!', tuples: { $list: { $list: 'ref', max: 4 }, max: 4096 } };
  const FUNC_T = { name: 'id!', map: { $list: { $list: 'ref', max: 5 }, max: 4096 } };
  const CONST_T = { name: 'id!', value: 'ref!' };
  const LINE_T = { f: 'expr!', rule: 'enum:' + ND_RULES.join('|') + '!', refs: { $list: 'int:1:200', max: 2 }, boxes: { $list: 'int:1:200', max: 2 }, depth: 'int:0:20' };
  const ARG_T = { id: 'id!', label: 'key', x: 'numx', y: 'numx' };
  const ATT_T = { u: 'ref!', v: 'ref!', on: 'numx' };
  const NORM_T = { id: 'id!', kind: 'enum:O|F|P', cond: 'expr', act: 'expr', mode: 'enum:achieve|maintain', deadline: 'expr', within: 'int:0:2000', by: 'fin', until: 'expr',
    agent: 'id', scope: 'enum:one|each', rank: 'int:-1000:1000', issued: 'fin', on: 'numx' };
  const PUZ_T = { kind: 'enum:muddy|cheryl|consecutive!', n: 'int:1:15', muddy: 'int:0:5', a: 'int:0:15', b: 'int:0:15' };
  const MODEL_T = {
    task: 'enum:' + TASKS.join('|') + '!', logic: 'enum:' + MV.join('|'), system: 'enum:' + SYSTEMS.join('|'), form: 'enum:' + FORMS.join('|'),
    solver: 'enum:dpll|cdcl', method: 'enum:forward|backward', semantics: 'enum:' + SEMANTICS.join('|'), op: 'enum:' + IO_OPS.join('|'), throughput: 'bool',
    formula: 'expr', formulas: { $list: 'expr', max: MAX_FORMULAS }, premises: { $list: 'expr', max: MAX_FORMULAS }, goal: 'expr', pick: 'numx',
    assign: { $list: { $obj: ATOMV_T }, max: MAX_ATOMS }, atoms: { $list: 'id', max: MAX_ATOMS }, levels: 'int:2:11', designated: 'unit',
    worlds: { $list: { $obj: WORLD_T }, max: MAX_STATES }, edges: { $list: { $obj: EDGE_T }, max: 4096 }, agents: { $list: 'id', max: 8 }, s5: 'bool',
    world: 'ref', at: 'numx', initial: 'ref', preset: 'enum:mutex', announce: { $list: 'expr', max: MAX_FORMULAS }, puzzle: { $obj: PUZ_T },
    trace: { $list: { $obj: STEP_T }, max: MAX_TRACE }, loop: 'int:0:1999', pos: 'numx', step: 'numx',
    domain: { $list: 'id', max: MAX_DOMAIN }, size: 'int:1:8', preds: { $list: { $obj: PRED_T }, max: 32 }, funcs: { $list: { $obj: FUNC_T }, max: 16 },
    consts: { $list: { $obj: CONST_T }, max: 32 }, terms: { $list: 'expr', max: 8 }, vars: { $list: 'id', max: 32 }, bound: 'int:1:2000',
    proof: { $list: { $obj: LINE_T }, max: MAX_LINES }, mood: 'id', figure: 'int:1:4', existential: 'bool',
    args: { $list: { $obj: ARG_T }, max: MAX_ARGS }, attacks: { $list: { $obj: ATT_T }, max: 600 }, arg: 'ref', ext: 'numx',
    norms: { $list: { $obj: NORM_T }, max: MAX_NORMS }, input: { $list: 'expr', max: MAX_FORMULAS }, order: { $list: 'enum:' + LEX.join('|'), max: 3 },
    view: { $list: 'fin', min: 4, max: 4 },
  };
  const REQ = { 'truth-table': ['formula|formulas'], equivalent: ['formulas'], entails: ['goal'], 'normal-form': ['formula', 'form'], sat: ['formula|formulas'],
    resolution: ['premises|goal'], proof: ['proof'], horn: ['formulas', 'goal'], 'many-valued': ['formula', 'logic'], 'fol-eval': ['formula', 'domain|size'],
    unify: ['terms'], 'fol-resolution': ['premises|goal'], syllogism: ['mood', 'figure'], kripke: ['worlds'], tableau: ['formula|goal'],
    epistemic: ['worlds|puzzle', 'formula'], ltl: ['trace', 'formula'], ctl: ['worlds|preset', 'formula'], dyadic: ['worlds', 'formula'], io: ['norms', 'goal', 'op'],
    norms: ['norms', 'trace'], af: ['args'] };
  const LANG_OF = { 'fol-eval': 'fol', unify: 'fol', 'fol-resolution': 'fol', kripke: 'deontic', tableau: 'deontic', epistemic: 'epistemic', ltl: 'ltl', ctl: 'ctl', dyadic: 'dyadic' };
  const langOf = m => (m.task === 'normal-form' && FOL_FORMS.includes(m.form) ? 'fol' : LANG_OF[m.task] || 'prop');
  const ATOM_TASKS = ['truth-table', 'equivalent', 'entails', 'many-valued', 'io'];
  const MODEL_TASKS = ['kripke', 'epistemic', 'ctl', 'dyadic'];
  const COMMON_S = ['flag'];
  const TASK_OUT = {
    'truth-table': [['valid', 'satisfiable', 'models', 'rows', 'value', 'atoms'], ['column']],
    equivalent: [['equivalent', 'countermodels', 'atoms'], ['column']],
    entails: [['entails', 'countermodels', 'consistent', 'atoms'], []],
    'normal-form': [['size', 'clauses', 'literals', 'vars', 'equivalent', 'skolems'], []],
    sat: [['satisfiable', 'decisions', 'propagations', 'conflicts', 'learned', 'backtracks', 'clauses', 'vars', 'steps', 'frame'], ['levels']],
    resolution: [['refuted', 'generated', 'proofLength', 'clauses', 'steps', 'frame'], []],
    proof: [['valid', 'errors', 'firstError', 'lines'], ['lineCodes']],
    horn: [['entails', 'derived', 'steps', 'frame'], []],
    'many-valued': [['value', 'valid', 'satisfiable', 'min', 'max'], ['column']],
    'fol-eval': [['value', 'count', 'domain'], []],
    unify: [['unifiable', 'bindings', 'steps'], []],
    'fol-resolution': [['refuted', 'generated', 'proofLength', 'clauses', 'steps', 'frame'], []],
    syllogism: [['valid', 'validTraditional'], []],
    kripke: [['value', 'count', 'worlds', 'reflexive', 'serial', 'transitive', 'symmetric', 'euclidean', 'axT', 'axD', 'ax4', 'ax5', 'axB'], ['truth']],
    tableau: [['valid', 'satisfiable', 'nodes', 'worlds', 'steps', 'frame'], []],
    epistemic: [['value', 'count', 'worlds', 'steps', 'frame'], ['truth', 'worldsLeft']],
    ltl: [['value', 'count'], ['truth']],
    ctl: [['value', 'count', 'worlds'], ['truth']],
    dyadic: [['value', 'count', 'worlds'], ['truth']],
    io: [['entails', 'triggered'], []],
    norms: [['violations', 'fulfilments', 'pending', 'conflicts', 'steps', 'frame'], ['violationsPerStep', 'activePerStep']],
    af: [['extensions', 'credulous', 'skeptical', 'accepted', 'inCount', 'steps', 'frame'], ['labels']],
  };
  const CODES = ['budget', 'bound', 'trace-truncated', 'size', 'vacuous', 'correspondence', 'deadlock', 'not-serial', 'not-equivalence', 'inconsistent-input',
    'conflict', 'unresolved', 'no-stable', 'occurs', 'clash', 'grid-only', 'scene-truncated', 'series-truncated', 'contradiction', 'nd-error', 'nd-open',
    'nd-goal', 'boundary', 'finite', 'empty', 'parse', 'norm'];
  /** every formula field of a model, in a fixed order: [text, path] */
  function formulaFields(m) {
    const out = [], L = (k) => { if (Array.isArray(m[k])) m[k].forEach((s, i) => { if (typeof s === 'string') out.push([s, `model.${k}[${i}]`]); }); };
    if (typeof m.formula === 'string') out.push([m.formula, 'model.formula']);
    L('formulas'); L('premises');
    if (typeof m.goal === 'string') out.push([m.goal, 'model.goal']);
    L('announce'); L('input');
    if (Array.isArray(m.norms)) m.norms.forEach((nm, i) => { for (const f of ['cond', 'act', 'deadline', 'until']) if (isObj(nm) && typeof nm[f] === 'string') out.push([nm[f], `model.norms[${i}].${f}`]); });
    if (Array.isArray(m.proof)) m.proof.forEach((ln, i) => { if (isObj(ln) && typeof ln.f === 'string') out.push([ln.f, `model.proof[${i}].f`]); });
    return out;
  }
  /** the agents a formula names (K_a, B_a, groups, [a] / <a>) */
  function agentsOf(f, out) {
    out = out || [];
    (function go(g) { if (!g || typeof g !== 'object') return; if (g.ag && !out.includes(g.ag)) out.push(g.ag); if (g.g) for (const a of g.g) if (!out.includes(a)) out.push(a); for (const k of ['a', 'b', 'c', 'f', 'p']) if (g[k]) go(g[k]); })(f);
    return out;
  }
  function predsOf(f, out) {
    out = out || [];
    (function go(g) { if (!g || typeof g !== 'object') return; if (g.t === 'pred') out.push([g.n, g.args.length]); for (const k of ['a', 'b']) if (g[k]) go(g[k]); })(f);
    return out;
  }
  const PUZ_AGENTS = pz => (pz.kind === 'muddy' ? Array.from({ length: pz.n || 3 }, (_, i) => 'c' + (i + 1)) : ['a', 'b']);
  /** checkSpec(spec) → [{code, path, msg, level}] (the same as tools/lib_logic.py check_spec) */
  function checkSpec(spec) {
    const { P, E, W } = C.problems();
    const m = isObj(spec) ? spec.model : undefined;
    const KINDS = ['scalar', 'series', 'scene'];
    if (!isObj(m)) { E('format', 'model', 'not an object'); C.checkOutputs(spec, ID, KINDS, () => true, E, W); return P; }
    C.walk(m, MODEL_T, 'model', E, W);
    if (C.hasErrors(P)) { C.checkOutputs(spec, ID, KINDS, () => true, E, W); return P; }
    const task = m.task, lang = langOf(m);
    const miss = REQ[task].filter(r => !r.split('|').some(f => m[f] !== undefined));
    for (const r of miss) E('value', 'model.' + r.split('|')[0], `missing (${task} needs ${REQ[task].map(x => x.split('|').join(' or ')).join(', ')})`);
    const parsed = [];
    for (const [s, p] of formulaFields(m)) {
      const r = parse(s, p.startsWith('model.norms') || p.startsWith('model.input') ? 'prop' : lang);
      if (!r.ok) E(r.code, p, r.msg); else parsed.push([r.ast, p]);
    }
    if (Array.isArray(m.terms)) m.terms.forEach((s, i) => {
      const r = parse(s, 'fol'), p = `model.terms[${i}]`;
      if (!r.ok) E(r.code, p, r.msg); else if (r.ast.t !== 'pred') E('term', p, 'needs a term (a name, or f(t1, …, tn))');
    });
    if (ATOM_TASKS.includes(task)) {
      const at = parsed.reduce((o, [f]) => atomsOf(f, o), []);
      if (at.length > MAX_ATOMS) E('size', 'model', `more than ${MAX_ATOMS} atoms (${at.length})`);
    }
    if (task === 'equivalent' && Array.isArray(m.formulas) && m.formulas.length < 2) E('value', 'model.formulas', 'needs two formulas');
    if (task === 'unify' && Array.isArray(m.terms) && m.terms.length < 2) E('value', 'model.terms', 'needs two terms or more');
    if (task === 'horn') {
      for (const [f, p] of parsed) {
        if (p.startsWith('model.formulas') && !hornRule(f)) E('horn', p, 'not a Horn clause (p, a ∧ b → c, a ∧ b → ⊥)');
        if (p === 'model.goal' && f.t !== 'atom') E('horn', p, 'needs an atom');
      }
    }
    if (task === 'syllogism' && m.mood !== undefined && !/^[AEIO]{3}$/.test(m.mood)) E('value', 'model.mood', 'needs three of A, E, I, O (AAA … OOO)');
    if (task === 'fol-eval') {
      if (m.domain !== undefined && m.size !== undefined) E('value', 'model.size', 'give domain or size, not both');
      const dom = Array.isArray(m.domain) ? m.domain : Array.from({ length: m.size || 0 }, (_, i) => 'd' + i);
      if (m.domain !== undefined && !dom.length) E('size', 'model.domain', 'needs at least one element');
      const inDom = new Set(dom), ar = new Map();
      (m.preds || []).forEach((pd, i) => {
        let a = null;
        (pd.tuples || []).forEach((tp, j) => {
          if (a === null) a = tp.length; else if (tp.length !== a) E('arity', `model.preds[${i}].tuples[${j}]`, `needs ${a} elements like the first tuple`);
          tp.forEach((x, k) => { if (!inDom.has(x)) E('ref', `model.preds[${i}].tuples[${j}][${k}]`, 'not an element of the domain'); });
        });
        ar.set(pd.name, a);
      });
      (m.consts || []).forEach((c, i) => { if (!inDom.has(c.value)) E('ref', `model.consts[${i}].value`, 'not an element of the domain'); });
      (m.funcs || []).forEach((fn, i) => (fn.map || []).forEach((row, j) => row.forEach((x, k) => { if (!inDom.has(x)) E('ref', `model.funcs[${i}].map[${j}][${k}]`, 'not an element of the domain'); })));
      for (const [f, p] of parsed) for (const [nm, k] of predsOf(f)) {
        if (!ar.has(nm)) { E('ref', p, `the predicate ${nm} is not in model.preds`); break; }
        if (ar.get(nm) !== null && ar.get(nm) !== k) { E('arity', p, `${nm} takes ${ar.get(nm)} arguments, not ${k}`); break; }
      }
    }
    const ids = new Set();
    if (MODEL_TASKS.includes(task) && Array.isArray(m.worlds)) {
      const cap = task === 'ctl' ? MAX_STATES : MAX_WORLDS;
      if (m.worlds.length > cap) E('size', 'model.worlds', `more than ${cap} ${task === 'ctl' ? 'states' : 'worlds'}`);
      m.worlds.forEach((w, i) => {
        if (ids.has(w.id)) E('duplicate', `model.worlds[${i}].id`, `the world ${w.id} is listed twice`); ids.add(w.id);
        (w.holds || []).forEach((a, j) => { if (!ATOM_RE.test(a)) E('value', `model.worlds[${i}].holds[${j}]`, 'needs an atom name (a letter or _, then letters, digits, _)'); });
      });
      (m.edges || []).forEach((e, i) => { for (const f of ['u', 'v']) if (!ids.has(e[f])) E('ref', `model.edges[${i}].${f}`, 'not a world of the model'); });
      for (const f of ['world', 'initial']) if (m[f] !== undefined && !ids.has(m[f])) E('ref', 'model.' + f, 'not a world of the model');
    }
    if ((task === 'epistemic' && m.worlds !== undefined && m.puzzle !== undefined) || (task === 'ctl' && m.worlds !== undefined && m.preset !== undefined)) E('value', task === 'ctl' ? 'model.preset' : 'model.puzzle', 'give worlds or ' + (task === 'ctl' ? 'preset' : 'puzzle') + ', not both');
    if (task === 'epistemic') {
      const pz = m.puzzle;
      if (pz && pz.kind === 'muddy' && (pz.n || 3) > 5) E('size', 'model.puzzle.n', 'at most 5 children (32 worlds)');
      if (pz && pz.kind === 'muddy' && pz.muddy !== undefined && pz.muddy > (pz.n || 3)) E('value', 'model.puzzle.muddy', 'at most n');
      const ags = pz && m.worlds === undefined ? PUZ_AGENTS(pz) : (m.agents || []);
      (m.edges || []).forEach((e, i) => { if (e.ag === undefined || !ags.includes(e.ag)) E('agent', `model.edges[${i}].ag`, 'needs an agent of model.agents'); });
      for (const [f, p] of parsed) for (const a of agentsOf(f)) if (!ags.includes(a)) { E('agent', p, `the agent ${a} is not in model.agents`); break; }
    }
    if (task === 'ltl' && m.loop !== undefined && Array.isArray(m.trace) && m.loop >= m.trace.length) E('value', 'model.loop', 'needs a position of the trace');
    if (task === 'af' && Array.isArray(m.args)) {
      const aids = new Set();
      m.args.forEach((a, i) => { if (aids.has(a.id)) E('duplicate', `model.args[${i}].id`, `the argument ${a.id} is listed twice`); aids.add(a.id); });
      (m.attacks || []).forEach((e, i) => { for (const f of ['u', 'v']) if (!aids.has(e[f])) E('ref', `model.attacks[${i}].${f}`, 'not an argument of the framework'); });
      if (m.arg !== undefined && !aids.has(m.arg)) E('ref', 'model.arg', 'not an argument of the framework');
    }
    if ((task === 'norms' || task === 'io') && Array.isArray(m.norms)) {
      const nids = new Set();
      m.norms.forEach((nm, i) => {
        if (nids.has(nm.id)) E('duplicate', `model.norms[${i}].id`, `the norm ${nm.id} is listed twice`); nids.add(nm.id);
        if (nm.act === undefined) E('value', `model.norms[${i}].act`, 'missing');
        if (task === 'norms' && nm.kind === undefined) E('value', `model.norms[${i}].kind`, 'missing (O, F or P)');
      });
    }
    const [SC, SE] = TASK_OUT[task];
    C.checkOutputs(spec, ID, KINDS, (o, at) => {
      for (const k of Object.keys(o)) if (!['id', 'kind', 'of', 'code'].includes(k)) W('unknown-field', at + '.' + k, 'ignored');
      const list = o.kind === 'scalar' ? SC.concat(COMMON_S) : o.kind === 'series' ? SE : ['drawing'];
      if (!list.includes(o.of)) { E('output', at + '.of', `${o.kind} outputs of ${ID} for ${task}: ${list.join(', ') || 'none'}`); return; }
      if (o.kind === 'scalar' && o.of === 'flag') { if (!CODES.includes(o.code)) E('enum', at + '.code', 'one of ' + CODES.join(', ')); }
      else if (o.code !== undefined) W('unknown-field', at + '.code', 'ignored');
    }, E, W);
    return P;
  }
  /** exprs(spec) → [[source, path, local names]]: every number of the model written as an expression */
  function exprs(spec) {
    const out = [], m = spec && spec.model;
    if (!isObj(m)) return out;
    const sx = (v, p) => { if (typeof v === 'string') out.push([v, p, []]); };
    for (const f of ['pick', 'at', 'pos', 'step', 'ext']) sx(m[f], 'model.' + f);
    const L = (k, fs) => { if (Array.isArray(m[k])) m[k].forEach((x, i) => { if (isObj(x)) for (const f of fs) sx(x[f], `model.${k}[${i}].${f}`); }); };
    L('assign', ['value']); L('worlds', ['x', 'y']); L('edges', ['on']); L('args', ['x', 'y']); L('attacks', ['on']); L('norms', ['on']);
    return out;
  }
  /** keys(spec) → [[key, path]]: the labels of worlds and arguments */
  function keys(spec) {
    const out = [], m = spec && spec.model;
    if (!isObj(m)) return out;
    for (const k of ['worlds', 'args']) if (Array.isArray(m[k])) m[k].forEach((x, i) => { if (isObj(x) && typeof x.label === 'string') out.push([x.label, `model.${k}[${i}].label`]); });
    return out;
  }

  /* =====================================================================================================================
     9. The run: each task computes its scalars, series, a scene and a trace; the step (model.step) picks how far the trace is shown */
  function diagSet() { const s = new Set(); return { add: c => s.add(c), has: c => s.has(c), get list() { return [...s].sort().map(code => ({ code })); } }; }
  const P1 = (s, lang) => { const r = parse(s, lang); return r.ok ? r.ast : null; };
  const num = (v, env, d) => { if (v === undefined) return d; const x = C.cx(v)(env); return Number.isFinite(x) ? x : d; };
  const on = (v, env) => v === undefined || num(v, env, 1) > 0.5;
  /** a scene of text lines (a proof, a trace, a normal form): line i at y = −i; roles per line */
  function textScene(lines, D) {
    const n = Math.min(lines.length, C.MAX_SCENE - 1);
    if (lines.length > n) D.add('scene-truncated');
    const sc = C.scene([0, 40, -(Math.max(n, 1) + 0.5), 0.5]);
    for (let i = 0; i < n; i++) sc.txt(0.5, -i, { s: short(lines[i].s), c: lines[i].c || 'base', anchor: 'start' });
    return sc.done();
  }
  /** a scene of a graph: worlds / states / arguments as points (role from truth), relations as arrows, ids and atoms as `s` */
  function graphScene(nodes, edges, view) {
    const n = nodes.length;
    const xs = nodes.map((nd, i) => (isNum(nd.x) ? nd.x : Math.cos(Math.PI / 2 - 2 * Math.PI * i / Math.max(n, 1)) * (n > 1 ? 3 : 0)));
    const ys = nodes.map((nd, i) => (isNum(nd.y) ? nd.y : Math.sin(Math.PI / 2 - 2 * Math.PI * i / Math.max(n, 1)) * (n > 1 ? 3 : 0)));
    const sc = C.scene(view || C.fitView(xs, ys, 0.3));
    for (const e of edges) {
      const u = e.u, v = e.v;
      if (u === v) { sc.circ(xs[u], ys[u] + 0.35, 0.25, { c: e.c || 'muted' }); continue; }
      const dx = xs[v] - xs[u], dy = ys[v] - ys[u], L = Math.hypot(dx, dy) || 1, k = 0.28 / L, off = e.both ? 0.08 : 0;
      sc.seg(xs[u] + dx * k - dy * off / L, ys[u] + dy * k + dx * off / L, xs[v] - dx * k - dy * off / L, ys[v] - dy * k + dx * off / L, { c: e.c || 'muted', arrow: true, ...(e.s ? { s: short(e.s) } : {}) });
    }
    nodes.forEach((nd, i) => {
      sc.pt(xs[i], ys[i], { r: 7, c: nd.c || 'base', ...(nd.key ? { key: nd.key } : { s: short(nd.s) }) });
      if (nd.sub) sc.txt(xs[i], ys[i] - 0.45, { s: short(nd.sub), c: 'muted' });
    });
    return sc.done();
  }
  function frameOf(m, env, total) { const v = m.step === undefined ? total : num(m.step, env, total); return Math.max(0, Math.min(total, Math.floor(v))); }
  /** the Kripke model of a spec (worlds, edges with on, agents; epistemic: s5 closure unless s5 is false) */
  function specModel(m, env, D, opts) {
    const edges = (m.edges || []).filter(e => on(e.on, env));
    const M = kmodel(m.worlds || [], edges, { agents: m.agents || [] });
    if (opts && opts.s5) for (const ag of Object.keys(M.rel)) if (ag !== '') { const before = M.rel[ag].join(''); equivClose(M.rel[ag], M.n); if (M.rel[ag].join('') !== before) D.add('not-equivalence'); }
    return M;
  }
  function worldIndex(m, env, M, dflt) {
    if (m.at !== undefined) { const k = Math.floor(num(m.at, env, 0)); return Math.max(0, Math.min(M.n - 1, k)); }
    const w = m.world !== undefined ? m.world : m.initial;
    if (w !== undefined && M.idx && M.idx.has(w)) return M.idx.get(w);
    return dflt || 0;
  }
  function modelNodes(M, truth, sel, wlist) {
    return Array.from({ length: M.n }, (_, i) => {
      const w = wlist ? wlist[i] : null, hold = Object.keys(M.val).filter(a => M.val[a][i]).sort().join(',');
      return { s: M.ids[i], key: w && w.label, x: w && isNum(w.x) ? w.x : undefined, y: w && isNum(w.y) ? w.y : undefined, c: i === sel ? 'hi' : truth ? (truth[i] ? 'ok' : 'bad') : 'base', sub: hold };
    });
  }
  function modelEdges(M, skipRefl) {
    const out = [];
    for (const [ag, r] of Object.entries(M.rel)) for (let i = 0; i < M.n; i++) for (let j = 0; j < M.n; j++) if (r[i * M.n + j] && !(skipRefl && i === j)) out.push({ u: i, v: j, s: ag || undefined, both: !!r[j * M.n + i] && i !== j });
    return out.slice(0, 1500);
  }
  function run(spec, env, opts) {
    env = env || {};
    const D = diagSet(), m = spec.model, task = m.task, lang = langOf(m), R = { s: {}, se: {}, scene: null };
    const S = R.s, SE = R.se;
    const fs = Array.isArray(m.formulas) ? m.formulas.map(s => P1(s, lang)) : [];
    let F0 = typeof m.formula === 'string' ? P1(m.formula, lang) : null;
    if (m.pick !== undefined && fs.length) F0 = fs[Math.max(0, Math.min(fs.length - 1, Math.floor(num(m.pick, env, 0))))];
    const prem = Array.isArray(m.premises) ? m.premises.map(s => P1(s, lang)) : [];
    const goal = typeof m.goal === 'string' ? P1(m.goal, lang) : null;
    const assign = {}; for (const a of m.assign || []) assign[a.atom] = num(a.value, env, 0);
    const boolAssign = Object.fromEntries(Object.entries(assign).map(([k, v]) => [k, v > 0.5]));
    let trace = [], total = 0;
    const T = TASK[task];
    if (T) T({ m, env, D, S, SE, R, fs, F0, prem, goal, assign, boolAssign, lang, setTrace: (lines) => { trace = lines; total = lines.length; } });
    if (R.scene === null && trace.length) {
      const k = frameOf(m, env, total);
      R.scene = textScene(trace.slice(0, Math.max(k, 0)), D);
    }
    if (S.steps === undefined) S.steps = total;
    if (S.frame === undefined) S.frame = frameOf(m, env, total);
    const out = {};
    for (const o of Array.isArray(spec.outputs) ? spec.outputs : []) {
      if (!o || typeof o.id !== 'string') continue;
      if (o.kind === 'scalar') { const v = o.of === 'flag' ? (D.has(o.code) ? 1 : 0) : S[o.of]; out[o.id] = typeof v === 'boolean' ? +v : isNum(v) ? v : NaN; }
      else if (o.kind === 'series') { const v = SE[o.of] || []; if (v.length > C.MAX_POINTS) D.add('series-truncated'); out[o.id] = Array.from(v).slice(0, C.MAX_POINTS); }
      else if (o.kind === 'scene') out[o.id] = R.scene || { view: [-1, 1, -1, 1], items: [] };
    }
    // a flag asked for after the series were cut
    for (const o of Array.isArray(spec.outputs) ? spec.outputs : []) if (o && o.kind === 'scalar' && o.of === 'flag') out[o.id] = D.has(o.code) ? 1 : 0;
    return { out, diag: D.list, scalars: S, series: SE, trace };
  }
  const tick = b => (b ? 'ok' : 'bad');
  const sceneTable = (heads, rows, D) => {
    // a truth table: one column per atom and formula, rows from TT…T; at most ~1900 cells
    const nc = heads.length, maxRows = Math.max(1, Math.floor(1900 / Math.max(nc, 1)) - 1), nr = Math.min(rows.length, maxRows);
    if (rows.length > nr) D.add('scene-truncated');
    const w = 2.2, sc = C.scene([-0.5, nc * w, -(nr + 0.8), 1]);
    heads.forEach((h, j) => sc.txt(j * w + w / 2, 0.2, { s: short(h), c: 'info' }));
    sc.seg(-0.3, -0.4, nc * w - 0.2, -0.4, { c: 'muted' });
    for (let i = 0; i < nr; i++) rows[i].forEach((v, j) => sc.txt(j * w + w / 2, -(i + 1), { s: typeof v === 'string' ? v : v === 1 ? 'T' : v === 0 ? 'F' : String(v), c: rows[i].roles ? rows[i].roles[j] : 'base' }));
    return sc.done();
  };
  const mvStr = x => (x === 0.5 ? '½' : x === 1 ? '1' : x === 0 ? '0' : String(Math.round(x * 1000) / 1000));

  const TASK = {
    'truth-table'({ m, D, S, SE, R, fs, F0, boolAssign }) {
      const list = F0 ? [F0] : fs.filter(Boolean); if (!list.length) return;
      const atoms = (m.atoms || []).filter(a => ATOM_RE.test(a));
      list.forEach(f => atomsOf(f, atoms));
      const tt = truthTable([list[0]], atoms), col = tt.cols[0];
      S.atoms = atoms.length; S.rows = col.length; S.models = col.reduce((a, b) => a + b, 0);
      S.valid = S.models === S.rows; S.satisfiable = S.models > 0; S.value = evalProp(list[0], boolAssign);
      SE.column = col;
      const rows = tt.rows.map((v, i) => { const r = atoms.map(a => (v[a] ? 1 : 0)).concat([col[i]]); r.roles = atoms.map(() => 'base').concat([tick(col[i])]); return r; });
      R.scene = sceneTable(atoms.concat([show(list[0])]), rows, D);
    },
    equivalent({ D, S, SE, R, fs }) {
      const [a, b] = fs; if (!a || !b) return;
      const tt = truthTable([a, b]), diff = tt.cols[0].map((x, i) => (x === tt.cols[1][i] ? 0 : 1));
      S.atoms = tt.atoms.length; S.countermodels = diff.reduce((x, y) => x + y, 0); S.equivalent = S.countermodels === 0; SE.column = diff;
      const rows = tt.rows.map((v, i) => { const r = tt.atoms.map(x => (v[x] ? 1 : 0)).concat([tt.cols[0][i], tt.cols[1][i]]); r.roles = tt.atoms.map(() => 'base').concat(diff[i] ? ['bad', 'bad'] : ['ok', 'ok']); return r; });
      R.scene = sceneTable(tt.atoms.concat([show(a), show(b)]), rows, D);
    },
    entails({ D, S, R, prem, goal }) {
      if (!goal || prem.some(p => !p)) return;
      const tt = truthTable(prem.concat([goal]));
      let cm = 0, cons = 0; const rows = [];
      tt.rows.forEach((v, i) => {
        const ps = prem.every((_, k) => tt.cols[k][i]), g = tt.cols[prem.length][i];
        if (ps) cons++; if (ps && !g) cm++;
        const r = tt.atoms.map(x => (v[x] ? 1 : 0)).concat(prem.map((_, k) => tt.cols[k][i]), [g]);
        r.roles = r.map((_, j) => (j < tt.atoms.length ? 'base' : ps && !g ? 'bad' : ps ? 'ok' : 'muted')); rows.push(r);
      });
      S.atoms = tt.atoms.length; S.countermodels = cm; S.entails = cm === 0; S.consistent = cons > 0;
      R.scene = sceneTable(tt.atoms.concat(prem.map(show), [show(goal)]), rows, D);
    },
    'normal-form'({ m, D, S, F0, setTrace }) {
      if (!F0) return;
      const form = m.form, lines = [];
      const countLits = cl => cl.reduce((a, c) => a + c.length, 0);
      if (form === 'nnf') { const g = nnf(F0); S.size = sizeOf(g); S.equivalent = 1; S.vars = 0; lines.push({ s: show(g) }); S.literals = atomsCount(g); }
      else if (form === 'cnf' || form === 'dnf') {
        const cl = cnfClauses(F0, MAX_CLAUSES, form === 'dnf');
        if (!cl) { D.add('size'); S.clauses = NaN; }
        else { S.clauses = cl.length; S.literals = countLits(cl); S.equivalent = 1; S.vars = 0; S.size = S.literals; cl.forEach(c => lines.push({ s: clauseStr(c, form === 'dnf') })); }
      } else if (form === 'tseitin') {
        const ts = tseitin(F0); S.clauses = ts.clauses.length; S.literals = countLits(ts.clauses); S.vars = ts.vars; S.equivalent = 0; S.size = S.literals;
        ts.clauses.forEach(c => lines.push({ s: clauseStr(c) }));
      } else if (form === 'prenex') { const p = prenex(F0); S.size = sizeOf(p.ast); S.equivalent = 1; S.vars = p.qs.length; lines.push({ s: show(p.ast) }); }
      else if (form === 'skolem') { const s = skolem(F0); S.size = sizeOf(s.ast); S.equivalent = 0; S.skolems = s.skolems; S.vars = s.univ.length; lines.push({ s: show(s.ast) }); }
      else if (form === 'clausal') { const cl = folClauses(F0, '0'); if (!cl) D.add('size'); else { S.clauses = cl.length; S.literals = countLits(cl); S.equivalent = 0; cl.forEach(c => lines.push({ s: c.map(folLitStr).join(' ∨ ') || '□' })); } }
      setTrace(lines);
    },
    sat({ m, D, S, SE, fs, F0, setTrace }) {
      const list = F0 ? [F0] : fs.filter(Boolean); if (!list.length) return;
      const f = bigAnd(list);
      let cl = cnfClauses(f, MAX_CLAUSES, false); if (!cl) cl = tseitin(f).clauses;
      const r = sat(cl, m.solver || 'cdcl', D);
      S.satisfiable = r.sat === null ? NaN : r.sat; S.decisions = r.st.decisions; S.propagations = r.st.propagations; S.conflicts = r.st.conflicts;
      S.learned = r.st.learned; S.backtracks = r.st.backtracks; S.clauses = cl.length; S.vars = r.names.length;
      const lit = l => (l > 0 ? '' : '¬') + r.names[Math.abs(l) - 1];
      SE.levels = r.ev.map(e => e.lvl);
      setTrace(r.ev.map(e => ({ s: e.k === 'decide' ? `decide ${lit(e.l)} @${e.lvl}` : e.k === 'flip' ? `flip ${lit(e.l)} @${e.lvl}` : e.k === 'unit' ? `unit ${lit(e.l)} (clause ${e.c + 1})` : e.k === 'conflict' ? `conflict (clause ${typeof e.c === 'number' ? e.c + 1 : '□'})` : e.k === 'learn' ? `learn ${e.lits.map(lit).join(' ∨ ') || '□'}` : `backtrack to @${e.lvl}`,
        c: e.k === 'conflict' ? 'bad' : e.k === 'learn' ? 'info' : e.k === 'decide' || e.k === 'flip' ? 'hi' : 'base' })).concat(r.sat === true ? [{ s: 'SAT ' + r.names.filter(nm => !nm.startsWith('_t')).map(nm => (r.model[nm] ? '' : '¬') + nm).join(' '), c: 'ok' }] : r.sat === false ? [{ s: 'UNSAT', c: 'bad' }] : []));
    },
    resolution({ m, D, S, prem, goal, setTrace }) {
      if (prem.some(p => !p)) return;
      const fs = prem.concat(goal ? [NOT(goal)] : []), cl = [];
      for (const f of fs) { const c = cnfClauses(f, MAX_CLAUSES, false); if (!c) { D.add('size'); return; } cl.push(...c); }
      const r = resolution(cl, D, m.bound);
      S.refuted = r.unknown ? NaN : r.refuted; S.generated = r.generated; S.proofLength = r.proof.length; S.clauses = cl.length;
      const lines = (r.refuted ? r.proof : r.all.map((_, i) => i)).map(k => ({ s: `${k + 1}. ${clauseStr(r.all[k].c) }` + (r.all[k].par ? `  (${r.all[k].par[0] + 1}, ${r.all[k].par[1] + 1}; ${r.all[k].par[2]})` : ''), c: r.all[k].c.length ? (r.all[k].par ? 'base' : 'muted') : 'ok' }));
      setTrace(lines);
    },
    proof({ m, D, S, SE, setTrace }) {
      const lines = (m.proof || []).map(l => ({ ...l, ast: P1(l.f, 'prop') }));
      const g = typeof m.goal === 'string' ? P1(m.goal, 'prop') : null;
      const r = checkProof(lines, g);
      S.valid = r.valid; S.errors = r.errors + (r.concl === 'nd-ok' ? 0 : 1); S.firstError = r.firstError; S.lines = lines.length;
      SE.lineCodes = r.codes.map(c => ND_CODES.indexOf(c));
      setTrace(lines.map((l, i) => ({ s: `${i + 1}${'  '.repeat(l.depth || 0)}| ${l.ast ? show(l.ast) : l.f}  ${l.rule}${(l.refs || []).length ? ' ' + l.refs.join(',') : ''}${(l.boxes || []).length ? ' [' + l.boxes.join(',') + ']' : ''}`, c: r.codes[i] === 'nd-ok' ? 'base' : 'bad' }))
        .concat([{ s: r.valid ? '∴ ' + (g ? show(g) : '') : r.concl, c: r.valid ? 'ok' : 'warn' }]));
      if (r.errors) D.add('nd-error'); if (r.concl === 'nd-open') D.add('nd-open'); if (r.concl === 'nd-goal') D.add('nd-goal');
    },
    horn({ m, D, S, fs, goal, setTrace }) {
      const rules = fs.map(f => (f ? hornRule(f) : null)).filter(Boolean); if (!goal || goal.t !== 'atom') return;
      const ev = [], r = (m.method === 'backward' ? backwardChain : forwardChain)(rules, goal.n, ev);
      if (r.contradiction) D.add('contradiction');
      S.entails = r.entails; S.derived = r.inferred.length;
      const rs = i => (i === undefined ? '' : ` (rule ${i + 1})`);
      setTrace(ev.map(e => ({ s: e.k === 'infer' ? `infer ${e.a}${rs(e.r)}` : `${'  '.repeat(Math.min(e.d || 0, 10))}${e.k} ${e.a}${rs(e.r)}`, c: e.k === 'fail' || e.k === 'loop' ? 'bad' : e.k === 'proved' || (e.k === 'infer' && e.a === goal.n) ? 'ok' : 'base' })));
    },
    'many-valued'({ m, D, S, SE, R, F0, assign }) {
      if (!F0) return;
      const logic = m.logic, atoms = atomsOf(F0, (m.atoms || []).filter(a => ATOM_RE.test(a)).slice()), lv = mvLevels(logic, m.levels || 5);
      if (!['k3', 'lp', 'l3'].includes(logic)) D.add('grid-only');
      const N = Math.pow(lv.length, atoms.length);
      if (N > 200000) { D.add('budget'); return; }
      const col = [], rows = []; let mn = Infinity, mx = -Infinity, allD = true, someD = false;
      for (let r = 0; r < N; r++) {
        const v = {}; let q = r; for (let i = atoms.length - 1; i >= 0; i--) { v[atoms[i]] = lv[lv.length - 1 - (q % lv.length)]; q = Math.floor(q / lv.length); }
        const x = evalMV(F0, v, logic); col.push(x); mn = Math.min(mn, x); mx = Math.max(mx, x);
        const d = mvDesignated(logic, x, m.designated); if (d) someD = true; else allD = false;
        if (rows.length < 1900) { const row = atoms.map(a => mvStr(v[a])).concat([mvStr(x)]); row.roles = atoms.map(() => 'base').concat([d ? 'ok' : 'bad']); rows.push(row); }
      }
      S.value = evalMV(F0, assign, logic); S.valid = allD; S.satisfiable = someD; S.min = mn; S.max = mx; SE.column = col;
      R.scene = sceneTable(atoms.concat([show(F0)]), rows, D);
    },
    'fol-eval'({ m, D, S, F0, setTrace }) {
      if (!F0) return;
      const St = structure(m), fv = freeVars(F0, St.consts), ctr = { ops: 0 };
      S.domain = St.dom.length;
      const env0 = {}; let count = 0, tot = 0;
      const lines = [];
      (function rec(i, env) {
        if (ctr.over) return;
        if (i === fv.length) { tot++; const v = evalFol(F0, St, env, ctr); if (v) count++; if (lines.length < 64 && fv.length) lines.push({ s: fv.map(x => x + '=' + env[x]).join(' ') + (v ? '  ✓' : '  ✗'), c: tick(v) }); return; }
        for (const d of St.dom) rec(i + 1, { ...env, [fv[i]]: d });
      })(0, env0);
      if (ctr.over) D.add('budget');
      S.count = count; S.value = fv.length ? count === tot : count === 1;
      const struct = [...St.preds.entries()].map(([nm, set]) => ({ s: nm + ' = {' + [...set].map(t => '(' + t + ')').join(' ') + '}', c: 'muted' }));
      setTrace([{ s: show(F0), c: 'info' }].concat(struct, lines));
    },
    unify({ m, D, S, setTrace }) {
      const ts = (m.terms || []).map(s => P1(s, 'fol')).filter(t => t && t.t === 'pred').map(p => ({ t: 'fn', n: p.n, args: p.args }));
      if (ts.length < 2) return;
      const vs = Array.isArray(m.vars) ? new Set(m.vars) : null, isVar = vs ? n => vs.has(n) : defaultVar;
      const ev = [], r = unify(ts.slice(1).map(t => [ts[0], t]), isVar, ev);
      S.unifiable = r.ok; S.bindings = r.ok ? r.s.size : NaN; S.steps = ev.length;
      const lines = ev.map(e => ({ s: e.k === 'bind' ? `${e.a} ↦ ${e.b}` : e.k === 'delete' ? `delete ${e.a} = ${e.a}` : `${e.k} ${e.a}${e.b !== undefined ? ' = ' + e.b : ''}`, c: e.k === 'clash' || e.k === 'occurs' ? 'bad' : e.k === 'bind' ? 'hi' : 'base' }));
      if (r.ok) lines.push({ s: 'mgu {' + [...r.s.entries()].map(([k, v]) => k + '↦' + termStr(v)).join(', ') + '}', c: 'ok' });
      if (!r.ok && r.code) D.add(r.code);
      setTraceFixed(setTrace, lines, S);
    },
    'fol-resolution'({ m, D, S, prem, goal, setTrace }) {
      if (prem.some(p => !p)) return;
      const cl = []; let k = 0;
      for (const f of prem.concat(goal ? [NOT(goal)] : [])) { const c = folClauses(f, String(k++)); if (!c) { D.add('size'); return; } cl.push(...c); }
      const r = folResolution(cl, D, m.bound);
      S.refuted = r.refuted ? 1 : NaN; S.generated = r.generated; S.proofLength = r.proof.length; S.clauses = cl.length;
      if (!r.refuted) D.add('bound');
      const idx = r.refuted ? r.proof : r.all.map((_, i) => i);
      setTrace(idx.map(i => ({ s: `${i + 1}. ${r.str(r.all[i].c)}` + (r.all[i].par ? `  (${r.all[i].par[0] + 1}, ${r.all[i].par[1] + 1})` : ''), c: r.all[i].c.length ? (r.all[i].par ? 'base' : 'muted') : 'ok' })));
    },
    syllogism({ m, S, R }) {
      if (!/^[AEIO]{3}$/.test(m.mood || '')) return;
      const b = syllogism(m.mood, m.figure, false), t = syllogism(m.mood, m.figure, true), show3 = m.existential ? t : b;
      S.valid = b.valid; S.validTraditional = t.valid;
      // the Venn diagram of the premises: ∅ in a region every model leaves empty, × where every model puts something
      const sc = C.scene([-3.2, 3.2, -3, 3]), cx = { S: [-0.9, 0.6], P: [0.9, 0.6], M: [0, -0.9] };
      for (const t3 of ['S', 'P', 'M']) { sc.circ(cx[t3][0], cx[t3][1], 1.6, { c: 'base' }); sc.txt(cx[t3][0] * 2.1, cx[t3][1] * 2.1 + (t3 === 'M' ? -0.2 : 0.5), { s: t3, c: 'info' }); }
      const at = r => { const s = region(r, 'S'), mm = region(r, 'M'), p = region(r, 'P'); const n = s + mm + p; if (!n) return [2.6, -2.6]; let x = 0, y = 0; if (s) { x += cx.S[0]; y += cx.S[1]; } if (mm) { x += cx.M[0]; y += cx.M[1]; } if (p) { x += cx.P[0]; y += cx.P[1]; } x /= n; y /= n; if (n === 1) { x *= 1.5; y *= 1.5; } return [x, y]; };
      for (let r = 0; r < 8; r++) { const [x, y] = at(r); if ((show3.empty >> r) & 1) sc.txt(x, y, { s: '∅', c: 'bad' }); else if ((show3.full >> r) & 1) sc.txt(x, y, { s: '×', c: 'ok' }); }
      R.scene = sc.done();
    },
    kripke({ m, env, D, S, SE, R, F0 }) {
      const M = specModel(m, env, D), r = M.rel[''], n = M.n, fp = frameProps(r, n);
      Object.assign(S, fp); S.worlds = n;
      for (const ax of Object.keys(AXIOMS)) S[ax] = axiomValid(ax, r, n, D);
      const sel = worldIndex(m, env, M);
      let truth = null;
      if (F0 && n) { const ctx = { ops: 0, D }; truth = satK(F0, M, ctx); if (ctx.over) D.add('budget'); S.value = !!truth[sel]; S.count = truth.reduce((a, b) => a + b, 0); SE.truth = Array.from(truth); if (hasDeon(F0) && !fp.serial) D.add('not-serial'); }
      R.scene = graphScene(modelNodes(M, truth, sel, m.worlds), modelEdges(M), m.view);
    },
    tableau({ m, D, S, F0, prem, goal, setTrace }) {
      const sys = m.system || 'K';
      let set;
      if (goal) { if (prem.some(p => !p)) return; set = prem.concat([NOT(goal)]); } else if (F0) set = [NOT(F0)]; else return;
      const r = tableau(set, sys, D);
      const r2 = !goal && F0 ? tableau([F0], sys, D) : null;
      S.valid = r.sat === null ? NaN : !r.sat; S.satisfiable = r2 ? (r2.sat === null ? NaN : r2.sat) : (r.sat === null ? NaN : r.sat); S.nodes = r.nodes; S.worlds = r.worlds + 1;
      setTrace(r.ev.map(e => ({ s: e.k === 'world' ? `w${e.from} → w${e.w}: ${e.s}` : e.k === 'clash' ? `w${e.w} ✗ ${e.s}` : e.k === 'branch' ? `w${e.w} branch ${e.s}` : `w${e.w} blocked ${e.s}`, c: e.k === 'clash' ? 'bad' : e.k === 'world' ? 'hi' : 'base' }))
        .concat([{ s: r.sat === null ? 'budget' : r.sat ? 'open: a model exists' : 'closed: no model', c: r.sat ? 'warn' : 'ok' }]));
    },
    epistemic({ m, env, D, S, SE, R, F0 }) {
      let M, actual = 0, ann = [];
      if (m.puzzle) { const pz = puzzle(m.puzzle); M = pz.M; actual = pz.actual; ann = pz.announce.map(s => P1(s, 'epistemic')); if (m.puzzle.kind === 'consecutive') D.add('boundary'); }
      else { M = specModel(m, env, D, { s5: m.s5 !== false }); actual = worldIndex(m, env, M); }
      if (Array.isArray(m.announce)) ann = ann.concat(m.announce.map(s => P1(s, 'epistemic')));
      ann = ann.filter(Boolean);
      const k = frameOf(m, env, ann.length), left = [M.n];
      let cur = M, curAct = actual, gone = false; const ctx = { ops: 0, D };
      for (let i = 0; i < ann.length; i++) {
        const s = satK(ann[i], cur, ctx);
        if (i < k) {
          if (!gone && curAct >= 0 && !s[curAct]) { D.add('empty'); gone = true; }
          const sub = restrict(cur, s); cur = sub.M; curAct = curAct >= 0 ? sub.map[curAct] : -1;
        }
        left.push(i < k ? cur.n : NaN);
      }
      if (ctx.over) D.add('budget');
      S.worlds = cur.n; SE.worldsLeft = left.filter(isNum);
      if (F0 && cur.n) { const t = satK(F0, cur, ctx); S.count = t.reduce((a, b) => a + b, 0); S.value = curAct >= 0 ? !!t[curAct] : NaN; SE.truth = Array.from(t); R.scene = graphScene(modelNodes(cur, t, curAct, null), modelEdges(cur, true), m.view); }
      else { S.count = 0; S.value = NaN; R.scene = graphScene(modelNodes(cur, null, curAct, null), modelEdges(cur, true), m.view); }
      S.steps = ann.length; S.frame = k;
    },
    ltl({ m, env, D, S, SE, R, F0 }) {
      if (!F0) return;
      const tr = m.trace || [], n = tr.length; if (!n) return;
      const loop = m.loop, succ = Array.from({ length: n }, (_, i) => (i < n - 1 ? i + 1 : loop !== undefined ? loop : -1));
      if (loop === undefined) D.add('finite');
      const val = tr.map(s => new Set((s.holds || []).concat(s.facts || [], s.acts || [])));
      const v = ltlVals(F0, n, succ, val), pos = Math.max(0, Math.min(n - 1, Math.floor(num(m.pos, env, 0))));
      S.value = !!v[pos]; S.count = v.reduce((a, b) => a + b, 0); SE.truth = Array.from(v);
      const sc = C.scene([-0.8, Math.max(n, 2) * 1.2, -1.6, 1.4]), N = Math.min(n, 600);
      if (n > N) D.add('scene-truncated');
      for (let i = 0; i < N; i++) {
        sc.pt(i * 1.2, 0, { r: 6, c: i === pos ? 'hi' : tick(v[i]), s: String(i) });
        sc.txt(i * 1.2, -0.8, { s: short([...val[i]].sort().join(',') || '∅'), c: 'muted' });
        if (succ[i] >= 0 && succ[i] === i + 1) sc.seg(i * 1.2 + 0.2, 0, i * 1.2 + 1, 0, { c: 'muted', arrow: true });
      }
      if (loop !== undefined) sc.poly([(n - 1) * 1.2, 0.3, (n - 1) * 1.2, 0.9, loop * 1.2, 0.9, loop * 1.2, 0.3], { c: 'info', closed: false });
      R.scene = sc.done();
    },
    ctl({ m, env, D, S, SE, R, F0 }) {
      let worlds = m.worlds, edges = m.edges;
      if (m.preset === 'mutex') ({ worlds, edges } = MUTEX());
      const M = kmodel(worlds || [], (edges || []).filter(e => on(e.on, env))), n = M.n, r = M.rel[''];
      for (let i = 0; i < n; i++) { let any = false; for (let j = 0; j < n; j++) if (r[i * n + j]) { any = true; break; } if (!any) { r[i * n + i] = 1; D.add('deadlock'); } }
      S.worlds = n;
      const sel = worldIndex(m, env, M);
      let truth = null;
      if (F0 && n) { const ctx = { ops: 0 }; truth = ctlSat(F0, M, ctx); if (ctx.over) D.add('budget'); S.value = !!truth[sel]; S.count = truth.reduce((a, b) => a + b, 0); SE.truth = Array.from(truth); }
      R.scene = graphScene(modelNodes(M, truth, sel, worlds), modelEdges(M), m.view);
    },
    dyadic({ m, env, D, S, SE, R, F0 }) {
      const M = specModel(m, env, D), n = M.n; S.worlds = n;
      const sel = worldIndex(m, env, M);
      let truth = null;
      if (F0 && n) { const ctx = { ops: 0, D, dyadic: true }; truth = satK(dyadicUniv(F0), M, ctx); S.value = !!truth[sel]; S.count = truth.reduce((a, b) => a + b, 0); SE.truth = Array.from(truth); }
      // worlds drawn by rank: the best (rank 0) at the top
      const nodes = modelNodes(M, truth, sel, null), byRank = {};
      nodes.forEach((nd, i) => { const rk = M.rank[i]; byRank[rk] = (byRank[rk] || 0) + 1; nd.x = isNum((m.worlds[i] || {}).x) ? m.worlds[i].x : (byRank[rk] - 1) * 1.6; nd.y = isNum((m.worlds[i] || {}).y) ? m.worlds[i].y : -rk * 1.4; nd.sub = (nd.sub ? nd.sub + ' · ' : '') + 'r' + rk; });
      R.scene = graphScene(nodes, [], m.view);
    },
    io({ m, D, S, goal, setTrace }) {
      if (!goal) return;
      const G = (m.norms || []).map(nm => ({ id: nm.id, a: nm.cond ? P1(nm.cond, 'prop') : TOP, x: nm.act ? P1(nm.act, 'prop') : null })).filter(g => g.a && g.x);
      const A = (m.input || []).map(s => P1(s, 'prop')).filter(Boolean);
      const atoms = []; G.forEach(g => { atomsOf(g.a, atoms); atomsOf(g.x, atoms); }); A.forEach(a => atomsOf(a, atoms)); atomsOf(goal, atoms);
      const r = ioLogic(G, A, goal, m.op, m.throughput === true, atoms);
      r.codes.forEach(c => D.add(c));
      S.entails = r.entails; S.triggered = r.triggered.length;
      const trig = new Set(r.triggered.map(g => g.id));
      setTrace(G.map(g => ({ s: `${g.id}: (${show(g.a)}, ${show(g.x)})`, c: trig.has(g.id) ? 'hi' : 'muted' })).concat([{ s: `${show(goal)} ${r.entails ? '∈' : '∉'} ${m.op}${m.throughput ? '⁺' : ''}`, c: tick(r.entails) }]));
    },
    norms({ m, env, D, S, SE, R }) {
      const tr = m.trace || [], k = frameOf(m, env, tr.length);
      const norms = (m.norms || []).map(nm => ({ ...nm, on: on(nm.on, env) }));
      const res = evalNorms(norms, tr.slice(0, k), { order: m.order });
      res.codes.forEach(c => D.add(c));
      S.violations = res.counts.violations; S.fulfilments = res.counts.fulfilments; S.pending = res.counts.pending; S.conflicts = res.counts.conflicts;
      S.steps = tr.length; S.frame = k; SE.violationsPerStep = res.perStep; SE.activePerStep = res.activePerStep;
      // a timeline: one row per norm, a mark at each step where it was fulfilled (ok) or violated (bad)
      const ids = norms.map(x => x.id), N = Math.max(tr.length, 1), sc = C.scene([-3, N + 1, -(ids.length + 0.5), 1.2]);
      ids.forEach((id, j) => { sc.txt(-1.5, -j, { s: short(id), c: 'info' }); sc.seg(0, -j, N, -j, { c: 'muted' }); });
      for (const v of res.violations) sc.pt(v.step + 0.5, -ids.indexOf(v.norm), { r: 5, c: 'bad' });
      for (const f of res.fulfilments) sc.pt(f.step + 0.5, -ids.indexOf(f.norm), { r: 5, c: 'ok' });
      for (const p of res.pending) sc.pt(k, -ids.indexOf(p.norm), { r: 4, c: 'warn' });
      sc.seg(k, 0.8, k, -(ids.length - 0.5), { c: 'hi', dash: true });
      R.scene = sc.done();
    },
    af({ m, env, D, S, SE, R }) {
      const args = m.args || [], ix = new Map(args.map((a, i) => [a.id, i]));
      const att = (m.attacks || []).filter(e => on(e.on, env)).map(e => [ix.get(e.u), ix.get(e.v)]).filter(([a, b]) => a !== undefined && b !== undefined);
      const r = afSolve(args.length, att, D), sem = m.semantics || 'grounded';
      const exts = sem === 'grounded' ? [r.grounded] : r[sem];
      if (sem === 'stable' && !exts.length) D.add('no-stable');
      S.extensions = exts.length;
      const q = m.arg !== undefined ? ix.get(m.arg) : undefined;
      if (q !== undefined) { S.credulous = exts.some(e => e[q] === 1); S.skeptical = exts.every(e => e[q] === 1); }
      const shownIdx = Math.max(0, Math.min(exts.length - 1, Math.floor(num(m.ext, env, 0))));
      let lab = exts.length ? exts[shownIdx] : args.map(() => 0.5);
      const total = r.iters.length;
      if (sem === 'grounded' && m.step !== undefined) { const kk = frameOf(m, env, total); lab = kk === 0 ? args.map(() => 0.5) : r.iters[kk - 1]; }
      S.steps = sem === 'grounded' ? total : 0; S.frame = sem === 'grounded' ? frameOf(m, env, total) : 0;
      if (q !== undefined) S.accepted = lab[q] === 1;
      S.inCount = lab.filter(v => v === 1).length; SE.labels = lab.slice();
      const nodes = args.map((a, i) => ({ s: a.id, key: a.label, x: isNum(num(a.x, env, NaN)) ? num(a.x, env, NaN) : undefined, y: isNum(num(a.y, env, NaN)) ? num(a.y, env, NaN) : undefined, c: lab[i] === 1 ? 'ok' : lab[i] === 0 ? 'bad' : 'warn' }));
      R.scene = graphScene(nodes, att.map(([u, v]) => ({ u, v, c: 'muted', both: att.some(([a, b]) => a === v && b === u) })), m.view);
    },
  };
  function hasDeon(g) { if (!g || typeof g !== 'object') return false; if (['O', 'P', 'F'].includes(g.t)) return true; return ['a', 'b', 'c'].some(k => hasDeon(g[k])); }
  function atomsCount(g) { let n = 0; (function go(h) { if (!h || typeof h !== 'object') return; if (h.t === 'atom' || h.t === 'pred') n++; for (const k of ['a', 'b']) if (h[k]) go(h[k]); })(g); return n; }
  function setTraceFixed(setTrace, lines, S) { const st = S.steps; setTrace(lines); S.steps = st; }
  /** in a dyadic model □ / ◇ are the universal modalities (Åqvist's E) */
  function dyadicUniv(f) {
    if (!f || typeof f !== 'object') return f;
    if (f.t === 'box' || f.t === 'dia') return { t: f.t, ag: '*', a: dyadicUniv(f.a) };
    if (['O', 'P', 'F'].includes(f.t)) return { t: f.t, a: dyadicUniv(f.a), c: f.c ? dyadicUniv(f.c) : null };
    const o = { ...f }; for (const k of ['a', 'b']) if (f[k]) o[k] = dyadicUniv(f[k]); return o;
  }
  /* the mutual-exclusion protocol of Huth & Ryan 2004 §3.3.4 (the first attempt): two processes n → t → c → n interleaved, never both
     in c; safety AG ¬(c1 ∧ c2) holds, liveness AG(t1 → AF c1) fails, non-blocking AG(n1 → EX t1) holds */
  function MUTEX() {
    const L = ['n', 't', 'c'], worlds = [], id = (a, b) => 's' + a + b, edges = [];
    for (const a of L) for (const b of L) if (!(a === 'c' && b === 'c')) worlds.push({ id: id(a, b), holds: [a + '1', b + '2'] });
    const nx = { n: 't', t: 'c', c: 'n' };
    for (const w of worlds) {
      const a = w.id[1], b = w.id[2];
      if (!(nx[a] === 'c' && b === 'c')) edges.push({ u: w.id, v: id(nx[a], b) });
      if (!(nx[b] === 'c' && a === 'c')) edges.push({ u: w.id, v: id(a, nx[b]) });
    }
    return { worlds, edges };
  }

  /* =====================================================================================================================
     10. The API for other engines (philo@1, rhetoric@1, law@1, agents@1): stable names, documented in docs/library/logic.md §9 */
  /** entails(premises, conclusion, opts) → {valid, counter, codes}: opts.logic 'prop' (default; truth tables, the first countermodel in
      row order TT…T first), a many-valued logic (k3, lp, l3, lukasiewicz, godel, product: designation preserved on the level grid),
      a modal system K, D, T, K4, S4 (tableaux; local consequence), or 'fol' (no countermodel among the structures with at most
      opts.maxSize ≤ 3 elements: code bounded; valid is then true only up to that size) */
  function entails(prem, concl, opts) {
    opts = opts || {}; const logic = opts.logic || 'prop', codes = [];
    prem = (prem || []).filter(Boolean);
    if (!concl) return { valid: null, counter: null, codes: ['parse'] };
    if (logic === 'prop') {
      const atoms = prem.concat([concl]).reduce((o, f) => atomsOf(f, o), []);
      if (atoms.length > 20) return { valid: null, counter: null, codes: ['size'] };
      const n = atoms.length;
      for (let r = (1 << n) - 1; r >= 0; r--) {
        const v = {}; atoms.forEach((a, i) => { v[a] = !!((r >> (n - 1 - i)) & 1); });
        if (prem.every(p => evalProp(p, v)) && !evalProp(concl, v)) return { valid: false, counter: v, codes };
      }
      return { valid: true, counter: null, codes };
    }
    if (MV.includes(logic)) {
      const atoms = prem.concat([concl]).reduce((o, f) => atomsOf(f, o), []), lv = mvLevels(logic, opts.levels || 5);
      if (Math.pow(lv.length, atoms.length) > 200000) return { valid: null, counter: null, codes: ['size'] };
      if (!['k3', 'lp', 'l3'].includes(logic)) codes.push('grid-only');
      const N = Math.pow(lv.length, atoms.length);
      for (let r = 0; r < N; r++) {
        const v = {}; let q = r; for (let i = atoms.length - 1; i >= 0; i--) { v[atoms[i]] = lv[lv.length - 1 - (q % lv.length)]; q = Math.floor(q / lv.length); }
        if (prem.every(p => mvDesignated(logic, evalMV(p, v, logic), opts.designated)) && !mvDesignated(logic, evalMV(concl, v, logic), opts.designated)) return { valid: false, counter: v, codes };
      }
      return { valid: true, counter: null, codes };
    }
    if (SYSTEMS.includes(logic)) {
      const D = diagSet(), r = tableau(prem.concat([NOT(concl)]), logic, D);
      return { valid: r.sat === null ? null : !r.sat, counter: null, codes: D.list.map(x => x.code) };
    }
    if (logic === 'fol') {
      const maxSize = Math.max(1, Math.min(3, opts.maxSize || 2)), all = prem.concat([NOT(concl)]);
      const pr = new Map(); all.forEach(f => predsOf(f).forEach(([nm, k]) => pr.set(nm, k)));
      const cs = new Set(); all.forEach(f => freeVars(f, new Map()).forEach(c => cs.add(c)));
      let ops = 0;
      for (let size = 1; size <= maxSize; size++) {
        const dom = Array.from({ length: size }, (_, i) => 'd' + i), preds = [...pr.entries()];
        const tuples = k => { let out = [[]]; for (let i = 0; i < k; i++) out = out.flatMap(t => dom.map(d => t.concat([d]))); return out; };
        const T = preds.map(([, k]) => tuples(k)), bits = T.reduce((a, t) => a + t.length, 0), consts = [...cs];
        const cBits = Math.pow(size, consts.length);
        if (bits > 16 || Math.pow(2, bits) * cBits > 200000) { codes.push('budget'); break; }
        for (let mask = 0; mask < Math.pow(2, bits); mask++) for (let cm = 0; cm < cBits; cm++) {
          if (++ops > 400000) { codes.push('budget'); return { valid: null, counter: null, codes }; }
          let b = 0; const P = preds.map(([name], j) => ({ name, tuples: T[j].filter(() => (mask >> b++) & 1) }));
          let q = cm; const cv = consts.map(c => { const d = dom[q % size]; q = Math.floor(q / size); return { name: c, value: d }; });
          const St = structure({ domain: dom, preds: P, consts: cv }), ctr = { ops: 0 };
          if (all.every(f => evalFol(f, St, {}, ctr))) return { valid: false, counter: { domain: dom, preds: P, consts: cv }, codes };
        }
      }
      codes.push('bounded');
      return { valid: true, counter: null, codes };
    }
    return { valid: null, counter: null, codes: ['logic'] };
  }
  /* Dung's semantics as functions of (n, attacks [[a, b]]): each returns labellings (1 in, 0 out, 0.5 undec) */
  const AF = {
    grounded: (n, att) => afSolve(n, att, diagSet()).grounded,
    complete: (n, att) => afSolve(n, att, diagSet()).complete,
    preferred: (n, att) => afSolve(n, att, diagSet()).preferred,
    stable: (n, att) => afSolve(n, att, diagSet()).stable,
    /** semi-stable: the complete labellings with a ⊆-minimal undecided set (Caminada 2006; Caminada, Carnielli & Dunne 2012) */
    semiStable(n, att) {
      const cs = afSolve(n, att, diagSet()).complete, und = l => l.map((v, i) => (v === 0.5 ? i : -1)).filter(i => i >= 0);
      return cs.filter(a => !cs.some(b => b !== a && und(b).length < und(a).length && und(b).every(i => a[i] === 0.5)));
    },
    /** ideal: the ⊆-largest admissible set inside every preferred extension (Dung, Mancarella & Toni 2007, AIJ 171:642) */
    ideal(n, att) {
      const r = afSolve(n, att, diagSet()), S = new Uint8Array(n).fill(1);
      for (const p of r.preferred) for (let i = 0; i < n; i++) if (p[i] !== 1) S[i] = 0;
      for (let ch = true; ch;) { ch = false; for (let b = 0; b < n; b++) if (S[b] && !r.atk[b].every(a => r.atk[a].some(c => S[c]))) { S[b] = 0; ch = true; } }
      return Array.from(S, (x, i) => (x ? 1 : r.atk[i].some(a => S[a]) ? 0 : 0.5));
    },
    /** accept(n, att, semantics, arg) → {credulous, skeptical} */
    accept(n, att, sem, arg) {
      const ls = sem === 'grounded' || sem === 'ideal' ? [AF[sem](n, att)] : AF[sem === 'semi-stable' ? 'semiStable' : sem](n, att);
      return { credulous: ls.some(l => l[arg] === 1), skeptical: ls.every(l => l[arg] === 1) };
    },
  };

  const { engine, simEngine } = C.makeEngine({ id: ID, checkSpec, run, scenes: true });
  engine.workerSource = C.workerSource(noemaLibLogicModule, 'NoemaLibLogic');
  const source = () => '(' + noemaLibLogicModule.toString() + ')(self);';
  root.NoemaLibLogic = Object.freeze({
    table: { model: MODEL_T, outputs: { scalar: [...new Set(Object.values(TASK_OUT).flatMap(x => x[0]).concat(COMMON_S))], series: [...new Set(Object.values(TASK_OUT).flatMap(x => x[1]))], scene: ['drawing'] }, fields: { code: 'enum:' + CODES.join('|') } },
    id: ID, checkSpec, exprs, keys, run, engine: Object.freeze(engine), simEngine, source,
    TASKS, LANGS, CODES, TASK_OUT, ND_RULES, ND_CODES, SYSTEMS, MV, IO_OPS,
    // the API for other engines (stable names)
    parse, show, key, atomsOf, evalProp, evalMV, rowsOf, truthTable, entails, nnf, cnfClauses, tseitin, sat, resolution, hornRule, forwardChain, backwardChain,
    checkProof, structure, evalFol, freeVars, unify, prenex, skolem, folClauses, folResolution, syllogism,
    kmodel, satK, restrict, equivClose, frameProps, axiomValid, tableau, puzzle, ctlSat, ltlVals, MUTEX,
    ioLogic, evalNorms, normMonitor, afSolve, AF, diagSet,
  });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
