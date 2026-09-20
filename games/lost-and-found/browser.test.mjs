import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { chromium } from 'playwright';
// Optional local browser override affects automated tests only, never the build.
if (process.env.LOST_FOUND_CHROMIUM) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = options => launch({ ...options, executablePath: process.env.LOST_FOUND_CHROMIUM });
}

for (const width of [1100, 390]) {
  console.log(await testGame('./games/lost-and-found', {
    width, height: width < 500 ? 844 : 900,
    screenshot: `./artifacts/lost-and-found-${width}.png`,
    check: async ({ page, game }) => {
      await game.getByRole('button', { name: 'Take this delivery' }).waitFor();
      await page.locator('.rf-game-frame').screenshot({path:`./artifacts/desk-${width}.png`});
      assert.equal(await game.getByText('Genesis #597', { exact: true }).count(), 1);
      await game.getByRole('button', { name: 'Take this delivery' }).click();
      await game.getByRole('button', { name: 'Go to Little square', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Morning bakery', exact: true }).click();
      await game.getByRole('button', { name: /^Deliver here/ }).click();
      await game.getByText('Not this address. Read the clue again. −8s', { exact: true }).waitFor();
      await game.getByRole('button', { name: 'Go to Little square', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Old bridge', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Lighthouse', exact: true }).click();
      await game.getByRole('button', { name: /^Deliver here/ }).click();
      await game.getByRole('heading', { name: 'A little less lost.' }).waitFor();
      await game.getByRole('button', { name: 'Make a postcard' }).click();
      await game.getByRole('img', { name: 'Your delivery postcard' }).waitFor();
      assert.ok(await game.getByRole('img', { name: 'Your delivery postcard' }).evaluate(img => img.complete && img.naturalWidth === 1200));
      await page.locator('.rf-game-frame').screenshot({path:`./artifacts/postcard-${width}.png`});
      assert.equal(await game.locator('.lf-toolbar').getAttribute('inert'), '');
      await page.keyboard.press('Tab');
      assert.equal(await game.getByRole('dialog', {name: 'Your postcard', exact: true}).evaluate(el => el.contains(document.activeElement)), true, 'Keyboard focus stays inside the postcard');
      await game.getByRole('dialog', {name: 'Your postcard', exact: true}).getByRole('button', { name: 'Back to the post office' }).click();
      await game.getByRole('button', { name: 'Gold-foil stamp · 2 demo RF' }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await game.getByText('20 demo RF', { exact: true }).waitFor();
      await game.getByRole('button', { name: 'Gold-foil stamp · 2 demo RF' }).click();
      await page.getByRole('button', { name: /Confirm/i }).click();
      await game.getByText('18 demo RF', { exact: true }).waitFor();
      await game.getByRole('button', { name: 'Gold-foil stamp selected' }).waitFor();
      assert.equal(await game.getByRole('button', { name: 'Gold-foil stamp selected' }).isDisabled(), true);
      await page.clock.install();
      await game.getByRole('button', { name: 'Take this delivery' }).click();
      await game.getByRole('button', { name: 'Settings', exact: true }).click();
      const beforePause = await game.getByTestId('timer').textContent();
      await page.clock.fastForward(5000);
      assert.equal(await game.getByTestId('timer').textContent(), beforePause);
      await game.getByRole('button', { name: 'Back to the mail' }).click();
      await page.clock.fastForward(100000);
      await game.getByRole('heading', { name: 'Even couriers get lost.' }).waitFor();
      await game.getByRole('button', { name: 'Back to the post office' }).click();
      await game.getByRole('button', { name: '日本語', exact: true }).click();
      await game.getByRole('button', { name: 'この配達を引き受ける' }).waitFor();
      const overflow = await game.locator('.lf-game').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false, 'No horizontal overflow');
      await game.locator('.lf-body').evaluate(el => {el.scrollTop = 0;});
      await game.locator('.delivery-side').evaluate(el => {el.scrollTop = 0;});
    },
  }));
}
