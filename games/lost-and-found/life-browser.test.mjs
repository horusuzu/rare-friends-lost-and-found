import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { chromium } from 'playwright';
if (process.env.LOST_FOUND_CHROMIUM) { const launch=chromium.launch.bind(chromium); chromium.launch=options=>launch({...options,executablePath:process.env.LOST_FOUND_CHROMIUM}); }
const sizes=process.env.LOST_FOUND_SIZE?JSON.parse(process.env.LOST_FOUND_SIZE):[[390,844],[1100,900]];
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
for(const [width,height] of sizes) console.log(await testGame('./games/lost-and-found',{
 width,height,screenshot:`./artifacts/friend-life-${width}.png`,
 check:async({page,game})=>{
  // The ♪ switch is a 44px button on screen, clear of the title, language switch and settings.
  const toggleFits=async()=>{await game.locator('.sound-toggle').scrollIntoViewIfNeeded();const box=await game.locator('.sound-toggle').boundingBox();assert.ok(box.width>=44&&box.height>=44,'sound toggle is at least 44px');
   assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height,'sound toggle on screen');
   for(const other of ['.language-toggle','.gear','.life-header h1'])assert.ok(!overlaps(box,await game.locator(other).boundingBox()),`sound toggle clear of ${other}`);};
  await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor({timeout:15000});
  await game.getByRole('button',{name:'ごはん',exact:true}).click();
  await game.getByRole('button',{name:/ベリー/}).click();
  await game.getByRole('button',{name:'おでかけ',exact:true}).click();
  await game.getByRole('button',{name:/しおかぜ海岸/}).click();
  await game.getByRole('button',{name:'貝がらを一緒に探す',exact:true}).click();
  await game.getByRole('button',{name:'おみやげを持って帰る',exact:true}).click();
  await game.getByRole('button',{name:'思い出',exact:true}).click();
  await game.getByRole('button',{name:/おそろいの貝がら/}).click();
  await game.getByRole('dialog').waitFor();
  await page.locator('.rf-game-frame').screenshot({path:`./artifacts/friend-life-card-${width}.png`});
  await game.getByRole('button',{name:'閉じる',exact:true}).click();
  await game.getByRole('button',{name:'島づくり',exact:true}).click();
  await game.getByRole('button',{name:'小さな花畑をつくる',exact:true}).click();
  await game.getByText('完成', {exact:true}).waitFor();
  await game.getByRole('button',{name:'おうち',exact:true}).click();
  await game.getByRole('button',{name:'おやすみ',exact:true}).click();
  await game.getByText('2日目',{exact:true}).waitFor();
  await game.getByRole('button',{name:'お花を摘む',exact:true}).click();
  await game.getByText('保存済み',{exact:true}).waitFor();
  const saved=await page.evaluate(()=>Object.entries(localStorage).find(([key])=>key.includes('preview')));
  assert.ok(saved,'Host has durable save'); assert.match(saved[1],/flowers/);
  await game.getByRole('button',{name:'設定',exact:true}).click();
  await game.getByRole('button',{name:'金色の額縁 · 2 demo RF',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await game.getByRole('button',{name:'金色の額縁 · 2 demo RF',exact:true}).click();
  await page.getByRole('button',{name:/Confirm/i}).click();
  await game.getByRole('button',{name:'金色の額縁を使用中',exact:true}).waitFor();
  assert.equal(await game.locator('.gold-frame').count(),1);
  await game.getByLabel('Friendの呼び名').fill('そら');
  await game.getByRole('button',{name:'この名前で呼ぶ'}).click();
  await game.getByText('保存済み',{exact:true}).waitFor();
  // Sound: ♪ flips aria-pressed, M flips it back, and the choice is saved with the island.
  const sound=game.getByRole('button',{name:'効果音',exact:true});assert.equal(await sound.getAttribute('aria-pressed'),'true','sound starts on');await toggleFits();
  const enabled=()=>sound.and(game.locator(':not([disabled])')).waitFor();
  await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false','click turns sound off');await enabled();
  await page.keyboard.press('m');await game.locator('.sound-toggle[aria-pressed="true"]').waitFor();await enabled();
  await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false');await game.getByText('保存済み',{exact:true}).waitFor();await enabled();
  assert.ok(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.includes('preview')&&JSON.parse(value).sound===false)),'sound off saved');
  await page.reload();
  await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();
  await page.getByRole('button',{name:/^Friend #7730\b/}).click();
  await game.getByRole('heading',{name:'そらと、島ぐらし。'}).waitFor();
  await game.getByText('2日目',{exact:true}).waitFor();
  await game.getByText('保存済み',{exact:true}).waitFor();
  assert.equal(await game.locator('.gold-frame').count(),0,'Cosmetic resets independently of care save');
  assert.equal(await game.getByRole('button',{name:'効果音',exact:true}).getAttribute('aria-pressed'),'false','sound stays off after a reload');await toggleFits();
  assert.equal(await game.locator('.life-app').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 }
}));
