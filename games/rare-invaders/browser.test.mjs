import {chromium} from 'playwright'; const launch=chromium.launch.bind(chromium);if(process.env.INVADERS_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.INVADERS_CHROMIUM});
import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
for(const width of [390,1100])console.log(await testGame('./games/rare-invaders',{width,height:width===390?844:900,screenshot:`./artifacts/invaders-${width}.png`,check:async({page,game})=>{
 await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Launch',exact:true}).click();
 await game.locator('canvas').waitFor();await game.getByRole('button',{name:'Pause',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 const score=await game.getByTestId('score').innerText();await game.getByRole('button',{name:'Resume',exact:true}).click();assert.equal(await game.getByTestId('score').innerText(),score);
 await game.getByRole('button',{name:'Shield',exact:true}).click();await game.getByTestId('shield-status').getByText(/RECHARGING/).waitFor();
 await game.locator('canvas').focus();await page.keyboard.down(' ');
 await game.getByTestId('score').filter({hasText:/000[1-9]/}).waitFor({timeout:15000});await page.keyboard.up(' ');
 await page.screenshot({path:`./artifacts/invaders-action-${width}.png`});
 await game.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Open Friend wallet',exact:true}).click();await page.getByRole('button',{name:'Close Friend wallet',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
}}));
