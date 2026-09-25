import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';

// Phone layout check with real phone emulation (isMobile, touch, DPR 3, mobile UA): town, dungeon, bag and map.
// DELVE_CHROMIUM points at an installed headless Chromium. DELVE_SIZE='[[390,664]]' runs one viewport.
// DELVE_SHOT=after writes ./artifacts/mobile-after-{360,390,430,land}.png in the dungeon.
// DELVE_PROBE=1 reports every measurement and failure without stopping at the first size.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const launch = chromium.launch.bind(chromium);
chromium.launch = async o => {
  const browser = await launch({ ...o, ...(process.env.DELVE_CHROMIUM ? { executablePath: process.env.DELVE_CHROMIUM } : {}) });
  const context = browser.newContext.bind(browser);
  browser.newContext = opts => context({ ...opts, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: UA });
  return browser;
};
const sizes = process.env.DELVE_SIZE ? JSON.parse(process.env.DELVE_SIZE) : [[360, 640], [375, 667], [390, 664], [430, 740], [664, 390]];
const SHOT = process.env.DELVE_SHOT, PROBE = !!process.env.DELVE_PROBE;
const shotName = (w, h) => w > h ? 'land' : String(w);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** The dungeon view covers at least this share of the phone's viewport height. */
const MIN_SCREEN = { portrait: 0.5, landscape: 0.6 };
const PADS = ['pad-n', 'pad-ne', 'pad-e', 'pad-se', 'pad-s', 'pad-sw', 'pad-w', 'pad-nw', 'pad-wait', 'pad-a', 'pad-b', 'pad-menu', 'pad-map', 'pad-turn'];
const failures = [];
/** Assertions: they stop the run, or with DELVE_PROBE they are recorded in the size's report and the check goes on. */
let report = {};
const ok = (cond, msg) => { if (cond) return; if (PROBE) (report.fails ??= []).push(msg); else assert.fail(msg); };
const eq = (a, b, msg = `${JSON.stringify(a)} = ${JSON.stringify(b)}`) => ok(a === b, `${msg} (${JSON.stringify(a)})`);
const round = b => b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)]));

for (const [width, height] of sizes) {
  const portrait = height > width;
  report = { size: `${width}x${height}` };
  try {
    await testGame('./games/rare-delve', {
      width, height, timeout: 20_000, check: async ({ page, game }) => {
        const screen = game.getByTestId('screen');
        const attr = name => screen.getAttribute(`data-${name}`);
        const until = async (what, fn, ms = 15_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await sleep(50); } throw new Error(`timed out: ${what}`); };
        const tap = id => game.getByTestId(id).tap();
        const inView = (b, what) => {
          ok(!!b, `${what} is rendered`);
          if (b) ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `${what} inside the ${width}x${height} viewport (${JSON.stringify(round(b))})`);
        };
        const target = (b, what, min = 44) => { inView(b, what); if (b) ok(b.width >= min && b.height >= min, `${what} is a ${min}px target (${Math.round(b.width)}x${Math.round(b.height)})`); };
        const within = (b, outer, what) => ok(b.x >= outer.x - 1 && b.y >= outer.y - 1 && b.x + b.width <= outer.x + outer.width + 1 && b.y + b.height <= outer.y + outer.height + 1,
          `${what} fits inside the dungeon view (${JSON.stringify(round(b))} in ${JSON.stringify(round(outer))})`);
        const noScroll = async where => {
          const [doc, frame] = await Promise.all([
            page.evaluate(() => { const e = document.scrollingElement; return { sh: e.scrollHeight, sw: e.scrollWidth, h: innerHeight, w: innerWidth }; }),
            game.locator('body').evaluate(() => { const e = document.scrollingElement; return { sh: e.scrollHeight, sw: e.scrollWidth, h: innerHeight, w: innerWidth }; }),
          ]);
          ok(doc.sh <= doc.h + 1 && doc.sw <= doc.w + 1, `${where}: the page does not scroll (${JSON.stringify(doc)})`);
          ok(frame.sh <= frame.h + 1 && frame.sw <= frame.w + 1, `${where}: the game frame does not scroll (${JSON.stringify(frame)})`);
        };
        const smallText = () => game.locator('.delve').evaluate(root => {
          const out = [];
          for (const el of root.querySelectorAll('*')) {
            if (!el.getClientRects().length) continue;
            const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
            if (!text) continue;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            if (s.visibility === 'hidden' || r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
            const px = parseFloat(s.fontSize);
            if (px < 12) out.push(`${el.className || el.tagName}:${px.toFixed(1)}:${text.slice(0, 16)}`);
          }
          return out;
        });

        await game.getByRole('button', { name: 'はじめから', exact: true }).tap();
        await until('town', async () => await attr('scene') === 'town');
        await noScroll('town');
        for (const id of ['town-dive', 'town-shop', 'town-chest', 'town-bag']) target(await game.getByTestId(id).boundingBox(), id);
        report.townSmall = await smallText();
        eq(report.townSmall.length, 0, `town: text is at least 12px ${JSON.stringify(report.townSmall)}`);

        await tap('town-dive');
        await until('floor 1', async () => await attr('scene') === 'dungeon' && await attr('floor') === '1');
        await game.locator('body').evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (SHOT) await page.screenshot({ path: `./artifacts/mobile-${SHOT}-${shotName(width, height)}.png` });

        // Dungeon: nothing scrolls, the view is large with big tiles, and the whole pad sits in the viewport below or beside it.
        await noScroll('dungeon');
        const view = await screen.boundingBox();
        const canvas = await game.locator('[data-testid="screen"] canvas').evaluate(c => ({ w: c.width, h: c.height }));
        const toolbar = await page.locator('.rf-frame-toolbar').boundingBox();
        const boxes = {};
        for (const id of PADS) boxes[id] = await game.getByTestId(id).boundingBox();
        Object.assign(report, { screenPct: Math.round(view.height / height * 100), screen: round(view), tiles: `${canvas.w / 16}x${canvas.h / 16}`, tilePx: +(view.width / (canvas.w / 16)).toFixed(1),
          dpad: round({ y: boxes['pad-n'].y, bottom: boxes['pad-s'].y + boxes['pad-s'].height }), a: round(boxes['pad-a']), pills: round(boxes['pad-menu']), toolbar: round(toolbar) });
        const min = portrait ? MIN_SCREEN.portrait : MIN_SCREEN.landscape;
        ok(view.height / height >= min, `the dungeon view covers ${report.screenPct}% of the viewport height (≥ ${min * 100}%)`);
        ok(Math.abs(view.width / view.height - canvas.w / canvas.h) < 0.02, `the view keeps its canvas shape (${view.width}x${view.height} for ${canvas.w}x${canvas.h})`);
        inView(view, 'the dungeon view');
        for (const [id, b] of Object.entries(boxes)) {
          target(b, id, ['pad-a', 'pad-b'].includes(id) ? 48 : 44);
          ok(b.y + b.height <= toolbar.y + 1, `${id} sits above the host toolbar`);
          if (portrait) ok(b.y >= view.y + view.height - 1, `${id} sits below the dungeon view, in the thumb zone`);
          else ok(b.x + b.width <= view.x + 1 || b.x >= view.x + view.width - 1, `${id} sits beside the dungeon view`);
        }
        for (const name of ['Choose Friend', 'Open Friend wallet']) target(await page.getByRole('button', { name, exact: true }).boundingBox(), `host ${name}`);
        ok(toolbar.height <= 56, `the host toolbar is compact (${toolbar.height}px)`);
        if (portrait) ok(report.tilePx >= 26, `phone tiles are enlarged (${report.tilePx}px a tile)`);

        // Touch behaviour: no double-tap zoom or long-press menu, no rubber-banding, no text selection.
        const touch = await game.locator('body').evaluate(() => {
          const css = (sel, prop) => getComputedStyle(document.querySelector(sel)).getPropertyValue(prop);
          const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          document.querySelector('[data-testid="screen"] canvas').dispatchEvent(menu);
          return { canvas: css('[data-testid="screen"] canvas', 'touch-action'), screen: css('[data-testid="screen"]', 'touch-action'), pad: css('[data-testid="pad-n"]', 'touch-action'),
            pill: css('[data-testid="pad-menu"]', 'touch-action'), mute: css('[data-testid="mute"]', 'touch-action'), select: css('.delve', 'user-select') || css('.delve', '-webkit-user-select'),
            overscroll: css('.delve', 'overscroll-behavior-y'), rootOverscroll: getComputedStyle(document.documentElement).overscrollBehaviorY, menuBlocked: menu.defaultPrevented };
        });
        report.touch = touch;
        eq(touch.canvas, 'none', 'the map canvas takes no browser gestures');
        eq(touch.screen, 'manipulation', 'no double-tap zoom on the view');
        eq(touch.pad, 'none'); eq(touch.pill, 'none'); eq(touch.mute, 'manipulation');
        eq(touch.select, 'none'); eq(touch.overscroll, 'none'); eq(touch.rootOverscroll, 'none');
        eq(touch.menuBlocked, true, 'long-press menu suppressed on the view');
        report.smallText = await smallText();
        eq(report.smallText.length, 0, `dungeon: text is at least 12px ${JSON.stringify(report.smallText)}`);
        await game.getByText(/RFでは ありません/).first().waitFor();

        // The pad works by touch: a step or a wait spends a turn.
        const turn = Number(await attr('turn'));
        await tap('pad-wait');
        await until('wait by touch', async () => Number(await attr('turn')) > turn);

        // Bag and map overlays fit the view; list rows are touch-sized.
        await tap('pad-menu');
        await until('bag', async () => await attr('scene') === 'bag');
        await noScroll('bag');
        const viewNow = await screen.boundingBox();
        within(await game.getByTestId('bag').boundingBox(), viewNow, 'the bag');
        target(await game.getByTestId('bag-row-0').boundingBox(), 'a bag row');
        await tap('pad-b');
        await until('bag closed', async () => await attr('scene') === 'dungeon');
        await tap('pad-map');
        await until('map', async () => await attr('showmap') === 'true');
        await noScroll('map');
        await tap('pad-b');
        await until('map closed', async () => await attr('showmap') === 'false');

        // Pause and resume by touch.
        await game.getByRole('button', { name: '一時停止', exact: true }).tap();
        await game.getByRole('heading', { name: 'PAUSED', exact: true }).waitFor();
        await noScroll('paused');
        await game.getByRole('button', { name: '再開する', exact: true }).tap();
        await until('resumed', async () => await attr('paused') === 'false');
        console.log(`Rare Delve mobile ${width}x${height}: view ${report.screenPct}% of the viewport, ${report.tiles} tiles at ${report.tilePx}px, pad ${report.dpad.y}–${report.dpad.bottom}px, PASS`);
      },
    });
  } catch (error) {
    failures.push(`${width}x${height}: ${error.message.split('\n')[0]}`);
    if (!PROBE) { console.log(JSON.stringify(report)); throw error; }
  }
  if (PROBE) { console.log(JSON.stringify(report)); if (report.fails?.length) failures.push(`${width}x${height}: ${report.fails.length} checks failed`); }
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
