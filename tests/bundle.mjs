// Build tests/bundle.html: a single-file copy of the game for the file:// CDP
// harnesses. The VM's Chromium blocks http://127.0.0.1 navigations from CDP,
// so the harnesses drive this bundle instead of the served game. Same code,
// import/export lines stripped, modules concatenated in dependency order.
// Usage: node tests/bundle.mjs   (regenerates tests/bundle.html)
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const gameDir = join(root, 'game');

// Dependency order: every name must be declared before the code that runs it.
const ORDER = [
  'config.js', 'random.js', 'map.js', 'raycast.js', 'combat.js',
  'player.js', 'enemies.js', 'missions.js', 'save.js', 'world.js',
  'textures.js', 'render.js', 'audio.js', 'input.js', 'ui.js', 'main.js',
];

let bundle = '';
for (const name of ORDER) {
  const src = fs.readFileSync(join(gameDir, 'src', name), 'utf8');
  const lines = src.split('\n').filter((line) => !line.startsWith('import '));
  const body = lines
    .join('\n')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ')
    .replace(/^export class /gm, 'class ');
  bundle += `\n// ---- ${name} ----\n${body}\n`;
}

const html = fs.readFileSync(join(gameDir, 'index.html'), 'utf8');
const out = html.replace(
  '<script type="module" src="./src/main.js"></script>',
  // A function replacement: the bundle contains $' sequences (template code)
  // that String.replace would otherwise expand as special $-patterns.
  () => `<script>\n${bundle}\n</script>`,
);
if (out === html) throw new Error('could not find the module script tag in game/index.html');
fs.writeFileSync(join(here, 'bundle.html'), out);
console.log('bundle.html written:', Buffer.byteLength(out), 'bytes from', ORDER.length, 'modules');
