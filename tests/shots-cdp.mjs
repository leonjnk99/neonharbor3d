// Take the 4 dossier screenshots via CDP: each shots.json entry opens the
// bundle with ?shot=<kind>&seed=1, waits for window.__shotReady, then captures
// a JPEG (retried at lower quality if it would exceed the 256 KiB cap).
// Usage: CDP_PORT=9227 node tests/shots-cdp.mjs
import { connectCDP } from './cdp.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = JSON.parse(fs.readFileSync(join(root, 'shots.json'), 'utf8'));
const bundleUrl = 'file://' + join(here, 'bundle.html');
const MAX_BYTES = 262144;

const cdp = await connectCDP();
for (const shot of shots) {
  const url = `${bundleUrl}${shot.query}`;
  const tab = await cdp.openTab(url);
  await tab.waitFor('window.__shotReady === true', 30000);
  const outPath = join(root, 'screenshots', shot.name);
  let quality = 88;
  let size = await tab.screenshot(outPath, quality);
  while (size > MAX_BYTES && quality > 40) {
    quality -= 12;
    size = await tab.screenshot(outPath, quality);
  }
  console.log(`${shot.name}: ${size} bytes (quality ${quality})${size > MAX_BYTES ? '  OVER THE 256 KiB CAP' : ''}`);
  tab.close();
}
console.log('screenshots done');
process.exit(0);
