import test from 'node:test';import assert from 'node:assert/strict';
import {bindGameFrame,createFrameGameClient} from '../dist/frame-bridge.js';import {createGamePreview} from '../dist/game.js';
test('score share is bounded and requires a trusted handler, never an arbitrary URL',async()=>{
 const definition={name:'Rare Invaders',consumable:'unused',price:1n,outcomes:[{name:'unused',chanceBps:10000,reward:1n}]};const {port1,port2}=new MessageChannel();let received;
 const host=bindGameFrame(port1,{client:createGamePreview(definition,{friendId:597n,stake:1n,rfBalance:0n}).client,authorize:async()=>{throw Error('No transactions');},onShareScore:args=>{received=args;}});const frame=createFrameGameClient(port2,definition);
 try{assert.equal(typeof frame.client.shareScore,'function');await frame.client.shareScore(1200,3,'over','ja');assert.deepEqual(received,[1200,3,'over','ja']);for(const args of [[-1,1,'over','ja'],[10,6,'over','en'],[10,1,'https://evil.test','en'],[1e9,1,'won','en']])await assert.rejects(frame.client.shareScore(...args),/Unsupported/);host.setPaused(true);await assert.rejects(frame.client.shareScore(0,1,'over','en'),/Close/);}finally{host.close();frame.close();}
});
test('score intent contains the host-selected NFT and fixed game URL',async()=>{
 const {scoreIntent}=await import('../dist/score-share.js');for(const lang of ['ja','en']){const {text,url}=scoreIntent([1234,5,'won',lang],597n,'genesis');const u=new URL(url);assert.equal(u.origin,'https://x.com');assert.equal(u.pathname,'/intent/tweet');assert.match(text,/Genesis #597/);assert.match(text,/1234/);assert.equal(u.searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/invaders/');}
});
test('an unconfigured host rejects score sharing',async()=>{
 const definition={name:'Other',consumable:'unused',price:1n,outcomes:[{name:'unused',chanceBps:10000,reward:1n}]};const {port1,port2}=new MessageChannel();const host=bindGameFrame(port1,{client:createGamePreview(definition,{friendId:1n,stake:1n,rfBalance:0n}).client,authorize:async()=>{}});const frame=createFrameGameClient(port2,definition);try{await assert.rejects(frame.client.shareScore(1,1,'over','en'),/unavailable/);}finally{host.close();frame.close();}
});
test('Rare Drop shares its own URL, title and largest Friend tier up to eleven',async()=>{
 const definition={name:'Rare Drop',consumable:'unused',price:1n,outcomes:[{name:'unused',chanceBps:10000,reward:1n}]};const {port1,port2}=new MessageChannel();let received;
 const host=bindGameFrame(port1,{client:createGamePreview(definition,{friendId:7730n,stake:1n,rfBalance:0n}).client,authorize:async()=>{throw Error('No transactions');},onShareScore:args=>{received=args;}});const frame=createFrameGameClient(port2,definition);
 try{await frame.client.shareScore(4200,11,'over','en');assert.deepEqual(received,[4200,11,'over','en']);await assert.rejects(frame.client.shareScore(10,12,'over','en'),/Unsupported/);}finally{host.close();frame.close();}
 const {scoreIntent}=await import('../dist/score-share.js');
 const ja=scoreIntent([4200,11,'over','ja'],7730n,'generations','Rare Drop');const en=scoreIntent([900,4,'over','en'],597n,'genesis','Rare Drop');
 for(const {url} of [ja,en])assert.equal(new URL(url).searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/drop/');
 assert.match(ja.text,/RARE DROP/);assert.match(ja.text,/Friend #7730/);assert.match(ja.text,/4200/);assert.match(ja.text,/Friend/);
 assert.match(en.text,/Genesis #597/);assert.match(en.text,/tier 4\/11/i);assert.doesNotMatch(en.text,/INVADERS|Wave/);
});
test('Rare Rush shares top speed in km/h with its own fixed URL',async()=>{
 const definition={name:'Rare Rush',consumable:'unused',price:1n,outcomes:[{name:'unused',chanceBps:10000,reward:1n}]};const {port1,port2}=new MessageChannel();let received;
 const host=bindGameFrame(port1,{client:createGamePreview(definition,{friendId:7730n,stake:1n,rfBalance:0n}).client,authorize:async()=>{throw Error('No transactions');},onShareScore:args=>{received=args;}});const frame=createFrameGameClient(port2,definition);
 try{await frame.client.shareScore(15000,432,'over','ja');assert.deepEqual(received,[15000,432,'over','ja']);await assert.rejects(frame.client.shareScore(10,451,'over','en'),/Unsupported/);}finally{host.close();frame.close();}
 const {scoreIntent}=await import('../dist/score-share.js');
 const ja=scoreIntent([15000,312,'over','ja'],7730n,'generations','Rare Rush'),en=scoreIntent([900,180,'over','en'],597n,'genesis','Rare Rush');
 for(const {url} of [ja,en])assert.equal(new URL(url).searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/rush/');
 assert.match(ja.text,/RARE RUSH/);assert.match(ja.text,/Friend #7730/);assert.match(ja.text,/15000/);assert.match(ja.text,/312km\/h/);
 assert.match(en.text,/Genesis #597/);assert.match(en.text,/180 km\/h/);assert.doesNotMatch(en.text,/Wave|tier/i);
});
test('Rare Mine shares its burned total and best streak with its own fixed URL',async()=>{
 const definition={name:'Rare Mine',consumable:'unused',price:1n,outcomes:[{name:'unused',chanceBps:10000,reward:1n}]};const {port1,port2}=new MessageChannel();let received;
 const host=bindGameFrame(port1,{client:createGamePreview(definition,{friendId:7730n,stake:1n,rfBalance:0n}).client,authorize:async()=>{throw Error('No transactions');},onShareScore:args=>{received=args;}});const frame=createFrameGameClient(port2,definition);
 try{await frame.client.shareScore(1200,4,'won','ja');assert.deepEqual(received,[1200,4,'won','ja']);await assert.rejects(frame.client.shareScore(10,21,'won','en'),/Unsupported/);}finally{host.close();frame.close();}
 const {scoreIntent}=await import('../dist/score-share.js');
 const ja=scoreIntent([1200,4,'won','ja'],7730n,'generations','Rare Mine'),en=scoreIntent([300,4,'won','en'],597n,'genesis','Rare Mine'),none=scoreIntent([50,1,'over','ja'],7730n,'generations','Rare Mine');
 for(const {url} of [ja,en,none])assert.equal(new URL(url).searchParams.get('url'),'https://horusuzu.github.io/rare-friends-lost-and-found/mine/');
 assert.match(ja.text,/RARE MINE/);assert.match(ja.text,/Friend #7730/);assert.match(ja.text,/🔥1200/);assert.match(ja.text,/×16（4連勝）/);assert.match(ja.text,/シミュレーション/);
 assert.match(en.text,/Genesis #597/);assert.match(en.text,/×16 \(4 wins in a row\)/);assert.match(en.text,/preview/i);assert.doesNotMatch(en.text,/Wave|tier|km\/h/i);
 assert.doesNotMatch(none.text,/連勝/);assert.match(none.text,/🔥50/);
});
