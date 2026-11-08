/**
 * The course as text for the AI's prompts (the tutor's context, a new question, a grade): English, never shown to the
 * learner. The search has its own shorter text (catalog/domain/records.ts blockText).
 */
import type { Block, Chapter, Exercise, Media, Region, Section } from './pack.ts';

type MediaMap = Readonly<Record<string, Media>>;
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
const nums = (x: unknown): number[] =>
  Array.isArray(x) ? x.filter((v): v is number => typeof v === 'number') : typeof x === 'number' ? [x] : [];
const str = (x: unknown): string => (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' ? String(x) : '');
const letter = (i: number): string => String.fromCharCode(65 + i);
const regionsOf = (x: { readonly regions?: readonly Region[] }, m: Media | undefined): readonly Region[] => x.regions ?? m?.regions ?? [];
const targets = (ex: Exercise, regs: readonly Region[]): Region[] =>
  Array.isArray(ex['targets']) ? ids(ex['targets']).flatMap(id => regs.filter(r => r.id === id).slice(0, 1)) : [...regs];

export function visualAsText(media: MediaMap, ex: Exercise): string {
  const m = ex.media ? media[ex.media] : undefined;
  const regs = regionsOf(ex, m);
  const L = (id: string): string => regs.find(r => r.id === id)?.label ?? id;
  let t = `Picture: ${m?.alt ?? ex.media ?? ''}${m?.caption ? ` — ${m.caption}` : ''}\n`;
  const named = targets(ex, regs).filter(r => r.label);
  if (named.length) t += `Labeled parts: ${named.map(r => (r.label ?? '') + (r.note ? ` (${r.note})` : '')).join('; ')}\n`;
  if (ex.type === 'img_hotspot') t += `Correct place(s): ${ids(ex.answer).map(L).join(', ')}\n`;
  if (ex.type === 'img_sequence') t += `Correct order: ${ids(ex.answer).map(L).join(' → ')}\n`;
  if (ex.distractors?.length) t += `Distractor labels: ${ex.distractors.join(', ')}\n`;
  return t;
}

export function figureAsText(media: MediaMap, b: Block): string {
  const m = b.media ? media[b.media] : undefined;
  const regs = regionsOf(b, m).filter(r => r.label && !r.id.endsWith('-area'));
  const cap = b.caption ?? m?.caption;
  return `[FIGURE] ${m?.alt ?? b.media ?? ''}${cap ? ` — ${cap}` : ''}${regs.length ? `\nParts: ${regs.map(r => (r.label ?? '') + (r.note ? `: ${r.note}` : '')).join('; ')}` : ''}`;
}

/** the critical-thinking types (ui/exercise/thinking.ts) */
export function typeAsText(ex: Exercise): string {
  switch (ex.type) {
    case 'flaw': {
      const reasons = ex.reasons ?? [];
      return `Lines:\n${(ex.lines ?? []).map((l, i) => `${String(i + 1)}. ${l}`).join('\n')}\nFlawed lines: ${(ex.flaws ?? []).map(i => i + 1).join(', ')}\nReason options: ${reasons.join(' | ')}\nCorrect reason: ${reasons[ex.reason ?? -1] ?? ''}${ex.fix ? `\nFix: ${ex.fix}` : ''}\n`;
    }
    case 'case':
      return `${(ex.parts ?? [])
        .map(
          (p, i) =>
            `Part ${String(i + 1)} (${p.type}): ${p.q}` +
            (p.options
              ? ` Options: ${p.options.join(' | ')} Correct: ${nums(p.answer)
                  .map(a => p.options?.[a] ?? '')
                  .join(' + ')}`
              : ` Answer: ${str(p.answer)}${p.unit ? ` ${p.unit}` : ''}`),
        )
        .join('\n')}\n`;
    case 'predict':
      return `${ex.options ? `Options: ${ex.options.join(' | ')}\nCorrect: ${ex.options[nums(ex.answer)[0] ?? -1] ?? ''}` : `Answer: ${str(ex.answer)} ${ex.unit ?? ''}`}\nWhat happens: ${ex.outcome ?? ''}\n`;
    case 'tree':
      return `Decision tree: ${Object.entries(ex.nodes ?? {})
        .map(([id, n]) => `[${id}] ${n.q} → right: ${n.options.find(o => o.ok)?.text ?? ''}`)
        .join(' | ')}\n`;
    case 'inquiry':
      return `Options with their value (0-3): ${(ex.options ?? []).map((o, i) => `${o} = ${String(ex.scores?.[i] ?? 0)}`).join(' | ')}\n`;
    case 'debate':
      return `${(ex.sides ?? []).map(s => `Position: ${s.position}; strongest objection: ${s.counters[s.best] ?? ''}`).join('\n')}\n`;
    default:
      return '';
  }
}

/** a theory block as text; an interactive block is described by its runtime (activities) */
export function blockText(b: Block, media: MediaMap, interactive: (b: Block) => string = () => ''): string {
  const items = b.items ?? [];
  const o = (x: unknown): Readonly<Record<string, unknown>> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
  switch (b.t) {
    case 'p':
    case 'diagram':
      return b.text ?? '';
    case 'list':
      return items.map(x => `- ${str(x)}`).join('\n');
    case 'code':
      return `\`\`\`${b.lang ?? ''}\n${b.code ?? ''}\n\`\`\``;
    case 'table':
      return [(b.head ?? []).join(' | '), ...(b.rows ?? []).map(r => r.join(' | '))].join('\n');
    case 'callout':
      return `[${(b.kind ?? '').toUpperCase()}] ${b.title ?? ''}: ${b.text ?? ''}`;
    case 'compare':
      return items
        .map(i => `${str(o(i)['title'])}: ${(Array.isArray(o(i)['points']) ? (o(i)['points'] as unknown[]) : []).map(str).join('; ')}`)
        .join('\n');
    case 'flow':
      return items.map(str).join(' → ');
    case 'reveal':
      return `Q: ${b.label ?? ''}\nA: ${b.text ?? ''}`;
    case 'ask':
      return `${b.title ?? 'Ask yourself'}:\n${(b.questions ?? []).map((q, i) => `${String(i + 1)}. ${q}`).join('\n')}`;
    case 'terms':
      return items.map(i => `${str(o(i)['term'])}: ${str(o(i)['def'])}`).join('\n');
    case 'figure':
      return figureAsText(media, b);
    case 'interactive':
      return interactive(b);
    default:
      return '';
  }
}

export function sectionText(s: Section, media: MediaMap, interactive?: (b: Block) => string): string {
  return `## ${s.title}\n${s.hook ?? ''}\n${s.blocks.map(b => blockText(b, media, interactive)).join('\n\n')}`;
}

export function chapterOutline(c: Chapter): string {
  return `# Chapter ${String(c.num)}: ${c.title} — ${c.subtitle ?? ''}\nMantra: ${c.mantra ?? ''}\nSections:\n${c.sections.map(s => `- ${s.title}: ${s.hook ?? ''}`).join('\n')}\nKey pitfalls:\n${c.pitfalls.map(p => `- ${p.title}: ${p.text}`).join('\n')}`;
}

/** the exercise as context for the AI, with its section's notes */
export function exerciseAsText(ex: Exercise, media: MediaMap, sec: Section | undefined, interactive?: (b: Block) => string): string {
  let t = `Exercise (${ex.type}): ${ex.q ?? ''}\n`;
  if (ex.code) t += `Code:\n${ex.code}\n`;
  if (ex.options)
    t += `Options:\n${ex.options.map((o, i) => `${letter(i)}. ${o}`).join('\n')}\nCorrect: ${nums(ex.answer).map(letter).join(', ')}\n`;
  if (ex.type === 'tf') t += `Correct answer: ${str(ex.answer)}\n`;
  if (ex.items && ex.type === 'order') t += `Correct order: ${ex.items.map(str).join(' → ')}\n`;
  if (ex.pairs) t += `Pairs: ${ex.pairs.map(p => `${p[0]} = ${p[1]}`).join('; ')}\n`;
  if (ex.buckets) {
    const b = ex.buckets;
    t += `Buckets: ${(ex.items ?? [])
      .map(i => {
        const it = i as { text?: string; bucket?: number };
        return `${it.text ?? ''} → ${b[it.bucket ?? -1] ?? ''}`;
      })
      .join('; ')}\n`;
  }
  if (ex.text) t += `Text: ${ex.text}\n`;
  if (ex.type.startsWith('img_')) t += visualAsText(media, ex);
  if (ex.lines && ex.type === 'spotbug')
    t += `Code lines:\n${ex.lines.join('\n')}\nBug lines (0-based): ${(ex.bugs ?? []).join(',')}\nFix: ${ex.fix ?? ''}\n`;
  if (ex.type === 'calc') t += `Answer: ${str(ex.answer)} ${ex.unit ?? ''}\n`;
  if (ex.steps) t += `Steps: ${ex.steps.map(s => `${s.prompt} [correct: ${s.options.find(o => o.ok)?.text ?? ''}]`).join(' | ')}\n`;
  t += typeAsText(ex);
  if (ex.model) t += `Model answer: ${ex.model}\n`;
  if (ex.solution) t += `Solution:\n${ex.solution}\n`;
  t += `Explanation: ${ex.explain ?? ''}`;
  return `COURSE NOTES — exercise context:\n${t}${sec ? `\n\nSection notes:\n${sectionText(sec, media, interactive).slice(0, 7000)}` : ''}`;
}
