/* NoemaCore for the node suites that run the older Roadmap files (engine/curriculum.js, curjobs.js, sourceplan.js …) in a vm:
   the Roadmaps domain and the bridges' lookup from build/roadmaps-node.cjs (npm run build), and the I18n port's locale and
   chain from the suite's NoemaI18n stub when it has one — as the app (window.NoemaCore) and the connector hand them. */
const path = require('path');
const core = require(path.join(__dirname, '..', 'build', 'roadmaps-node.cjs'));

/** Give a vm context (its window and itself) NoemaCore. */
module.exports = function withCore(ctx) {
  const w = ctx.window || ctx, I = w.NoemaI18n;
  const chain = t => [...new Set([t, ...(t.includes('-') ? [t.split('-')[0]] : []), 'en'])];
  const i18n = I ? { locale: () => (typeof I.locale === 'function' ? I.locale() : I.locale), chain: t => (I.chain ? I.chain(t ?? i18n.locale()) : chain(t ?? i18n.locale())) } : undefined;
  const NoemaCore = { roadmaps: core.roadmaps, bridges: core.bridges, ...(i18n ? { i18n } : {}) };
  w.NoemaCore = NoemaCore;
  if (ctx !== w) ctx.NoemaCore = NoemaCore;
  return ctx;
};
