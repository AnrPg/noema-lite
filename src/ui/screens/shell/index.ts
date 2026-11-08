/**
 * The shell's screens (phase 3, area 1): the frame, Today, Progress, Settings and its pages, the character gallery and
 * its preview bar, the first time's questions, "who is learning", the 🔔 list and the "in use elsewhere" cover.
 */
import { NoemaAccountPicker } from './account-picker.ts';
import { NoemaShellFrame } from './frame.ts';
import { NoemaBellList, NoemaInUse } from './notices.ts';
import { NoemaProgressPage } from './progress.ts';
import { NoemaCharacters, NoemaLook, NoemaOnboarding, NoemaPreviewBar, NoemaSettings } from './settings.ts';
import { NoemaToday } from './today.ts';

export const SHELL_ELEMENTS = {
  'noema-shell-frame': NoemaShellFrame,
  'noema-today': NoemaToday,
  'noema-progress-page': NoemaProgressPage,
  'noema-settings': NoemaSettings,
  'noema-look': NoemaLook,
  'noema-characters': NoemaCharacters,
  'noema-preview-bar': NoemaPreviewBar,
  'noema-onboarding': NoemaOnboarding,
  'noema-account-picker': NoemaAccountPicker,
  'noema-bell-list': NoemaBellList,
  'noema-in-use': NoemaInUse,
} as const;

/** Defines the shell's elements once in a registry. */
export function defineShell(registry: CustomElementRegistry = customElements): void {
  for (const [tag, cls] of Object.entries(SHELL_ELEMENTS)) if (!registry.get(tag)) registry.define(tag, cls);
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-shell-frame': NoemaShellFrame;
    'noema-today': NoemaToday;
    'noema-progress-page': NoemaProgressPage;
    'noema-settings': NoemaSettings;
    'noema-look': NoemaLook;
    'noema-characters': NoemaCharacters;
    'noema-preview-bar': NoemaPreviewBar;
    'noema-onboarding': NoemaOnboarding;
    'noema-account-picker': NoemaAccountPicker;
    'noema-bell-list': NoemaBellList;
    'noema-in-use': NoemaInUse;
  }
}

export { APP_ROUTES, ENGINE_ROUTES, placeOf } from './routes.ts';
export type { ShellContext, ShellArt, TutorVars } from './base.ts';
