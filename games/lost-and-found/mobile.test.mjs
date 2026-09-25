// Phone layouts for Our Little Island: emulated touch phones (isMobile, touch, DPR 3, mobile UA) at common sizes.
// MOBILE_SHOT=before|after names the in-play screenshots; MOBILE_MEASURE=1 only prints measurements.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
import {decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';import {REWARDS_DEPLOYMENT as D} from '../../dist/friend-rewards.js';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const b=await launch({...o,...(process.env.LOST_FOUND_CHROMIUM?{executablePath:process.env.LOST_FOUND_CHROMIUM}:{})});const nc=b.newContext.bind(b);
 b.newContext=o=>nc({...o,isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:o?.viewport?.width===360?ANDROID:IPHONE});return b;};
const sizes=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const measureOnly=process.env.MOBILE_MEASURE==='1',shot=process.env.MOBILE_SHOT??'after';
const tag=(w,h)=>w>h?'land':String(w);const check=(ok,msg)=>{if(measureOnly){if(!ok)console.log(`  ✗ ${msg}`);}else assert.ok(ok,msg);};
const box=l=>l.boundingBox();const round=b=>b&&[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];
const abi=parseAbi(['function ownerOf(uint256) view returns (address)','function activationManager() view returns (address)','function tokenBoundAccount(uint256) view returns (address)','function positions(address,uint256) view returns (uint8,uint256)','function retired() view returns (bool)','function rf() view returns (address)','function weth() view returns (address)','function earned(address,address,uint256) view returns (uint256)','function balanceOf(address) view returns (uint256)']);
/** Answers the piggy bank's read-only reward calls (same fixture as rewards-browser.test.mjs). */
async function mockRewards(page,account,friendWallet){
 await page.route('https://rpc.mainnet.chain.robinhood.com/**',async route=>{
  if(route.request().method()!=='POST')return route.fallback();const raw=route.request().postDataJSON(),requests=Array.isArray(raw)?raw:[raw];let decoded;
  try{decoded=requests.map(r=>{if(r.method!=='eth_call')throw Error();return decodeFunctionData({abi,data:r.params[0].data});});}catch{return route.fallback();}
  if(!decoded.some(d=>['activationManager','positions','retired','rf','weth','earned'].includes(d.functionName))&&!requests.every(r=>[D.rf,D.weth,D.genesis].some(a=>a.toLowerCase()===r.params[0].to.toLowerCase())))return route.fallback();
  const response=requests.map((r,i)=>{const {functionName:f,args}=decoded[i];const values={ownerOf:account,activationManager:D.manager,tokenBoundAccount:friendWallet,positions:[0,100n],retired:false,rf:D.rf,weth:D.weth,
   earned:String(args?.[0]).toLowerCase()===D.rf.toLowerCase()?5n*10n**18n:10n**15n,balanceOf:r.params[0].to.toLowerCase()===D.rf.toLowerCase()?2n*10n**18n:2n*10n**15n};
   return{jsonrpc:'2.0',id:r.id,result:encodeFunctionResult({abi,functionName:f,result:values[f]})};});
  await route.fulfill({json:Array.isArray(raw)?response:response[0],headers:{'access-control-allow-origin':'*'}});
 });
}
/** Visible text boxes (elements with their own text) that intersect the nav, outside the nav itself. */
const textUnderNav=game=>game.locator('body').evaluate(()=>{const nav=document.querySelector('.life-nav').getBoundingClientRect(),hits=[];
 for(const el of document.querySelectorAll('.life-content *')){if(el.closest('.life-nav')||!el.getClientRects().length)continue;if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
  // Only the part left visible by its scroll area counts (overflow clips the rest).
  const b=el.getBoundingClientRect(),scroller=el.closest('.life-scroll')?.getBoundingClientRect(),r=scroller?{top:Math.max(b.top,scroller.top),bottom:Math.min(b.bottom,scroller.bottom),left:Math.max(b.left,scroller.left),right:Math.min(b.right,scroller.right)}:b;
  if(r.bottom<=r.top||r.right<=r.left)continue;
  if(r.bottom>nav.top+1&&r.top<nav.bottom-1&&r.right>nav.left&&r.left<nav.right&&r.bottom>0&&r.top<innerHeight)hits.push(`${el.className||el.tagName}:${el.textContent.trim().slice(0,12)}`);}return hits;});
const minText=game=>game.locator('body').evaluate(()=>{let min=99,where='';for(const el of document.querySelectorAll('body *')){if(!el.getClientRects().length)continue;if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
 const f=parseFloat(getComputedStyle(el).fontSize);if(f<min){min=f;where=`${el.className||el.tagName}`;}}return {min,where};});
const pageMetrics=async(page,game)=>({...await page.evaluate(()=>{const d=document.documentElement,i=document.querySelector('iframe').getBoundingClientRect(),t=document.querySelector('.rf-frame-toolbar').getBoundingClientRect();
 return {vw:innerWidth,vh:innerHeight,docW:d.scrollWidth,docH:d.scrollHeight,top:Math.round(i.top),bottom:Math.round(i.bottom),iframeH:Math.round(i.height),toolbar:[Math.round(t.top),Math.round(t.height)],toolbarOverGame:t.top<i.bottom-1};}),
 ...await game.locator('body').evaluate(()=>{const d=document.scrollingElement;return {gameDocH:d.scrollHeight,gameClientH:d.clientHeight,gameDocW:d.scrollWidth,gameClientW:d.clientWidth};})});

for(const [width,height] of sizes){const t=tag(width,height),report={size:`${width}x${height}`};
 await testGame('./games/lost-and-found',{width,height,check:async({page,game,account,friendWallet})=>{
  await mockRewards(page,account,friendWallet);
  await game.getByRole('heading',{name:'まめと、島ぐらし。'}).waitFor({timeout:15000});
  const m=await pageMetrics(page,game);report.home=m;
  check(m.docH<=m.vh&&m.docW<=m.vw,`host document does not scroll (${m.docW}×${m.docH} in ${m.vw}×${m.vh})`);
  check(m.gameDocH<=m.gameClientH&&m.gameDocW<=m.gameClientW,`game document does not scroll (${m.gameDocW}×${m.gameDocH})`);
  check(!m.toolbarOverGame,'host toolbar sits below the game instead of over it');
  // Host toolbar: styled, compact, 44px targets, 12px text.
  for(const name of ['Choose Friend','Open Friend wallet']){const l=page.getByRole('button',{name,exact:true}),b=await box(l),bg=await l.evaluate(e=>getComputedStyle(e).backgroundColor);
   check(b.height>=44&&b.y+b.height<=height,`host ${name} ≥44px and on screen (${b.height})`);check(bg!=='rgb(238, 238, 238)',`host ${name} is styled (${bg})`);}
  report.hostFont=await page.locator('.rf-frame-toolbar button').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));check(report.hostFont>=12,`host toolbar text ≥12px (${report.hostFont})`);
  // Nav: thumb-sized, on screen, nothing written underneath it.
  const nav=await box(game.locator('.life-nav'));report.nav=round(nav);check(nav.y>=m.top&&nav.y+nav.height<=m.bottom+1,'nav fully on screen');
  for(const b of await game.locator('.life-nav button').all()){const r=await box(b);check(r.height>=48&&r.width>=44,`nav button ≥48px tall (${Math.round(r.width)}×${Math.round(r.height)})`);}
  const under=await textUnderNav(game);report.textUnderNav=under;check(under.length===0,`no text under the nav (${under.join(', ')})`);
  // The scene is comfortably sized and fully visible on arrival.
  const scene=await box(game.locator('.life-scene'));report.scene=round(scene);
  check(width>height?scene.height>=150:scene.width>=300&&scene.height>=170,`scene is comfortably sized (${Math.round(scene.width)}×${Math.round(scene.height)})`);
  const railed=nav.height>nav.width;check(scene.y>=m.top&&scene.y+scene.height<=(railed?m.bottom:Math.min(nav.y,m.bottom))+1&&(!railed||scene.x+scene.width<=nav.x+1),`scene fully visible beside/above the nav (${round(scene)} vs ${round(nav)})`);
  const tx=await minText(game);report.minText=tx;check(tx.min>=12,`text ≥12px (${tx.min}px in ${tx.where})`);
  const style=await game.locator('.life-nav button').first().evaluate(e=>{const s=getComputedStyle(e);return {ta:s.touchAction,us:s.userSelect||s.webkitUserSelect,tap:s.webkitTapHighlightColor};});report.navStyle=style;
  check(style.ta==='manipulation'&&style.us==='none'&&style.tap==='rgba(0, 0, 0, 0)','nav buttons are touch-friendly');
  const panel=await game.locator('.life-app').evaluate(e=>({ob:getComputedStyle(e).overscrollBehaviorY,menu:e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))}));
  check(panel.ob==='none'||panel.ob==='contain','no overscroll chaining');check(panel.menu===false,'long-press menu suppressed on the island');
  await page.screenshot({path:`./artifacts/mobile-${shot}-${t}-island.png`});
  // Each tab stays clear of the nav at the top and at the end of its scroll.
  for(const [name,ready] of [['おでかけ','どこへ、出かけよう？'],['島づくり','ぼくらの島を、育てよう。'],['思い出','ふたりの思い出。'],['おうち','今日は、何しよう？']]){
   await game.getByRole('button',{name,exact:true}).tap();await game.getByRole('heading',{name:ready}).waitFor();
   const top=await textUnderNav(game);await game.locator('.life-scroll, .life-app').first().evaluate(e=>{e.scrollTop=e.scrollHeight;});const end=await textUnderNav(game);
   check(top.length===0&&end.length===0,`${name}: no text under the nav (${[...top,...end].join(', ')})`);
   const mm=await pageMetrics(page,game);check(mm.docH<=mm.vh&&mm.gameDocH<=mm.gameClientH,`${name}: no document scroll`);
   await game.locator('.life-scroll, .life-app').first().evaluate(e=>{e.scrollTop=0;});}
  // Piggy bank: the panel fits the screen, scrolls inside, and closes.
  await game.getByRole('button',{name:'部屋の貯金箱',exact:true}).tap();const dialog=game.getByRole('dialog');await dialog.waitFor();await game.getByTestId('claimable-rf').waitFor();
  const d=await box(game.locator('.life-dialog')),close=await box(game.getByRole('button',{name:'閉じる',exact:true}));report.piggy=round(d);
  check(d.y>=m.top&&d.y+d.height<=m.bottom+1&&d.x>=0&&d.x+d.width<=width,`piggy bank panel fits (${round(d)})`);check(close.height>=44&&close.y>=m.top,'piggy close button reachable');
  check(await game.locator('.life-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'piggy panel has no sideways overflow');
  if(t==='390'||t==='land')await page.screenshot({path:`./artifacts/mobile-${shot}-${t}-island-piggy.png`});
  await game.getByRole('button',{name:'閉じる',exact:true}).tap();await dialog.waitFor({state:'hidden'});
  const m2=await pageMetrics(page,game);check(m2.docH<=m2.vh&&m2.gameDocH<=m2.gameClientH,'still no document scroll');
 }});
 console.log(JSON.stringify(report));console.log(`Our Little Island mobile ${width}x${height} ${measureOnly?'measured':'PASS'}`);}
