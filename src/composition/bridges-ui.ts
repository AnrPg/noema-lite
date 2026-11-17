/**
 * NoemaShell.bridge (build/ui.js): 文A the screens of the language help (src/features/bridges/ui) over NoemaCore.bridges
 * (src/composition/bridges.ts), the word-linking core (engine/wordlink.js) and the open subject:
 *
 *   section({ sid, body, head }) · tag(subject, acc) · menuItem() · panel(acc)
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { bridgeUi, type BridgeUi } from '../features/bridges/ui/help.ts';
import type { BridgeGlobals } from './bridges.ts';

/** NoemaShell.bridge: the screens over NoemaCore.bridges, the word-linking core and the open subject. */
export function pageBridgeUi(g: BridgeGlobals = globalThis as BridgeGlobals): BridgeUi {
  const bridges = g.NoemaCore?.bridges;
  if (!bridges) throw new Error('NoemaCore.bridges is missing: build/app.js loads before build/ui.js'); // a log: a page built wrong
  const i18n = noemaI18n();
  const endonym = (code: string): string => {
    try {
      const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code;
    } catch {
      return code; // a code Intl does not know: shown as it is
    }
  };
  const errors = (g as { NoemaCore?: { errors?: { report(e: unknown, o: Readonly<Record<string, unknown>>): unknown } } }).NoemaCore
    ?.errors;
  const ui = bridgeUi({
    bridges,
    i18n,
    words: () => g.NoemaWordlink ?? null,
    open: () => {
      const N = g.Noema;
      return N?.subject && N.pack ? { subject: N.subject, pack: N.pack, meta: N.subjectMeta ?? null } : null;
    },
    langName: code => g.NoemaI18n?.fmt?.langName?.(code) ?? endonym(code),
    endonym,
    today: () => (globalThis as { NoemaCore?: { clock?: { today(): string } } }).NoemaCore?.clock?.today() ?? '',
    now: () => (globalThis as { NoemaCore?: { clock?: { now(): number } } }).NoemaCore?.clock?.now() ?? Date.now(),
    speaker: () => {
      const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null;
      return (text, lang) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        synth.cancel();
        synth.speak(u);
      };
    },
    document,
  });
  return Object.freeze({
    ...ui,
    // the study page asks and goes on: a failure is reported, the section stays as it is
    section: (o: Parameters<BridgeUi['section']>[0]) =>
      ui.section(o).catch((e: unknown) => {
        errors?.report(e, { where: 'bridge.section', severity: 'warning' });
      }),
  });
}
