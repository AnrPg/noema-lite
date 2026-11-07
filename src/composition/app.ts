/**
 * The entry of engine/core.js: starts the browser root (src/composition/browser.ts) and publishes window.NoemaCore.
 * The only module with a side effect on import; tests import browser.ts instead.
 */
import { start } from './browser.ts';

start();
