import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';

// Optional: QUEST_CHROMIUM points at an installed headless Chromium. QUEST_SIZE='[[390,844]]' runs one viewport.
const launch = chromium.launch.bind(chromium);
if (process.env.QUEST_CHROMIUM) chromium.launch = o => launch({ ...o, executablePath: process.env.QUEST_CHROMIUM });
const sizes = process.env.QUEST_SIZE ? JSON.parse(process.env.QUEST_SIZE) : [[320, 568], [390, 844], [844, 390], [960, 640], [1100, 900]];
const shots = new Set([390, 1100]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const [width, height] of sizes) console.log(await testGame('./games/rare-quest', {
  width, height, timeout: 20_000, screenshot: `./artifacts/quest-${width}.png`, check: async ({ page, game }) => {
    const screen = game.getByTestId('screen');
    const attr = name => screen.getAttribute(`data-${name}`);
    const until = async (what, fn, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(60); } throw new Error(`timed out: ${what}`); };
    const shot = async name => { if (shots.has(width)) await page.screenshot({ path: `./artifacts/quest-${name}-${width}.png` }); };
    const tapA = () => game.getByTestId('pad-a').click();
    async function hold(dir, done, ms = 15_000) {
      const pad = game.getByTestId(`pad-${dir}`);
      await pad.hover(); await page.mouse.down();
      try { await until(`holding ${dir}`, done, ms); } finally { await page.mouse.up(); }
    }

    const connect = async () => {
      await page.reload();
      await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole('button', { name: /^Friend #7730/ }).click();
    };
    await connect();
    await game.getByRole('button', { name: 'はじめから', exact: true }).waitFor();
    await game.getByRole('img', { name: 'Friend #7730', exact: true }).first().waitFor();
    await shot('title');
    await game.getByRole('button', { name: 'はじめから', exact: true }).click();

    // Layout: controls are big enough and sit clear of the host wallet toolbar; nothing scrolls sideways.
    const wallet = await page.getByRole('button', { name: 'Open Friend wallet', exact: true }).boundingBox();
    for (const id of ['pad-up', 'pad-down', 'pad-left', 'pad-right', 'pad-a', 'pad-b', 'pad-menu']) {
      const box = await game.getByTestId(id).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${id} is a 44px target (${box.width}x${box.height})`);
      assert.ok(box.y + box.height <= wallet.y + 1, `${id} clear of host controls`);
    }
    const sbox = await screen.boundingBox(); assert.ok(sbox.width >= 240, `screen width ${sbox.width}`);
    assert.ok(Math.abs(sbox.width / sbox.height - 160 / 144) < 0.02, 'screen keeps the 160x144 shape');

    // Intro dialogue: A advances the text box.
    await game.getByTestId('textbox').waitFor();
    for (let i = 0; i < 10 && await attr('scene') === 'talk'; i++) await tapA();
    assert.equal(await attr('scene'), 'world'); assert.equal(await attr('map'), 'moegi');

    // After a lost battle the Friend wakes up at home: walk out of the door, across the village and north to the trail.
    async function leaveHome() {
      await hold('left', async () => Number(await attr('x')) <= 2, 5000);
      await hold('down', async () => Number(await attr('y')) >= 5, 5000);
      await hold('right', async () => Number(await attr('x')) >= 3, 5000);
      await hold('down', async () => await attr('map') === 'moegi', 5000);
      await hold('right', async () => Number(await attr('x')) >= 9, 5000);
      await hold('up', async () => await attr('map') === 'wakaba' || await attr('scene') !== 'world');
    }
    // Walk north out of the village into the Sprout Trail.
    await hold('up', async () => await attr('map') === 'wakaba' || await attr('scene') !== 'world');
    await shot('world');
    // Pace the tall grass until a wild monster appears (retry if a battle is lost).
    let result = '';
    for (let battle = 0; battle < 3 && !['win', 'caught'].includes(result); battle++) {
      let dir = 'up'; const trail = [];
      for (let n = 0; n < 150 && await attr('scene') === 'world'; n++) {
        if (await attr('map') === 'home') { await leaveHome(); continue; }
        if (await attr('map') === 'moegi') { await hold('up', async () => await attr('map') === 'wakaba' || await attr('scene') !== 'world'); continue; }
        const y = Number(await attr('y'));
        // Grass rows 21-23 at x=9; overshooting north is harmless, south leads back to the village.
        dir = y <= 20 ? 'down' : y >= 22 ? 'up' : dir;
        const target = dir === 'up' ? y - 1 : y + 1; trail.push(`${y}${dir[0]}${await attr('paused') === 'true' ? 'P' : ''}`);
        await hold(dir, async () => Number(await attr('y')) === target || await attr('scene') !== 'world', 3000).catch(() => {});
      }
      await until(`battle after ${trail.join(' ')} on ${await attr('map')}`, async () => await attr('scene') === 'battle', 5000);
      if (battle === 0) {
        await until('battle menu', async () => { if (await attr('ui') === 'main') return true; await tapA(); return false; });
        await game.getByRole('button', { name: 'たたかう', exact: true }).waitFor();
        await shot('battle');
      }
      let triedRibbon = false;
      await until('battle over', async () => {
        const scene = await attr('scene');
        if (scene !== 'battle') return true;
        const ui = await attr('ui');
        if (ui === 'main' && !triedRibbon) {
          // Weaken it first, then try a Friend Ribbon once.
          const hp = await game.getByTestId('foe-hud').getByRole('meter').getAttribute('aria-valuenow');
          const max = await game.getByTestId('foe-hud').getByRole('meter').getAttribute('aria-valuemax');
          if (Number(hp) < Number(max)) { triedRibbon = true; await game.getByRole('button', { name: 'どうぐ', exact: true }).click(); await game.getByRole('button', { name: /なかよしリボン/ }).click(); return false; }
        }
        if (ui === 'party') { await game.getByTestId('pad-down').click(); await tapA(); return false; }
        await tapA();
        return false;
      }, 60_000);
      for (let i = 0; i < 6 && await attr('scene') === 'talk'; i++) await tapA();
      result = await attr('last');
    }
    assert.ok(['win', 'caught'].includes(result), `won or befriended: ${result}`);
    const partySize = Number(await attr('party'));
    assert.ok(result !== 'caught' || partySize === 2, 'befriended monster joined the party');

    // Keyboard: focus the game frame, open the menu with M and save with ↓↓↓ Z.
    await screen.click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('m'); await until('menu', async () => await attr('scene') === 'menu');
    await shot('menu');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('z');
    await game.getByText('きろくを セーブしました！', { exact: true }).waitFor();
    await page.keyboard.press('z'); await until('world', async () => await attr('scene') === 'world');

    // Pause with P freezes input; resume by button.
    await page.keyboard.press('p'); await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
    const before = await attr('y'); await game.getByTestId('pad-down').hover(); await page.mouse.down(); await sleep(500); await page.mouse.up();
    assert.equal(await attr('y'), before, 'paused: no movement');
    await game.getByRole('button', { name: '再開する', exact: true }).click();

    // Language toggle switches every label.
    await game.getByRole('button', { name: 'English', exact: true }).click();
    await game.getByRole('button', { name: '日本語', exact: true }).waitFor();
    await game.getByTestId('pad-menu').click(); await game.getByRole('button', { name: 'PARTY', exact: true }).waitFor();
    await game.getByRole('button', { name: 'PARTY', exact: true }).click(); await game.getByRole('heading', { name: /Party/ }).waitFor();
    if (width === 1100 || width === 390) await shot('party');
    await game.getByTestId('pad-b').click(); await game.getByTestId('pad-b').click();
    await until('closed', async () => await attr('scene') === 'world');

    const wide = await game.locator('.quest').evaluate(e => e.scrollWidth > e.clientWidth + 1 ? [...e.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > e.clientWidth + 1).map(n => n.className || n.tagName).slice(0, 8) : null);
    assert.equal(wide, null, `no horizontal overflow: ${JSON.stringify(wide)}`);
    assert.equal(await game.locator('body').evaluate(e => e.scrollWidth > innerWidth), false);

    // The save survives a reload: Continue resumes on the trail.
    await connect();
    await game.getByRole('button', { name: 'つづきから', exact: true }).click();
    await until('resumed', async () => await attr('scene') === 'world' && await attr('map') === 'wakaba');
    assert.equal(Number(await attr('party')), partySize, 'party restored');
    console.log(`Rare Quest ${width}x${height}: walk, battle (${result}), save, pause, language, reload PASS`);
  },
}));
