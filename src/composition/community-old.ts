/**
 * The engine's half of the ⚑ locator and the share dialog's cloud calls, over the older scripts (engine/src, engine/cloud.js).
 */
import type { ReportContext, ShareHost } from '../features/community/ui/host.ts';

export function oldAppReportContext(win: Window): ReportContext {
  win;
  return {} as ReportContext;
}
export function oldAppShare(win: Window): ShareHost {
  win;
  return {} as ShareHost;
}
