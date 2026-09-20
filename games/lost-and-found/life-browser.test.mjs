import assert from 'node:assert/strict';
import { testGame } from '@rarefriends/friendsdk/testing';
import { chromium } from 'playwright';
if (process.env.LOST_FOUND_CHROMIUM) { const launch=chromium.launch.bind(chromium); chromium.launch=options=>launch({...options,executablePath:process.env.LOST_FOUND_CHROMIUM}); }
for(const width of [390,1100]) console.log(await testGame('./games/lost-and-found',{
 width,height:width===390?844:900,screenshot:`./artifacts/friend-life-${width}.png`,
 check:async({page,game})=>{
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
  await page.reload();
  await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();
  await page.getByRole('button',{name:/^Friend #7730\b/}).click();
  await game.getByRole('heading',{name:'そらと、島ぐらし。'}).waitFor();
  await game.getByText('2日目',{exact:true}).waitFor();
  await game.getByText('保存済み',{exact:true}).waitFor();
  assert.equal(await game.locator('.gold-frame').count(),0,'Cosmetic resets independently of care save');
  assert.equal(await game.locator('.life-app').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 }
}));
