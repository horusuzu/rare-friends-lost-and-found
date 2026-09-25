// Phone layouts for Rare Cards: emulated touch phones (isMobile, touch, DPR 3, mobile UA) at common sizes.
// MOBILE_SHOT=before|after names the in-play screenshots; MOBILE_MEASURE=1 only prints measurements.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const b=await launch({...o,...(process.env.STICKERS_CHROMIUM?{executablePath:process.env.STICKERS_CHROMIUM}:{})});const nc=b.newContext.bind(b);
 b.newContext=o=>nc({...o,isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:o?.viewport?.width===360?ANDROID:IPHONE});return b;};
const sizes=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const measureOnly=process.env.MOBILE_MEASURE==='1',shot=process.env.MOBILE_SHOT??'after';
const tag=(w,h)=>w>h?'land':String(w);const check=(ok,msg)=>{if(measureOnly){if(!ok)console.log(`  ✗ ${msg}`);}else assert.ok(ok,msg);};
const box=l=>l.boundingBox();const extra=(page,t,name)=>(t==='390'||t==='land')?page.screenshot({path:`./artifacts/mobile-${shot}-${t}-stickers-${name}.png`}):null;
/** Host document and game document must not scroll; the game's own panel may. */
const pageMetrics=async(page,game)=>({...await page.evaluate(()=>{const d=document.documentElement,f=document.querySelector('.rf-game-frame').getBoundingClientRect(),t=document.querySelector('.rf-frame-toolbar').getBoundingClientRect(),i=document.querySelector('iframe').getBoundingClientRect();
 return {vw:innerWidth,vh:innerHeight,docW:d.scrollWidth,docH:d.scrollHeight,frameH:Math.round(f.height),toolbarH:Math.round(t.height),toolbarBottom:Math.round(t.bottom),iframe:[Math.round(i.width),Math.round(i.height)],top:Math.round(i.top),bottom:Math.round(i.bottom)};}),
 ...await game.locator('body').evaluate(()=>{const d=document.scrollingElement;return {gameDocH:d.scrollHeight,gameClientH:d.clientHeight,gameDocW:d.scrollWidth,gameClientW:d.clientWidth};})});
const assertNoScroll=(m,label)=>{check(m.docH<=m.vh&&m.docW<=m.vw,`${label}: host document does not scroll (${m.docW}×${m.docH} in ${m.vw}×${m.vh})`);
 check(m.gameDocH<=m.gameClientH&&m.gameDocW<=m.gameClientW,`${label}: game document does not scroll (${m.gameDocW}×${m.gameDocH})`);check(m.toolbarBottom<=m.vh,`${label}: host toolbar on screen`);};
/** Smallest rendered text (elements with their own visible text); canvas art is excluded. */
const minText=game=>game.locator('body').evaluate(()=>{let min=99,where='';for(const el of document.querySelectorAll('body *')){if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
 if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const f=parseFloat(getComputedStyle(el).fontSize);if(f<min){min=f;where=el.className||el.tagName;}}return {min,where:String(where)};});
const touchStyle=el=>{const s=getComputedStyle(el);return {ta:s.touchAction,us:s.userSelect||s.webkitUserSelect,callout:CSS.supports('-webkit-touch-callout','none')?s.webkitTouchCallout:'unsupported',tap:s.webkitTapHighlightColor,font:parseFloat(s.fontSize)};};

for(const [width,height] of sizes){const t=tag(width,height),report={size:`${width}x${height}`};
 await testGame('./games/rare-stickers',{width,height,check:async({page,game})=>{
  await game.getByText('パックを開けて、カードを集めよう！').waitFor();
  const m0=await pageMetrics(page,game);report.start=m0;assertNoScroll(m0,'binder (empty)');
  // Host toolbar: compact but usable on a phone.
  for(const name of ['Choose Friend','Open Friend wallet']){const b=await box(page.getByRole('button',{name,exact:true}));check(b.height>=44&&b.width>=44,`host ${name} ≥44px (${b.width}×${b.height})`);}
  const hostFont=await page.locator('.rf-frame-toolbar button').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));check(hostFont>=12,`host toolbar text ≥12px (${hostFont})`);report.toolbarFont=hostFont;
  // Tabs, sound and language sit on screen with ≥44px targets and touch-friendly styles.
  for(const b of [...await game.locator('.tabs button').all(),game.locator('.sound-toggle'),game.locator('.lang')]){const r=await box(b);check(r.height>=44&&r.width>=44&&r.y>=m0.top&&r.y+r.height<=m0.bottom+1,`control ≥44px and visible (${r.width}×${r.height})`);}
  const overlaps=(a,b)=>a.x<b.x+b.width-1&&b.x<a.x+a.width-1&&a.y<b.y+b.height-1&&b.y<a.y+a.height-1;
  const header=await Promise.all(['.sound-toggle','.lang','.brand h1','.tabs'].map(q=>box(game.locator(q))));
  for(let i=0;i<header.length;i++)for(let j=i+1;j<header.length;j++)check(!overlaps(header[i],header[j]),`header controls do not overlap (${i}/${j})`);
  const tabStyle=await game.locator('.tabs button').first().evaluate(touchStyle);report.tabStyle=tabStyle;
  check(tabStyle.ta==='manipulation','tabs use touch-action: manipulation');check(tabStyle.us==='none','tabs are not text-selectable');check(['none','unsupported'].includes(tabStyle.callout),'tabs suppress the iOS callout (Safari-only property)');check(tabStyle.tap==='rgba(0, 0, 0, 0)','tabs have no tap highlight');
  const surface=await game.locator('.stickers').evaluate(e=>({ob:getComputedStyle(e).overscrollBehaviorY,menu:e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))}));
  check(surface.ob==='none'||surface.ob==='contain','panel does not chain overscroll to the page');check(surface.menu===false,'long-press menu suppressed on the play surface');
  // Three free packs: the pack button and its reveal fit the screen.
  await game.getByRole('button',{name:/^パック/}).click();
  const pack=game.getByRole('button',{name:/^パックを開ける/});
  for(let i=0;i<3;i++){await pack.click();await game.getByText('シール帳に貼りました · タップで次へ').waitFor();
   if(i===0){const p=await box(game.locator('.pack')),c=await box(game.locator('.pack .card-canvas'));report.pack=[Math.round(p.width),Math.round(p.height)];report.revealCard=[Math.round(c.width),Math.round(c.height)];
    await extra(page,t,'pack');check(p.y>=m0.top&&p.y+p.height<=m0.bottom+1,`opened pack fully visible (${Math.round(p.y)}+${Math.round(p.height)} of ${m0.bottom})`);}
   await game.getByRole('button',{name:'次へ',exact:true}).click();}
  // Binder: nine pockets sized to the space, big enough to read, and all on screen together.
  await game.getByRole('button',{name:'カード帳',exact:true}).click();await game.locator('.pocket:not(.empty-pocket)').nth(2).waitFor();
  const pockets=await Promise.all((await game.locator('.pocket').all()).map(box)),pager=await box(game.locator('.pager'));
  const pw=Math.round(pockets[0].width),bottom=Math.max(...pockets.map(p=>p.y+p.height));report.pocket=[pw,Math.round(pockets[0].height)];report.binderBottom=Math.round(bottom);report.pagerBottom=Math.round(pager.y+pager.height);
  check(pw>=(width>height?(height<380?60:72):(height<600?64:84)),`binder pockets are legible (${pw}px wide)`);check(bottom<=m0.bottom+1&&pager.y+pager.height<=m0.bottom+1,`all nine pockets and the pager fit on screen (${Math.round(bottom)}, pager ${Math.round(pager.y+pager.height)} of ${m0.bottom})`);
  const cv=await game.locator('.pocket .card-canvas').first().evaluate(e=>({px:e.width,css:e.getBoundingClientRect().width}));report.canvasDensity=+(cv.px/cv.css).toFixed(2);check(cv.px/cv.css>=2,`card canvases are crisp (${report.canvasDensity}× backing)`);
  // Nothing in the panel may cover the pager (the footer once slid over it).
  const covered=await game.locator('.pager button').last().evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !(hit===e||e.contains(hit));});check(!covered,'pager buttons are not covered');
  const tx=await minText(game);report.minText=tx;check(tx.min>=12,`text ≥12px (${tx.min}px in ${tx.where})`);
  await page.screenshot({path:`./artifacts/mobile-${shot}-${t}-stickers.png`});
  const m1=await pageMetrics(page,game);report.binder=m1;assertNoScroll(m1,'binder');
  // Card view: fits, glints under a finger drag, and its trade code stays selectable.
  await game.locator('.pocket:not(.empty-pocket)').first().tap();const dialog=game.getByRole('dialog');await dialog.waitFor();
  const card=dialog.locator('.card-canvas');const cb=await box(card);report.detailCard=[Math.round(cb.width),Math.round(cb.height)];
  const cs=await card.evaluate(e=>getComputedStyle(e).touchAction);check(cs==='none','the live card takes drag gestures (touch-action: none)');
  await dialog.getByRole('button',{name:'交換コードを出す'}).tap();const code=game.getByTestId('trade-code');
  const ds=await box(dialog.locator('.card'));await extra(page,t,'detail');check(ds.y>=m0.top&&ds.y+ds.height<=m0.bottom+1,`card view fits (${Math.round(ds.y)}+${Math.round(ds.height)})`);
  const cStyle=await code.evaluate(touchStyle);report.codeStyle=cStyle;check(cStyle.us!=='none'&&cStyle.callout!=='none','trade code stays selectable/copyable');
  await dialog.getByRole('button',{name:'とじる',exact:true}).tap();await dialog.waitFor({state:'hidden'});
  // Battle: the deck picker gives thumb-sized cards.
  await game.getByRole('button',{name:'バトル',exact:true}).click();const pick=await box(game.locator('.deck-pick button').first());report.deckPick=[Math.round(pick.width),Math.round(pick.height)];await extra(page,t,'battle');
  check(pick.width>=44&&pick.height>=44,`deck cards ≥44px (${Math.round(pick.width)})`);
  // Trade: the code field is 16px (no iOS zoom) and stays visible when a keyboard takes ~45% of the screen.
  await game.getByRole('button',{name:/^交換/}).click();const input=game.getByRole('textbox',{name:'友だちの交換コード'});
  const iStyle=await input.evaluate(touchStyle);check(iStyle.font>=16,`code field ≥16px (${iStyle.font})`);check(iStyle.us!=='none','code field selectable');
  await input.tap();await page.setViewportSize({width,height:Math.round(height*0.55)});await input.evaluate(e=>e.scrollIntoView({block:'nearest'}));
  const kb=await pageMetrics(page,game),ib=await box(input);report.keyboard={...kb,input:[Math.round(ib.y),Math.round(ib.height)]};
  check(ib.y>=kb.top&&ib.y+ib.height<=kb.bottom+1,`code field visible above the keyboard (${Math.round(ib.y+ib.height)} of ${kb.bottom})`);check(kb.docW<=kb.vw,'no horizontal overflow with the keyboard');
  await page.setViewportSize({width,height});
  // Audio unlocks on the first touch release; pausing when hidden is covered by sound.test.mjs.
 }});
 console.log(JSON.stringify(report));console.log(`Rare Cards mobile ${width}x${height} ${measureOnly?'measured':'PASS'}`);}
