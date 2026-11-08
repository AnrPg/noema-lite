/**
 * The study screens' text: a pack's inline markdown (`**bold**`, `*em*`, `` `code` ``, line breaks) as safe HTML, code
 * with the app's syntax colours, and the tutor's full markdown (marked + DOMPurify when the page has them, a small safe
 * subset otherwise). Every function returns an HTML string that is safe to put into the page: the pack's and the AI's
 * text are always escaped or sanitised first. A code block's ⧉ copy button is handled once for the whole page
 * (`wireCopy`), so a block drawn by a template needs no listener of its own.
 */

/** a text of a pack or of the AI: a string, sometimes a number, or nothing */
export type Text = string | number | null | undefined;

export const esc = (s: Text): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Inline markdown-lite → safe HTML. */
export function fmt(text: Text): string {
  const codes: string[] = [];
  const s = String(text ?? '').replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(c);
    return `\u0000${String(codes.length - 1)}\u0000`;
  });
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)])}</code>`);
}

/* the keywords the highlighter colours (code, not words of the interface) */
const KW: Readonly<Record<string, string>> = {
  sql: 'select from where group by order having limit join left right inner outer full cross on as and or not null is in exists between like case when then else end create replace table view or if insert into values overwrite update set delete merge using matched source target alter add column columns drop truncate describe detail history restore version timestamp of vacuum retain hours optimize zorder cluster partitioned tblproperties show tables schemas catalogs use catalog schema grant revoke to all privileges with distinct union explain analyze compute statistics refresh streaming live stream materialized constraint expect violation fail row rows over partition row_number rank desc asc true false cast coalesce sum count avg min max apply purge reorg full by liquid auto',
  python:
    'def return import from as if elif else for while in not and or is none true false class with try except finally raise lambda yield pass break continue global print self',
};
const KWSET = new Map(Object.entries(KW).map(([k, v]) => [k, new Set(v.split(' '))]));

/** Code → HTML with the token classes of the theme (tk-c comment, tk-s string, tk-n number, tk-k keyword, tk-f call). */
export function highlight(code: string, language?: string): string {
  const lang = (language ?? '').toLowerCase();
  const set = KWSET.get(lang === 'pyspark' ? 'python' : lang);
  const re =
    /(--[^\n]*|#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|([\s\S])/g;
  let out = '';
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const [, com, str, num, word, call, other] = m;
    if (com !== undefined) {
      const isCom =
        (lang === 'sql' && com.startsWith('--')) || (['python', 'bash', 'yaml', 'pyspark'].includes(lang) && com.startsWith('#'));
      out += isCom ? `<span class="tk-c">${esc(com)}</span>` : esc(com);
    } else if (str !== undefined) out += `<span class="tk-s">${esc(str)}</span>`;
    else if (num !== undefined) out += `<span class="tk-n">${num}</span>`;
    else if (word !== undefined) {
      if (set?.has(word.toLowerCase())) out += `<span class="tk-k">${word}</span>`;
      else if (call !== undefined && lang !== 'text') out += `<span class="tk-f">${word}</span>`;
      else out += word;
      if (call !== undefined) out += esc(call);
    } else out += esc(other);
  }
  return out;
}

/** The language a piece of code is most likely in (for its colours). */
export function guessLang(code: string): string {
  if (/spark\.|\bdf\.|dbutils|^\s*import |\.write\b|\.read\b|\bF\.|^\s*def |display\(/m.test(code)) return 'python';
  if (
    /\b(select|insert|merge|update|delete|create|alter|describe|show|grant|revoke|optimize|vacuum|restore|row_number|partition by|count\(|truncate|refresh|use)\b/i.test(
      code,
    )
  )
    return 'sql';
  if (/^\s*(databricks|pip|git|%sh)\b/m.test(code)) return 'bash';
  return 'text';
}

/** A code block: the language tag, the coloured code and the copy button (its label from the caller, in the UI language). */
export function codeBlockHtml(code: string, lang: string | undefined, copyLabel: string): string {
  const tag = lang && lang !== 'text' ? `<span class="lang">${esc(lang)}</span>` : '';
  return `<div class="pre" data-code="${esc(code)}">${tag}${highlight(code, lang)}<button class="copy" type="button" data-copy>${esc(copyLabel)}</button></div>`;
}

/** What the page offers for rich markdown (engine/vendor: marked, DOMPurify); null: the small safe subset. */
export interface MarkdownLibs {
  parse(markdown: string): string;
  sanitize(html: string): string;
}

/** The tutor's markdown → safe HTML (code blocks with the app's colours, tables in a scroll box). */
export function markdown(text: Text, copyLabel: string, libs: MarkdownLibs | null): string {
  const s = String(text ?? '');
  if (libs) {
    const html = libs.sanitize(libs.parse(s));
    return `<div class="mdx">${html
      .replace(/<pre><code(?: class="language-([\w+-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (_, lang: string | undefined, body: string) => {
        const code = unescapeHtml(body).replace(/\n$/, '');
        return codeBlockHtml(code, lang ?? guessLang(code), copyLabel);
      })
      .replace(/<table>/g, '<div class="tablewrap"><table>')
      .replace(/<\/table>/g, '</table></div>')}</div>`;
  }
  return markdownLite(s, copyLabel);
}

const unescapeHtml = (s: string): string =>
  s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e: string) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[e] ?? '');

/** Paragraphs, lists, headings (as bold lines) and fenced code; everything escaped. */
export function markdownLite(s: string, copyLabel: string): string {
  const parts = s.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 1) {
      out += codeBlockHtml((parts[i + 1] ?? '').replace(/\n$/, ''), parts[i] || 'text', copyLabel);
      i++;
      continue;
    }
    const txt = parts[i] ?? '';
    if (!txt.trim()) continue;
    let list: string[] | null = null,
      ltype = '',
      para: string[] = [];
    const flushP = (): void => {
      if (para.length) out += `<p>${para.map(fmt).join('<br>')}</p>`;
      para = [];
    };
    const flushL = (): void => {
      if (list) out += `<${ltype}>${list.join('')}</${ltype}>`;
      list = null;
      ltype = '';
    };
    for (const ln of txt.split('\n')) {
      const ul = /^\s*[-*•]\s+(.*)/.exec(ln),
        ol = /^\s*\d+[.)]\s+(.*)/.exec(ln),
        hd = /^\s*#{1,4}\s+(.*)/.exec(ln);
      if (ul || ol) {
        flushP();
        const t = ul ? 'ul' : 'ol';
        if (!list || ltype !== t) {
          flushL();
          list = [];
          ltype = t;
        }
        list.push(`<li>${fmt((ul ?? ol)?.[1])}</li>`);
      } else if (hd) {
        flushP();
        flushL();
        out += `<p><strong>${fmt(hd[1])}</strong></p>`;
      } else if (!ln.trim()) {
        flushP();
        flushL();
      } else {
        flushL();
        para.push(ln);
      }
    }
    flushP();
    flushL();
  }
  return `<div>${out}</div>`;
}

/** One listener for every code block's copy button under `root`: copies the code, then `copied()` (a toast). */
export function wireCopy(root: EventTarget, copy: (text: string) => void): () => void {
  const on = (e: Event): void => {
    const t = e.target as Element | null;
    const btn = t?.closest('[data-copy]');
    const pre = btn?.closest('.pre');
    if (!btn || !(pre instanceof HTMLElement)) return;
    e.stopPropagation();
    copy(pre.dataset['code'] ?? '');
  };
  root.addEventListener('click', on);
  return () => {
    root.removeEventListener('click', on);
  };
}
