/** Fixtures of the tutor's unit tests: a catalog in a map, a persona, a subject, a small course. */
import type { I18n } from '../../../ports/i18n.ts';
import type { CourseLookup, Persona, PromptSubject, ReplyLanguage } from './prompts.ts';

/** a catalog in a map: the key itself when missing, {name} filled in */
export function fakeI18n(m: Record<string, string> = {}): I18n {
  const fill = (s: string, p?: Record<string, unknown>): string =>
    s.replace(/\{(\w+)[^}]*\}/g, (_x, k: string) => (p && k in p ? String(p[k]) : ''));
  return {
    t: (k, p) => fill(m[k] ?? k, p),
    has: k => k in m,
    err: e => (e instanceof Error ? e.message : String(e)),
    plural: () => 'other',
    locale: () => 'en',
    chain: () => ['en'],
    dir: () => 'ltr',
    format: {
      number: n => String(n),
      percent: n => String(n),
      date: d => String(d),
      time: d => String(d),
      relative: n => String(n),
      list: l => l.join(', '),
      compare: (a, b) => a.localeCompare(b),
    },
    onChange: () => () => undefined,
  };
}
export const PERSONA: Persona = {
  name: 'Ada',
  avatar: '🦉',
  domain: 'physics',
  prior: '',
  examples: 'Everyday examples.',
  interviewer: 'an examiner for physics',
  simulation: 'a lab anomaly',
  terminology: 'SI units',
  examinerRole: 'physics examiner',
};
export const SUBJECT: PromptSubject = { title: 'Physics', language: 'en', math: true, code: false, learner: 'The learner likes tests.' };
export const EN: ReplyLanguage = { code: 'en', name: 'English', rule: '', fields: () => '' };
export const COURSE: CourseLookup = {
  outlines: () => ['Ch1 Motion', 'Ch2 Energy'],
  section: id =>
    id === 'ch01-s01' ? { title: 'Speed', chapter: 'ch01', text: 'Speed is distance over time.', mantra: 'Measure first.' } : null,
  chapter: id => (id === 'ch01' ? { num: 1, title: 'Motion', outline: 'Motion: speed, velocity' } : null),
  playbook: id =>
    id === 'pb1'
      ? {
          title: 'Wrong sign',
          symptom: 'negative energy',
          askYourself: ['units?', 'sign?'],
          steps: [{ do: 'check', code: 'x' }],
          rootCauses: ['sign'],
          fix: 'flip',
        }
      : null,
};
