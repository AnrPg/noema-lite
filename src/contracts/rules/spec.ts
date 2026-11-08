/* noema-lite — specifications: small, composable rules over the contracts' data (the specification pattern).
   A rule never throws: it returns the issues it finds (none = satisfied). The pack checks (pack.ts), the quality rules
   Q1–Q8 (quality.ts) and the level rules (levels.ts) are built from them; the app, the connector and the tools run the same. */

export interface RuleIssue {
  /** the rule's stable id, e.g. "levels.prerequisite" */
  readonly rule: string;
  /** where: a step id, a level id, a chapter id … */
  readonly at: string;
  /** English, like every check message (docs/i18n.md: diagnostics stay English) */
  readonly message: string;
}

export interface Spec<T> {
  readonly id: string;
  issues(subject: T): RuleIssue[];
}

/** A rule from a function. */
export const spec = <T>(id: string, issues: (subject: T) => RuleIssue[]): Spec<T> => ({ id, issues });

/** Every rule (their issues together). */
export const all = <T>(id: string, ...specs: readonly Spec<T>[]): Spec<T> => spec(id, x => specs.flatMap(s => s.issues(x)));

/** A rule that applies only when the condition holds. */
export const when = <T>(cond: (subject: T) => boolean, s: Spec<T>): Spec<T> => spec(s.id, x => (cond(x) ? s.issues(x) : []));

/** The rule over a part of the subject. */
export const on = <T, U>(part: (subject: T) => U, s: Spec<U>): Spec<T> => spec(s.id, x => s.issues(part(x)));

export const satisfied = <T>(s: Spec<T>, subject: T): boolean => s.issues(subject).length === 0;
