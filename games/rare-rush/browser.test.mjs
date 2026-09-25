import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const launch=chromium.launch.bind(chromium);if(process.env.RUSH_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.RUSH_CHROMIUM});
const sizes=process.env.RUSH_SIZE?JSON.parse(process.env.RUSH_SIZE):[[320,568],[390,844],[844,390],[960,640],[1100,900]];
const overlap=(a,b)=>a.x<b.x+b.width-.5&&b.x<a.x+a.width-.5&&a.y<b.y+b.height-.5&&b.y<a.y+a.height-.5;
/** The ♪ toggle is at least 44 px, on screen and clear of every other control. */
async function soundFits(game,width,height){
 const sb=await game.getByTestId('sound').boundingBox();assert.ok(sb.width>=44&&sb.height>=44,`sound toggle 44px ${JSON.stringify(sb)}`);
 assert.ok(sb.x>=0&&sb.y>=0&&sb.x+sb.width<=width+.5&&sb.y+sb.height<=height+.5,'sound toggle on screen');
 for(const other of await game.locator('header button:not([data-testid=sound]),header .brand,.hud,.stage,.controls button').all()){const ob=await other.boundingBox();if(ob)assert.ok(!overlap(sb,ob),`sound toggle overlaps ${await other.evaluate(e=>e.className||e.tagName)} at ${width}x${height}`);}
}
const openGame=async page=>{await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();};
/** Poll the host's preview store (real time, bounded) until the saved setting lands. */
async function savedSound(page,want){for(let i=0;i<100;i++){const got=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('friendsdk:local-preview')).map(k=>JSON.parse(localStorage.getItem(k)).sound));if(got.includes(want))return;await new Promise(r=>setTimeout(r,50));}assert.fail(`sound ${want} was not saved`);}
for(const [width,height] of sizes)console.log(await testGame('./games/rare-rush',{width,height,screenshot:`./artifacts/rush-${width}.png`,check:async({page,game})=>{
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
 await game.getByRole('button',{name:'乗車する',exact:true}).waitFor();if(width===390||width===1100)await page.screenshot({path:`./artifacts/rush-start-${width}.png`});
 await game.getByRole('button',{name:'乗車する',exact:true}).click();await soundFits(game,width,height);
 const hold=game.getByRole('button',{name:'長押し',exact:true});const hb=await hold.boundingBox();const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();
 assert.ok(hb.y+hb.height<=wallet.y+1,'game controls must not overlap host controls');assert.ok(wallet.y+wallet.height<=height,'host controls within screen');assert.ok(hb.height>=44);
 // Launch: hold to the pressure peak, then release.
 const pressure=async()=>Number((await game.getByTestId('pressure').getAttribute('style')).match(/height:\s*([\d.]+)%/)[1]);
 await hold.hover();await page.mouse.down();let seen=[];
 for(let i=0;i<200;i++){await page.clock.runFor(30);const p=await pressure();seen.push(p);if(p>=92)break;}
 assert.ok(seen.some(p=>p>5&&p<92),'pressure builds gradually');assert.ok(seen.at(-1)>=92,`reached the peak: ${seen.at(-1)}`);
 if(width===390)await page.screenshot({path:'./artifacts/rush-launch-390.png'});await page.mouse.up();await page.clock.runFor(300);
 assert.ok(Number(await game.getByTestId('speed').innerText())>=180,'perfect launch reaches 180+ km/h');
 // Ride with holds and releases; distance grows.
 for(let i=0;i<6;i++){await hold.hover();await page.mouse.down();await page.clock.runFor(700);await page.mouse.up();await page.clock.runFor(500);}
 // Turbo: one in stock at the start; firing shows the burst and spends it.
 const turbo=game.getByTestId('turbo');const tbb=await turbo.boundingBox();assert.ok(tbb.height>=44&&tbb.y+tbb.height<=wallet.y+1,'turbo button fits above host controls');
 const stock=async()=>Number((await turbo.getAttribute('aria-label')).match(/\d+/)[0]);const had=await stock();assert.ok(had>=1,'starts with a turbo');
 await turbo.hover();await page.mouse.down();await page.clock.runFor(120);await page.mouse.up();
 await game.locator('.turbo.firing').waitFor();if(width===390||width===1100)await page.screenshot({path:`./artifacts/rush-turbo-${width}.png`});
 assert.ok(await stock()<=had,'turbo spent');await page.clock.runFor(1500);
 const dist=Number((await game.getByTestId('distance').innerText()).replace('m',''));assert.ok(dist>150,`distance ${dist}`);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/rush-ride-${width}.png`});
 await game.getByRole('button',{name:'一時停止',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 await page.clock.runFor(300);const frozen=await game.getByTestId('distance').innerText();await page.clock.runFor(2000);assert.equal(await game.getByTestId('distance').innerText(),frozen,'pause freezes the ride');
 await game.getByRole('button',{name:'再開する',exact:true}).click();
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false','mute mid-ride');
 // Let the timer run out.
 for(let i=0;i<60;i++){if(await game.getByRole('heading',{name:'おつかれさま！',exact:true}).count())break;await page.clock.runFor(5000);}
 await page.screenshot({path:'./artifacts/rush-dbg-'+width+'.png'});await game.getByRole('heading',{name:'おつかれさま！',exact:true}).waitFor();
 const finalScore=Number(await game.getByTestId('final-score').innerText());assert.ok(finalScore>0);
 if(width===390)await page.screenshot({path:'./artifacts/rush-over-390.png'});
 await game.getByRole('button',{name:'スコアをXでシェア',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'スコアをシェア',exact:true});await dialog.waitFor();if(width===390||width===1100)await page.screenshot({path:`./artifacts/rush-share-${width}.png`});
 const link=dialog.getByRole('link',{name:'Xの投稿画面を開く ↗'});const u=new URL(await link.getAttribute('href'));const text=u.searchParams.get('text');
 assert.equal(u.origin,'https://x.com');assert.ok(text.includes(`RARE RUSHでFriend #7730と${finalScore}点`),text);assert.match(text,/最高\d+km\/h/);assert.equal(u.searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/rush/');
 await page.context().route('https://x.com/**',r=>r.fulfill({body:'Test composer; no post sent'}));const popup=page.waitForEvent('popup');await link.click();const opened=await popup;await opened.waitForLoadState();assert.equal(new URL(opened.url()).origin,'https://x.com');await opened.close();
 await dialog.getByRole('button',{name:'ゲームに戻る'}).click();await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Ride again',exact:true}).click();
 assert.equal(await game.getByTestId('score').innerText(),'0');
 assert.equal(await game.locator('.rush').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
}}));
