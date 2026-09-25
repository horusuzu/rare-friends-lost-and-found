import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { chromium } from 'playwright'; import { buildGame, createGameServer } from '../../scripts/dev-game.mjs';
import { installFixture, createArtworkFixture, OWNER, SECOND_OWNER } from '../../scripts/browser-fixture.mjs';
import { routeRewards, RF } from './rewards-fixture.mjs';

// MINE_CHROMIUM points at an installed headless Chromium; MINE_SIZE='[390]' runs one width.
const widths = process.env.MINE_SIZE ? JSON.parse(process.env.MINE_SIZE).map(w => Array.isArray(w) ? w[0] : w) : [390, 1100];
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const width of widths) {
  const dir = await mkdtemp(join(tmpdir(), 'genesis-mine-')); let server, browser;
  try {
    const build = await buildGame('./games/rare-mine', { outdir: join(dir, 'dist') }); server = createGameServer(build.outdir);
    await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.MINE_CHROMIUM ? { executablePath: process.env.MINE_CHROMIUM } : {}) });
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' }); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const fixture = await installFixture(page, origin, { artworkCall: await createArtworkFixture(), genesisOwner: OWNER }); const game = page.frameLocator('iframe');
    // Genesis #597 on mainnet: about 38 529 RF claimable, accruing about 16.4 RF a minute.
    await routeRewards(page, { owner: OWNER, base: 38_529n * RF, perSecond: 164n * RF / 600n });
    await page.goto(origin); await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole('button', { name: /^Genesis #597/ }).waitFor(); await page.getByRole('button', { name: /^Friend #7730/ }).waitFor();
    await page.getByRole('button', { name: /^Genesis #597/ }).click();
    await game.getByTestId('title-rewards').getByText(/^NFTの未受取（本物） 38,5\d\d\.\d\d RF/).waitFor();
    await game.getByTestId('start-real').click(); assert.ok(fixture.genesisReads >= 2);
    await game.getByRole('img', { name: 'Genesis #597', exact: true, includeHidden: true }).first().waitFor({ state: 'attached' });
    // Genesis mines its real rewards: the pot is its whole claimable RF (first baseline 0), and a withdraw records it.
    const screen = game.getByTestId('screen');
    const attr = name => screen.getAttribute(`data-${name}`);
    const until = async (what, fn, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(60)) if (await fn()) return; throw new Error(`timed out: ${what}`); };
    await until('real Genesis pot', async () => await attr('mode') === 'real' && BigInt(await attr('pot-wei') || '0') > 38_000n * RF);
    await until('rate', async () => await attr('rate') !== '');
    await game.getByTestId('rate').getByText(/^\+16\.\d RF\/分$/).waitFor();
    await game.getByTestId('sim-note').getByText('表示中のRFは本物の報酬（読み取りのみ）', { exact: true }).waitFor();
    await until('coins pop', async () => Number(await attr('strikes')) >= 2);
    await page.screenshot({ path: `./artifacts/mine2-genesis-${width}.png` });
    await game.getByTestId('withdraw').click();
    await until('recorded', async () => BigInt(await attr('baseline') || '0') > 38_000n * RF);
    await game.getByRole('button', { name: '一時停止', exact: true }).click(); await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Choose Friend', exact: true }).click(); await page.getByRole('button', { name: /^Friend #7730/ }).click();
    await game.getByTestId('start-real').waitFor();
    await page.getByRole('button', { name: 'Choose Friend', exact: true }).click(); fixture.genesisOwner = SECOND_OWNER;
    await page.getByRole('button', { name: /^Genesis #597/ }).click();
    await page.getByText('このウォレットは選択したGenesisを所有していません。', { exact: true }).waitFor(); assert.equal(await page.locator('iframe').count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(fixture.errors, []);
    const requests = await page.evaluate(() => window.__friendWalletTest.state.requests);
    assert.ok(requests.every(m => ['eth_accounts', 'eth_requestAccounts', 'eth_chainId'].includes(m)));
    console.log(`Rare Mine Genesis selection, real-reward mining, withdraw and transferred-owner rejection PASS ${width}`);
  } finally { await browser?.close(); if (server) await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); }
}
