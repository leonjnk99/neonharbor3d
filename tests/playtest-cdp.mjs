// NEONHARBOR 3D — scripted CDP playtest. Drives the real game in headless
// Chromium (file:// bundle) through keyboard/mouse input and the
// window.__nh3d debug API. Fails on any console error, failed request, or
// failed check. Usage: CDP_PORT=9227 node tests/playtest-cdp.mjs
import { connectCDP } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundleUrl = 'file://' + join(here, 'bundle.html');

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('  ok  ' + name); }
  else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdp = await connectCDP();
const tab = await cdp.openTab(bundleUrl);
await tab.waitFor('window.__nh3d && window.__nh3d.ready === true', 30000);
console.log('game loaded');

// 1. Start the game (skip the title screen).
await tab.eval(`window.__nh3d.start(false)`);
await sleep(600);
let st = await tab.eval(`window.__nh3d.state()`);
check('playtest: game starts in playing state', st.state === 'playing', st.state);

// 2. Walk forward with W: position must change.
const x0 = st.x, y0 = st.y;
await tab.holdKey('KeyW', 'w', 1500);
st = await tab.eval(`window.__nh3d.state()`);
const moved = Math.hypot(st.x - x0, st.y - y0);
check('playtest: W walks the player', moved > 2, `moved=${moved.toFixed(2)}`);

// 3. Turn with the API, then shoot with a real mouse click: ammo must drop.
await tab.eval(`window.__nh3d.setYaw(0)`);
await tab.eval(`window.__nh3d.teleport(13.5, 13.5, Math.PI)`);
await tab.eval(`window.__nh3d.spawnEnemy('gang', 10.5, 13.5)`);
await sleep(300);
const ammo0 = (await tab.eval(`window.__nh3d.state()`)).ammo;
await tab.holdClick(640, 360, 350);
await sleep(500);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: mouse click fires (ammo drops)', st.ammo < ammo0, `ammo ${ammo0} -> ${st.ammo}`);

// 4. Shooting the enemy in front hurts it: spawn a fresh target 3 cells west
// (track it by id — ambient gang also roam, so find() alone is ambiguous),
// read its hp, shoot, read again.
const eid = await tab.eval(`window.__nh3d.spawnEnemy('gang', 10.5, 13.5).id`);
const hpOf = (id) => `(() => { const e = window.__nh3d.world.enemies.find(x => x.id === ${id}); return e ? e.hp : 0; })()`;
const hpBefore = await tab.eval(hpOf(eid));
await tab.holdClick(640, 360, 350);
await sleep(400);
const hpAfter = await tab.eval(hpOf(eid));
check('playtest: shots damage the enemy', hpAfter < hpBefore, `hp ${hpBefore} -> ${hpAfter}`);

// 5. Mission 1 completes by reaching the bar marker.
await tab.eval(`window.__nh3d.setMission(0)`);
await tab.eval(`window.__nh3d.teleport(10.5, 7.5, 0)`);
await sleep(400);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: mission 1 completes at the bar', st.mission === 2, `mission=${st.mission}`);
check('playtest: mission 1 pays $100', st.cash >= 100, `cash=${st.cash}`);

// 6. Driving: mission 3, steal the car, drive forward.
await tab.eval(`window.__nh3d.setMission(2)`);
await tab.eval(`window.__nh3d.teleport(8.0, 20.5, 0)`);
await tab.press('KeyE', 'e');
await sleep(400);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: E steals the car', st.driving === true, `driving=${st.driving}`);
await tab.eval(`window.__nh3d.setYaw(-Math.PI/2)`);
const cy0 = st.y;
await tab.holdKey('KeyW', 'w', 1500);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: car drives north', st.y < cy0 - 3, `y ${cy0.toFixed(1)} -> ${st.y.toFixed(1)}`);
await tab.press('KeyE', 'e');
await sleep(300);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: E exits the car', st.driving === false);

// 7. Wanted: 3 stars spawns police.
await tab.eval(`window.__nh3d.setWanted(3)`);
await sleep(6000);
const police = await tab.eval(`window.__nh3d.world.enemies.filter(e => e.type === 'police' && !e.dead).length`);
check('playtest: police spawn at 3 stars', police >= 1, `police=${police}`);

// 8. Reload with R refills the magazine.
await tab.eval(`window.__nh3d.giveAmmo()`);
await tab.eval(`window.__nh3d.teleport(1.5, 6.5, 0)`);
await tab.press('KeyR', 'r');
await sleep(1500);
st = await tab.eval(`window.__nh3d.state()`);
check('playtest: R reloads the pistol', st.ammo === 12, `ammo=${st.ammo}`);

// 9. Save exists after a mission completed.
const saved = await tab.eval(`!!localStorage.getItem('neonharbor3d-save-v1')`);
check('playtest: progress saved to localStorage', saved === true);

// 10. Frame rate over 3 seconds (headless software rendering; expect 30+).
await sleep(500);
const fps = await tab.eval(`(async () => { await new Promise(r => setTimeout(r, 3000)); return window.__nh3d.fps(); })()`);
console.log(`  fps (3s sample): ${fps}`);
check('playtest: fps >= 30', fps >= 30, `fps=${fps}`);

// 11. No console errors, no failed requests, no http(s) requests.
const errs = tab.consoleErrors();
const failedReqs = tab.failedRequests();
const httpReqs = tab.httpRequests();
check('playtest: zero console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
check('playtest: zero failed requests', failedReqs.length === 0, failedReqs.slice(0, 2).join(' | '));
check('playtest: zero network requests', httpReqs.length === 0, httpReqs.slice(0, 3).join(' | '));

console.log(`\nplaytest: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('failures:', failures.join(', ')); process.exit(1); }
process.exit(0);
