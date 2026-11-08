/* The design tokens as CSS (src/ui/tokens → engine/tokens.css): the generator of the esbuild pipeline. It bundles
   src/ui/tokens/css.ts with esbuild, runs tokensCss() and writes the file (only when it changed).
     import { writeTokensCss } from './tokens.mjs'; await writeTokensCss();   (tools/esbuild.mjs, on every build: npm run build, tools/build.py)
     node tools/tokens.mjs [out.css]   (default engine/tokens.css)   ·   node tools/tokens.mjs --print   (the text, to stdout) */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_CSS = path.join(ROOT, 'engine', 'tokens.css');

/** the text of engine/tokens.css */
export async function tokensCssText() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, 'src', 'ui', 'tokens', 'css.ts')], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'warning' });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
  return mod.tokensCss();
}
/** write engine/tokens.css (or out); → true when the file changed */
export async function writeTokensCss(out = TOKENS_CSS) {
  const css = await tokensCssText();
  if (fs.existsSync(out) && fs.readFileSync(out, 'utf8') === css) return false;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, css);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--print') process.stdout.write(await tokensCssText());
  else {
    const out = path.resolve(arg || TOKENS_CSS);
    console.log(`tokens: ${path.relative(ROOT, out)} ${(await writeTokensCss(out)) ? 'written' : 'unchanged'}`);
  }
}
