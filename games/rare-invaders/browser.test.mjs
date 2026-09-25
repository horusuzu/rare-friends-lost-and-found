import {chromium} from 'playwright'; const launch=chromium.launch.bind(chromium);if(process.env.INVADERS_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.INVADERS_CHROMIUM});
import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const sizes=process.env.INVADERS_SIZE?JSON.parse(process.env.INVADERS_SIZE):[[390,844],[1100,900]];
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
for(const [width,height] of sizes)console.log(await testGame('./games/rare-invaders',{width,height,screenshot:`./artifacts/invaders-${width}.png`,check:async({page,game})=>{
 // The ♪ toggle is a 44px key on screen, clear of the other header controls, before and during play.
 const toggleFits=async()=>{const box=await game.locator('.sound-toggle').boundingBox();assert.ok(box.width>=44&&box.height>=44,'sound toggle is at least 44px');
  assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height,'sound toggle on screen');
  for(const other of [...await game.locator('.top-actions button:not(.sound-toggle)').all(),game.locator('.brand'),game.locator('.hud')])assert.ok(!overlaps(box,await other.boundingBox()),'sound toggle overlaps nothing');
  assert.equal(await game.locator('.arcade').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');};
 await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();assert.equal(await game.getByRole('button',{name:'効果音',exact:true}).getAttribute('aria-pressed'),'true','sound starts on');await toggleFits();
 await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Launch',exact:true}).click();
 await game.locator('canvas').waitFor();await game.getByRole('button',{name:'Pause',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 const score=await game.getByTestId('score').innerText();await game.getByRole('button',{name:'Resume',exact:true}).click();assert.equal(await game.getByTestId('score').innerText(),score);
 await game.getByRole('button',{name:'Shield',exact:true}).click();await game.getByTestId('shield-status').getByText(/RECHARGING/).waitFor();
 await game.locator('canvas').focus();await page.keyboard.down(' ');
 await game.getByTestId('score').filter({hasText:/000[1-9]/}).waitFor({timeout:15000});await page.keyboard.up(' ');
 await page.screenshot({path:`./artifacts/invaders-action-${width}.png`});
 await game.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Open Friend wallet',exact:true}).click();await page.getByRole('button',{name:'Close Friend wallet',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
 // Sound: ♪ flips aria-pressed, M flips it back, and the choice survives a reload with the best score.
 await toggleFits();const sound=game.getByRole('button',{name:'Sound effects',exact:true});
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false','click turns sound off');
 await page.keyboard.press('m');assert.equal(await sound.getAttribute('aria-pressed'),'true','M turns it back on');
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false');
 const saved=()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('friendsdk:local-preview')&&JSON.parse(localStorage.getItem(k)).sound===false));
 for(let i=0;i<100&&!(await saved());i++)await new Promise(r=>setTimeout(r,50));assert.ok(await saved(),'sound off is saved');
 await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();
 await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();const again=game.getByRole('button',{name:'効果音',exact:true});
 await again.and(game.locator(':not([disabled])')).waitFor();assert.equal(await again.getAttribute('aria-pressed'),'false','sound stays off after a reload');await toggleFits();
}}));
