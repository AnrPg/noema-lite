/**
 * What the activity author needs from the rest of the app (src/features/author/application/author.ts): the engine library
 * (its catalogue, the loaded engines' tables and checks, the schema kernel that turns a table into a form, the expression
 * language), the content checks (the validators' own rules) and the words. The composition root hands the real ones in;
 * each is looked up at every use, since the page loads them lazily.
 */

/** a library engine's module: its model checker, its formulas, its table */
export interface AuthorEngineModule {
  readonly checkSpec?: ((spec: Readonly<Record<string, unknown>>) => readonly { readonly level?: string }[]) | undefined;
  readonly exprs?:
    ((spec: Readonly<Record<string, unknown>>) => ReadonlyArray<readonly [string, string, (readonly string[])?]>) | undefined;
  readonly table?: Readonly<Record<string, unknown>> | undefined;
}
/** the schema kernel (src/engines/kernel/schema.ts): an engine's table as a JSON Schema of its specs */
export interface AuthorSchemaKernel {
  specSchema(id: string, table: never, sim: never): unknown;
  partsSchema?(engines: readonly { readonly id: string; readonly table: never }[], sim: never): unknown;
  schemaId(id: string): string;
  readonly PARTS_ID: string;
  ofs(table: never, model: unknown, kind: string): readonly string[];
}
export interface AuthorEngines {
  readonly catalog: {
    readonly CATALOG: readonly { readonly id: string; readonly layer: string; readonly plugin: boolean; readonly slug: string }[];
    byId(id: string): { readonly slug: string } | null;
  };
  loaded(id: string): AuthorEngineModule | null;
  schema(): AuthorSchemaKernel | null;
  readonly expr: { check(src: string, opts: { vars: readonly string[] }): readonly { readonly msg: string }[] };
}
/** the content checks (src/features/content): the same messages as activity_lint.py, make_pack.py and the connector */
export interface AuthorChecks {
  checkSimSpec(spec: unknown, tables: unknown): readonly string[];
  checkActivities?(pack: unknown, translations: readonly string[]): { readonly errors: readonly string[] };
  needRequires?(items: readonly unknown[]): unknown;
}
/** the words: the app's catalogs (the I18n port's has and t) */
export interface AuthorWords {
  has(key: string): boolean;
  t(key: string, vars?: Readonly<Record<string, string | number>>): string;
}
export interface AuthorDeps {
  engines(): AuthorEngines | null;
  checks(): AuthorChecks | null;
  readonly words: AuthorWords;
  /** the reference activities the page ships (tools/activities_examples/, NoemaActivityRefs): {ref: {item, spec, strings}} */
  refs(): Readonly<Record<string, unknown>>;
  /** the JSON Schemas of the forms (sim-spec, circuit, activities), when registry() is called without them */
  schemas?(): readonly unknown[];
  /** whether this app can run an engine (the page's activity runtime); every engine when not given */
  runnable?(id: string): boolean;
  /** the engines grouped as on the engines' page (#/engines) */
  groups?(): readonly (readonly [string, readonly string[]])[];
}
