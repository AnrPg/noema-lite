/* The UI root over the memory adapters in a DOM (happy-dom): the demo mounts in the frame, the hash picks the section,
   an unknown section is corrected, leaving #/ui-kit hands over to the older screens, the appearance is kept. */
import '../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage } from '../adapters/memory/storage.ts';
import { memoryHash } from '../ui/router/router.ts';
import { settle, testServices } from '../ui/test/services.ts';
import { APPEARANCE_KEY, loadAppearance, startUiKit } from './ui-kit-root.ts';

test('the kit in its frame: sections from the hash, the unknown corrected, leaving reloads, the appearance kept', async () => {
  const s = testServices();
  const kv = memoryStorage().kv;
  const location = memoryHash('#/ui-kit/forms');
  let left = 0;
  document.body.classList.add('noema-booting');
  const app = await startUiKit({ i18n: s.i18n, clock: s.clock, locales: s.locales, kv, location, leave: () => left++ });
  await settle(app.frame);
  assert.equal(document.body.classList.contains('noema-booting'), false);
  assert.equal(app.kit.section, 'forms');
  assert.equal(app.frame.current, 'forms');
  assert.deepEqual(
    app.frame.tabs.map(t => t.href),
    ['#/ui-kit/basics', '#/ui-kit/overlays', '#/ui-kit/forms', '#/ui-kit/look'],
  );
  assert.deepEqual(
    app.frame.crumbs.map(c => c.href),
    ['#/ui-kit', undefined],
  );
  assert.equal(app.frame.back, '#/ui-kit');

  app.router.navigate('#/ui-kit/nowhere');
  assert.equal(location.get(), '#/ui-kit', 'replaced by the first section');
  assert.equal(app.kit.section, 'basics');
  assert.equal(app.frame.back, undefined);

  app.notifier.toast('Saved');
  assert.deepEqual(app.frame.layer.toaster.shown, [{ text: 'Saved', kind: 'toast' }]);

  app.kit.host?.setAppearance({ scheme: 'dark', character: 'owl', motion: 'reduced' });
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.deepEqual(loadAppearance(kv, document.documentElement), { scheme: 'dark', character: 'owl', motion: 'reduced' });
  assert.ok(kv.get(APPEARANCE_KEY).ok);

  app.router.navigate('#/today');
  assert.equal(left, 1);
  app.stop();
  assert.equal(document.querySelector('noema-app-frame'), null);
});

test('a saved appearance that is not readable: the character on the page, else the default', () => {
  const kv = memoryStorage().kv;
  kv.set(APPEARANCE_KEY, '{broken');
  const root = document.createElement('html');
  root.dataset.m = 'robot';
  assert.deepEqual(loadAppearance(kv, root), { scheme: 'system', character: 'robot', motion: 'system' });
  root.dataset.m = 'nobody';
  assert.equal(loadAppearance(kv, root).character, 'hedge');
});
