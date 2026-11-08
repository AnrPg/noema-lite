/* The loop guard of the runtimes that run an author's scripts in a frame (html-app@1, h5p@1; docs/INTERACTIVE.md §7, docs/adr/001 D3).
   In Firefox and WebKit a sandboxed frame shares the app's thread, so an endless loop in it would freeze the whole app (spike c).
   Before a frame is built, every loop of its inline scripts gets a time guard: `while (c)` → `while (G() && (c))`,
   `for (a; b; c)` → `for (a; G() && (b); c)`, `for (x of y)` → `for (x of G.it(y))`, `do … while (c)` the same. G() throws (and
   keeps throwing) once one turn of the event loop has run for longer than the budget, and the frame's bootstrap tells the host,
   which stops the activity and offers Restart. Only a tokenizer, no parser: strings, template literals, comments and regular
   expressions are skipped; the result is the same program with a few calls added. Also read by tests/activities.js (node). */

/* i18n-ignore-start */ // code, not text

export interface Token {
  readonly t: 'id' | 'num' | 'str' | 'tpl' | 're' | 'p';
  readonly v?: string;
  readonly s: number;
  readonly e: number;
}

const KW_BEFORE_REGEX = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);
const SPACE = new Set([' ', '\t', '\n', '\r', ' ', ' ', '﻿', ' ']);

/** → the tokens of a script (comments and whitespace dropped, positions kept) */
export function tokens(src: string): Token[] {
  const out: Token[] = [];
  const n = src.length;
  const tplStack: number[] = []; // brace depth at which a template's ${ … } ends
  let i = 0,
    depth = 0;
  const at = (j: number): string => src.charAt(j);
  const regexAllowed = (): boolean => {
    const p = out[out.length - 1];
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'id') return KW_BEFORE_REGEX.has(p.v ?? '');
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  /** from just after ` or after the closing } of ${ … } → the end (after ` or after ${) */
  const readTpl = (start: number): { end: number; open: boolean } => {
    let j = start;
    while (j < n) {
      const ch = at(j);
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '`') return { end: j + 1, open: false };
      if (ch === '$' && at(j + 1) === '{') return { end: j + 2, open: true };
      j++;
    }
    return { end: n, open: false };
  };
  while (i < n) {
    const ch = at(i);
    if (SPACE.has(ch)) {
      i++;
      continue;
    }
    if (ch === '/' && at(i + 1) === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (ch === '/' && at(i + 1) === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (ch === '<' && src.startsWith('<!--', i)) {
      // an HTML-like comment in a script
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && at(j) !== ch && at(j) !== '\n') j += at(j) === '\\' ? 2 : 1;
      out.push({ t: 'str', s: i, e: Math.min(j + 1, n) });
      i = Math.min(j + 1, n);
      continue;
    }
    if (ch === '`') {
      const r = readTpl(i + 1);
      out.push({ t: 'tpl', s: i, e: r.end });
      if (r.open) {
        tplStack.push(depth);
        depth++;
      }
      i = r.end;
      continue;
    }
    if (ch === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth - 1) {
      // the end of a ${ … } inside a template
      tplStack.pop();
      depth--;
      const r = readTpl(i + 1);
      out.push({ t: 'tpl', s: i, e: r.end });
      if (r.open) {
        tplStack.push(depth);
        depth++;
      }
      i = r.end;
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      let j = i + 1,
        cls = false;
      while (j < n && at(j) !== '\n') {
        const c = at(j);
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (cls) {
          if (c === ']') cls = false;
        } else if (c === '[') cls = true;
        else if (c === '/') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(at(j))) j++;
      out.push({ t: 're', s: i, e: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_$\u0080-￿]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[\w$\u0080-￿]/.test(at(j))) j++;
      out.push({ t: 'id', v: src.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(at(i + 1)))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(at(j))) j++;
      out.push({ t: 'num', s: i, e: j });
      i = j;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === '.' && at(i + 1) === '.' && at(i + 2) === '.') {
      out.push({ t: 'p', v: '...', s: i, e: i + 3 });
      i += 3;
      continue;
    }
    if (ch === '?' && at(i + 1) === '.' && !/[0-9]/.test(at(i + 2))) {
      out.push({ t: 'p', v: '?.', s: i, e: i + 2 });
      i += 2;
      continue;
    }
    out.push({ t: 'p', v: ch, s: i, e: i + 1 });
    i++;
  }
  return out;
}

const punct = (t: Token | undefined): string | null => (t && t.t === 'p' ? (t.v ?? null) : null);

/** the index of the token closing the bracket opened at tk[k] (or -1) */
function closing(tk: readonly Token[], k: number): number {
  let d = 0;
  for (let j = k; j < tk.length; j++) {
    const v = punct(tk[j]);
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') {
      d--;
      if (d === 0) return j;
    }
  }
  return -1;
}

/** transform(src, G) → { code, loops }: the same program with the guard G on every loop */
export function transform(src: string, G: string): { code: string; loops: number } {
  const tk = tokens(src),
    ins: [number, string][] = [];
  let loops = 0;
  const isProp = (k: number): boolean => {
    const v = punct(tk[k - 1]);
    return v === '.' || v === '?.';
  };
  for (let k = 0; k < tk.length; k++) {
    const t = tk[k];
    if (!t || t.t !== 'id' || isProp(k)) continue;
    if (t.v === 'while') {
      const o = k + 1,
        to = tk[o];
      if (!to || to.v !== '(') continue;
      const c = closing(tk, o),
        tc = tk[c];
      if (!tc) continue;
      ins.push([to.e, G + '()&&(']);
      ins.push([tc.s, ')']);
      loops++;
    } else if (t.v === 'for') {
      let o = k + 1;
      const isAwait = tk[o]?.t === 'id' && tk[o]?.v === 'await';
      if (isAwait) o++;
      if (tk[o]?.v !== '(') continue;
      const c = closing(tk, o),
        tc = tk[c];
      if (!tc) continue;
      const semis: Token[] = [];
      let ofAt: Token | null = null,
        d = 0;
      for (let j = o + 1; j < c; j++) {
        const tj = tk[j];
        if (!tj) continue;
        const v = punct(tj);
        if (v === '(' || v === '[' || v === '{') d++;
        else if (v === ')' || v === ']' || v === '}') d--;
        else if (d === 0 && v === ';') semis.push(tj);
        else if (d === 0 && tj.t === 'id' && tj.v === 'of' && !ofAt && semis.length === 0) ofAt = tj;
      }
      const [a, b] = semis;
      if (semis.length === 2 && a && b) {
        if (tk.indexOf(b) === tk.indexOf(a) + 1) ins.push([a.e, G + '()']);
        else {
          ins.push([a.e, G + '()&&(']);
          ins.push([b.s, ')']);
        }
        loops++;
      } else if (ofAt && !isAwait) {
        ins.push([ofAt.e, ' ' + G + '.it(']);
        ins.push([tc.s, ')']);
        loops++;
      }
    }
  }
  ins.sort((x, y) => y[0] - x[0]);
  let code = src;
  for (const [p, s] of ins) code = code.slice(0, p) + s + code.slice(p);
  return { code, loops };
}

/** the guard itself, as the source of a script for the frame (installed non-writable on window under the random name G) */
export function runtime(G: string, budgetMs: number, onTrip: string): string {
  return `(function(){var t0=0,c=0,tripped=false,B=${String(budgetMs || 1500)},ch=new MessageChannel();ch.port1.onmessage=function(){t0=0;c=0;};
function trip(){tripped=true;try{(${onTrip})();}catch(e){}throw new Error('noema: this activity ran too long without a pause and was stopped');}
function g(){if(tripped)trip();if((++c&255)===0){var n=performance.now();if(!t0){t0=n;ch.port2.postMessage(0);}else if(n-t0>B)trip();}return true;}
g.it=function(x){if(x==null)return x;var it=x[Symbol.iterator]?x[Symbol.iterator]():x;var o={};o[Symbol.iterator]=function(){return{next:function(){g();return it.next();},return:function(v){return it.return?it.return(v):{done:true,value:v};}};};return o;};
Object.freeze(g.it);Object.freeze(g);Object.defineProperty(window,${JSON.stringify(G)},{value:g,writable:false,configurable:false,enumerable:false});})();`;
}

/** a random name for the guard in one frame */
export const guardName = (): string =>
  '__noemaGuard' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

/* i18n-ignore-end */
