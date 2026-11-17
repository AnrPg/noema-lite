/* 🌐 The translator over memory ports: own keys only and the chosen provider, off = nothing sent, the policy before anything
   leaves, each text sent once, the cache (per target, kept on this device), the three caps, a provider's error, the estimate. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MtSettings } from '../domain/plan.ts';
import { createTranslator, type JsonStore, type MtProvider } from './translator.ts';

const store = (): JsonStore & { map: Map<string, unknown> } => {
  const map = new Map<string, unknown>();
  return {
    map,
    get: k => map.get(k) ?? null,
    set: (k, v) => (map.set(k, JSON.parse(JSON.stringify(v)) as unknown), true),
    remove: k => void map.delete(k),
  };
};
function fakes(keys: { claude?: boolean; gemini?: boolean } = {}) {
  const settings = new Map<string, MtSettings>(),
    device = store(),
    session = store(),
    sent: string[] = [];
  let now = 1_000_000,
    perMinute = 100;
  const provider = (id: string, has: boolean): MtProvider => ({
    id,
    label: id,
    has: () => has,
    price: () => ({ in: 1, out: 1 }),
    translate: (_acc, texts, o) => {
      sent.push(...texts);
      return Promise.resolve({ texts: texts.map(t => `[${o.to}] ${t}`) });
    },
  });
  const mt = createTranslator({
    account: acc => acc ?? 'tester',
    uiLocale: () => 'en',
    readSettings: acc => settings.get(acc) ?? null,
    writeSettings: (acc, s) => settings.set(acc, s),
    device,
    session,
    clock: { now: () => now, today: () => '2026-11-17' },
    providers: () => [provider('claude', !!keys.claude), provider('gemini', !!keys.gemini)],
    perMinute: () => perMinute,
  });
  return {
    mt,
    sent,
    device,
    tick: (ms: number) => (now += ms),
    setPerMinute: (n: number) => (perMinute = n),
  };
}

test('providers: none without an own key; auto takes Claude first; a chosen one is respected', () => {
  assert.equal(fakes().mt.provider(), null);
  assert.equal(fakes({ gemini: true }).mt.provider()?.id, 'gemini');
  const { mt } = fakes({ claude: true, gemini: true });
  assert.equal(mt.provider()?.id, 'claude');
  mt.setSettings(null, { provider: 'gemini' });
  assert.equal(mt.provider()?.id, 'gemini');
});

test('off: nothing sent; on: the policy first, each text once, results in order, same-language texts kept', async () => {
  const { mt, sent } = fakes({ gemini: true });
  const off = await mt.translate(['Κινηματική'], { kind: 'explore.pack' });
  assert.equal(off[0]?.reason, 'off');
  assert.equal(sent.length, 0);
  mt.setSettings(null, { on: true });
  assert.equal((await mt.translate(['Οι σημειώσεις μου'], { kind: 'note' }))[0]?.reason, 'policy');
  const r = await mt.translate(['Κινηματική', { text: 'Physics', language: 'en' }, 'Κινηματική', { text: 'Ιδιωτικό', private: true }], {
    kind: 'explore.pack',
  });
  assert.deepEqual(
    r.map(x => x.reason ?? x.text),
    ['[en] Κινηματική', 'same', '[en] Κινηματική', 'private'],
  );
  assert.deepEqual(sent, ['Κινηματική']);
  assert.equal(r[0]?.original, 'Κινηματική');
  assert.equal(r[0].provider, 'gemini');
});

test('the cache: hits are free, per target locale, kept on this device; cleared', async () => {
  const { mt, sent, device } = fakes({ gemini: true });
  mt.setSettings(null, { on: true });
  await mt.translate(['Μηχανική'], { kind: 'explore.pack' });
  const again = await mt.translate(['Μηχανική'], { kind: 'explore.pack' });
  assert.ok(again[0]?.cached && again[0].translated);
  assert.equal(sent.length, 1);
  assert.equal((await mt.translate(['Μηχανική'], { kind: 'explore.pack', to: 'fr' }))[0]?.text, '[fr] Μηχανική');
  assert.equal(mt.cache.size(), 2);
  assert.ok(device.map.has('noema-device:mt:cache:tester'));
  mt.cache.clear();
  assert.equal(mt.cache.size(), 0);
});

test('no key: the original with nokey; a provider error: the original with error', async () => {
  const { mt } = fakes();
  mt.setSettings(null, { on: true });
  assert.equal((await mt.translate(['Θερμοδυναμική'], { kind: 'shared.roadmap' }))[0]?.reason, 'nokey');
  mt.useProvider({ translate: () => Promise.reject(new Error('down')) });
  const r = await mt.translate(['Θερμοδυναμική'], { kind: 'shared.roadmap' });
  assert.equal(r[0]?.reason, 'error');
  assert.equal(r[0].text, 'Θερμοδυναμική');
});

test('the caps: characters a day, requests a session, requests a minute — nothing sent over one', async () => {
  const f = fakes({ gemini: true });
  const { mt, sent } = f;
  mt.setSettings(null, { on: true });
  await mt.translate(['Κάτι νέο'], { kind: 'explore.pack' });
  assert.equal(mt.usage.day(), 'Κάτι νέο'.length);
  assert.equal(mt.usage.session(), 1);
  mt.setSettings(null, { dailyChars: mt.usage.day() + 5 });
  assert.equal((await mt.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack' }))[0]?.reason, 'cap.daily');
  mt.setSettings(null, { dailyChars: 20000, sessionRequests: 1 });
  assert.equal((await mt.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack' }))[0]?.reason, 'cap.session');
  mt.setSettings(null, { sessionRequests: 100 });
  f.setPerMinute(1);
  assert.equal((await mt.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack' }))[0]?.reason, 'cap.rate');
  f.tick(61_000);
  assert.ok((await mt.translate(['Ένα αρκετά μεγάλο κείμενο'], { kind: 'explore.pack' }))[0]?.translated, 'a minute later');
  assert.equal(sent.length, 2);
});

test('the estimate: the unique texts not in the cache, their characters, the provider', async () => {
  const { mt } = fakes();
  mt.useProvider({ translate: (_a, texts) => Promise.resolve({ texts: texts.map(t => 'x' + t) }) });
  mt.setSettings(null, { on: true });
  await mt.translate(['Ένα'], { kind: 'explore.pack' });
  const e = mt.estimate(['Ένα', 'Δύο κείμενα', 'Δύο κείμενα']);
  assert.equal(e.texts, 1);
  assert.equal(e.cached, 1);
  assert.equal(e.chars, 11);
  assert.equal(e.provider, 'Mock');
});
