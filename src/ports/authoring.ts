/**
 * Authoring port: what the activity author's screens (src/ui/screens/author) need from the authoring feature
 * (src/features/author): a form's view of a JSON document under its schema and the edits on it (`SchemaFormModel`, drawn by
 * `noema-schema-form`), and the activity author itself (`AuthorService`: the kinds, the checks, the files). docs/activities-dev/authoring_ui.md.
 */

/** a place in a JSON document: keys and array indexes */
export type FieldPath = readonly (string | number)[];

/** one choice of a select */
export interface FieldOption {
  readonly value: string;
  readonly label: string;
}
interface FieldBase {
  readonly path: FieldPath;
  readonly label: string;
  readonly help: string;
  /** shown without its x (an array item, a required field, a branch's body) */
  readonly required: boolean;
  /** has an x that removes it from its object */
  readonly removable: boolean;
  /** drawn without its heading (the body of an alternative, a value in an array's row) */
  readonly bare?: boolean;
}
export type InputControl = 'select' | 'checkbox' | 'number' | 'integer' | 'text' | 'textarea' | 'json';
/** a value edited in one control */
export interface InputField extends FieldBase {
  readonly kind: 'input';
  readonly control: InputControl;
  /** the text of the control (a select: the chosen option's value; a checkbox: its state) */
  readonly value: string | boolean;
  readonly options?: readonly FieldOption[];
  readonly mono: boolean;
  /** the authoring hint of its schema (x-noema: expr, key, name, element, series, of, scene, sound, ref, part, longtext) */
  readonly hint: string | null;
  readonly min?: number;
  readonly max?: number;
  /** a field its schema does not describe (kept as it is, edited as JSON) */
  readonly unknown?: boolean;
}
/** a value that is one of several kinds: the kind's select, then the editor of that kind */
export interface AltField extends FieldBase {
  readonly kind: 'alt';
  readonly options: readonly FieldOption[];
  readonly selected: string;
  readonly body: FieldNode | null;
}
/** the entries of a map (an object whose keys are names) */
export interface MapEntry {
  readonly key: string;
  readonly path: FieldPath;
  readonly keyHint: string | null;
  readonly value: FieldNode | null;
}
export interface ObjectField extends FieldBase {
  readonly kind: 'object';
  /** root: the form itself; item: an array item (its card is the frame); fieldset: a group with its legend */
  readonly frame: 'root' | 'item' | 'fieldset';
  /** the property that tells the object's branches apart, as a select */
  readonly disc: {
    readonly path: FieldPath;
    readonly label: string;
    readonly help: string;
    readonly options: readonly FieldOption[];
    readonly selected: string;
  } | null;
  readonly fields: readonly FieldNode[];
  readonly map: { readonly entries: readonly MapEntry[]; readonly canAdd: boolean } | null;
  /** the optional fields not in the value yet (the "Add a field" select) */
  readonly absent: readonly FieldOption[];
}
export interface ArrayItem {
  readonly index: number;
  readonly path: FieldPath;
  /** an object item is a card that folds (details); a value is a row */
  readonly object: boolean;
  readonly summary: string;
  readonly body: FieldNode | null;
}
export interface ArrayField extends FieldBase {
  readonly kind: 'array';
  readonly items: readonly ArrayItem[];
  readonly canAdd: boolean;
  readonly min: number;
  readonly max: number | null;
}
export type FieldNode = InputField | AltField | ObjectField | ArrayField;

/** an edit of the form */
export type FormIntent =
  | { readonly op: 'input'; readonly path: FieldPath; readonly control: InputControl; readonly raw: string | boolean }
  | { readonly op: 'remove'; readonly path: FieldPath }
  | { readonly op: 'add'; readonly path: FieldPath; readonly prop: string }
  | { readonly op: 'push'; readonly path: FieldPath }
  | { readonly op: 'move'; readonly path: FieldPath; readonly from: number; readonly to: number }
  | { readonly op: 'branch'; readonly path: FieldPath; readonly option: number }
  | { readonly op: 'alt'; readonly path: FieldPath; readonly option: number }
  | { readonly op: 'entry'; readonly path: FieldPath }
  | { readonly op: 'rename'; readonly path: FieldPath; readonly from: string; readonly to: string };
export interface FormResult {
  readonly value: unknown;
  /** the shape changed (a field added or removed, a kind switched): the form is drawn again */
  readonly structural: boolean;
  /** the field to focus next */
  readonly focus?: FieldPath;
  /** the words of a value that could not be taken (not a number…): shown at the field, the value is kept */
  readonly error?: string;
}
/** a form over one schema: its view of a value, and the edits */
export interface SchemaFormModel {
  tree(value: unknown): FieldNode | null;
  apply(value: unknown, intent: FormIntent): FormResult;
  /** the words of the form's own controls (add, remove, up, down …) */
  text(key: string, vars?: Readonly<Record<string, string | number>>): string;
}
/** a problem shown at its field */
export interface FieldError {
  readonly path: FieldPath;
  readonly msg: string;
}

/* ---------------- the activity author ---------------- */
export type WordTables = Record<string, Record<string, string>>;
/** an activity being written: its registry entry, its spec and its word tables */
export interface AuthorDoc {
  item: Record<string, unknown>;
  spec: Record<string, unknown>;
  strings: WordTables;
}
export type AuthorTab = 'item' | 'spec' | 'strings';
export interface AuthorProblem {
  readonly tab: AuthorTab;
  readonly path: FieldPath;
  readonly msg: string;
  readonly key?: string;
  readonly loc?: string;
  readonly kw?: string;
}
export interface AuthorKind {
  readonly id: string;
  readonly name: string;
  /** what it computes, in a sentence (its ⓘ) */
  readonly what: string;
}
/** what picking a kind does: the document at once, or a question (a library engine: its reference activity or a blank one) */
export type KindPick =
  | { readonly doc: AuthorDoc }
  | {
      readonly ask: string;
      readonly ref: { readonly tip: string; readonly doc: AuthorDoc } | null;
      readonly blank: AuthorDoc;
    };
/** the suggestions of the form's name fields (datalists) */
export interface AuthorLists {
  readonly keys: readonly string[];
  readonly els: readonly string[];
  readonly series: readonly string[];
  readonly scenes: readonly string[];
  readonly sounds: readonly string[];
  readonly ids: readonly string[];
  readonly parts: readonly string[];
}
export interface AuthorService {
  /** the kinds of activity, grouped as the engines' page groups them */
  kinds(): readonly { readonly label: string; readonly kinds: readonly AuthorKind[] }[];
  kindOf(doc: AuthorDoc): AuthorKind;
  /** the first kind's blank activity */
  blank(): AuthorDoc;
  /** the blank activity of a kind (New) */
  blankOf(kind: string): AuthorDoc;
  pick(kind: string, doc: AuthorDoc): KindPick;
  /** the form of the spec (its engine's schema) and its schema's id (a new form when it changes) */
  specForm(spec: unknown): { readonly id: string; readonly form: SchemaFormModel };
  itemForm(): SchemaFormModel;
  check(doc: AuthorDoc): AuthorProblem[];
  usedKeys(spec: unknown): string[];
  /** a formula's feedback at its field: the names it may use and its first problem; null where the field is no formula */
  formula(doc: AuthorDoc, path: FieldPath, text: string): { readonly names: readonly string[]; readonly error: string | null } | null;
  /** what an output of an engine may compute (an "of" field) */
  ofs(doc: AuthorDoc, path: FieldPath): readonly string[];
  lists(doc: AuthorDoc): AuthorLists;
  /** the registry entry after an edit: a new id renames its entry and its still */
  itemEdited(old: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown>;
  isKey(key: string): boolean;
  isLocale(tag: string): boolean;
  files(doc: AuthorDoc): Record<string, string>;
  zip(files: Readonly<Record<string, string>>): Uint8Array;
  unzip(bytes: Uint8Array): Promise<Record<string, string>>;
  fromFiles(files: Readonly<Record<string, string>>, base?: AuthorDoc): AuthorDoc;
}
