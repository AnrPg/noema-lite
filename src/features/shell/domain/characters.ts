/**
 * The characters (one character = one theme and its mascot, docs/UI_MAP.md): who is in which group of the gallery, how
 * playful each one is, the face for plain-text places, and the rule of changing one. Their look is the design tokens
 * (src/ui/tokens/characters.ts, same order), their pictures engine/art.js, their words i18n/characters/ (char.<id>.*).
 *
 * The rule: the learner's character (a:settings.character, synced) changes freely for FREE_DAYS after the first choice,
 * then once every CHANGE_DAYS; any other can be tried for PREVIEW_MS. An organisation can fix it for everybody
 * (config: character + lockCharacter).
 */
export type CharacterGroup = 'animals' | 'tales' | 'grown';
/** how much game a character brings: cute and serious ones play, the strict one stays calm */
export type CharacterTone = 'cute' | 'serious' | 'strict';
/** what the learner wants to learn: knowledge, languages, or both (the tabs follow it) */
export type World = 'know' | 'lang' | 'both';
/** how much "game" (reactions, celebrations): playful, calm, or none */
export type Game = 'playful' | 'calm' | 'off';

/* i18n-ignore-start — ids, no words for learners */
export const CHARACTER_DATA = {
  hedge: { group: 'animals', tone: 'cute' },
  owl: { group: 'animals', tone: 'cute' },
  axo: { group: 'animals', tone: 'cute' },
  dragon: { group: 'animals', tone: 'cute' },
  alien: { group: 'animals', tone: 'cute' },
  bear: { group: 'animals', tone: 'cute' },
  fruit: { group: 'animals', tone: 'cute' },
  knight: { group: 'animals', tone: 'cute' },
  berry: { group: 'animals', tone: 'cute' },
  hood: { group: 'tales', tone: 'cute' },
  piglet: { group: 'tales', tone: 'cute' },
  candy: { group: 'tales', tone: 'cute' },
  jack: { group: 'tales', tone: 'cute' },
  frog: { group: 'tales', tone: 'cute' },
  puss: { group: 'tales', tone: 'cute' },
  wolf: { group: 'grown', tone: 'serious' },
  eagle: { group: 'grown', tone: 'serious' },
  robot: { group: 'grown', tone: 'serious' },
  heron: { group: 'grown', tone: 'serious' },
  litM: { group: 'grown', tone: 'serious' },
  litF: { group: 'grown', tone: 'serious' },
  techM: { group: 'grown', tone: 'serious' },
  techF: { group: 'grown', tone: 'serious' },
  physM: { group: 'grown', tone: 'serious' },
  physF: { group: 'grown', tone: 'serious' },
  bioM: { group: 'grown', tone: 'serious' },
  bioF: { group: 'grown', tone: 'serious' },
  hydra: { group: 'grown', tone: 'serious' },
  prism: { group: 'grown', tone: 'strict' },
} as const satisfies Record<string, { group: CharacterGroup; tone: CharacterTone }>;

export type CharacterId = keyof typeof CHARACTER_DATA;

/** a text-friendly face for places where only a character fits (titles of conversations, plain-text buttons) */
export const CHARACTER_EMOJI: Readonly<Record<CharacterId, string>> = {
  hedge: '🦔',
  owl: '🦉',
  axo: '🦎',
  dragon: '🐉',
  alien: '👽',
  bear: '🐻',
  fruit: '🍊',
  knight: '🛡️',
  berry: '🍓',
  hood: '🧺',
  piglet: '🐷',
  candy: '🍬',
  jack: '🌱',
  frog: '🐸',
  puss: '🐱',
  wolf: '🐺',
  eagle: '🦅',
  robot: '🤖',
  heron: '🪶',
  prism: '🔷',
  litM: '📚',
  litF: '✒️',
  techM: '💻',
  techF: '🖥️',
  physM: '⚛️',
  physF: '🪐',
  bioM: '🧪',
  bioF: '🧬',
  hydra: '🐲',
};
/* i18n-ignore-end */

/** Hansel and Gretel are two: their name goes with plural verbs (x-plural in i18n/characters/en.arb) */
export const PLURAL_CHARACTERS: ReadonlySet<CharacterId> = new Set<CharacterId>(['candy']);
export const CHARACTER_ORDER = Object.keys(CHARACTER_DATA) as CharacterId[];
export const CHARACTER_GROUPS: Readonly<Record<CharacterGroup, readonly CharacterId[]>> = {
  animals: CHARACTER_ORDER.filter(k => CHARACTER_DATA[k].group === 'animals'),
  tales: CHARACTER_ORDER.filter(k => CHARACTER_DATA[k].group === 'tales'),
  grown: CHARACTER_ORDER.filter(k => CHARACTER_DATA[k].group === 'grown'),
};

export const DAY_MS = 864e5;
export const FREE_DAYS = 15;
export const CHANGE_DAYS = 5;
export const PREVIEW_MS = 5 * 60e3;
export const DEFAULT_CHARACTER: CharacterId = 'hedge';

export const isCharacter = (x: unknown): x is CharacterId => typeof x === 'string' && Object.hasOwn(CHARACTER_DATA, x);

/** The character part of an account's settings (a:settings). */
export interface CharacterSettings {
  readonly character?: unknown;
  /** when the character last changed (epoch ms) */
  readonly characterAt?: number;
  /** when the learner first chose one (epoch ms): the free days count from it */
  readonly characterSince?: number;
  readonly world?: unknown;
  readonly game?: unknown;
}
/** What the deployment fixes (config.js). */
export interface CharacterConfig {
  readonly character?: unknown;
  readonly lockCharacter?: unknown;
}
/** A try of another character, until a moment. */
export interface Preview {
  readonly m: CharacterId;
  readonly until: number;
}

export const isLocked = (cfg: CharacterConfig): boolean => !!cfg.lockCharacter && isCharacter(cfg.character);

/** The learner's own character: the fixed one, else the chosen one, else the deployment's, else the default. */
export function ownedCharacter(s: CharacterSettings, cfg: CharacterConfig): CharacterId {
  if (isLocked(cfg)) return cfg.character as CharacterId;
  if (isCharacter(s.character)) return s.character;
  return isCharacter(cfg.character) ? cfg.character : DEFAULT_CHARACTER;
}

/** A stored try that still runs (never while the character is fixed). */
export function livePreview(p: unknown, now: number, cfg: CharacterConfig): Preview | null {
  if (!p || typeof p !== 'object' || isLocked(cfg)) return null;
  const { m, until } = p as { m?: unknown; until?: unknown };
  return isCharacter(m) && typeof until === 'number' && until > now ? { m, until } : null;
}

/** Until when changes are free: FREE_DAYS after the first choice (older settings count from their last choice); 0: none chosen. */
export function freeUntil(s: CharacterSettings): number {
  const since = s.characterSince || s.characterAt;
  return s.character && since ? since + FREE_DAYS * DAY_MS : 0;
}

/** When the next change is possible (0 or a past moment: now). */
export function nextChangeAt(s: CharacterSettings, now: number): number {
  if (!s.character || now < freeUntil(s)) return 0;
  return (s.characterAt || 0) + CHANGE_DAYS * DAY_MS;
}

export const canChange = (s: CharacterSettings, cfg: CharacterConfig, now: number): boolean =>
  !isLocked(cfg) && now >= nextChangeAt(s, now);

/** The settings patch that keeps character m, or null when the rule refuses it (fixed, unknown, or too soon). */
export function choosePatch(
  m: unknown,
  s: CharacterSettings,
  cfg: CharacterConfig,
  now: number,
  force = false,
): { character: CharacterId; characterAt: number; characterSince: number } | null {
  if (!isCharacter(m) || isLocked(cfg)) return null;
  const changes = !!s.character && s.character !== m;
  if (!force && changes && !canChange(s, cfg, now)) return null;
  return {
    character: m,
    characterAt: changes ? now : s.characterAt || now,
    characterSince: s.characterSince || s.characterAt || now,
  };
}

export const worldOf = (s: CharacterSettings): World => (s.world === 'lang' || s.world === 'both' ? s.world : 'know');

/** How much game: a fixed strict character allows only calm or off; otherwise the learner's choice, else calm for the strict one. */
export function gameOf(s: CharacterSettings, cfg: CharacterConfig, current: CharacterId): Game {
  const g = s.game === 'playful' || s.game === 'calm' || s.game === 'off' ? s.game : null;
  if (isLocked(cfg) && CHARACTER_DATA[cfg.character as CharacterId].tone === 'strict') return g === 'off' ? 'off' : 'calm';
  return g ?? (CHARACTER_DATA[current].tone === 'strict' ? 'calm' : 'playful');
}
