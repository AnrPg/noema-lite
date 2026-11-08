/**
 * The character on the page (window.NoemaThemes, the phase bridge's UI half: docs/ARCHITECTURE.md §6.3). One character
 * = one theme (its token set, src/ui/tokens) and its mascot (engine/art.js); the rules are the shell's domain
 * (src/features/shell/domain/characters.ts). This puts the character worn now on <html data-m data-tone>, keeps the
 * learner's choice in a:settings (synced), runs the 5-minute try, and tells every listener (the frame, the tutor, the
 * open screen) when it changes — also when another device or tab chose another one.
 */
import {
  CHANGE_DAYS,
  CHARACTER_DATA,
  CHARACTER_EMOJI,
  CHARACTER_GROUPS,
  CHARACTER_ORDER,
  DEFAULT_CHARACTER,
  FREE_DAYS,
  PLURAL_CHARACTERS,
  PREVIEW_MS,
  canChange,
  choosePatch,
  freeUntil,
  gameOf,
  isCharacter,
  isLocked,
  livePreview,
  nextChangeAt,
  ownedCharacter,
  worldOf,
  type CharacterConfig,
  type CharacterId,
  type CharacterTone,
  type Game,
  type Preview,
  type World,
} from '../../features/shell/domain/characters.ts';
import { P, jsonOf, type DeviceKv } from './kv.ts';

export type Settings = Record<string, unknown>;

/** What the themes need of the page. */
export interface ThemesHost {
  readonly kv: DeviceKv;
  /** the open account, else the last one (noema1:current) */
  account(): string | null;
  /** writes a:settings through the timed store (the sync sees it), when there is one */
  write(key: string, value: string): void;
  config(): CharacterConfig;
  now(): number;
  /** the app's i18n runtime (engine/i18n.js), when it is there */
  i18n(): I18nRuntime | null;
  /** the session's storage of the try ({ m, until }) */
  readonly session: { get(): unknown; set(p: Preview | null): void };
  readonly root: { dataset: DOMStringMap } | null;
  setInterval(f: () => void, ms: number): () => void;
}

/** What the themes use of engine/i18n.js (NoemaI18n): a message in a given locale, and the locale a preference means. */
export interface I18nRuntime {
  t(key: string, params: undefined, locale: string): string;
  /** the offered locale for a language tag, or null */
  match(tag: string): string | null;
  /** the interface locale for a preference (none: the browser's) */
  lang(pref: unknown): string;
}

export type ThemeListener = (m: CharacterId, why?: 'tick') => void;

export interface TutorName {
  readonly n: string;
  readonly nom: string;
  readonly acc: string;
  readonly to: string;
  readonly pl: boolean;
  readonly emoji: string;
}
export interface CharacterText {
  readonly name: string;
  readonly short: string;
  readonly world: string;
  readonly place: string;
  readonly coll: string;
  readonly item: string;
}

export function createThemes(host: ThemesHost) {
  const listeners: ThemeListener[] = [];
  let stopTick: (() => void) | null = null;
  const settingsOf = (acc: string | null = host.account()): Settings =>
    acc ? jsonOf<Settings | null>(host.kv, `${P}${acc}:a:settings`, {}) || {} : {};
  const locked = (): boolean => isLocked(host.config());
  const owned = (acc?: string | null): CharacterId => ownedCharacter(settingsOf(acc), host.config());
  const preview = (): Preview | null => livePreview(host.session.get(), host.now(), host.config());
  const current = (acc?: string | null): CharacterId => preview()?.m ?? owned(acc);
  const tell = (m: CharacterId, why?: 'tick'): void => {
    for (const f of [...listeners]) {
      try {
        f(m, why);
      } catch (e) {
        console.error('[themes]', e);
      }
    }
  };

  function putSettings(patch: Settings, acc: string | null = host.account()): void {
    if (!acc) return;
    const k = `${P}${acc}:a:settings`;
    const gone = new Set(Object.keys(patch).filter(x => patch[x] === undefined));
    const s: Settings = Object.fromEntries(
      Object.entries({ ...(jsonOf<Settings | null>(host.kv, k, {}) || {}), ...patch }).filter(([x]) => !gone.has(x)),
    );
    host.write(k, JSON.stringify(s));
    const live = (globalThis as { S?: { settings?: Settings } }).S; // the open engine's copy of the settings
    if (live?.settings) Object.assign(live.settings, patch);
  }
  function apply(m: CharacterId = current()): CharacterId {
    const root = host.root;
    if (root && root.dataset['m'] !== m) {
      root.dataset['m'] = m;
      root.dataset['tone'] = CHARACTER_DATA[m].tone;
      tell(m);
    }
    return m;
  }
  function endPreview(reapply = true): void {
    host.session.set(null);
    stopTick?.();
    stopTick = null;
    if (reapply) apply(owned());
  }
  function watchPreview(): void {
    stopTick?.();
    stopTick = host.setInterval(() => {
      if (!preview()) endPreview();
      tell(current(), 'tick');
    }, 1000);
  }
  function startPreview(m: unknown): void {
    if (!isCharacter(m) || locked()) return;
    host.session.set({ m, until: host.now() + PREVIEW_MS });
    apply(m);
    watchPreview();
  }
  /** Keep a character: as often as the learner likes for 15 days after the first choice, then once every 5 days. */
  function choose(m: unknown, { acc = host.account(), force = false }: { acc?: string | null; force?: boolean } = {}): boolean {
    const patch = choosePatch(m, settingsOf(acc), host.config(), host.now(), force);
    if (!patch) return false;
    putSettings(patch, acc);
    endPreview(false);
    apply(patch.character);
    return true;
  }
  /* the words of a character, in the interface language (i18n/characters/, English the fallback) */
  const uiLang = (): string => host.i18n()?.lang(settingsOf()['lang']) ?? 'en';
  const word = (key: string, loc: string): string => {
    const i = host.i18n();
    return i ? i.t(key, undefined, loc) : key;
  };
  const charLoc = (lang: string): string => {
    const i = host.i18n();
    return i?.match(lang) ?? 'en';
  };
  function tutor(m: unknown = current(), lang = uiLang()): TutorName {
    const id: CharacterId = isCharacter(m) ? m : DEFAULT_CHARACTER;
    const loc = charLoc(lang),
      k = (f: string) => `char.${id}.${f}`,
      n = word(k('name'), loc);
    // a form a language has not given (yet) is its own plain name, never the English form
    const form = (f: string): string => {
      const v = word(k(f), loc);
      return loc !== 'en' && v === word(k(f), 'en') ? n : v;
    };
    return { n, nom: form('nameNom'), acc: form('nameAcc'), to: form('nameTo'), pl: PLURAL_CHARACTERS.has(id), emoji: CHARACTER_EMOJI[id] };
  }
  function text(m: unknown = current(), lang = uiLang()): CharacterText {
    const id: CharacterId = isCharacter(m) ? m : DEFAULT_CHARACTER;
    const loc = charLoc(lang),
      w = (f: string) => word(`char.${id}.${f}`, loc);
    return { name: w('title'), short: w('short'), world: w('world'), place: w('place'), coll: w('coll'), item: w('item') };
  }
  /** a change of the settings that arrived (another device: noema:remote; another tab: storage) */
  const remoteChange = (keys: readonly (string | null)[]): void => {
    if (keys.some(k => !k || /:a:settings$/.test(k))) apply();
  };
  if (preview()) watchPreview(); // a try that goes on after a reload still ends on time

  return {
    DATA: CHARACTER_DATA,
    ORDER: CHARACTER_ORDER,
    GROUPS: CHARACTER_GROUPS,
    EMOJI: CHARACTER_EMOJI,
    PREVIEW_MS,
    CHANGE_DAYS,
    FREE_DAYS,
    apply,
    current,
    owned,
    preview,
    startPreview,
    endPreview,
    choose,
    canChange: (acc?: string | null) => canChange(settingsOf(acc), host.config(), host.now()),
    nextChangeAt: (acc?: string | null) => nextChangeAt(settingsOf(acc), host.now()),
    freeUntil: (acc?: string | null) => freeUntil(settingsOf(acc)),
    locked,
    onChange(f: ThemeListener): () => void {
      listeners.push(f);
      return () => {
        const i = listeners.indexOf(f);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    tutor,
    text,
    uiLang,
    world: (acc?: string | null): World => worldOf(settingsOf(acc)),
    game: (acc?: string | null): Game => gameOf(settingsOf(acc), host.config(), current(acc)),
    settings: settingsOf,
    putSettings,
    tone: (m: CharacterId = current()): CharacterTone => CHARACTER_DATA[m].tone,
    remoteChange,
  };
}
export type Themes = ReturnType<typeof createThemes>;
