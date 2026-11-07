/* noema-lite — the page side of the service worker (build/pwa.js, loaded by index.html on the site and on npm run dev).
   Registers /sw.js (scope /): the app shell offline after the first visit, the Python files of py-module@1 (src/composition/sw.ts).
   When a newer build's worker takes over a tab that was opened with an older one, a small note says so, with "Reload"
   (its words: the UI catalogs, i18n/loader/*.arb, keys loader.pwa.*). Never in the one-file bundle (file://: no service worker). */

interface I18n {
  t(key: string, vars?: Readonly<Record<string, unknown>>): string;
}
interface PwaWindow {
  NoemaI18n?: I18n;
  NOEMA_BUNDLE?: boolean;
  NOEMA_CONFIG?: { pwa?: boolean };
}

const W = window as Window & PwaWindow;
const SW_URL = '/sw.js';
const t = (key: string): string => W.NoemaI18n?.t(key) ?? key;

function showUpdateReady(): void {
  if (document.getElementById('noema-pwa-update')) return;
  const box = document.createElement('div');
  box.id = 'noema-pwa-update';
  box.setAttribute('role', 'status');
  box.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:200;display:flex;flex-wrap:wrap;align-items:center;gap:10px;' +
    'max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 14px;border-radius:14px;background:var(--card,#fff);color:var(--ink,#2f2a24);' +
    'border:1px solid var(--line,#ece5d8);box-shadow:0 10px 30px -12px rgba(0,0,0,.25);font-size:14px';
  const text = document.createElement('span');
  text.textContent = t('loader.pwa.updateReady');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'btn small';
  reload.textContent = t('loader.pwa.reload');
  reload.addEventListener('click', () => {
    location.reload();
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'btn small ghost';
  later.textContent = t('loader.pwa.later');
  later.addEventListener('click', () => {
    box.remove();
  });
  box.append(text, reload, later);
  document.body.append(box);
}

async function register(): Promise<void> {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (hadController) showUpdateReady();
  }); // a newer build took over this tab
  const reg = await sw.register(SW_URL, { scope: '/' });
  // a tab left open for days: look for a newer build when it comes back to the front (sw.js is small and never cached)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      reg.update().catch((e: unknown) => {
        console.info('[noema] service worker: no update check (offline?)', e);
      });
  });
}

const usable = (): boolean =>
  'serviceWorker' in navigator &&
  window.isSecureContext &&
  /^https?:$/.test(location.protocol) &&
  !W.NOEMA_BUNDLE &&
  W.NOEMA_CONFIG?.pwa !== false;
if (usable()) {
  const start = (): void => {
    register().catch((e: unknown) => {
      console.warn('[noema] service worker not registered', e);
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
