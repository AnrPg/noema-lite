/**
 * The share dialog's cloud calls over the older scripts (engine/cloud.js, engine/loader.js, engine/srcfiles.js).
 */
import type { ShareHost } from '../features/community/ui/host.ts';

export function oldAppShare(win: Window): ShareHost {
  return { win } as unknown as ShareHost;
}
