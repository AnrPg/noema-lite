/**
 * The AI's one-shot jobs on exercises (formerly engine/src/20_ai.js aiGrade, aiQuestion, aiDrillGrade): grading a free
 * answer or code, a new multiple-choice question on a section, grading a drill's checklist. Each asks for one JSON object
 * (the reply-language rule names the learner's language for its texts) and is kept as a conversation of its own kind.
 */
import { NoemaError } from '../../../kernel/errors.ts';
import type { I18n } from '../../../ports/i18n.ts';
import {
  DRILL_SCHEMA,
  GRADE_SCHEMA,
  QUESTION_SCHEMA,
  drillPrompt,
  firstJson,
  gradePrompt,
  questionPrompt,
  type GradedExercise,
  type Persona,
  type ReplyLanguage,
} from '../domain/prompts.ts';
import type { TutorAi, TutorSession } from './tutor.ts';
import { str } from '../domain/threads.ts';

export interface Grade {
  score: number;
  verdict: string;
  covered?: string[];
  missing?: string[];
  mistakes?: string[];
  feedback: string;
}
export interface DrillGrade {
  score: number;
  hit: number[];
  feedback: string;
}
export interface NewQuestion {
  q: string;
  code: string;
  options: string[];
  answer: number;
  why: string[];
  explain: string;
}
export interface JobDeps {
  readonly i18n: I18n;
  ai(): Promise<TutorAi>;
  persona(): Persona;
  language(): ReplyLanguage;
}

async function askJson(d: JobDeps, system: string, prompt: string, schema: object): Promise<Record<string, unknown>> {
  const ai = await d.ai();
  const r = await ai.chat({
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    json: true,
    jsonSchema: schema as never,
    temperature: 0.4,
  });
  if (!r.ok) throw r.error;
  const v = firstJson(r.value.text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new NoemaError('ai.not_json', 'The answer was not valid JSON.');
  return v as Record<string, unknown>;
}
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
const plainQ = (q: unknown): string =>
  str(q ?? '')
    .replace(/[*`_]/g, '')
    .slice(0, 70);

export class TutorJobs {
  readonly #d: JobDeps;
  readonly #session: TutorSession;
  constructor(d: JobDeps, session: TutorSession) {
    this.#d = d;
    this.#session = session;
  }

  /** grades a free answer (or reviews code: type "write") against its model answer and the section's notes */
  async grade(
    ex: GradedExercise & { readonly id: string },
    answer: string,
    where: { readonly notes: string; readonly label: string | null },
  ): Promise<Grade> {
    const p = gradePrompt(ex, answer, where.notes, this.#d.persona(), this.#d.language());
    const g = await askJson(this.#d, p.system, p.prompt, GRADE_SCHEMA);
    const out: Grade = {
      score: Number(g['score']) || 0,
      verdict: str(g['verdict'] ?? ''),
      covered: strs(g['covered']),
      missing: strs(g['missing']),
      mistakes: strs(g['mistakes']),
      feedback: str(g['feedback'] ?? ''),
    };
    const t = this.#d.i18n.t.bind(this.#d.i18n),
      code = ex.type === 'write';
    this.#session.logAI(code ? 'code-review' : 'grading', {
      ctx: { kind: 'exercise', id: ex.id, label: where.label ? t('engine.log.exCtx', { ch: where.label, id: ex.id }) : ex.id },
      title: t(code ? 'engine.log.codeReview' : 'engine.log.grading', { q: plainQ(ex.q) }),
      prompt:
        t('engine.log.questionMd', { q: ex.q }) +
        (ex.code ? '\n\n```\n' + ex.code + '\n```' : '') +
        '\n\n' +
        t('engine.log.myAnswerMd') +
        '\n\n' +
        (code ? '```\n' + answer + '\n```' : answer),
      response:
        t('engine.log.scoreMd', { score: out.score }) +
        ' — ' +
        out.verdict +
        '\n\n' +
        (out.covered?.length ? '✅ ' + out.covered.join(' · ') + '\n\n' : '') +
        (out.missing?.length ? '➕ ' + t('engine.log.missing', { list: out.missing.join(' · ') }) + '\n\n' : '') +
        (out.mistakes?.length ? '❌ ' + out.mistakes.join(' · ') + '\n\n' : '') +
        out.feedback,
    });
    return out;
  }

  /** a fresh multiple-choice question on a section (seen: questions it must not repeat) */
  async question(sec: {
    readonly id: string;
    readonly title: string;
    readonly notes: string;
    readonly label: string;
    readonly seen: readonly string[];
  }): Promise<NewQuestion> {
    const p = questionPrompt(sec.seen, sec.notes, this.#d.persona(), this.#d.language());
    const r = await askJson(this.#d, p.system, p.prompt, QUESTION_SCHEMA);
    const options = strs(r['options']).slice(0, 4);
    const out: NewQuestion = {
      q: str(r['q'] ?? ''),
      code: str(r['code'] ?? ''),
      options,
      answer: Math.max(0, Math.min(3, Math.trunc(Number(r['answer']) || 0))),
      why: strs(r['why']).slice(0, 4),
      explain: str(r['explain'] ?? ''),
    };
    const t = this.#d.i18n.t.bind(this.#d.i18n);
    this.#session.logAI('question', {
      ctx: { kind: 'section', id: sec.id, label: sec.label },
      title: t('engine.log.aiQuestion', { q: plainQ(out.q) }),
      prompt: t('engine.log.aiQuestionAsk', { title: sec.title }),
      response:
        `${out.q}${out.code ? '\n\n```\n' + out.code + '\n```' : ''}\n\n${options
          .map(
            (o, i) =>
              `${i === out.answer ? '✅' : '▫️'} ${String.fromCharCode(65 + i)}. ${o}${out.why[i] ? ' — *' + out.why[i] + '*' : ''}`,
          )
          .join('\n')}\n\n` + t('engine.log.explanationMd', { text: out.explain }),
    });
    return out;
  }

  /** grades the questions a learner would ask themselves on a drill's symptom against its checklist */
  async drillGrade(
    dr: { readonly id: string; readonly title: string; readonly symptom: string; readonly askYourself: readonly string[] },
    answer: string,
  ): Promise<DrillGrade> {
    const p = drillPrompt(dr, answer, this.#d.language());
    const g = await askJson(this.#d, p.system, p.prompt, DRILL_SCHEMA);
    const out: DrillGrade = {
      score: Number(g['score']) || 0,
      hit: Array.isArray(g['hit']) ? g['hit'].map(Number).filter(n => Number.isInteger(n)) : [],
      feedback: str(g['feedback'] ?? ''),
    };
    const t = this.#d.i18n.t.bind(this.#d.i18n);
    this.#session.logAI('drill-grading', {
      ctx: { kind: 'playbook', id: dr.id, label: dr.title },
      title: t('engine.log.drill', { title: dr.title }).slice(0, 90),
      prompt: t('engine.log.symptomMd', { symptom: dr.symptom }) + '\n\n' + t('engine.log.myQuestionsMd') + '\n\n' + answer,
      response:
        t('engine.log.drillScoreMd', { score: out.score, hit: out.hit.length, of: dr.askYourself.length }) +
        '\n\n' +
        out.feedback +
        '\n\n' +
        t('engine.log.checklistMd') +
        '\n' +
        dr.askYourself.map((q, i) => `${out.hit.includes(i) ? '✅' : '▫️'} ${str(i + 1)}. ${q}`).join('\n'),
    });
    return out;
  }
}
