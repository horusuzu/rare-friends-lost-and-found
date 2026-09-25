import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { betOutcome } from './economy.ts';
import { routeRewards } from './rewards-fixture.mjs';

// Practice mode: the fixture Friend is not activated, so real rewards read as zero and the simulated mine is offered.
// Optional: MINE_CHROMIUM points at an installed headless Chromium. MINE_SIZE='[[390,844]]' runs one viewport.
const launch = chromium.launch.bind(chromium);
if (process.env.MINE_CHROMIUM) chromium.launch = o => launch({ ...o, executablePath: process.env.MINE_CHROMIUM });
const sizes = process.env.MINE_SIZE ? JSON.parse(process.env.MINE_SIZE) : [[320, 568], [390, 844], [844, 390], [960, 640], [1100, 900]];
const shots = new Set(process.env.MINE_SHOT_ALL ? sizes.map(([w]) => w) : [390, 1100]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const [width, height] of sizes) console.log(await testGame('./games/rare-mine', {
  width, height, timeout: 20_000, check: async ({ page, game, account }) => {
    const rewards = await routeRewards(page, { owner: account });
    rewards.inactive = true;
    const screen = game.getByTestId('screen');
    const attr = name => screen.getAttribute(`data-${name}`);
    const num = async name => Number(await attr(name));
    const until = async (what, fn, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(50); } throw new Error(`timed out: ${what}`); };
    const shot = async name => { if (shots.has(width)) await page.screenshot({ path: `./artifacts/mine-${name}-${width}.png` }); };
    const tap = id => game.getByTestId(id).click();
    const rock = async () => { const b = await screen.boundingBox(); await screen.click({ position: { x: b.width * 0.93, y: b.height * 0.5 } }); };
    const connect = async () => {
      await page.reload();
      await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole('button', { name: /^Friend #7730/ }).click();
    };

    // Title: the Friend is the miner; the currency is labelled as a simulation.
    await connect();
    await game.getByTestId('title-rewards').getByText('このFriendには報酬がたまっていません。アクティベートは公式サイトで。', { exact: true }).waitFor();
    await game.getByTestId('start').getByText('練習モードで採掘', { exact: true }).waitFor();
    await game.getByTestId('retry-title').waitFor();
    await game.getByRole('img', { name: 'Friend #7730', exact: true }).first().waitFor();
    await game.getByText('シミュレーション・本物のRFではありません', { exact: false }).first().waitFor();
    await shot('title');
    await tap('start');
    await until('mining', async () => await attr('started') === 'true' && await attr('phase') === 'mine');
    await game.getByTestId('sim-note').getByText('シミュレーション・本物のRFではありません', { exact: true }).waitFor();
    await game.getByTestId('sim-note').getByText('練習モード', { exact: true }).waitFor();
    await game.getByTestId('retry-rewards').waitFor();

    // Layout: every control is a 44px target clear of the host wallet toolbar; Withdraw and Bet are the same size.
    const wallet = await page.getByRole('button', { name: 'Open Friend wallet', exact: true }).boundingBox();
    for (const id of ['withdraw', 'bet', 'sound', 'lang', 'pause']) {
      const box = await game.getByTestId(id).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${id} is a 44px target (${box.width}x${box.height})`);
      assert.ok(box.y + box.height <= wallet.y + 1, `${id} clear of host controls`);
    }
    const [wb, bb] = [await game.getByTestId('withdraw').boundingBox(), await game.getByTestId('bet').boundingBox()];
    assert.ok(Math.abs(wb.width - bb.width) < 1 && Math.abs(wb.height - bb.height) < 1, 'Withdraw and Bet are equal-sized');
    const sbox = await screen.boundingBox(); assert.ok(sbox.width >= 240, `stage width ${sbox.width}`);
    const ratio = sbox.width / sbox.height;
    assert.ok(ratio > 256 / 272 - 0.02 && ratio < 1.62, `stage shape ${ratio}`);

    // The Friend mines on its own.
    await until('auto strikes', async () => await num('strikes') >= 2 && await num('pot') > 0);

    // Tapping the rock strikes at once and builds a combo.
    const before = await num('strikes');
    let bestCombo = 0;
    for (let i = 0; i < 10; i++) { await rock(); bestCombo = Math.max(bestCombo, await num('combo')); }
    assert.ok(bestCombo >= 2, `combo reached ${bestCombo}`);
    assert.ok(await num('strikes') >= before + 4, 'taps strike the rock');
    await page.keyboard.press('Space');
    await until('pot grows', async () => await num('pot') >= 20);
    await shot('mining');

    // Withdraw: the pot moves to the safe balance.
    await tap('withdraw');
    await until('withdrawn', async () => await num('safe') > 0);
    assert.equal(await num('safe'), await num('withdrawn'));
    assert.equal(await num('streak'), 0);

    // Bet: odds first, then a fixed, seeded outcome. Keep betting until both a win and a loss have happened.
    let wins = 0, losses = 0, maxStreak = 0, sawBet = false, sawBurn = false, sawWinFx = false, sawLoseFx = false;
    for (let round = 0; round < 40 && !(wins && losses && (maxStreak >= 2 || round >= 14)); round++) {
      await until('pot to bet', async () => await num('pot') > 0 && await attr('phase') === 'mine');
      for (let n = 0; n < 12 && await num('pot') < 12; n++) await rock();
      await tap('bet');
      await until('odds shown', async () => await attr('phase') === 'confirm');
      await game.getByTestId('odds').getByText('勝率45%・勝てば2倍・負ければ全額バーン', { exact: true }).waitFor();
      assert.ok(await game.getByTestId('withdraw').isEnabled(), 'Withdraw stays available while the odds are shown');
      if (!sawBet) { sawBet = true; await shot('bet'); }
      const seed = await num('betseed'), expect = betOutcome(seed)[0] ? 'win' : 'lose';
      const lastId = await num('lastid'), stake = await num('pot'), burned = await num('burned'), streak = await num('streak');
      await tap('confirm-bet');
      // The pachinko reach plays (2.5–4 s); its tier is cosmetic. Tap to skip straight to the result.
      await until('reach', async () => await attr('fx') === 'reach' && await attr('phase') === 'roll');
      assert.ok(['0', '1', '2'].includes(await attr('reach-tier')), 'reach tier');
      await game.getByTestId('roll').waitFor();
      await tap('roll');
      await until('result', async () => await num('lastid') !== lastId && await attr('phase') === 'mine');
      assert.equal(await attr('last'), expect, `seed ${seed} resolves as the engine says`);
      if (expect === 'win') {
        wins++; assert.equal(await num('streak'), streak + 1); maxStreak = Math.max(maxStreak, streak + 1);
        const fx = streak + 1 >= 3 ? 'fever' : 'win';
        await until(`${fx} effect`, async () => await attr('fx') === fx && await attr('win-tier') === String(Math.min(3, streak)));
        await game.getByTestId('result').getByText(/連勝/).waitFor();
        await game.getByTestId('streak-badge').getByText(`${streak + 1}連チャン`, { exact: true }).waitFor();
        sawWinFx = true;
      } else {
        losses++; assert.equal(await num('burned'), burned + stake); assert.equal(await num('streak'), 0);
        await until('burn effect', async () => await attr('fx') === 'lose');
        await game.getByTestId('result').getByText(`🔥 ${stake.toLocaleString('en-US')} バーン`, { exact: true }).waitFor();
        sawLoseFx = true;
        if (!sawBurn) { sawBurn = true; await shot('burn'); }
      }
    }
    assert.ok(wins > 0 && losses > 0, `both outcomes seen (${wins} wins, ${losses} losses)`);
    assert.ok(sawWinFx && sawLoseFx, 'the win and burn effects both appeared');
    assert.equal(await num('best'), maxStreak, 'best streak stat');
    assert.equal(await num('won'), wins); assert.equal(await num('lost'), losses);
    assert.match(await game.getByTestId('stat-burned').textContent(), new RegExp(`🔥 ${(await num('burned')).toLocaleString('en-US')}`));
    assert.equal(await game.getByTestId('stat-record').textContent(), `${wins} · ${losses}`);
    assert.match(await game.getByTestId('stat-best').textContent(), new RegExp(`×${2 ** maxStreak}`));
    await game.getByTestId('share').waitFor();

    // Cancel keeps the pot; Withdraw is offered right beside the odds.
    await until('pot for cancel', async () => await num('pot') > 0);
    await tap('bet'); await until('confirm', async () => await attr('phase') === 'confirm');
    await page.keyboard.press('n'); await until('cancelled', async () => await attr('phase') === 'mine');
    await shot('stats');

    // Sound: the ♪ button reports its state; M toggles it too.
    const sound = game.getByTestId('sound');
    assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    await sound.click(); await until('muted', async () => await sound.getAttribute('aria-pressed') === 'false' && await attr('sound') === 'false');
    await page.keyboard.press('m'); await until('unmuted', async () => await attr('sound') === 'true');

    // Pause with P freezes the mine; resume by button.
    await page.keyboard.press('p'); await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
    assert.equal(await attr('paused'), 'true');
    const frozen = await num('strikes'); await rock(); await page.keyboard.press('Space'); await sleep(1500);
    assert.equal(await num('strikes'), frozen, 'paused: no strikes');
    await game.getByRole('button', { name: '再開する', exact: true }).click();
    await until('resumed', async () => await attr('paused') === 'false');
    await until('mining again', async () => await num('strikes') > frozen);

    // Reduced motion (pause menu): the reach is a 0.3 s static reveal and the result card still appears.
    // The motion toggle flips a setting that may already be on (the harness can emulate reduced motion): set it, don't flip it.
    const setMotion = async want => { if (await attr('reduced') !== want) await game.getByTestId('motion').click(); await until(`reduced=${want}`, async () => await attr('reduced') === want, 3000); };
    await page.keyboard.press('p'); await setMotion('true');
    await game.getByRole('button', { name: '再開する', exact: true }).click(); await until('resumed reduced', async () => await attr('paused') === 'false');
    await until('pot for reduced bet', async () => await num('pot') > 0 && await attr('phase') === 'mine');
    const reducedId = await num('lastid');
    await tap('bet'); await until('confirm reduced', async () => await attr('phase') === 'confirm');
    await tap('confirm-bet');
    await until('reduced result', async () => await num('lastid') !== reducedId && await attr('phase') === 'mine', 5_000);
    await until('reduced card', async () => ['win', 'fever', 'lose'].includes(await attr('fx')));
    await game.getByTestId('result').waitFor();
    await page.keyboard.press('p'); await setMotion('false');
    await game.getByRole('button', { name: '再開する', exact: true }).click(); await until('resumed full', async () => await attr('paused') === 'false');

    // Language toggle switches the controls and the simulation label.
    await tap('lang');
    await game.getByRole('button', { name: '日本語', exact: true }).waitFor();
    assert.match(await game.getByTestId('withdraw').textContent(), /^Withdraw/);
    await game.getByTestId('sim-note').getByText('Simulation · not real RF', { exact: true }).waitFor();
    await tap('lang'); await game.getByRole('button', { name: 'English', exact: true }).waitFor();

    const wide = await game.locator('.mine').evaluate(e => e.scrollWidth > e.clientWidth + 1 ? [...e.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > e.clientWidth + 1).map(n => n.className || n.tagName).slice(0, 8) : null);
    assert.equal(wide, null, `no horizontal overflow: ${JSON.stringify(wide)}`);
    const tall = await game.locator('.mine').evaluate(e => [...e.children].filter(n => n.getBoundingClientRect().bottom > e.clientHeight + 1).map(n => n.className || n.tagName));
    assert.deepEqual(tall, [], 'nothing falls below the frame');
    assert.equal(await game.locator('body').evaluate(e => e.scrollWidth > innerWidth || e.scrollHeight > innerHeight + 1), false, 'no page overflow');

    // Reload keeps the save: safe balance, stats and the sound setting (muted before reloading).
    await sound.click(); await until('muted for reload', async () => await attr('sound') === 'false');
    const saves = await num('saves');
    await game.getByTestId('pause').click(); await until('saved on pause', async () => await num('saves') > saves);
    const kept = { safe: await num('safe'), burned: await num('burned'), won: await num('won'), lost: await num('lost'), best: await num('best') };
    await connect();
    await game.getByTestId('continue').getByText(/^練習モードのつづき/).waitFor();
    assert.match(await game.getByTestId('continue').textContent(), new RegExp(kept.safe.toLocaleString('en-US')));
    await tap('continue');
    await until('resumed mine', async () => await attr('started') === 'true');
    assert.deepEqual({ safe: await num('safe'), burned: await num('burned'), won: await num('won'), lost: await num('lost'), best: await num('best') }, kept);
    assert.equal(await game.getByTestId('sound').getAttribute('aria-pressed'), 'false', 'sound setting survives a reload');
    console.log(`Rare Mine ${width}x${height}: practice notice, mine, combo, withdraw, bet ${wins}W/${losses}L (best ×${2 ** maxStreak}), burn, stats, sound, pause, language, reload PASS`);
  },
}));
