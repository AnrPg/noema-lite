/* ===================== interactive activities — the loop guard (docs/INTERACTIVE.md §7, docs/adr/001 D3) =====================
   A mini-app (runtime html-app@1) runs in a sandboxed frame. In Firefox and WebKit that frame shares the app's thread, so an
   endless loop in it would freeze the whole app (spike c). Before a mini-app is mounted, every loop of its inline scripts gets a
   time guard: `while (c)` → `while (G() && (c))`, `for (a; b; c)` → `for (a; G() && (b); c)`, `for (x of y)` → `for (x of G.it(y))`,
   `do … while (c)` the same. G() throws (and keeps throwing) once one turn of the event loop has run for longer than the budget, and
   the frame's bootstrap tells the host, which stops the activity and offers Restart. Only a tokenizer, no parser: strings, template
   literals, comments and regular expressions are skipped; the result is the same program with a few calls added.
   Also used by tests/activities.js (node) and the authoring lint (it reports what it would guard). */
(function (root) {
  /* i18n-ignore-start */   // code, not text
  const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
  /** → tokens [{t: 'id'|'num'|'str'|'tpl'|'re'|'p'|'c', v, s, e}] (c = comment / whitespace are dropped, positions kept) */
  function tokens(src) {
    const out = []; let i = 0; const n = src.length;
    const tplStack = [];   // brace depth at which a template's ${ … } ends
    let depth = 0;
    const prevSig = () => out[out.length - 1];
    const regexAllowed = () => {
      const p = prevSig(); if (!p) return true;
      if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
      if (p.t === 'id') return KW_BEFORE_REGEX.has(p.v);
      return !(p.v === ')' || p.v === ']' || p.v === '}');
    };
    const readTpl = (start) => {   // from just after ` or after a closing } of ${ … }; returns end index (after ` or after ${)
      let j = start;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '`') return { end: j + 1, open: false };
        if (ch === '$' && src[j + 1] === '{') return { end: j + 2, open: true };
        j++;
      }
      return { end: n, open: false };
    };
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ' || ch === '﻿' || ch === ' ') { i++; continue; }
      if (ch === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
      if (ch === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
      if (ch === '<' && src.startsWith('<!--', i)) { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }   // HTML-like comment in a script
      if (ch === '"' || ch === "'") {
        let j = i + 1; while (j < n && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        out.push({ t: 'str', s: i, e: Math.min(j + 1, n) }); i = Math.min(j + 1, n); continue;
      }
      if (ch === '`') {
        const r = readTpl(i + 1); out.push({ t: 'tpl', s: i, e: r.end });
        if (r.open) { tplStack.push(depth); depth++; }
        i = r.end; continue;
      }
      if (ch === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth - 1) {   // the end of a ${ … } inside a template
        tplStack.pop(); depth--;
        const r = readTpl(i + 1); out.push({ t: 'tpl', s: i, e: r.end });
        if (r.open) { tplStack.push(depth); depth++; }
        i = r.end; continue;
      }
      if (ch === '/' && regexAllowed()) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') { const c = src[j]; if (c === '\\') { j += 2; continue; } if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true; else if (c === '/') break; j++; }
        j++; while (j < n && /[a-z]/i.test(src[j])) j++;
        out.push({ t: 're', s: i, e: j }); i = j; continue;
      }
      if (/[A-Za-z_$\u0080-￿]/.test(ch)) { let j = i + 1; while (j < n && /[\w$\u0080-￿]/.test(src[j])) j++; out.push({ t: 'id', v: src.slice(i, j), s: i, e: j }); i = j; continue; }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; out.push({ t: 'num', s: i, e: j }); i = j; continue; }
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      if (ch === '}' || ch === ')' || ch === ']') depth--;
      if (ch === '.' && src[i + 1] === '.' && src[i + 2] === '.') { out.push({ t: 'p', v: '...', s: i, e: i + 3 }); i += 3; continue; }
      if (ch === '?' && src[i + 1] === '.' && !/[0-9]/.test(src[i + 2] || '')) { out.push({ t: 'p', v: '?.', s: i, e: i + 2 }); i += 2; continue; }
      out.push({ t: 'p', v: ch, s: i, e: i + 1 }); i++;
    }
    return out;
  }
  /** index of the token closing the bracket opened at tokens[k] (or -1) */
  function closing(tk, k) {
    let d = 0;
    for (let j = k; j < tk.length; j++) {
      const v = tk[j].t === 'p' ? tk[j].v : null;
      if (v === '(' || v === '[' || v === '{') d++;
      else if (v === ')' || v === ']' || v === '}') { d--; if (d === 0) return j; }
    }
    return -1;
  }
  /** transform(src, G) → { code, loops }: the same program with the guard G on every loop. */
  function transform(src, G) {
    const tk = tokens(src), ins = [];   // [position, text]
    let loops = 0;
    const isProp = k => k > 0 && tk[k - 1].t === 'p' && (tk[k - 1].v === '.' || tk[k - 1].v === '?.');
    for (let k = 0; k < tk.length; k++) {
      const t = tk[k]; if (t.t !== 'id' || isProp(k)) continue;
      if (t.v === 'while') {
        const o = k + 1; if (!tk[o] || tk[o].v !== '(') continue;
        const c = closing(tk, o); if (c < 0) continue;
        ins.push([tk[o].e, G + '()&&(']); ins.push([tk[c].s, ')']); loops++;
      } else if (t.v === 'for') {
        let o = k + 1; const isAwait = !!(tk[o] && tk[o].t === 'id' && tk[o].v === 'await'); if (isAwait) o++;
        if (!tk[o] || tk[o].v !== '(') continue;
        const c = closing(tk, o); if (c < 0) continue;
        const semis = []; let ofAt = -1, d = 0;
        for (let j = o + 1; j < c; j++) {
          const v = tk[j].t === 'p' ? tk[j].v : null;
          if (v === '(' || v === '[' || v === '{') d++; else if (v === ')' || v === ']' || v === '}') d--;
          else if (d === 0 && v === ';') semis.push(j);
          else if (d === 0 && tk[j].t === 'id' && tk[j].v === 'of' && ofAt < 0 && semis.length === 0) ofAt = j;
        }
        if (semis.length === 2) {
          const a = semis[0], b = semis[1];
          if (b === a + 1) ins.push([tk[a].e, G + '()']);
          else { ins.push([tk[a].e, G + '()&&(']); ins.push([tk[b].s, ')']); }
          loops++;
        } else if (ofAt >= 0 && !isAwait) { ins.push([tk[ofAt].e, ' ' + G + '.it(']); ins.push([tk[c].s, ')']); loops++; }
      }
    }
    ins.sort((x, y) => y[0] - x[0]);
    let code = src; for (const [p, s] of ins) code = code.slice(0, p) + s + code.slice(p);
    return { code, loops };
  }
  /** The guard itself, as the source of a script for the frame (installed non-writable on window under the random name G). */
  function runtime(G, budgetMs, onTrip) {
    return `(function(){var t0=0,c=0,tripped=false,B=${Number(budgetMs) || 1500},ch=new MessageChannel();ch.port1.onmessage=function(){t0=0;c=0;};
function trip(){tripped=true;try{(${onTrip})();}catch(e){}throw new Error('noema: this activity ran too long without a pause and was stopped');}
function g(){if(tripped)trip();if((++c&255)===0){var n=performance.now();if(!t0){t0=n;ch.port2.postMessage(0);}else if(n-t0>B)trip();}return true;}
g.it=function(x){if(x==null)return x;var it=x[Symbol.iterator]?x[Symbol.iterator]():x;var o={};o[Symbol.iterator]=function(){return{next:function(){g();return it.next();},return:function(v){return it.return?it.return(v):{done:true,value:v};}};};return o;};
Object.freeze(g.it);Object.freeze(g);Object.defineProperty(window,${JSON.stringify(G)},{value:g,writable:false,configurable:false,enumerable:false});})();`;
  }
  root.NoemaLoopGuard = Object.freeze({ tokens, transform, runtime });
  /* i18n-ignore-end */
})(typeof window !== 'undefined' ? window : globalThis);
