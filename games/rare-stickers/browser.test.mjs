import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const launch=chromium.launch.bind(chromium);if(process.env.STICKERS_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.STICKERS_CHROMIUM});
const sizes=process.env.STICKERS_SIZE?JSON.parse(process.env.STICKERS_SIZE):[[320,568],[390,844],[844,390],[960,640],[1100,900]];
for(const [width,height] of sizes)console.log(await testGame('./games/rare-stickers',{width,height,screenshot:`./artifacts/stickers-${width}.png`,check:async({page,game})=>{
 await page.clock.install();await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();
 await game.getByText('パックを開けて、シールを貼ろう！').waitFor();
 // Open all three daily packs.
 await game.getByRole('button',{name:/^パック/}).click();
 for(let i=0;i<3;i++){
  await game.getByRole('button',{name:/^パックを開ける/}).click();await page.clock.runFor(1000);
  await game.getByText('シール帳に貼りました · タップで次へ').waitFor();if(i===0&&(width===390||width===1100))await page.screenshot({path:`./artifacts/stickers-pack-${width}.png`});
  await game.getByRole('button',{name:'次へ',exact:true}).click();
 }
 await game.getByText('今日のパックはおしまい。また明日！').waitFor();assert.equal(await game.getByRole('button',{name:/^パックを開ける/}).isDisabled(),true);
 // RF pack: the host asks to confirm the simulated purchase and draw; the SDK outcome decides the finish.
 assert.equal(await game.getByTestId('rf-spent').innerText(),'0 RF');
 await game.getByRole('button',{name:/^RFパックを開ける/}).click();
 for(let i=0;i<6;i++){const confirm=page.getByRole('button',{name:'Confirm preview',exact:true});if(await game.getByText('シール帳に貼りました · タップで次へ').isVisible().catch(()=>false))break;if(await confirm.isVisible().catch(()=>false))await confirm.click();await page.clock.runFor(1000);}
 await game.getByText('シール帳に貼りました · タップで次へ').waitFor();if(width===390||width===1100)await page.screenshot({path:`./artifacts/stickers-rfpack-${width}.png`});
 await game.getByRole('button',{name:'次へ',exact:true}).click();
 await game.getByTestId('rf-spent').filter({hasText:'2 RF'}).waitFor();await game.getByTestId('rf-balance').filter({hasText:'18 RF'}).waitFor();
 // Book: three stickers; drag one to a new spot.
 await game.getByRole('button',{name:'シール帳',exact:true}).click();const placed=game.locator('.placed');assert.equal(await placed.count(),4);
 const first=placed.first();const before=await first.getAttribute('style');const box=await first.boundingBox();const pageBox=await game.locator('.page').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(pageBox.x+pageBox.width*0.5,pageBox.y+pageBox.height*0.8,{steps:8});await page.mouse.up();
 assert.notEqual(await first.getAttribute('style'),before,'dragging re-sticks the sticker');
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/stickers-book-${width}.png`});
 // Tap → detail → trade code.
 await placed.nth(1).click();const dialog=game.getByRole('dialog');await dialog.waitFor();
 await dialog.getByRole('button',{name:'交換コードを出す'}).click();const code=await game.getByTestId('trade-code').inputValue();assert.match(code,/^RF-[0-9A-Z-]+$/);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/stickers-detail-${width}.png`});
 await dialog.getByRole('button',{name:'とじる'}).click();await dialog.waitFor({state:'hidden'});
 // Keyboard: Enter opens a sticker, Escape closes it.
 await placed.nth(2).focus();await page.keyboard.press('Enter');await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 // Trade tab: bad code, then a real code, then the same code again.
 await game.getByRole('button',{name:/^交換/}).click();const input=game.getByRole('textbox',{name:'友だちの交換コード'});
 await input.fill('RF-HELLO-WORLD-0000');await game.getByRole('button',{name:'コードを確かめる'}).click();await game.getByRole('alert').first().waitFor();
 await input.fill(code);await game.getByRole('button',{name:'コードを確かめる'}).click();await game.getByText(/自分のFriendのシールはパックから出ます/).waitFor();

 await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:/^Book/}).click();assert.equal(await game.locator('.placed').count(),4);await game.getByRole('button',{name:/^Packs 0/}).waitFor();
 const lower=Math.max(...await game.locator('button').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().bottom)));const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();
 assert.ok(wallet.y+wallet.height<=height,'host controls within screen');
 assert.equal(await game.locator('.stickers').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);void lower;
}}));
