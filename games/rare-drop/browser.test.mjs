import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const launch=chromium.launch.bind(chromium);if(process.env.DROP_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.DROP_CHROMIUM});
const sizes=process.env.DROP_SIZE?JSON.parse(process.env.DROP_SIZE):[[320,568],[390,844],[844,390],[960,640],[1100,900]];
const overlap=(a,b)=>a.x<b.x+b.width-.5&&b.x<a.x+a.width-.5&&a.y<b.y+b.height-.5&&b.y<a.y+a.height-.5;
/** The ♪ toggle is at least 44 px, on screen and clear of every other control. */
async function soundFits(game,width,height){
 const sb=await game.getByTestId('sound').boundingBox();assert.ok(sb.width>=44&&sb.height>=44,`sound toggle 44px ${JSON.stringify(sb)}`);
 assert.ok(sb.x>=0&&sb.y>=0&&sb.x+sb.width<=width+.5&&sb.y+sb.height<=height+.5,'sound toggle on screen');
 for(const other of await game.locator('header button:not([data-testid=sound]),header .brand,.hud,.screen,.touch-controls button').all()){const ob=await other.boundingBox();if(ob)assert.ok(!overlap(sb,ob),`sound toggle overlaps ${await other.evaluate(e=>e.className||e.tagName)} at ${width}x${height}`);}
}
const openGame=async page=>{await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();};
/** Poll the host's preview store (real time, bounded) until the saved setting lands. */
async function savedSound(page,want){for(let i=0;i<100;i++){const got=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('friendsdk:local-preview')).map(k=>JSON.parse(localStorage.getItem(k)).sound));if(got.includes(want))return;await new Promise(r=>setTimeout(r,50));}assert.fail(`sound ${want} was not saved`);}
for(const [width,height] of sizes)console.log(await testGame('./games/rare-drop',{width,height,screenshot:`./artifacts/drop-${width}.png`,check:async({page,game})=>{
 await page.clock.install();await page.reload();await openGame(page);
 // Sound toggle: ♪ with aria-pressed, M shortcut, and the setting survives a reload.
 const sound=game.getByRole('button',{name:'サウンド オン/オフ',exact:true});await game.locator('[data-testid=sound]:not([disabled])').waitFor();
 assert.equal(await sound.getAttribute('aria-pressed'),'true','sound starts on');assert.equal(await sound.innerText(),'♪');await soundFits(game,width,height);
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false');
 await page.keyboard.press('m');assert.equal(await sound.getAttribute('aria-pressed'),'true','M toggles sound');
 await page.keyboard.press('m');assert.equal(await sound.getAttribute('aria-pressed'),'false');await savedSound(page,false);
 await page.reload();await openGame(page);await game.locator('[data-testid=sound]:not([disabled])').waitFor();
 assert.equal(await sound.getAttribute('aria-pressed'),'false','sound off survives a reload');
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'true');await savedSound(page,true);
 await game.getByRole('button',{name:'はじめる',exact:true}).click();await soundFits(game,width,height);
 const drop=await game.getByRole('button',{name:'落とす',exact:true}).boundingBox();const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();
 assert.ok(drop.y+drop.height<=wallet.y+1,'game controls must not overlap host controls');assert.ok(wallet.y+wallet.height<=height,'host controls within screen');assert.ok(drop.height>=44);
 // Keyboard: pause/resume keeps state.
 await game.getByRole('button',{name:'一時停止',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();await game.getByRole('button',{name:'再開する',exact:true}).click();
 // NEXT must be the orb that appears in the dropper after each drop (compare canvas colour at the dropper row).
 const FILLS=['#ff9db1','#ffbd76','#ffe26f','#a3e86a','#63d8c4'];const frame=page.frames().find(f=>f!==page.mainFrame());
 const held=()=>frame.evaluate(FILLS=>{const row=document.querySelector('.screen canvas').getContext('2d').getImageData(0,80,400,1).data;const n=FILLS.map(f=>{const q=[1,3,5].map(k=>parseInt(f.slice(k,k+2),16));let c=0;for(let x=0;x<400;x++)if(q.every((v,j)=>Math.abs(v-row[x*4+j])<6))c++;return c;});return Math.max(...n)?n.indexOf(Math.max(...n))+1:0;},FILLS);
 for(let i=0;i<4;i++){const next=Number(await game.getByTestId('next-tier').getAttribute('data-tier'));await game.getByRole('button',{name:'落とす',exact:true}).click();await page.clock.runFor(700);const got=await held();assert.equal(got,next,'NEXT preview matches the orb that arrives');}
 // Tap the jar to drop at a pointer position, then use the DROP button and keyboard.
 const jar=game.locator('.screen canvas');const box=await jar.boundingBox();
 await jar.click({position:{x:box.width*.3,y:box.height*.3}});await page.clock.runFor(700);
 await game.getByRole('button',{name:'落とす',exact:true}).click();await page.clock.runFor(700);
 await jar.focus();await page.keyboard.press('Space');await page.clock.runFor(700);
 // Keep dropping in one column until the jar fills; merges must score along the way.
 // The jar can fill in real time between the check and the click, so a disabled DROP after game over ends the loop.
 for(let i=0;i<400;i++){const over=game.getByRole('heading',{name:/^(JAR FULL|FRIEND MADE!)$/});if(await over.count())break;await game.getByRole('button',{name:'落とす',exact:true}).click({timeout:3000}).catch(async error=>{if(!await over.count())throw error;});await page.clock.runFor(600);}
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
