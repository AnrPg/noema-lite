/* noema-lite — what the code of an activity may not contain: an html-app@1 bundle (lintHtml) and the Python of a py-module@1
   activity (lintPython). docs/INTERACTIVE.md §8, docs/INTERACTIVE_PYTHON.md. */
import { utf8Length } from '../../../../kernel/bytes.ts';
import type { Report } from '../util.ts';
import { BANNED, HTML_MAX, HTML_WARN, PY_BANNED, PY_BASE, PY_EXTRAS, PY_MAX, PY_WARN, WARN } from './rules.ts';

/** the words a learner would see in the HTML (outside scripts and styles) */
function visibleText(html: string): string[] {
  let body = html.includes('<body') ? html.split('<body').slice(1).join('<body') : html;
  body = body
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  return body.match(/[\p{L}]{2,}/gu) ?? [];
}

/** lintHtml(html) → the errors and warnings of an html-app@1 bundle */
export function lintHtml(html: unknown): Report {
  const E: string[] = [],
    W: string[] = [];
  if (typeof html !== 'string' || !html.trim()) return { errors: ['the bundle is empty'], warnings: W };
  const n = utf8Length(html);
  if (n > HTML_MAX) E.push(`the bundle is ${Math.floor(n / 1024)} KB (at most ${HTML_MAX / 1024} KB)`);
  else if (n > HTML_WARN) W.push(`the bundle is ${Math.floor(n / 1024)} KB (aim for <= ${HTML_WARN / 1024} KB)`);
  for (const [re, why] of BANNED) {
    const m = re.exec(html);
    if (m) E.push(`${why} — found “${m[0].slice(0, 40)}”`);
  }
  for (const [re, why] of WARN) if (re.test(html)) W.push(why);
  const words = visibleText(html);
  if (words.length >= 3)
    W.push(
      `visible text in the HTML (“${words.slice(0, 6).join(' ')}…”): put every word in the string tables and show it with noema.t(key)`,
    );
  return { errors: E, warnings: W };
}

/** lintPython(source, packages) → what a py-module@1 activity may not contain */
export function lintPython(src: unknown, packages?: unknown): Report {
  const E: string[] = [],
    W: string[] = [];
  if (typeof src !== 'string' || !src.trim()) return { errors: ['the Python file is empty'], warnings: W };
  const n = utf8Length(src);
  if (n > PY_MAX) E.push(`the Python file is ${Math.floor(n / 1024)} KB (at most ${PY_MAX / 1024} KB)`);
  if (!/^def\s+step\s*\(/m.test(src)) E.push('the Python file defines no step(inputs, state) at the top level');
  for (const [re, why] of PY_BANNED) {
    const m = re.exec(src);
    if (m) E.push(`${why} — found “${m[0].trim().slice(0, 40)}”`);
  }
  for (const [re, why] of PY_WARN) if (re.test(src)) W.push(why);
  const decl = new Set<unknown>(Array.isArray(packages) ? (packages as unknown[]) : []);
  for (const name of [...PY_BASE, ...PY_EXTRAS])
    if (!decl.has(name) && new RegExp('^\\s*(?:import|from)\\s+' + name + '\\b', 'm').test(src))
      E.push(`the Python file imports ${name}: list it in "packages"`);
  return { errors: E, warnings: W };
}
