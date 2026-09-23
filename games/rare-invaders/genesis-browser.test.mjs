import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {chromium} from 'playwright';import {buildGame,createGameServer} from '../../scripts/dev-game.mjs';
import {installFixture,createArtworkFixture,assertBounds,OWNER,SECOND_OWNER} from '../../scripts/browser-fixture.mjs';
for(const width of [390,1100]){
 const dir=await mkdtemp(join(tmpdir(),'genesis-preview-'));let server,browser;
 try{
 const build=await buildGame('./games/rare-invaders',{outdir:join(dir,'dist')});server=createGameServer(build.outdir);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.INVADERS_CHROMIUM?{executablePath:process.env.INVADERS_CHROMIUM}:{})});
 const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=await installFixture(page,origin,{artworkCall:await createArtworkFixture(),genesisOwner:OWNER});const game=page.frameLocator('iframe');
 await page.goto(origin);await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();
 await page.getByRole('button',{name:/^Genesis #597/}).waitFor();await page.getByRole('button',{name:/^Friend #7730/}).waitFor();
 await page.getByRole('button',{name:/^Genesis #597/}).click();
 await game.getByRole('button',{name:'出撃する',exact:true}).click();assert.ok(fixture.genesisReads>=2);
 await game.getByRole('img',{name:'Genesis #597',exact:true,includeHidden:true}).waitFor({state:'attached'});
 await game.getByRole('button',{name:'一時停止',exact:true}).click();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();
 await page.getByRole('button',{name:'Choose Friend',exact:true}).click();fixture.genesisOwner=SECOND_OWNER;await page.getByRole('button',{name:/^Genesis #597/}).click();await page.getByText('このウォレットは選択したGenesisを所有していません。',{exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(fixture.errors,[]);const requests=await page.evaluate(()=>window.__friendWalletTest.state.requests);assert.ok(requests.every(m=>['eth_accounts','eth_requestAccounts','eth_chainId'].includes(m)));console.log(`Genesis selection, launch and transferred-owner rejection PASS ${width}`);
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
