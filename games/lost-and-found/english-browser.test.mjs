import assert from 'node:assert/strict';
import {testGame} from '@rarefriends/friendsdk/testing';import {chromium} from 'playwright';
if(process.env.LOST_FOUND_CHROMIUM){const launch=chromium.launch.bind(chromium);chromium.launch=o=>launch({...o,executablePath:process.env.LOST_FOUND_CHROMIUM});}
for(const width of [390,1100])console.log(await testGame('./games/lost-and-found',{width,height:width===390?844:900,screenshot:`./artifacts/english-home-${width}.png`,check:async({page,game})=>{
 await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor();
 // Create a Japanese memory before changing locale; its stored content must remain valid.
 await game.getByRole('button',{name:'おさんぽ',exact:true}).click();await game.getByText('保存済み',{exact:true}).waitFor();
 assert.equal(await game.getByRole('button',{name:'English',exact:true}).count(),1,'Visible English toggle');
 await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Feed',exact:true}).waitFor();
 await game.getByRole('button',{name:'Memories',exact:true}).click();assert.doesNotMatch(await game.locator('.journal').innerText(),/[\u3040-\u30ff\u4e00-\u9fff]/,'Old journal translates immediately');
 await game.getByRole('button',{name:'Outings',exact:true}).click();await game.getByRole('button',{name:/Saltwind Shore/}).click();await game.getByRole('button',{name:'Look for shells together',exact:true}).click();await game.getByRole('button',{name:'Bring the souvenirs home',exact:true}).click();
 assert.doesNotMatch(await game.locator('.journal').innerText(),/[\u3040-\u30ff\u4e00-\u9fff]/);
 await game.locator('.memory-grid button').first().click();await game.locator('.memory-image').waitFor();await game.getByRole('button',{name:'Close',exact:true}).click();
 await game.getByRole('button',{name:'Settings',exact:true}).click();await game.getByLabel("Your Friend’s name").fill('Sora');await game.getByRole('button',{name:'Use this name',exact:true}).click();
 await game.getByRole('button',{name:'Home',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();await game.getByRole('button',{name:'Feed',exact:true}).waitFor();
 assert.match(await game.locator('h1').innerText(),/Sora/);assert.equal(await game.locator('section.life-app').getAttribute('lang'),'en');
 await game.getByRole('button',{name:'日本語',exact:true}).click();await game.getByRole('button',{name:'ごはん',exact:true}).waitFor();assert.match(await game.locator('h1').innerText(),/Sora/);
 await game.getByRole('button',{name:'思い出',exact:true}).click();assert.match(await game.locator('.journal').innerText(),/しおかぜ海岸/);
 await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Home',exact:true}).click();
 assert.equal(await game.locator('.life-app').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 const save=await page.evaluate(()=>Object.entries(localStorage).find(([k])=>k.includes('local-preview'))?.[1]);assert.equal(JSON.parse(save).language,'en');assert.ok(JSON.parse(save).cards.length===1);
}}));
