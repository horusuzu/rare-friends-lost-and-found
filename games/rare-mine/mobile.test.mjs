import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { routeRewards } from './rewards-fixture.mjs';

// Phone layout check in practice mode, with real phone emulation (isMobile, touch, DPR 3, mobile UA).
// MINE_CHROMIUM points at an installed headless Chromium. MINE_SIZE='[[390,664]]' runs one viewport.
// MINE_SHOT=after writes ./artifacts/mobile-after-{360,390,430,land}.png while mining.
// MINE_PROBE=1 reports every measurement and failure without stopping at the first size.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const launch = chromium.launch.bind(chromium);
chromium.launch = async o => {
  const browser = await launch({ ...o, ...(process.env.MINE_CHROMIUM ? { executablePath: process.env.MINE_CHROMIUM } : {}) });
  const context = browser.newContext.bind(browser);
  browser.newContext = opts => context({ ...opts, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  return browser;
};
const sizes = process.env.MINE_SIZE ? JSON.parse(process.env.MINE_SIZE) : [[360, 640], [375, 667], [390, 664], [430, 740], [664, 390]];
const SHOT = process.env.MINE_SHOT, PROBE = !!process.env.MINE_PROBE;
const shotName = (w, h) => w > h ? 'land' : String(w);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Portrait: the mine covers at least this share of the phone's viewport height; landscape: this share. */
const MIN_STAGE = { portrait: 0.45, landscape: 0.5 };
const failures = [];
/** Assertions: they stop the run, or with MINE_PROBE they are recorded in the size's report and the check goes on. */
let report = {};
const ok = (cond, msg) => { if (cond) return; if (PROBE) (report.fails ??= []).push(msg); else assert.fail(msg); };
const eq = (a, b, msg = `${JSON.stringify(a)} = ${JSON.stringify(b)}`) => ok(a === b, `${msg} (${JSON.stringify(a)})`);
const deq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (${JSON.stringify(a)})`);

for (const [width, height] of sizes) {
  const portrait = height > width;
  report = { size: `${width}x${height}` };
  try {
    await testGame('./games/rare-mine', {
      width, height, timeout: 20_000, check: async ({ page, game, account }) => {
        const rewards = await routeRewards(page, { owner: account });
        rewards.inactive = true;
        const screen = game.getByTestId('screen');
        const attr = name => screen.getAttribute(`data-${name}`);
        const num = async name => Number(await attr(name));
        const until = async (what, fn, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(50); } throw new Error(`timed out: ${what}`); };
        const rock = async () => { const b = await screen.boundingBox(); await screen.tap({ position: { x: b.width * 0.93, y: b.height * 0.6 } }); };
        const view = { width, height };
        const inView = (b, what) => {
          ok(b, `${what} is rendered`);
          ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= view.width + 1 && b.y + b.height <= view.height + 1, `${what} inside the ${width}x${height} viewport (${JSON.stringify(b)})`);
        };
        const target = (b, what, min = 44) => { inView(b, what); ok(b.width >= min && b.height >= min, `${what} is a ${min}px target (${b.width}x${b.height})`); };
        const noScroll = async where => {
          const [doc, frame] = await Promise.all([
            page.evaluate(() => { const e = document.scrollingElement; return { sh: e.scrollHeight, sw: e.scrollWidth, h: innerHeight, w: innerWidth }; }),
            game.locator('body').evaluate(() => { const e = document.scrollingElement; return { sh: e.scrollHeight, sw: e.scrollWidth, h: innerHeight, w: innerWidth }; }),
          ]);
          report[`scroll-${where}`] = { page: doc, frame };
          ok(doc.sh <= doc.h + 1 && doc.sw <= doc.w + 1, `${where}: the page does not scroll (${JSON.stringify(doc)})`);
          ok(frame.sh <= frame.h + 1 && frame.sw <= frame.w + 1, `${where}: the game frame does not scroll (${JSON.stringify(frame)})`);
        };

        await game.getByTestId('start').waitFor();
        await game.getByTestId('start').tap();
        await until('mining', async () => await attr('started') === 'true' && await attr('phase') === 'mine');
        await until('auto strikes', async () => await num('strikes') >= 1);
        for (let i = 0; i < 6; i++) await rock();
        await game.locator('body').evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (SHOT) await page.screenshot({ path: `./artifacts/mobile-${SHOT}-${shotName(width, height)}.png` });

        // Play: nothing scrolls, the mine is large, and the controls sit inside the phone viewport.
        await noScroll('play');
        const stage = await screen.boundingBox();
        const boxes = {};
        for (const id of ['withdraw', 'bet', 'sound', 'lang', 'pause']) boxes[id] = await game.getByTestId(id).boundingBox();
        const toolbar = await page.locator('.rf-frame-toolbar').boundingBox();
        const hostButtons = { friend: await page.getByRole('button', { name: 'Choose Friend', exact: true }).boundingBox(), wallet: await page.getByRole('button', { name: 'Open Friend wallet', exact: true }).boundingBox() };
        const round = b => b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)]));
        Object.assign(report, { stagePct: Math.round(stage.height / height * 100), stage: round(stage), withdraw: round(boxes.withdraw), bet: round(boxes.bet), toolbar: round(toolbar) });
        const minStage = portrait ? MIN_STAGE.portrait : MIN_STAGE.landscape;
        ok(stage.height / height >= minStage, `the mine covers ${Math.round(stage.height / height * 100)}% of the viewport height (≥ ${minStage * 100}%)`);
        inView(stage, 'the mine');
        for (const [id, b] of Object.entries(boxes)) target(b, id, ['withdraw', 'bet'].includes(id) ? 48 : 44);
        for (const id of ['withdraw', 'bet']) ok(boxes[id].y + boxes[id].height <= toolbar.y + 1, `${id} sits above the host toolbar`);
        if (portrait) for (const id of ['withdraw', 'bet']) ok(boxes[id].y >= stage.y + stage.height - 1, `${id} sits below the mine, in the thumb zone`);
        for (const [id, b] of Object.entries(hostButtons)) target(b, `host ${id} button`);
        ok(toolbar.height <= 56, `the host toolbar is compact (${toolbar.height}px)`);

        // Touch behaviour: no double-tap zoom on controls, the mine owns its gestures, no long-press menu or text selection.
        const touch = await game.locator('body').evaluate(() => {
          const css = (sel, prop) => getComputedStyle(document.querySelector(sel)).getPropertyValue(prop);
          const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          document.querySelector('[data-testid="screen"]').dispatchEvent(menu);
          return { stage: css('[data-testid="screen"]', 'touch-action'), withdraw: css('[data-testid="withdraw"]', 'touch-action'), sound: css('[data-testid="sound"]', 'touch-action'),
            select: css('[data-testid="screen"]', 'user-select') || css('[data-testid="screen"]', '-webkit-user-select'), overscroll: css('.mine', 'overscroll-behavior-y'),
            rootOverscroll: getComputedStyle(document.documentElement).overscrollBehaviorY, menuBlocked: menu.defaultPrevented };
        });
        report.touch = touch;
        eq(touch.stage, 'none', 'the mine handles its own taps');
        eq(touch.withdraw, 'manipulation'); eq(touch.sound, 'manipulation');
        eq(touch.select, 'none'); eq(touch.overscroll, 'none'); eq(touch.rootOverscroll, 'none');
        eq(touch.menuBlocked, true, 'long-press menu suppressed on the mine');

        // Text in play is at least 12px (the canvas and hidden screen-reader text excepted).
        const smallText = () => game.locator('.mine').evaluate(root => {
          const out = [];
          for (const el of root.querySelectorAll('*')) {
            if (el.closest('.sr-only') || !el.getClientRects().length) continue;
            const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
            if (!text) continue;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            if (s.visibility === 'hidden' || r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
            const px = parseFloat(s.fontSize);
            if (px < 12) out.push(`${el.className || el.tagName}:${px.toFixed(1)}:${text.slice(0, 20)}`);
          }
          return out;
        });
        const small = await smallText();
        report.smallText = small;
        deq(small, [], 'text in play is at least 12px');

        // The simulated-economy labels stay visible in play.
        await game.getByTestId('sim-note').getByText('シミュレーション・本物のRFではありません', { exact: true }).waitFor();
        await game.getByTestId('stats-note').waitFor();

        // Bet: the odds dialog, the reach and the result cards fit the mine, with each banner on one line.
        await tapUntilPot(game, rock, num, 20);
        await game.getByTestId('bet').tap();
        await until('odds shown', async () => await attr('phase') === 'confirm');
        await noScroll('odds');
        const within = (b, outer, what) => ok(b.x >= outer.x - 1 && b.y >= outer.y - 1 && b.x + b.width <= outer.x + outer.width + 1 && b.y + b.height <= outer.y + outer.height + 1, `${what} fits inside the mine (${JSON.stringify(round(b))} in ${JSON.stringify(round(outer))})`);
        const stageNow = await screen.boundingBox();
        within(await game.getByTestId('confirm').boundingBox(), stageNow, 'the odds dialog');
        for (const id of ['confirm-bet', 'cancel-bet']) target(await game.getByTestId(id).boundingBox(), id);
        await game.getByTestId('confirm-bet').tap();
        await until('reach', async () => await attr('phase') === 'roll');
        await game.getByTestId('roll').waitFor();
        await noScroll('reach');
        within(await game.getByTestId('roll').boundingBox(), stageNow, 'the reach overlay');
        const oneLine = async (sel, what) => {
          const m = await game.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { h: r.height, lh: parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3, sw: e.scrollWidth, cw: e.clientWidth, font: parseFloat(getComputedStyle(e).fontSize) }; });
          ok(m.h <= m.lh * 1.6 + 8, `${what} stays on one line (${JSON.stringify(m)})`);
          return m;
        };
        report.reachLine = await oneLine('.reach-line', 'the reach line');
        await game.getByTestId('roll').tap();
        await until('result', async () => await attr('phase') === 'mine' && ['win', 'fever', 'lose'].includes(await attr('fx')));
        const result = game.getByTestId('result');
        await result.waitFor();
        await noScroll('result');
        const card = (await attr('fx')) === 'lose' ? '.lose-card' : '.win-card';
        within(await game.locator(card).boundingBox(), stageNow, `the ${card} result card`);
        const banner = card === '.lose-card' ? '.lose-card b' : '.win-title';
        report.banner = await oneLine(banner, 'the result banner');
        if (SHOT) await page.screenshot({ path: `./artifacts/mobile-${SHOT}-${shotName(width, height)}-result.png` });
        const bw = await game.locator(banner).evaluate(e => [e.scrollWidth, e.getBoundingClientRect().width, e.parentElement.getBoundingClientRect().width]);
        ok(bw[0] <= bw[2] + 1, `the banner is not clipped (${bw})`);

        // Stats: a compact strip in play; the full panel and the share button are reachable (one tap on phones).
        const toggle = game.getByTestId('stats-toggle');
        if (await toggle.isVisible()) {
          target(await toggle.boundingBox(), 'stats toggle');
          await toggle.tap();
          await until('stats open', async () => await toggle.getAttribute('aria-expanded') === 'true');
          if (SHOT) await page.screenshot({ path: `./artifacts/mobile-${SHOT}-${shotName(width, height)}-stats.png` });
        }
        await game.getByTestId('share').scrollIntoViewIfNeeded();
        await game.getByTestId('share').waitFor();
        target(await game.getByTestId('share').boundingBox(), 'share on X');
        await game.getByTestId('stat-record').waitFor();
        await game.getByTestId('mode-bar').waitFor();
        await noScroll('stats');
        if (await toggle.isVisible()) {
          await toggle.tap();
          await until('stats closed', async () => await toggle.getAttribute('aria-expanded') === 'false');
          eq(await game.getByTestId('share').isVisible(), false, 'the sheet closes');
        }

        // Pause and resume by touch.
        await game.getByTestId('pause').tap();
        await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
        await noScroll('paused');
        await game.getByRole('button', { name: '再開する', exact: true }).tap();
        await until('resumed', async () => await attr('paused') === 'false');
        // Real mode (an activated Friend): the taller real-reward HUD and its labels fit the phone too.
        rewards.inactive = false;
        await page.reload();
        await page.getByRole('button', { name: /^Connect (wallet|Browser wallet)$/ }).tap();
        await page.getByRole('button', { name: /^Friend #7730/ }).tap();
        await game.getByTestId('start-real').tap();
        await until('real mine', async () => await attr('mode') === 'real' && await attr('phase') === 'mine' && await attr('rate') !== '');
        await game.getByTestId('sim-note').getByText('表示中のRFは本物の報酬（読み取りのみ）', { exact: true }).waitFor();
        await noScroll('real');
        const realStage = await screen.boundingBox();
        within(await game.locator('.pot.real').boundingBox(), realStage, 'the real-reward HUD');
        report.realSmallText = await smallText();
        deq(report.realSmallText, [], 'real mode: text is at least 12px');
        if (SHOT) await page.screenshot({ path: `./artifacts/mobile-${SHOT}-${shotName(width, height)}-real.png` });
        console.log(`Rare Mine mobile ${width}x${height}: stage ${report.stagePct}% of the viewport, controls ${report.withdraw.y}–${report.withdraw.y + report.withdraw.height}px, PASS`);
      },
    });
  } catch (error) {
    failures.push(`${width}x${height}: ${error.message.split('\n')[0]}`);
    if (!PROBE) { console.log(JSON.stringify(report)); throw error; }
  }
  if (PROBE) { console.log(JSON.stringify(report)); if (report.fails?.length) failures.push(`${width}x${height}: ${report.fails.length} checks failed`); }
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }

async function tapUntilPot(game, rock, num, want) {
  for (let n = 0; n < 40 && await num('pot') < want; n++) await rock();
  const end = Date.now() + 20_000;
  while (await num('pot') <= 0 && Date.now() < end) await sleep(50);
}
