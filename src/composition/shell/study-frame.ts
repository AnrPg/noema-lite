/**
 * The frame as the study area sees it (src/features/study/ui/host.ts FramePort): the shell's <main>, top bar, ⋮ and ▾,
 * sheets, toasts, the learner's recent places and its words. The few things only the open subject's page knows (the setup
 * reminders, its dialogs, the character's name, the subject's tags) come from the study area's adapter
 * (engine/app/study.js), which asks for this with NoemaShell.studyFrame(page).
 */
import type { Chrome as StudyChrome, FramePort, MenuEntry as StudyMenuEntry } from '../../features/study/ui/host.ts';
import type { MenuEntry } from './dom.ts';
import type { Chrome, Recent } from './host.ts';

/** what the shell lends the study area's frame */
export interface StudyFrameShell {
  readonly main: HTMLElement;
  chrome(c: Chrome): void;
  subjectChrome(c: Chrome): Chrome;
  menuButton(items: readonly MenuEntry[], o: { label: string; cls?: string; content?: Node | null }): HTMLElement;
  sheet(title: string, build: (body: HTMLElement, close: () => void) => void, o?: { cls?: string }): () => void;
  setActs(nodes: readonly Node[]): void;
  noteRecent(r: Recent): void;
  toast(text: string, ms?: number): void;
  L(key: string, params?: Readonly<Record<string, string | number>>): string;
  /** the open subject and the Roadmap step it is (for Today › Continue) */
  place(): { readonly subj: string; readonly title: string; readonly cid: string | null; readonly node: string | null } | null;
}

/** what only the subject's page knows */
export type StudyFramePage = Pick<FramePort, 'setupBanner' | 'modal' | 'confirm' | 'subjectTags' | 'character'>;

const entries = (items: readonly (StudyMenuEntry | null)[]): MenuEntry[] => items.filter((x): x is StudyMenuEntry => x !== null);

const chromeOf = (c: StudyChrome): Chrome => {
  const { menu, ...rest } = c;
  return { ...rest, ...(menu ? { menu: () => entries(menu()) } : {}) };
};

export function studyFrame(shell: StudyFrameShell, page: StudyFramePage): FramePort {
  return {
    main: () => shell.main,
    setupBanner: () => page.setupBanner(),
    chrome: c => {
      shell.chrome(shell.subjectChrome(chromeOf(c)));
    },
    menuButton: (items, { label, cls }) => {
      const content = document.createElement('span');
      content.append(label, ' ▾');
      return shell.menuButton(entries(items), { label, ...(cls ? { cls } : {}), content });
    },
    sheet: (title, build, o) => shell.sheet(title, build, o?.cls ? { cls: o.cls } : {}),
    modal: build => page.modal(build),
    toast: (text, ms) => {
      shell.toast(text, ms);
    },
    confirm: text => page.confirm(text),
    navigate: href => {
      location.hash = href;
    },
    setActs: nodes => {
      shell.setActs(nodes);
    },
    noteRecent: extra => {
      const at = shell.place();
      if (at) shell.noteRecent({ ...at, ...extra } as Recent);
    },
    subjectTags: () => page.subjectTags(),
    character: () => page.character(),
    L: (k, v) => shell.L(k, v),
  };
}
