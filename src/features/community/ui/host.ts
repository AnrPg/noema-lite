/**
 * What the community screens (search, vault, people, ⚑ reports, Explore and sharing, #/engines) need from the rest of the
 * app, as one interface: the address, the signed-in account, the learner's subjects and Roadmaps, the tutor's
 * conversations, the place to put a dialog, the frame's character face. The composition root implements it (today over
 * the older app: src/composition/community-ui.ts; the phase-3 shell over its own services) and hands it to every screen
 * with the feature services (deps.ts). Nothing in the screens reaches a global.
 *
 * Data that belongs to another area (a subject's pack, a Roadmap) crosses this line as plain records of the fields the
 * screens read; the other area keeps its own model.
 */
import type { MessageParams } from '../../../ports/i18n.ts';

/** The signed-in account (a local profile or a cloud account). */
export interface HostAccount {
  readonly id: string;
  readonly kind: 'local' | 'cloud';
  readonly name?: string;
  readonly emoji?: string;
}
/** The cloud session of the account (null: not signed in to the cloud). */
export interface HostSession {
  readonly userId: string;
  readonly email?: string;
}

/** One of the learner's subjects (its meta, as the subject list holds it). */
export interface HostSubject {
  readonly id: string;
  readonly title: string;
  readonly emoji?: string;
  readonly description?: string;
  readonly kind?: string;
  readonly hidden?: boolean;
  readonly origin?: string;
  readonly language?: string;
  readonly [more: string]: unknown;
}
/** A subject pack (the parts the screens read; the pack's own model belongs to Study). */
export interface HostPack {
  readonly subject?: { id: string; title?: string; emoji?: string | null; [more: string]: unknown };
  readonly chapters?: readonly { readonly exercises?: readonly unknown[]; readonly [more: string]: unknown }[];
  readonly counts?: { readonly exercises?: number; readonly [more: string]: unknown };
  readonly [more: string]: unknown;
}
/** One of the learner's Roadmaps (the parts the screens read). */
export interface HostRoadmap {
  readonly id: string;
  readonly title?: string;
  readonly goal?: string;
  readonly shared?: { readonly role?: string; readonly public?: boolean; readonly ownerName?: string } | null;
  readonly [more: string]: unknown;
}
/** A Roadmap or a subject others share (Explore). */
export interface PublicItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly domain?: string;
  readonly emoji?: string;
  readonly language?: string;
  readonly owner?: string;
  readonly owner_name?: string;
  readonly steps?: number;
  readonly prepared?: number;
  readonly have?: boolean;
  readonly own?: boolean;
  readonly meta?: { readonly language?: string; readonly [more: string]: unknown };
  readonly [more: string]: unknown;
}

/** A source of the search index (docs/SEARCH.md §3): built by the host from the learner's data. */
export interface HostSearchSource {
  readonly key: string;
  readonly label?: string;
  readonly sig: string;
  input(): Promise<{ readonly kind: 'pack' | 'curriculum' | 'lang' | 'convos'; readonly data: unknown; readonly meta?: unknown } | null>;
}

/** The engine's half of the ⚑ locator (docs/REPORTS.md §2): the open subject and the pack's own terms. */
export interface ReportContext {
  /** the open subject on a subject route (null elsewhere) */
  subject(page: string): Readonly<Record<string, unknown>> | null;
  /** chapter, section, block, exercise … of a place (the engine's locateItem) */
  locate(place: Readonly<Record<string, string>>): unknown;
  /** what the learner typed into the exercise card that holds el */
  given(el: Element): string | null;
  /** the app's version, build and kind (frame, bundle, url) */
  app(): Readonly<Record<string, unknown>>;
  /** the character and the side (knowledge / languages) */
  look(): { readonly character: string | null; readonly world: string | null };
  /** the catalogs of the interface: locale → key → message (for the reverse lookup of a word) */
  catalogs(): Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** the last errors of the page (kept from the start: a report about something broken says what failed) */
  errors(): readonly { readonly level: string; readonly at: string; readonly msg: string }[];
  /** the screenshot library (modern-screenshot), loaded on the first report */
  screenshots(): Promise<{ domToJpeg(node: Node, options: Readonly<Record<string, unknown>>): Promise<string> }>;
}

/** A menu entry of a screen's ⋮ (the frame draws it). */
export interface ChromeMenuItem {
  readonly label: string;
  readonly sub?: string;
  readonly icon?: string;
  readonly href?: string;
  readonly run?: () => void;
  readonly danger?: boolean;
  readonly cls?: string;
}
/** What a screen tells the frame: its tab, crumbs, where ← goes, its ⋮. */
export interface ScreenChrome {
  readonly tab: string | null;
  readonly crumbs: readonly { readonly label: string; readonly href?: string }[];
  readonly back?: string;
  readonly menu?: readonly (ChromeMenuItem | '-')[];
}

export interface CommunityHost {
  /* ---------- the address ---------- */
  hash(): string;
  /** goes to an address (drawing it again when it is the one shown) */
  go(hash: string): void;
  /** changes the address without drawing anything again (the page's own state) */
  replace(hash: string): void;
  /** the address as a link another person can open */
  link(hash: string): string;
  /** the last address that was not one of `prefix` (where ← of the search page goes) */
  outside(prefix: string): string;

  /* ---------- the account ---------- */
  account(): HostAccount | null;
  session(): HostSession | null;
  /** the account picker (sign in / create an account) */
  signIn(): void;
  /** what this account learns: knowledge, languages or both */
  world(): 'know' | 'lang' | 'both';
  /** an account's own setting (synced): its value as stored (JSON text) */
  getAccountSetting(name: string): string | null;
  setAccountSetting(name: string, value: string): void;

  /* ---------- the frame ---------- */
  /** puts an overlay (a dialog) over every page; → takes it away */
  overlay(el: HTMLElement): () => void;
  /** the character's face for an empty page (null: none here) */
  face(mood?: string): HTMLElement | null;
  /** a text of another area's catalog (the frame's words: sh.*) */
  word(key: string, params?: MessageParams): string;

  /* ---------- the learner's subjects and Roadmaps ---------- */
  subjects(): Promise<readonly HostSubject[]>;
  loadSubject(id: string): Promise<HostPack | null>;
  importPack(pack: HostPack, meta: Readonly<Record<string, unknown>>): Promise<HostSubject>;
  /** opens a subject (at an address of it) */
  openSubject(id: string, hash?: string): void;
  /** the subject open in the engine now (null: none) */
  openSubjectId(): string | null;
  roadmaps(): readonly HostRoadmap[];
  roadmap(id: string): HostRoadmap | null;
  publishRoadmap(id: string, o: { readonly isPublic: boolean }): Promise<void>;
  joinRoadmap(id: string, o: { readonly viaRoom: boolean }): Promise<void>;
  /** 📚 From your sources with these files */
  fromSources(files: readonly File[]): void;
  /** the number of pages of a PDF (null: not known) */
  pdfPages(file: File): Promise<number | null>;
  /** someone's public page (#/u/<id>): published or not (null: unknown) */
  publicPage(userId: string): Promise<{ readonly published?: boolean } | null>;

  /* ---------- the search ---------- */
  searchSources(): Promise<readonly HostSearchSource[]>;
  /** the learner's status in a subject (read sections, results) */
  subjectStatus(id: string): Readonly<Record<string, unknown>> | null;
  /** the subjects of a Roadmap's stations */
  roadmapPacks(id: string): readonly string[];
  /** opens a tutor conversation */
  openConversation(id: string): void;

  /* ---------- Explore and sharing ---------- */
  publicSubjects(): Promise<readonly PublicItem[]>;
  studyPublic(item: PublicItem): Promise<void>;
  publicRoadmaps(): Promise<readonly PublicItem[]>;
  openPublicRoadmap(item: PublicItem): Promise<void>;
  /** the Roadmaps' domains, in their order */
  domains(): readonly string[];
  /** the language badge of a subject (the frame's) */
  langTag(item: PublicItem): HTMLElement | null;
  /** 🌐 shared texts translated on request (engine/mt.js): marks an element, the bar that switches it */
  translatable(el: HTMLElement, o: { readonly language?: string | undefined; readonly kind: string }): void;
  translateBar(scope: HTMLElement): HTMLElement | null;
  /** the share dialog's data and calls (engine/cloud.js) */
  share: ShareHost;

  /* ---------- ⚑ reports ---------- */
  report: ReportContext;
}

/** What the share dialog of a subject uses (the cloud's sharing: engine/cloud.js). */
export interface ShareHost {
  /** the pack as it is shared (every translation inline), its info and its source files */
  prepare(subjectId: string): Promise<SharePrep>;
  /** is the subject public now (and since when) */
  published(subjectId: string): Promise<{ readonly at?: string } | null>;
  publish(prep: SharePrep, o: { readonly files: boolean; readonly onProgress: ShareProgress }): Promise<void>;
  unpublish(subjectId: string): Promise<void>;
  /** shares with one person (by e-mail), with a message */
  send(
    prep: SharePrep,
    o: {
      readonly email: string;
      readonly message: string;
      readonly files: boolean;
      readonly onProgress: ShareProgress;
    },
  ): Promise<void>;
  /** the shares of this subject sent to people */
  sent(subjectId: string): Promise<readonly { readonly id: string; readonly to_email: string; readonly status: string }[]>;
  withdraw(shareId: string): Promise<void>;
  /** the package as a file to send by hand (a local profile) */
  download(prep: SharePrep): void;
}
/** the files going up: done of total (total 0: still being prepared), the file now */
export type ShareProgress = (done: number, total: number, name: string) => void;
export interface SharePrep {
  readonly subject: HostSubject;
  readonly counts: { readonly chapters: number; readonly exercises: number; readonly pictures: number };
  /** the pack's pictures that are not openly licensed (the warning asks to confirm) */
  readonly restricted: number;
  /** the source files that can go with it: their count and size */
  readonly files: { readonly n: number; readonly bytes: number };
  readonly [more: string]: unknown;
}
