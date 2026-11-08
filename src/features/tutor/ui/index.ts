/** The tutor drawer's elements, defined once (build/study.js, with the subject's pages). Me › Conversations' element is
 *  ./conversations.ts (build/ui.js). */
import { NoemaTutorPanel, NoemaTutorThreads } from './panel.ts';

export { NoemaTutorPanel, NoemaTutorThreads };
export { explainable } from './explain.ts';
export type { MenuItem, TutorView } from './view.ts';

export function defineTutorUi(registry: CustomElementRegistry = customElements): void {
  const def = (name: string, c: CustomElementConstructor): void => {
    if (!registry.get(name)) registry.define(name, c);
  };
  def('noema-tutor-panel', NoemaTutorPanel);
  def('noema-tutor-threads', NoemaTutorThreads);
}
