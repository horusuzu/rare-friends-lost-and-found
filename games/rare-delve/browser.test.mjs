import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { DIRS, DIR_LIST } from './data.ts';
import { canStep } from './dungeon.ts';
import { newFloor } from './run.ts';

// Optional: DELVE_CHROMIUM points at an installed headless Chromium. DELVE_SIZE='[[390,844]]' runs one viewport.
const launch = chromium.launch.bind(chromium);
if (process.env.DELVE_CHROMIUM) chromium.launch = o => launch({ ...o, executablePath: process.env.DELVE_CHROMIUM });
const sizes = process.env.DELVE_SIZE ? JSON.parse(process.env.DELVE_SIZE) : [[320, 568], [390, 844], [844, 390], [960, 640], [1100, 900]];
const shots = new Set([390, 1100]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NUMPAD = { n: 'Numpad8', ne: 'Numpad9', e: 'Numpad6', se: 'Numpad3', s: 'Numpad2', sw: 'Numpad1', w: 'Numpad4', nw: 'Numpad7' };

/** The floor as the engine builds it (same seed, same layout): used only to plan a route, never to change the game. */
function layout(seed, floor) {
  const s = newFloor({ run: { seed, nextId: 1 }, hero: {}, meta: { best: 0 } }, floor);
  return { map: s.run.map, items: s.run.items, traps: s.run.traps };
}
/** First step of a shortest 8-way path from (x, y) to (tx, ty) that avoids every trap. */
function firstStep(map, traps, x, y, tx, ty) {
  const blocked = new Set(traps.map(t => t.y * map.w + t.x));
  const prev = new Map([[y * map.w + x, null]]), queue = [[x, y]];
  for (let q = 0; q < queue.length; q++) {
    const [cx, cy] = queue[q];
    if (cx === tx && cy === ty) break;
    for (const d of DIR_LIST) {
      if (!canStep(map, cx, cy, d)) continue;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1], i = ny * map.w + nx;
      if (prev.has(i) || (blocked.has(i) && !(nx === tx && ny === ty))) continue;
      prev.set(i, [cx, cy, d]); queue.push([nx, ny]);
    }
  }
  let at = prev.get(ty * map.w + tx), dir = null;
  while (at) { dir = at[2]; at = prev.get(at[1] * map.w + at[0]); }
  return dir;
}

for (const [width, height] of sizes) console.log(await testGame('./games/rare-delve', {
  width, height, timeout: 20_000, check: async ({ page, game }) => {
    const screen = game.getByTestId('screen');
    const attr = name => screen.getAttribute(`data-${name}`);
    const num = async name => Number(await attr(name));
    const until = async (what, fn, ms = 15_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(50); } throw new Error(`timed out: ${what}`); };
    const shot = async name => { if (shots.has(width)) await page.screenshot({ path: `./artifacts/delve-${name}-${width}.png` }); };
    const tap = id => game.getByTestId(id).click();
    const where = async () => ({ scene: await attr('scene'), floor: await num('floor'), x: await num('x'), y: await num('y'), turn: await num('turn') });

    /** One keypad step; waits until the engine answers (moved, turn spent, or the scene changed). */
    async function stepKey(dir) {
      const before = await where();
      await page.keyboard.press(NUMPAD[dir] ?? 'Numpad5');
      await until(`step ${dir}`, async () => { const now = await where(); return now.turn !== before.turn || now.x !== before.x || now.y !== before.y || now.scene !== before.scene; }, 3000).catch(() => {});
    }
    /** Walk to (tx, ty) on the current floor; true once standing there. Fights whatever blocks the way. */
    async function walkTo(tx, ty, stop = async () => false, limit = 400) {
      const floor = await num('floor'), plan = layout(await num('seed'), floor);
      for (let n = 0; n < limit; n++) {
        const at = await where();
        if (at.scene !== 'dungeon' || at.floor !== floor || await stop()) return false;
        if (at.x === tx && at.y === ty) return true;
        const dir = firstStep(plan.map, plan.traps, at.x, at.y, tx, ty);
        if (!dir) return false;
        await stepKey(dir);
      }
      return false;
    }
    async function dive() {
      if (await attr('scene') === 'summary') { await tap('summary-ok'); await until('town', async () => await attr('scene') === 'town'); }
      await tap('town-dive'); await until('floor 1', async () => await attr('scene') === 'dungeon' && await num('floor') === 1);
    }

    const connect = async () => {
      await page.reload();
      await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole('button', { name: /^Friend #7730/ }).click();
    };
    await connect();
    await game.getByRole('button', { name: 'はじめから', exact: true }).waitFor();
    await game.getByRole('img', { name: 'Friend #7730', exact: true }).first().waitFor();
    await game.getByText('ゴールドは ゲーム内の 無料シミュレーション通貨です（RFでは ありません）。', { exact: true }).waitFor();
    await shot('title');
    await game.getByRole('button', { name: 'はじめから', exact: true }).click();
    await until('town', async () => await attr('scene') === 'town');

    // Layout: every pad control is a 44px target clear of the host wallet toolbar; the screen keeps its canvas's shape
    // (15 x 11 tiles, or 13 columns and more rows on a phone's portrait stage).
    const wallet = await page.getByRole('button', { name: 'Open Friend wallet', exact: true }).boundingBox();
    const pads = ['pad-n', 'pad-ne', 'pad-e', 'pad-se', 'pad-s', 'pad-sw', 'pad-w', 'pad-nw', 'pad-wait', 'pad-a', 'pad-b', 'pad-menu', 'pad-map', 'pad-turn', 'mute'];
    for (const id of pads) {
      const box = await game.getByTestId(id).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${id} is a 44px target (${box.width}x${box.height})`);
      assert.ok(box.y + box.height <= wallet.y + 1, `${id} clear of host controls`);
    }
    const sbox = await screen.boundingBox(); assert.ok(sbox.width >= 240, `screen width ${sbox.width}`);
    const [cols, rows] = [await num('cols'), await num('rows')];
    assert.ok((cols === 15 && rows === 11) || (cols === 13 && rows >= 11 && width <= 560 && height > width), `view ${cols}x${rows}`);
    assert.ok(Math.abs(sbox.width / sbox.height - cols / rows) < 0.02, `screen keeps the ${cols * 16}x${rows * 16} shape`);

    // Town: the shop counter opens and closes; gold is labelled as simulated.
    await shot('town');
    await tap('town-shop'); await until('shop', async () => await attr('scene') === 'shop');
    await game.getByTestId('shop-upgrade').waitFor();
    await game.getByText(/RFでは ありません/).first().waitFor();
    await tap('pad-b'); await until('back in town', async () => await attr('scene') === 'town');

    // Dive, then act: attack the air, search in place, and turn without spending a turn.
    await dive();
    await screen.click({ position: { x: 8, y: 30 } });
    let t = await num('turn'); await tap('pad-a'); await until('attack spends a turn', async () => await num('turn') === t + 1);
    t = await num('turn'); await page.keyboard.press('Numpad5'); await until('wait spends a turn', async () => await num('turn') === t + 1);
    t = await num('turn'); await tap('pad-turn'); await until('turn mode', async () => await attr('turnmode') === 'true');
    await page.keyboard.press('Numpad6'); await until('faced east', async () => await attr('turnmode') === 'false');
    assert.equal(await num('turn'), t, 'turning in place is free');
    const tapBefore = await where(); await tap('pad-s'); await sleep(150);
    await tap('pad-n'); await until('pad steps answer', async () => (await where()).turn !== tapBefore.turn || (await attr('scene')) !== 'dungeon', 3000).catch(() => {});
    await shot('dungeon');

    // Pick something up: walk to the nearest floor item (fighting anything in the way).
    let picked = false;
    for (let attempt = 0; attempt < 3 && !picked; attempt++) {
      if (await attr('scene') !== 'dungeon') await dive();
      const plan = layout(await num('seed'), await num('floor'));
      const { x, y } = await where();
      const targets = plan.items.filter(f => f.item.k !== 'lantern').sort((a, b) => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) - Math.max(Math.abs(b.x - x), Math.abs(b.y - y)));
      for (const f of targets.slice(0, 3)) {
        const had = await num('bag') + await num('gold');
        await walkTo(f.x, f.y);
        if (await attr('scene') === 'dungeon' && await num('bag') + await num('gold') > had) { picked = true; break; }
      }
    }
    assert.ok(picked, 'picked up an item or gold');

    // Item menu: open the bag, check unidentified names, eat the starter bun.
    await tap('pad-menu'); await until('bag', async () => await attr('scene') === 'bag');
    await shot('items');
    if (await num('unknown') > 0) assert.ok(await game.getByTestId('bag').getByText(/の びん$|」の巻物$|のつえ \(|のつえ$/).count() > 0, 'unidentified items show their looks');
    const bag = await num('bag');
    await game.getByTestId('bag').getByRole('button', { name: /小さなパン/ }).first().click();
    await until('act menu', async () => await attr('scene') === 'act');
    await tap('act-use'); await until('ate', async () => await attr('scene') === 'dungeon' && await num('bag') === bag - 1);

    // Map overlay toggles without spending a turn.
    t = await num('turn'); await tap('pad-map'); await until('map', async () => await attr('showmap') === 'true');
    await shot('map');
    await tap('pad-b'); await until('map closed', async () => await attr('showmap') === 'false');
    assert.equal(await num('turn'), t, 'the map is free');

    // Stairs: walk there and descend with A.
    for (let attempt = 0; attempt < 3 && await num('floor') < 2; attempt++) {
      if (await attr('scene') !== 'dungeon') await dive();
      const plan = layout(await num('seed'), await num('floor'));
      if (await walkTo(plan.map.stairs[0], plan.map.stairs[1])) {
        await until('on stairs', async () => await attr('onstairs') === 'true', 3000);
        await tap('pad-a'); await until('floor 2', async () => await num('floor') === 2, 5000);
      }
    }
    assert.equal(await num('floor'), 2, 'reached floor 2 by the stairs');

    // Pause with P freezes input; resume by button.
    await page.keyboard.press('p'); await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
    assert.equal(await attr('paused'), 'true');
    const frozen = await where(); await page.keyboard.press('Numpad5'); await page.keyboard.press('Numpad8'); await sleep(300);
    assert.deepEqual(await where(), frozen, 'paused: no turn passes');
    await game.getByRole('button', { name: '再開する', exact: true }).click();
    await until('resumed', async () => await attr('paused') === 'false');

    // Language toggle switches the HUD and controls; then back to Japanese.
    await game.getByRole('button', { name: 'English', exact: true }).click();
    await game.getByRole('button', { name: '日本語', exact: true }).waitFor();
    await game.getByTestId('hud').getByText('Belly', { exact: false }).waitFor();
    assert.equal(await game.getByTestId('pad-menu').textContent(), 'Bag');
    await game.getByText('GOLD IS FREE & SIMULATED · NOT RF', { exact: true }).waitFor();
    await game.getByRole('button', { name: '日本語', exact: true }).click();
    await game.getByTestId('hud').getByText('おなか', { exact: false }).waitFor();

    const wide = await game.locator('.delve').evaluate(e => e.scrollWidth > e.clientWidth + 1 ? [...e.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > e.clientWidth + 1).map(n => n.className || n.tagName).slice(0, 8) : null);
    assert.equal(wide, null, `no horizontal overflow: ${JSON.stringify(wide)}`);
    assert.equal(await game.locator('body').evaluate(e => e.scrollWidth > innerWidth || e.scrollHeight > innerHeight + 1), false, 'no page overflow');

    // Suspend: save the dive exactly as it stands, then reload and continue.
    const suspended = await where();
    await game.getByRole('button', { name: '一時停止', exact: true }).click();
    await game.getByTestId('suspend').click();
    await game.getByRole('button', { name: /^つづきから/ }).waitFor();
    await connect();
    await game.getByRole('button', { name: /^つづきから（2階）$/ }).click();
    await until('resumed dive', async () => await attr('scene') === 'dungeon');
    assert.deepEqual(await where(), suspended, 'the suspended dive resumes on the same floor, tile and turn');
    console.log(`Rare Delve ${width}x${height}: town, shop, dive, act, pick up, bag, map, stairs, pause, language, suspend, reload PASS`);
  },
}));
