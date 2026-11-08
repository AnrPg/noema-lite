/**
 * A browser for the UI's unit tests: happy-dom's window installed as the globals (document, customElements, HTMLElement …)
 * before Lit and the components are imported. Import it first in every test file of the UI:
 *   import './dom.ts';
 * Each test file runs in its own process (node --test), so the globals never leak into the other suites.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/', width: 1280, height: 900 });
