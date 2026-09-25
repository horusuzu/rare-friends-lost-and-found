import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
import {openPack} from './album.ts';import {encodeBattle,decodeBattle} from './cards.ts';
const launch=chromium.launch.bind(chromium);if(process.env.STICKERS_CHROMIUM)chromium.launch=o=>launch({...o,executablePath:process.env.STICKERS_CHROMIUM});
const sizes=process.env.STICKERS_SIZE?JSON.parse(process.env.STICKERS_SIZE):[[320,568],[390,844],[844,390],[960,640],[1100,900]];
// A rival holder (Genesis #597) whose deck shows Friend #7730 art, which the SDK fixture can serve.
const RIVAL={collection:'genesis',tokenId:597n};const rivalDeck=[0,1,2,3,4].map(i=>openPack({collection:'generations',tokenId:7730n},900+i));
for(const [width,height] of sizes)console.log(await testGame('./games/rare-stickers',{width,height,screenshot:`./artifacts/cards-${width}.png`,check:async({page,game})=>{
 await page.clock.install();await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();
 await game.getByText('パックを開けて、カードを集めよう！').waitFor();
 const confirmUntil=async done=>{for(let i=0;i<8;i++){if(await done())return;const c=page.getByRole('button',{name:'Confirm preview',exact:true});if(await c.isVisible().catch(()=>false))await c.click();await page.clock.runFor(800);}if(!(await done()))await page.screenshot({path:`./artifacts/dbg-confirm-${width}.png`});assert.ok(await done(),'finished after confirmations');};
 const revealed=()=>game.getByText('シール帳に貼りました · タップで次へ').isVisible().catch(()=>false);
 // Three free packs and two RF packs = five cards.
 await game.getByRole('button',{name:/^パック/}).click();
 for(let i=0;i<3;i++){await game.getByRole('button',{name:/^パックを開ける/}).click();await page.clock.runFor(1000);await game.getByText('シール帳に貼りました · タップで次へ').waitFor();await game.getByRole('button',{name:'次へ',exact:true}).click();}
 for(let i=0;i<2;i++){await game.getByRole('button',{name:/^RFパックを開ける/}).click();await confirmUntil(revealed);if(i===0&&(width===390||width===1100))await page.screenshot({path:`./artifacts/cards-rfpack-${width}.png`});await game.getByRole('button',{name:'次へ',exact:true}).click();}
 await game.getByTestId('rf-spent').filter({hasText:'4 RF'}).waitFor();
 // Binder: nine pockets per page, five filled; open a card from the keyboard.
 await game.getByRole('button',{name:'カード帳',exact:true}).click();
 assert.equal(await game.locator('.pocket:not(.empty-pocket)').count(),5);assert.equal(await game.locator('.pocket').count(),9);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/cards-binder-${width}.png`});
 await game.locator('.pocket:not(.empty-pocket)').nth(1).focus();await page.keyboard.press('Enter');const dialog=game.getByRole('dialog');await dialog.waitFor();
 await dialog.getByRole('button',{name:'交換コードを出す'}).click();assert.match(await game.getByTestId('trade-code').inputValue(),/^RF-/);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/cards-detail-${width}.png`});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 // Battle: pick a deck, issue a challenge (burns one ticket).
 await game.getByRole('button',{name:'バトル',exact:true}).click();
 const picks=game.locator('.deck-pick button');for(let i=0;i<5;i++)await picks.nth(i).click();
 await game.getByRole('button',{name:/^挑戦状を出す/}).click();await confirmUntil(()=>game.getByTestId('challenge-code').isVisible().catch(()=>false));
 const myChallenge=decodeBattle(await game.getByTestId('challenge-code').inputValue());assert.equal(myChallenge.deck.length,5);
 await game.getByTestId('rf-burned').filter({hasText:'2 RF'}).waitFor();
 // Accept a rival's challenge: burns another ticket, replays, and offers a reply code.
 const input=game.getByRole('textbox',{name:'友だちの挑戦コード／返信コード'});const rivalCode=encodeBattle({owner:RIVAL,nonce:4242,deck:rivalDeck});
 await input.fill(rivalCode.toLowerCase().replaceAll('-',' '));await game.getByRole('button',{name:'コードで対戦する'}).click();
 await confirmUntil(async()=>(await game.getByRole('button',{name:'スキップ'}).isVisible().catch(()=>false))||(await game.getByTestId('verdict').isVisible().catch(()=>false)));
 if(width===390||width===1100){await page.clock.runFor(700);await page.screenshot({path:`./artifacts/cards-battle-${width}.png`});}
 if(await game.getByRole('button',{name:'スキップ'}).isVisible().catch(()=>false))await game.getByRole('button',{name:'スキップ'}).click();
 await game.getByTestId('verdict').waitFor();assert.match(await game.getByTestId('verdict').innerText(),/勝利|敗北|引き分け/);
 const reply=decodeBattle(await game.getByTestId('reply-code').inputValue());assert.equal(reply.nonce,4242);assert.equal(reply.owner.tokenId,7730n);
 if(width===390||width===1100)await page.screenshot({path:`./artifacts/cards-verdict-${width}.png`});
 await game.getByTestId('rf-burned').filter({hasText:'4 RF'}).waitFor();
 await game.getByRole('button',{name:'とじる',exact:true}).click();
 await input.fill(rivalCode);await game.getByRole('button',{name:'コードで対戦する'}).click();await game.getByText('この挑戦にはもう答えています。').waitFor();
 await input.fill(await game.getByTestId('challenge-code').inputValue());await game.getByRole('button',{name:'コードで対戦する'}).click();await game.getByText(/自分の挑戦には自分では答えられません/).waitFor();
 // The rival's reply to my challenge settles it without burning more.
 await input.fill(encodeBattle({owner:RIVAL,nonce:myChallenge.nonce,deck:rivalDeck}));await game.getByRole('button',{name:'コードで対戦する'}).click();
 if(await game.getByRole('button',{name:'スキップ'}).isVisible().catch(()=>false))await game.getByRole('button',{name:'スキップ'}).click();
 await game.getByTestId('verdict').waitFor();await game.getByTestId('rf-burned').filter({hasText:'4 RF'}).waitFor();
 const total=await game.locator('.record b').evaluateAll(els=>els.slice(0,3).reduce((s,e)=>s+Number(e.textContent),0));assert.equal(total,2,'two battles recorded');
 await game.getByRole('button',{name:'English',exact:true}).click();await game.getByRole('button',{name:'Binder',exact:true}).click();await game.getByRole('button',{name:/^Packs/}).waitFor();
 const wallet=await page.getByRole('button',{name:'Open Friend wallet',exact:true}).boundingBox();assert.ok(wallet.y+wallet.height<=height,'host controls within screen');
 assert.equal(await game.locator('.stickers').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
 assert.equal(await game.locator('body').evaluate(e=>e.scrollWidth>innerWidth),false);
 // Sound: the ♪ toggle flips aria-pressed, M toggles it (not while typing), and the choice survives a reload.
 const sound=game.getByRole('button',{name:'Sound effects',exact:true});assert.equal(await sound.getAttribute('aria-pressed'),'true','sound starts on');
 const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 const checkToggle=async()=>{const s=await game.locator('.sound-toggle').boundingBox(),l=await game.locator('.lang').boundingBox(),h=await game.locator('.brand').boundingBox(),tabs=await game.locator('.tabs').boundingBox();
  assert.ok(s.width>=44&&s.height>=44,'sound toggle is at least 44px');assert.ok(s.x>=0&&s.x+s.width<=width&&s.y>=0&&s.y+s.height<=height,'sound toggle on screen');
  for(const [name,box] of [['language',l],['title',h],['tabs',tabs]])assert.ok(!overlaps(s,box),`sound toggle clear of the ${name}`);};
 await checkToggle();
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false','click turns sound off');
 await page.keyboard.press('m');assert.equal(await sound.getAttribute('aria-pressed'),'true','M turns it back on');
 await game.getByRole('button',{name:/^Trade/}).click();await game.getByRole('textbox',{name:"Friend's trade code"}).focus();await page.keyboard.type('m');
 assert.equal(await sound.getAttribute('aria-pressed'),'true','typing m in a code field leaves sound alone');
 await sound.click();assert.equal(await sound.getAttribute('aria-pressed'),'false');
 const saved=()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('friendsdk:local-preview')&&JSON.parse(localStorage.getItem(k)).sound===false));
 for(let i=0;i<100&&!(await saved());i++)await new Promise(r=>setTimeout(r,50));assert.ok(await saved(),'sound off saved with the book');
 await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();
 const soundJa=game.getByRole('button',{name:'効果音',exact:true});await soundJa.waitFor();
 assert.equal(await soundJa.getAttribute('aria-pressed'),'false','sound stays off after a reload');await checkToggle();
 assert.equal(await game.locator('.pocket:not(.empty-pocket)').count(),5,'the book itself is unchanged');
}}));
