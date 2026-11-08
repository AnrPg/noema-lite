/**
 * My page (#/profile) over the app of today: kept on this device (the account's key/value, synced) and, for a cloud
 * account, in the cloud's public profiles (engine/cloud.js: myPage, saveMyPage) with the card of what it shows. The card
 * is counted from the learning log (NoemaCore.learning), the stats, the Roadmaps and the language courses, the same
 * counts as the Progress page (src/composition/ui-root.ts); the treasures are src/features/shell/domain/progress.ts.
 * docs/PROFILE.md.
 */
import type { MyPage, ProfileCard, ProfileHost } from '../features/community/ui/host.ts';
import { medals } from '../features/shell/domain/progress.ts';
import { call, obj, str, type Any } from './community-host.ts';

interface Win {
  readonly [name: string]: unknown;
}
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const keys = (x: unknown): number => Object.keys(obj(x) ?? {}).length;

export function oldAppProfile(win: Win): ProfileHost {
  const g = (name: string): Any | null => obj(win[name]);
  const N = (): Any | null => g('Noema');
  const core = (): Any | null => g('NoemaCore');
  const CU = (): Any | null => g('NoemaCurriculum');
  const acc = (): string => str(obj(N()?.['account'])?.['id']) || str(obj(N()?.['kv'])?.['acc']);
  const key = (): string => `noema1:${acc()}:a:mypage`;
  const me = (): string | null => {
    if (obj(N()?.['account'])?.['kind'] !== 'cloud') return null;
    return str(obj(obj(call<unknown>(g('NoemaCloud'), 'session'))?.['user'])?.['id']) || null;
  };
  const local = (): Partial<MyPage> | null => obj(call<unknown>(N(), 'jget', key(), null));
  const pageOf = (r: Partial<MyPage> | null): MyPage => ({
    bio: str(r?.bio),
    avatar: typeof r?.avatar === 'string' ? r.avatar : null,
    show: { ...(obj(r?.show) ?? {}) },
    published: r?.published === true,
  });
  const put = (p: MyPage): void => {
    const kv = obj(N()?.['kv']);
    if (typeof kv?.['set'] === 'function') call(kv, 'set', key(), JSON.stringify(p));
    else call(N(), 'jset', key(), p);
  };

  async function card(show: MyPage['show']): Promise<ProfileCard> {
    const n = N(),
      a = acc(),
      stats = obj(n?.['stats']),
      st = obj(call<unknown>(stats, 'get')),
      xp = num(st?.['xp']),
      sn = num(call<unknown>(stats, 'streakNow'));
    const app = obj(n?.['app']);
    const subs = (await call<Promise<Any[]>>(app, 'subjects')) ?? [];
    const shell = g('NoemaShell');
    const isLang = (s: Any): boolean => call<boolean>(shell, 'isLang', s) ?? str(s['kind']) === 'language';
    const progress = obj(obj(core()?.['study'])?.['progress']);
    let done = 0,
      fcN = 0,
      boss = 0;
    for (const s of subs) {
      const x = obj(call<unknown>(obj(core()?.['learning']), 'progressOf', a, s['id']));
      if (!x) continue;
      const chapters = s['chapters'] ?? obj(s['meta'])?.['chapters'] ?? [];
      done += num(call<unknown>(progress, 'chaptersDone', chapters, x['read'], x['boss']));
      fcN += keys(x['fc']);
      boss += keys(x['boss']);
    }
    const rms = call<Any[]>(CU(), 'list', a) ?? [];
    const summary = (c: Any): Any | null => obj(call<unknown>(CU(), 'summary', a, c));
    const out: { -readonly [k in keyof ProfileCard]: ProfileCard[k] } = {};
    if (show.progress) {
      const lv = obj(call<unknown>(obj(obj(core()?.['study'])?.['xp']), 'level', xp));
      out.progress = { level: num(lv?.['lv']), xp, streak: sn, chapters: done };
    }
    if (show.achievements) {
      const mastered = rms.reduce((m, c) => m + (c['status'] === 'ready' ? num(summary(c)?.['mastered']) : 0), 0);
      out.achievements = medals({ mastered, fcN, sn, boss, xp })
        .filter(m => m.found)
        .map(m => m.id);
    }
    if (show.languages) {
      const studying = call<Any[]>(obj(obj(shell?.['WORLDS'])?.['lang']), 'studying');
      out.languages = (studying ?? subs.filter(isLang).map((s): Any => ({ id: s['id'], title: s['title'], languages: [] }))).map(x => ({
        id: str(x['id']),
        title: str(x['title']),
        languages: Array.isArray(x['languages']) ? x['languages'].map(str) : [],
        ...(num(x['words']) ? { words: num(x['words']) } : {}),
      }));
    }
    if (show.topics) {
      const pct = (s: Any): number => num(call<unknown>(app, 'subjectPct', s));
      out.topics = [
        ...rms
          .filter(c => keys(c['nodes']))
          .map(c => ({
            kind: 'roadmap' as const,
            title: str(c['title']) || str(c['goal']),
            pct: Math.round(num(summary(c)?.['pct']) * 100),
          })),
        ...subs
          .filter(s => !isLang(s) && !(call<unknown[]>(CU(), 'stepsOf', a, s['id']) ?? []).length && pct(s) > 0)
          .map(s => ({
            kind: 'subject' as const,
            title: str(s['title']),
            emoji: str(s['emoji']) || null,
            pct: Math.round(pct(s) * 100),
          })),
      ].slice(0, 40);
    }
    return out;
  }

  return {
    me,
    load: async () => {
      const had = local();
      if (!had && me()) {
        // another device wrote it
        const r = obj(await (call<Promise<unknown>>(g('NoemaCloud'), 'myPage') ?? Promise.resolve(null)).catch(() => null));
        if (r) {
          const p = pageOf({
            bio: str(r['bio']),
            avatar: r['avatar'] as string | null,
            show: obj(r['show']) ?? {},
            published: !!r['published'],
          });
          put(p);
          return p;
        }
      }
      return pageOf(had);
    },
    save: async p => {
      put(p);
      if (!me()) return;
      const a = obj(N()?.['account']);
      await call<Promise<unknown>>(g('NoemaCloud'), 'saveMyPage', {
        published: p.published,
        display_name: str(a?.['name']),
        emoji: str(a?.['emoji']),
        bio: p.bio,
        avatar: p.avatar,
        show: p.show,
        card: await card(p.show),
      });
    },
    card,
  };
}
