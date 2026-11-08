/**
 * What waits on a step (pure): the small signs the map shows on it — prepared, being prepared (here, by another member,
 * in the Claude app), to look over, failed, paused, taught by the learner's own subject or from their material. The
 * classic map shows each as its emoji, the treasure map as a little picture with the same words.
 */
import type { Roadmap } from '../domain/model.ts';
import type { StepStatus } from '../domain/status.ts';
import { needsPlan } from '../domain/work.ts';

export type MarkKind = 'replan' | 'own' | 'others' | 'ready' | 'app' | 'busy' | 'failed' | 'paused' | 'review' | 'material';

export interface Mark {
  readonly k: MarkKind;
  /** the classic map's emoji */
  readonly emoji: string;
  /** the treasure map's picture (the kit's icon names) */
  readonly icon: string;
  /** the catalog key of its words, and their parameters */
  readonly key: string;
  readonly params?: Readonly<Record<string, string>>;
}

const MARK: Readonly<Record<MarkKind, { emoji: string; icon: string; key: string }>> = {
  replan: { emoji: '🔄', icon: 'sync', key: 'roadmap.map.sign.replan' },
  own: { emoji: '📦', icon: 'book', key: 'roadmap.map.sign.own' },
  others: { emoji: '👤', icon: 'people', key: 'roadmap.map.sign.byOther' },
  ready: { emoji: '⚡', icon: 'bolt', key: 'roadmap.map.sign.ready' },
  app: { emoji: '💬', icon: 'chat', key: 'roadmap.map.sign.app' },
  busy: { emoji: '⏳', icon: 'clock', key: 'roadmap.map.sign.busy' },
  failed: { emoji: '⚠️', icon: 'info', key: 'roadmap.map.sign.failed' },
  paused: { emoji: '⏸️', icon: 'pause', key: 'roadmap.map.sign.paused' },
  review: { emoji: '📝', icon: 'edit', key: 'roadmap.map.sign.review' },
  material: { emoji: '📎', icon: 'link', key: 'roadmap.map.sign.material' },
};

export const isMember = (c: Pick<Roadmap, 'shared'>): boolean => c.shared?.role === 'member' && !c.shared.ended;
export const autoApprove = (c: Roadmap): boolean => c['autoApprove'] === true;
/** what the others did with a step of a shared Roadmap (null: not shared) */
export const remoteOf = (c: Roadmap, id: string): NonNullable<Roadmap['remote']>[string] | null =>
  c.shared && !c.shared.ended ? (c.remote?.[id] ?? null) : null;

/** The signs on a step, most telling first. busy: the step being prepared on this device now; classic: the classic map's
    signs (a mastered step keeps them, a prepared one shows ⚡ before it opens). */
export function marks(c: Roadmap, id: string, st: StepStatus, busy: string | null, anotherMember: string, classic = false): Mark[] {
  const n = c.nodes[id];
  if (!n || (st.mastered && !classic)) return [];
  const pk = n.pack?.status ?? null,
    rx = remoteOf(c, id),
    out: Mark[] = [];
  const add = (k: MarkKind, params?: Record<string, string>): void => {
    out.push({ k, ...MARK[k], ...(params ? { params } : {}) });
  };
  if (n.pack?.assigned) add(st.replanning ? 'replan' : 'own');
  else if (rx && !rx.mine)
    out.push({
      k: 'others',
      ...MARK.others,
      key: rx.status === 'ready' ? 'roadmap.map.st.preparedBy' : 'roadmap.map.st.beingPreparedBy',
      params: { who: rx.by ?? anotherMember },
    });
  else if (pk === 'ready' || rx?.status === 'ready') {
    if (st.open || classic) add('ready');
  } else if (pk === 'app' || (needsPlan(n) && c.provider === 'claudeapp' && !isMember(c))) add('app');
  else if (pk === 'generating' || busy === `${c.id}/${id}`) add('busy');
  else if (pk === 'failed') add('failed');
  else if (pk === 'paused') add('paused');
  else if (st.open && !n.reviewed && !autoApprove(c)) add('review');
  if (n.material?.files?.length && !n.pack?.assigned) add('material');
  return out;
}
