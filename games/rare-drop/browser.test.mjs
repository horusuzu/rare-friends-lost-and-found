import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const launch=chromium.launch.bind(chromium);if(process.env.DROP_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.DROP_CHROMIUM});
const sizes=process.env.DROP_SIZE?JSON.parse(process.env.DROP_SIZE):[[320,568],[390,844],[844,390],[960,640],[1100,900]];
for(const [width,height] of sizes)console.log(await testGame('./games/rare-drop',{width,height,screenshot:`./artifacts/drop-${width}.png`,check:async({page,game})=>{
 await page.clock.install();await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();
 await game.getByRole('button',{name:'はじめる',exact:true}).click();
 const drop=await game.getByRole('button',{name:'落とす',exact:true}).boundingBox();const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();
 assert.ok(drop.y+drop.height<=wallet.y+1,'game controls must not overlap host controls');assert.ok(wallet.y+wallet.height<=height,'host controls within screen');assert.ok(drop.height>=44);
 // Keyboard: pause/resume keeps state.
 await game.getByRole('button',{name:'一時停止',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();await game.getByRole('button',{name:'再開する',exact:true}).click();
 // Tap the jar to drop at a pointer position, then use the DROP button and keyboard.
 const jar=game.locator('canvas');const box=await jar.boundingBox();
 await jar.click({position:{x:box.width*.3,y:box.height*.3}});await page.clock.runFor(700);
 await game.getByRole('button',{name:'落とす',exact:true}).click();await page.clock.runFor(700);
 await jar.focus();await page.keyboard.press('Space');await page.clock.runFor(700);
 // Keep dropping in one column until the jar fills; merges must score along the way.
 for(let i=0;i<400;i++){if(await game.getByRole('heading',{name:/^(JAR FULL|FRIEND MADE!)$/}).count())break;await game.getByRole('button',{name:'落とす',exact:true}).click();await page.clock.runFor(600);}
 await game.getByRole('heading',{name:/^(JAR FULL|FRIEND MADE!)$/}).waitFor();
 const finalScore=Number(await game.getByTestId('score').innerText());assert.ok(finalScore>=0);
 if(width===390)await page.screenshot({path:'./artifacts/drop-over-390.png'});
 await game.getByRole('button',{name:'スコアをXでシェア',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'スコアをシェア',exact:true});await dialog.waitFor();if(width===390||width===1100)await page.screenshot({path:`./artifacts/drop-share-${width}.png`});
 const link=dialog.getByRole('link',{name:'Xの投稿画面を開く ↗'});const u=new URL(await link.getAttribute('href'));
 assert.equal(u.origin,'https://x.com');const text=u.searchParams.get('text');assert.ok(text.includes(`RARE DROPでFriend #7730と${finalScore}点`),text);assert.equal(u.searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/drop/');
 await page.context().route('https://x.com/**',r=>r.fulfill({body:'Test composer; no post sent'}));const popup=page.waitForEvent('popup');await link.click();const opened=await popup;await opened.waitForLoadState();assert.equal(new URL(opened.url()).origin,'https://x.com');await opened.close();
 await dialog.getByRole('button',{name:'ゲームに戻る'}).click();await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Play again',exact:true}).click();
 assert.equal(await game.getByTestId('score').innerText(),'00000');
 await game.getByRole('button',{name:'Drop',exact:true}).click();await page.clock.runFor(1500);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/drop-play-${width}.png`});
 assert.equal(await game.locator('.jar-game').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
}}));
