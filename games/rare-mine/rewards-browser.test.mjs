import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { betOutcome } from './economy.ts';
import { routeRewards } from './rewards-fixture.mjs';

// Real-reward mode over a growing readRewards fixture. MINE_CHROMIUM points at an installed headless Chromium;
// MINE_SIZE='[[390,844]]' runs one viewport. Every wait polls data-* state; nothing asserts fixed timings.
const launch = chromium.launch.bind(chromium);
if (process.env.MINE_CHROMIUM) chromium.launch = o => launch({ ...o, executablePath: process.env.MINE_CHROMIUM });
const sizes = process.env.MINE_SIZE ? JSON.parse(process.env.MINE_SIZE) : [[320, 568], [390, 844], [844, 390], [960, 640], [1100, 900]];
const shots = new Set(process.env.MINE_SHOT_ALL ? sizes.map(([w]) => w) : [390, 1100]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REAL_NOTE = '表示中のRFは本物の報酬（読み取りのみ）';
const BET_NOTE = '賭け・バーンはシミュレーション。本物のRFは動かず、燃えません';
const INACTIVE = 'このFriendには報酬がたまっていません。アクティベートは公式サイトで。';

for (const [width, height] of sizes) console.log(await testGame('./games/rare-mine', {
  width, height, timeout: 20_000, check: async ({ page, game, account }) => {
    const fx = await routeRewards(page, { owner: account });
    const screen = game.getByTestId('screen');
    const attr = name => screen.getAttribute(`data-${name}`);
    const num = async name => Number(await attr(name));
    const big = async name => BigInt(await attr(name) || '0');
    const until = async (what, fn, ms = 30_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(60); } throw new Error(`timed out: ${what}`); };
    const shot = async name => { if (shots.has(width)) await page.screenshot({ path: `./artifacts/mine2-${name}-${width}.png` }); };
    const tap = id => game.getByTestId(id).click();
    // Short portrait phones fold the mode notice and sharing into a stats sheet: open it for those checks, then close it.
    const toggle = game.getByTestId('stats-toggle');
    const inSheet = async fn => {
      const folded = await toggle.isVisible();
      if (folded && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      await fn();
      if (folded && await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      // Leave focus off the toggle: Space on a focused button presses it (the mine's Space strike skips buttons).
      if (folded) await game.locator('body').evaluate(() => document.activeElement?.blur?.());
    };
    const rock = async () => { const b = await screen.boundingBox(); await screen.click({ position: { x: b.width * 0.93, y: b.height * 0.5 } }); };
    const connect = async () => {
      await page.reload();
      await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
      await page.getByRole('button', { name: /^Friend #7730/ }).click();
    };
    // One atomic read of the screen's data-* state (separate reads could straddle a re-render).
    const ledger = async () => {
      const d = await screen.evaluate(el => ({ ...el.dataset }));
      const b = k => BigInt(d[k] || '0');
      return { baseline: b('baseline'), bonus: b('bonus'), burned: b('burnedWei'), withdrawn: b('withdrawnWei'), pot: b('potWei'), shown: b('shown'),
        streak: Number(d.streak), lastId: Number(d.lastid) };
    };
    const potIdentity = async () => {
      const l = await ledger();
      return l.pot === (l.shown > l.baseline ? l.shown - l.baseline : 0n) + l.bonus;
    };

    // Title: the real unclaimed RF is read (read-only) and offered for mining.
    await connect();
    await game.getByTestId('title-rewards').getByText('NFTの未受取（本物）', { exact: false }).waitFor();
    await game.getByTestId('start-real').waitFor();
    assert.equal(await game.getByTestId('start').count(), 0, 'practice is not offered while real rewards accrue');
    await tap('start-real');
    await until('real mine', async () => await attr('mode') === 'real' && await attr('phase') === 'mine');

    // Labels: the number is real and read-only, taps are cosmetic, the bet and burn are simulated.
    await game.getByTestId('sim-note').getByText(REAL_NOTE, { exact: true }).waitFor();
    await game.getByTestId('sim-note').getByText('タップは演出です', { exact: true }).waitFor();
    await game.getByTestId('stats-note').getByText(BET_NOTE, { exact: true }).waitFor();
    await inSheet(() => game.getByTestId('mode-bar').getByText('本物の受け取りは公式サイト rarefriends.com/portfolio で', { exact: true }).waitFor());
    assert.equal(await game.locator('a').count(), 0, 'no links from game code');

    // Layout: 44px targets clear of the host wallet toolbar; Withdraw and Bet equal-sized.
    const wallet = await page.getByRole('button', { name: 'Open Friend wallet', exact: true }).boundingBox();
    for (const id of ['withdraw', 'bet', 'sound', 'lang', 'pause']) {
      const box = await game.getByTestId(id).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${id} is a 44px target (${box.width}x${box.height})`);
      assert.ok(box.y + box.height <= wallet.y + 1, `${id} clear of host controls`);
    }
    const [wb, bb] = [await game.getByTestId('withdraw').boundingBox(), await game.getByTestId('bet').boundingBox()];
    assert.ok(Math.abs(wb.width - bb.width) < 1 && Math.abs(wb.height - bb.height) < 1, 'Withdraw and Bet are equal-sized');

    // Rate: measured from the second snapshot on, then the badge shows RF per minute.
    await until('rate known', async () => await attr('rate') !== '' && await num('reads') >= 2);
    await game.getByTestId('rate').getByText(/^\+[\d.,]+ RF\/分$/).waitFor();

    // The odometer rises between polls (interpolation), not only when a snapshot lands.
    let rose = false;
    for (let tries = 0; tries < 4 && !rose; tries++) {
      const reads = await num('reads'), pot = await game.getByTestId('pot').getAttribute('data-value');
      await until('pot moves', async () => BigInt(await game.getByTestId('pot').getAttribute('data-value')) > BigInt(pot), 5_000);
      rose = await num('reads') === reads;
    }
    assert.ok(rose, 'the odometer rose with no new snapshot');
    assert.ok(await potIdentity(), 'pot = max(0, real − baseline) + bonus');

    // Real coins pop on their own; taps only add cosmetic sparks and never mine simulated coins.
    await until('real coins pop', async () => await num('strikes') >= 3);
    for (let i = 0; i < 5; i++) await rock();
    assert.equal(await num('mined'), 0, 'real-mode taps mine nothing');
    await shot('real');

    // Withdraw records the pot and moves the baseline up to the real value.
    const w0 = await ledger();
    await tap('withdraw');
    await until('withdraw recorded', async () => (await ledger()).withdrawn > w0.withdrawn);
    const w1 = await ledger();
    assert.ok(w1.baseline > w0.baseline, 'withdraw moves the baseline');
    assert.equal(w1.withdrawn - w0.withdrawn, w1.baseline - w0.baseline + w0.bonus, 'withdrawn = accrued since the baseline + bonus');
    assert.equal(w1.bonus, 0n);

    // Bet: odds first, simulated label on the dialog, outcome from the seeded stream. A win adds to the bonus;
    // a loss burns the pot and moves the baseline.
    let wins = 0, losses = 0, best = 0, sawBet = false, sawBurn = false, sawWinFx = false, sawLoseFx = false;
    for (let round = 0; round < 40 && !(wins && losses); round++) {
      await until('pot to bet', async () => await attr('phase') === 'mine' && await game.getByTestId('bet').isEnabled());
      await tap('bet');
      await until('odds shown', async () => await attr('phase') === 'confirm');
      await game.getByTestId('odds').getByText('勝率45%・勝てば2倍・負ければ全額バーン', { exact: true }).waitFor();
      await game.getByTestId('bet-sim-note').getByText(BET_NOTE, { exact: true }).waitFor();
      assert.ok(await game.getByTestId('withdraw').isEnabled(), 'Withdraw stays available beside the odds');
      if (!sawBet) { sawBet = true; await shot('bet'); }
      const expect = betOutcome(await num('betseed'))[0] ? 'win' : 'lose';
      const b0 = await ledger();
      await tap('confirm-bet');
      // The reach plays; the simulated label stays on screen; tap to skip to the result.
      await until('reach', async () => await attr('fx') === 'reach' && await attr('phase') === 'roll');
      await game.getByTestId('stats-note').getByText(BET_NOTE, { exact: true }).waitFor();
      await tap('roll');
      await until('result', async () => await num('lastid') !== b0.lastId && await attr('phase') === 'mine');
      assert.equal(await attr('last'), expect, 'resolves as the engine says');
      const b1 = await ledger();
      if (expect === 'win') {
        wins++; best = Math.max(best, b0.streak + 1);
        assert.ok(b1.bonus > b0.bonus, 'a win adds the stake to the bonus'); assert.equal(b1.baseline, b0.baseline); assert.equal(b1.streak, b0.streak + 1);
        await until('win effect', async () => ['win', 'fever'].includes(await attr('fx')));
        await game.getByTestId('result').getByText(/連勝/).waitFor();
        await game.getByTestId('result').getByText('（シミュレーション）', { exact: true }).waitFor();
        sawWinFx = true;
      } else {
        losses++;
        assert.ok(b1.baseline >= b0.baseline, 'a loss moves the baseline up');
        assert.equal(b1.burned - b0.burned, b1.baseline - b0.baseline + b0.bonus, 'the whole pot burns (simulated)');
        assert.equal(b1.bonus, 0n); assert.equal(b1.streak, 0);
        await until('burn effect', async () => await attr('fx') === 'lose');
        await game.getByTestId('result').getByText(/^🔥 [\d,.]+ RF バーン$/).waitFor();
        sawLoseFx = true;
        if (!sawBurn) { sawBurn = true; await shot('burn'); }
      }
      assert.ok(await potIdentity(), 'pot identity after a bet');
    }
    assert.ok(wins > 0 && losses > 0, `both outcomes seen (${wins} wins, ${losses} losses)`);
    assert.ok(sawWinFx && sawLoseFx, 'the win and burn effects both appeared');
    assert.equal(await num('won'), wins); assert.equal(await num('lost'), losses); assert.equal(await num('best'), best);
    assert.equal(await game.getByTestId('stat-record').textContent(), `${wins} · ${losses}`);
    assert.match(await game.getByTestId('stat-burned').textContent(), /^🔥 [\d,]+\.\d+$/);
    await inSheet(() => game.getByTestId('share').waitFor());

    // Sound: ♪ reports its state and M toggles it.
    const sound = game.getByTestId('sound');
    assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    await sound.click(); await until('muted', async () => await sound.getAttribute('aria-pressed') === 'false' && await attr('sound') === 'false');
    await page.keyboard.press('m'); await until('unmuted', async () => await attr('sound') === 'true');

    // English labels.
    await tap('lang');
    await game.getByTestId('sim-note').getByText('The RF shown is your real reward (read-only)', { exact: true }).waitFor();
    await game.getByTestId('stats-note').getByText('The bet and burn are simulated. Your real RF never moves or burns.', { exact: true }).waitFor();
    await game.getByTestId('rate').getByText(/^\+[\d.,]+ RF\/min$/).waitFor();
    await tap('lang'); await game.getByRole('button', { name: 'English', exact: true }).waitFor();

    const wide = await game.locator('.mine').evaluate(e => e.scrollWidth > e.clientWidth + 1 ? [...e.querySelectorAll('*')].filter(n => n.getBoundingClientRect().right > e.clientWidth + 1).map(n => n.className || n.tagName).slice(0, 8) : null);
    assert.equal(wide, null, `no horizontal overflow: ${JSON.stringify(wide)}`);
    const tall = await game.locator('.mine').evaluate(e => [...e.children].filter(n => n.getBoundingClientRect().bottom > e.clientHeight + 1).map(n => `${n.className || n.tagName} ${Math.round(n.getBoundingClientRect().bottom)}>${e.clientHeight}`));
    if (tall.length) await page.screenshot({ path: `./artifacts/mine2-overflow-${width}.png` });
    assert.deepEqual(tall, [], 'nothing falls below the frame');
    assert.equal(await game.locator('body').evaluate(e => e.scrollWidth > innerWidth || e.scrollHeight > innerHeight + 1), false, 'no page overflow');

    // Reload keeps the ledger and the sound setting.
    await sound.click(); await until('muted for reload', async () => await attr('sound') === 'false');
    const saves = await num('saves');
    await tap('pause'); await until('saved on pause', async () => await num('saves') > saves);
    const kept = await ledger();
    await connect();
    await game.getByTestId('start-real').getByText(/^つづきから（記録 [\d,.]+ RF）$/).waitFor();
    await tap('start-real');
    await until('real again', async () => await attr('mode') === 'real' && await attr('baseline') !== null);
    const back = await ledger();
    assert.deepEqual([back.baseline, back.withdrawn, back.burned], [kept.baseline, kept.withdrawn, kept.burned], 'ledger survives a reload');
    assert.equal(await num('won'), wins); assert.equal(await num('lost'), losses);
    assert.equal(await game.getByTestId('sound').getAttribute('aria-pressed'), 'false', 'sound setting survives a reload');

    // Practice fallback: a Friend that is not activated gets the notice, the simulated mine labelled 練習モード and a retry.
    fx.inactive = true;
    await connect();
    await game.getByTestId('title-rewards').getByText(INACTIVE, { exact: true }).waitFor();
    assert.equal(await game.getByTestId('start-real').count(), 0);
    await tap('start');
    await until('practice mine', async () => await attr('mode') === 'practice' && await num('pot') > 0);
    await game.getByTestId('sim-note').getByText('練習モード', { exact: true }).waitFor();
    await game.getByTestId('sim-note').getByText('シミュレーション・本物のRFではありません', { exact: true }).waitFor();
    await inSheet(() => game.getByTestId('mode-bar').getByText(`練習モード: ${INACTIVE}`, { exact: true }).waitFor());
    await shot('practice');
    fx.inactive = false;
    await inSheet(async () => {
      await tap('retry-rewards');
      await game.getByTestId('go-real').waitFor();
      await tap('go-real');
    });
    await until('back to real', async () => await attr('mode') === 'real');
    assert.equal(await big('baseline'), kept.baseline, 'the real ledger is kept across practice');

    // Reads that keep failing fall back to practice with a retry (checked once; the backoff takes a few seconds).
    if (width === 390) {
      fx.failed = true;
      await connect();
      await until('practice after failures', async () => await attr('decision') === 'practice:failed');
      await game.getByTestId('title-rewards').getByText('本物の報酬を読み取れませんでした（残高0という意味ではありません）。', { exact: true }).waitFor();
      fx.failed = false;
      await tap('retry-title');
      await game.getByTestId('start-real').waitFor();
    }
    console.log(`Rare Mine real rewards ${width}x${height}: rate, interpolation, withdraw, bet ${wins}W/${losses}L, labels, sound, reload, practice fallback PASS`);
  },
}));
