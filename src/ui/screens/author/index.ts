/**
 * The activity author's screens (docs/activities-dev/authoring_ui.md): `noema-schema-form`, a form generated from a JSON
 * Schema, and `noema-author`, the page of #/author. They reach the authoring feature through its port (src/ports/authoring.ts);
 * the composition root (src/composition/author.ts) wires them.
 */
import { NoemaAuthor } from './author.ts';
import { NoemaSchemaForm } from './schema-form.ts';

export { NoemaAuthor, type AuthorPreview } from './author.ts';
export { NoemaSchemaForm, formIcon, type Decorate, type Decoration, type SchemaFormChange } from './schema-form.ts';
export { authorStyles } from './styles.ts';

const ELEMENTS = { 'noema-schema-form': NoemaSchemaForm, 'noema-author': NoemaAuthor } as const;
/** Defines the author's elements (once per registry). */
export function defineAuthor(registry: CustomElementRegistry = customElements): void {
  for (const [tag, ctor] of Object.entries(ELEMENTS)) if (!registry.get(tag)) registry.define(tag, ctor);
}
