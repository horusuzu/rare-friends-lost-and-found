import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {chromium} from 'playwright';import {buildGame,createGameServer} from '../../scripts/dev-game.mjs';
import {installFixture,createArtworkFixture,assertBounds,OWNER,SECOND_OWNER} from '../../scripts/browser-fixture.mjs';
for(const width of [390,1100]){
 const dir=await mkdtemp(join(tmpdir(),'genesis-preview-'));let server,browser;
 try{
 const build=await buildGame('./games/lost-and-found',{outdir:join(dir,'dist')});server=createGameServer(build.outdir);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.LOST_FOUND_CHROMIUM?{executablePath:process.env.LOST_FOUND_CHROMIUM}:{})});
 const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=await installFixture(page,origin,{artworkCall:await createArtworkFixture(),genesisOwner:OWNER});const game=page.frameLocator('iframe');
 await page.goto(origin);await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();
 await page.getByRole('button',{name:/^Genesis #597/}).waitFor();await page.getByRole('button',{name:/^Friend #7730/}).waitFor();
 await page.getByRole('button',{name:/^Genesis #597/}).click();await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor();assert.ok(fixture.genesisReads>=2,'fresh owner check after discovery');await game.getByRole('img',{name:'Genesis #597',exact:true}).waitFor();
 await game.getByRole('button',{name:'ごはん',exact:true}).click();await game.getByRole('button',{name:/ベリー/}).click();await game.getByText('保存済み',{exact:true}).waitFor();
 await game.getByRole('button',{name:'設定',exact:true}).click();await game.getByLabel('Friendの呼び名').fill('ジェネ');await game.getByRole('button',{name:'この名前で呼ぶ'}).click();await game.getByText('保存済み',{exact:true}).waitFor();
 const saved=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.includes('local-preview')));assert.equal(saved.length,1);assert.match(saved[0][0],/genesis:v1/);
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor();
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:/^Genesis #597/}).click();await game.getByRole('heading',{name:'ジェネと、島ぐらし。'}).waitFor();
 await page.reload();await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Genesis #597/}).click();await game.getByRole('heading',{name:'ジェネと、島ぐらし。'}).waitFor();
 await assertBounds(page);assert.equal(await game.locator('.life-app').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await mkdir('./artifacts',{recursive:true});await page.screenshot({path:`./artifacts/genesis-home-${width}.png`});
 // A chain change tears down the Genesis session and requires selection again.
 await page.evaluate(()=>window.__friendWalletTest.chain('0x1'));await page.getByRole('button',{name:'Switch to Robinhood',exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 await page.evaluate(()=>window.__friendWalletTest.chain('0x1237'));await page.getByRole('button',{name:/^Genesis #597/}).click();await game.getByRole('heading',{name:'ジェネと、島ぐらし。'}).waitFor();
 // A transfer between discovery and selection is rechecked, never allowed to mount.
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor();
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();fixture.genesisOwner=SECOND_OWNER;await page.getByRole('button',{name:/^Genesis #597/}).click();await page.getByText('このウォレットは選択したGenesisを所有していません。',{exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:'Refresh Friends',exact:true}).click();await page.getByText('Loading your Friends…',{exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:/^Genesis #597/}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(fixture.errors,[]);const requests=await page.evaluate(()=>window.__friendWalletTest.state.requests);assert.ok(requests.every(m=>['eth_accounts','eth_requestAccounts','eth_chainId'].includes(m)));console.log(`Genesis picker, canonical art, care, separate save/reload, transferred-owner rejection PASS ${width}`);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
