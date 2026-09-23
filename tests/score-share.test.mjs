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
