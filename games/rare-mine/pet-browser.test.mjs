import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { chromium } from 'playwright'; import { buildGame, createGameServer } from '../../scripts/dev-game.mjs';
import { installFixture, createArtworkFixture, OWNER, SECOND_OWNER } from '../../scripts/browser-fixture.mjs';
import { routeRewards, RF } from './rewards-fixture.mjs';

// Desktop pet (trusted host, Document Picture-in-Picture). Headless Chromium has no documentPictureInPicture, so the
// supported runs stub requestWindow with a real same-origin popup that the test inspects like the PiP document.
// MINE_CHROMIUM points at an installed headless Chromium; MINE_SIZE='[1100]' runs one width. Screenshots at 2x.
const widths = process.env.MINE_SIZE ? JSON.parse(process.env.MINE_SIZE).map(w => Array.isArray(w) ? w[0] : w) : [1100, 390];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (what, fn, ms = 20_000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(60)) if (await fn()) return; throw new Error(`timed out: ${what}`); };
const PET = /^🐾 (Pet|ペット)$/;
const stubPip = () => {
  window.documentPictureInPicture = {
    window: null,
    requestWindow(options) {
      const w = window.open('', '_blank', `popup,width=${options.width},height=${options.height}`);
      if (!w) return Promise.reject(new DOMException('Popup blocked', 'NotAllowedError'));
      this.window = w;
      w.addEventListener('pagehide', () => { if (this.window === w) this.window = null; });
      return Promise.resolve(w);
    },
  };
};

const dir = await mkdtemp(join(tmpdir(), 'pet-mine-')); let server, starterServer, browser;
const listen = async s => { await new Promise(r => s.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${s.address().port}`; };
try {
  const [mine, starter] = await Promise.all([buildGame('./games/rare-mine', { outdir: join(dir, 'mine') }), buildGame('./examples/starter', { outdir: join(dir, 'starter') })]);
  await Promise.all([mine.close(), starter.close()]);
  server = createGameServer(mine.outdir); starterServer = createGameServer(starter.outdir);
  const origin = await listen(server), starterOrigin = await listen(starterServer);
  browser = await chromium.launch({ headless: true, ...(process.env.MINE_CHROMIUM ? { executablePath: process.env.MINE_CHROMIUM } : {}) });

  /** A fresh page connected to Friend #7730 with a running verified session. */
  async function open(width, { url = origin, pip = true, genesisOwner = SECOND_OWNER } = {}) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    const page = await context.newPage(); page.setDefaultTimeout(15_000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    if (pip) await page.addInitScript(stubPip); else await page.addInitScript(() => { delete window.documentPictureInPicture; });
    const fixture = await installFixture(page, url, { artworkCall: await createArtworkFixture(), genesisOwner });
    const rewards = await routeRewards(page, { owner: OWNER, fixture });
    await page.goto(url);
    await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole('button', { name: /^Friend #7730/ }).click();
    await page.locator('iframe').waitFor();
    await page.locator('.rf-runtime-status').waitFor({ state: 'hidden' });
    return { context, page, errors, fixture, rewards };
  }
  const finish = async ({ context, page, errors, fixture }) => {
    assert.deepEqual(errors, []); assert.deepEqual(fixture.errors, []);
    const requests = await page.evaluate(() => window.__friendWalletTest.state.requests);
    assert.ok(requests.every(m => ['eth_accounts', 'eth_requestAccounts', 'eth_chainId'].includes(m)), 'no signing or transactions');
    await context.close();
  };

  for (const width of widths) {
    // Unsupported browsers (no documentPictureInPicture: Safari, Firefox, phones, headless) never see the toggle.
    const plain = await open(width, { pip: false });
    await sleep(300);
    assert.equal(await plain.page.getByRole('button', { name: PET }).count(), 0, 'hidden when unsupported');
    await finish(plain);

    // Other games are not in the host's pet table.
    const other = await open(width, { url: starterOrigin });
    await sleep(300);
    assert.equal(await other.page.getByRole('button', { name: PET }).count(), 0, 'hidden for games outside the pet table');
    await finish(other);

    const run = await open(width, { genesisOwner: OWNER });
    const { page, rewards } = run;
    const toggle = page.getByRole('button', { name: PET });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    const box = await toggle.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `44px toggle (${box.width}x${box.height})`);
    const bar = await page.locator('.rf-frame-toolbar').boundingBox();
    assert.ok(bar.height <= 60, `one toolbar row (${bar.height})`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
    for (const name of ['Choose Friend', 'Open Friend wallet']) {
      const other = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(other.x + other.width <= box.x + 1 || box.x + box.width <= other.x + 1, `${name} and the pet toggle do not overlap`);
    }

    const openPet = async () => {
      const [popup] = await Promise.all([page.waitForEvent('popup'), toggle.click()]);
      // Playwright gives popups the context viewport; use the size the host requested (PiP windows get it natively).
      await popup.setViewportSize({ width: 220, height: 260 });
      const pet = popup.getByTestId('pet');
      await pet.waitFor();
      assert.equal(await popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true, 'the pet fits its window');
      await until('pressed', async () => await toggle.getAttribute('aria-pressed') === 'true');
      return { popup, pet, attr: name => pet.getAttribute(`data-${name}`) };
    };
    const closed = async (popup, what) => { await until(what, async () => popup.isClosed()); await until(`${what}: toggle reset`, async () => await toggle.getAttribute('aria-pressed') === 'false'); };

    // ON: the Friend on its ledge, the real unclaimed RF, the rate badge, coins, the read-only label.
    let { popup, pet, attr } = await openPet();
    await until('sprite', async () => await attr('sprite') === 'ready');
    await page.screenshot({ path: `./artifacts/pet-host-${width}.png` });
    const canvas = pet.locator('canvas');
    const cbox = await canvas.boundingBox();
    assert.ok(cbox.width >= 180 && cbox.height >= 100, `canvas ${cbox.width}x${cbox.height}`);
    assert.equal(await canvas.getAttribute('aria-label'), 'Friend #7730');
    assert.ok(await canvas.evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 60) ink++; return ink > 50; }), 'the canvas is drawn');
    await pet.getByText('読み取りのみ・本物のRF', { exact: true }).waitFor();
    await until('real value', async () => BigInt(await attr('value') || '0') >= 38n * RF);
    await pet.getByTestId('pet-odometer').getByText(/^\d{2}\.\d{4}$/).waitFor();
    await until('rate', async () => await attr('status') === 'accruing');
    await pet.getByTestId('pet-rate').getByText(/^\+[\d.]+ RF\/分$/).waitFor();
    // The counter rises between reads (interpolation), not only when a snapshot lands.
    let rose = false;
    for (let tries = 0; tries < 4 && !rose; tries++) {
      const reads = await attr('reads'), v0 = BigInt(await attr('value'));
      await until('counter rises', async () => BigInt(await attr('value')) > v0, 5_000);
      rose = await attr('reads') === reads;
    }
    assert.ok(rose, 'the counter rose with no new read');
    await until('coins pop', async () => Number(await attr('coins')) >= 3);
    assert.equal(await attr('motion'), 'full');
    // Sound is off by default; the ♪ toggle is inside the pet.
    const sound = pet.getByRole('button', { name: 'コインの音' });
    assert.equal(await sound.getAttribute('aria-pressed'), 'false');
    await sound.click(); assert.equal(await sound.getAttribute('aria-pressed'), 'true');
    await sound.click(); assert.equal(await sound.getAttribute('aria-pressed'), 'false');
    // Clicking the pet shows a one-line hint; no links or navigation.
    await canvas.click();
    await pet.getByTestId('pet-hint').getByText(/Rare Mine に戻る/).waitFor();
    assert.equal(await pet.locator('a').count(), 0);
    assert.equal(popup.url(), 'about:blank');
    await sleep(400);
    if (width === widths[0]) await popup.screenshot({ path: './artifacts/pet-on.png' });
    // Reduced motion: no swinging or particles, just the sprite and the counter.
    await popup.emulateMedia({ reducedMotion: 'reduce' });
    await until('reduced', async () => await attr('motion') === 'reduced');
    const coins = await attr('coins'), v1 = BigInt(await attr('value'));
    await until('counter still rises', async () => BigInt(await attr('value')) > v1, 8_000);
    assert.equal(await attr('coins'), coins, 'no particles with reduced motion');
    await popup.emulateMedia({ reducedMotion: 'no-preference' });

    // OFF closes it.
    await toggle.click();
    await closed(popup, 'OFF closes the pet');

    // The pet window's own ✕ (pagehide) resets the toggle.
    ({ popup, pet, attr } = await openPet());
    await popup.evaluate(() => window.close());
    await closed(popup, 'closing the pet window');

    // Reads failing: the Friend still idles and says it is retrying.
    rewards.failed = true;
    ({ popup, pet, attr } = await openPet());
    await pet.getByTestId('pet-status').getByText('読み取り失敗・再試行中', { exact: true }).waitFor();
    assert.equal(await attr('status'), 'failed');
    rewards.failed = false;
    await toggle.click(); await closed(popup, 'OFF after failures');

    // A Friend change closes it; the new session starts with the pet off.
    ({ popup, pet, attr } = await openPet());
    await page.getByRole('button', { name: 'Choose Friend', exact: true }).click();
    await page.getByRole('button', { name: /^Genesis #597/ }).click();
    await until('Friend change closes the pet', async () => popup.isClosed());
    await page.locator('.rf-runtime-status').waitFor({ state: 'hidden' });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');

    // No accrual (not activated): the Friend idles with 「報酬なし」.
    rewards.inactive = true;
    ({ popup, pet, attr } = await openPet());
    assert.equal(await pet.locator('canvas').getAttribute('aria-label'), 'Genesis #597');
    await pet.getByTestId('pet-status').getByText('報酬なし', { exact: true }).waitFor();
    await until('sprite', async () => await attr('sprite') === 'ready');
    assert.equal(await pet.getByTestId('pet-rate').isVisible(), false, 'no rate badge without accrual');
    await sleep(1_500);
    assert.equal(await attr('coins'), '0', 'no coins without accrual');
    if (width === widths[0]) await popup.screenshot({ path: './artifacts/pet-noreward.png' });

    // An account change closes it too.
    await page.evaluate(address => window.__friendWalletTest.accounts([address]), SECOND_OWNER);
    await until('account change closes the pet', async () => popup.isClosed());
    await finish(run);
    console.log(`Rare Mine desktop pet: gating, open/close, real counter, failures, no-reward, Friend and account changes PASS ${width}`);
  }
} finally {
  await browser?.close();
  for (const s of [server, starterServer]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
  await rm(dir, { recursive: true, force: true });
}
