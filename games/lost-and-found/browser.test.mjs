import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';

for (const width of [1100, 390]) {
  console.log(await testGame('./games/lost-and-found', {
    width, height: width < 500 ? 844 : 900,
    screenshot: `./artifacts/lost-and-found-${width}.png`,
    check: async ({ page, game }) => {
      await game.getByRole('button', { name: 'Take this delivery' }).waitFor();
      assert.equal(await game.getByText('Genesis #597', { exact: true }).count(), 1);
      await game.getByRole('button', { name: 'Take this delivery' }).click();
      await game.getByRole('button', { name: 'Go to Little square', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Morning bakery', exact: true }).click();
      await game.getByRole('button', { name: 'Deliver here', exact: true }).click();
      await game.getByText('Not this address. Read the clue again. −8s', { exact: true }).waitFor();
      await game.getByRole('button', { name: 'Go to Little square', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Old bridge', exact: true }).click();
      await game.getByRole('button', { name: 'Go to Lighthouse', exact: true }).click();
      await game.getByRole('button', { name: 'Deliver here', exact: true }).click();
      await game.getByRole('heading', { name: 'A little less lost.' }).waitFor();
      await game.getByRole('button', { name: 'Make a postcard' }).click();
      await game.getByRole('img', { name: 'Your delivery postcard' }).waitFor();
      assert.ok(await game.getByRole('img', { name: 'Your delivery postcard' }).evaluate(img => img.complete && img.naturalWidth === 1200));
      await page.locator('.rf-game-frame').screenshot({path:`./artifacts/postcard-${width}.png`});
      await game.getByRole('button', { name: 'Back to the post office' }).click();
      await game.getByRole('button', { name: 'Gold-foil stamp · 2 demo RF' }).click();
      await page.getByRole('button', { name: /Confirm/i }).click();
      await game.getByText('18 demo RF', { exact: true }).waitFor();
      await game.getByRole('button', { name: 'Gold-foil stamp selected' }).waitFor();
      await game.getByRole('button', { name: '日本語', exact: true }).click();
      await game.getByRole('button', { name: 'この配達を引き受ける' }).waitFor();
      const overflow = await game.locator('.lf-game').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false, 'No horizontal overflow');
    },
  }));
}
