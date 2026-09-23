import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const launch=chromium.launch.bind(chromium);if(process.env.INVADERS_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.INVADERS_CHROMIUM});
for(const [width,height] of [[320,568],[390,844],[844,390],[960,640]])console.log(await testGame('./games/rare-invaders',{width,height,screenshot:`./artifacts/invaders-mobile-${width}.png`,check:async({page,game})=>{
 await game.getByRole('button',{name:'出撃する',exact:true}).click();
 const fire=await game.getByRole('button',{name:'射撃',exact:true}).boundingBox();const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();assert.ok(fire.y+fire.height<=wallet.y,'game controls must not overlap host controls');assert.ok(wallet.y+wallet.height<=height,'host controls within screen');assert.ok(fire.height>=44);
 await page.clock.install();await page.clock.runFor(150000);
 await game.getByRole('heading',{name:'TRY AGAIN',exact:true}).waitFor();await game.getByRole('button',{name:'スコアをXでシェア',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'スコアをシェア',exact:true});await dialog.waitFor();const link=dialog.getByRole('link',{name:'Xの投稿画面を開く ↗'});const u=new URL(await link.getAttribute('href'));assert.equal(u.origin,'https://x.com');assert.match(u.searchParams.get('text'),/Friend #7730.*0点/);assert.equal(u.searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/invaders/');
 await page.route('https://x.com/**',r=>r.fulfill({body:'Test composer; no post sent'}));const popup=page.waitForEvent('popup');await link.click();const opened=await popup;await opened.waitForLoadState();assert.equal(new URL(opened.url()).origin,'https://x.com');await opened.close();await dialog.getByRole('button',{name:'ゲームに戻る'}).click();await game.getByRole('button',{name:'もう一度',exact:true}).click();
 assert.equal(await game.locator('.arcade').evaluate(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1),false);
}}));
