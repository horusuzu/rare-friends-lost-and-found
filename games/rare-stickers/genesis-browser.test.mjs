import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {chromium} from 'playwright';import {encodeCode} from './album.ts';import {buildGame,createGameServer} from '../../scripts/dev-game.mjs';
import {installFixture,createArtworkFixture,assertBounds,OWNER,SECOND_OWNER} from '../../scripts/browser-fixture.mjs';
for(const width of [390,1100]){
 const dir=await mkdtemp(join(tmpdir(),'genesis-stickers-'));let server,browser;
 try{
 const build=await buildGame('./games/rare-stickers',{outdir:join(dir,'dist')});server=createGameServer(build.outdir);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.STICKERS_CHROMIUM?{executablePath:process.env.STICKERS_CHROMIUM}:{})});
 const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=await installFixture(page,origin,{artworkCall:await createArtworkFixture(),genesisOwner:OWNER});const game=page.frameLocator('iframe');
 await page.goto(origin);await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();
 await page.getByRole('button',{name:/^Genesis #597/}).waitFor();await page.getByRole('button',{name:/^Friend #7730/}).waitFor();
 await page.getByRole('button',{name:/^Genesis #597/}).click();
 await game.getByText('パックを開けて、シールを貼ろう！').waitFor();assert.ok(fixture.genesisReads>=2);
 // Trade: as Genesis #597, receive a sticker of Friend #7730 (art read from the chain fixture).
 const code=encodeCode({collection:'generations',tokenId:7730n,style:6,backdrop:0,hue:4,nameA:1,nameB:2,serial:4321});
 await game.getByRole('button',{name:/^交換/}).click();const input=game.getByRole('textbox',{name:'友だちの交換コード'});
 await input.fill(code.toLowerCase().replaceAll('-',' '));await game.getByRole('button',{name:'コードを確かめる'}).click();
 await game.getByRole('img',{name:/プリズム/}).waitFor().catch(()=>{});if(width===390||width===1100)await page.screenshot({path:`./artifacts/stickers-trade-${width}.png`});
 await game.getByRole('button',{name:'シール帳に貼る'}).click();assert.equal(await game.locator('.placed').count(),1,'traded sticker added to the book');
 await game.getByRole('button',{name:/^交換/}).click();await input.fill(code);await game.getByRole('button',{name:'コードを確かめる'}).click();await game.getByRole('button',{name:'シール帳に貼る'}).click();
 await game.getByText('このシールはもうシール帳にあります。').waitFor();await game.getByRole('button',{name:'シール帳',exact:true}).click();
 await game.getByRole('img',{name:'Genesis #597',exact:true,includeHidden:true}).waitFor({state:'attached'});
 await game.getByRole('button',{name:/^パック/}).click();await game.getByRole('button',{name:/^パックを開ける/}).click();await game.getByText('シール帳に貼りました · タップで次へ').waitFor({timeout:5000}).catch(()=>{});
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();await game.getByText('パックを開けて、シールを貼ろう！').waitFor();
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();fixture.genesisOwner=SECOND_OWNER;await page.getByRole('button',{name:/^Genesis #597/}).click();await page.getByText('このウォレットは選択したGenesisを所有していません。',{exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(fixture.errors,[]);const requests=await page.evaluate(()=>window.__friendWalletTest.state.requests);assert.ok(requests.every(m=>['eth_accounts','eth_requestAccounts','eth_chainId'].includes(m)));console.log(`Genesis selection, launch and transferred-owner rejection PASS ${width}`);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
