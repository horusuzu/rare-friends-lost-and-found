import {chromium} from 'playwright'; const launch=chromium.launch.bind(chromium);chromium.launch=o=>launch({...o,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
for(const width of [390,1100])console.log(await testGame('./games/rare-invaders',{width,height:width===390?844:900,screenshot:`./artifacts/invaders-${width}.png`,check:async({page,game})=>{
 await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Launch',exact:true}).click();
 await game.locator('canvas').waitFor();await game.getByRole('button',{name:'Pause',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 const score=await game.getByTestId('score').innerText();await game.getByRole('button',{name:'Resume',exact:true}).click();assert.equal(await game.getByTestId('score').innerText(),score);
 await game.getByRole('button',{name:'Shield',exact:true}).click();await game.getByTestId('shield-status').getByText(/RECHARGING/).waitFor();
 await game.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Open Friend wallet',exact:true}).click();await page.getByRole('button',{name:'Close Friend wallet',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
}}));
