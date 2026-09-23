import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, WIDTH, HEIGHT, PLAYER_Y} from './engine.ts';
const idle = {move:0,fire:false,shield:false};
const tick = (s, input=idle, dt=.03) => step(s,input,dt);
test('initial fleet and movement boundaries, dt cap, immutable inputs',()=>{
 const s=createGame(); const before=structuredClone(s);
 assert.equal(s.lives,3); assert.equal(s.wave,1); assert.ok(s.enemies.length>0);
 assert.equal(HEIGHT,560); assert.equal(WIDTH,480);
 let n=tick(s,{...idle,move:1},50); assert.ok(n.playerX-s.playerX<=10);
 for(let i=0;i<100;i++) n=tick(n,{...idle,move:1});
 assert.equal(n.playerX,WIDTH-22);
 for(let i=0;i<100;i++) n=tick(n,{...idle,move:-1});
 assert.equal(n.playerX,22); assert.deepEqual(s,before);
 assert.deepEqual(tick(s,idle,NaN),s); assert.deepEqual(tick(s,idle,-1),s);
});
test('held fire has cooldown and friendly shots kill and score once',()=>{
 let s=tick(createGame(),{...idle,fire:true}); assert.equal(s.shots.length,1);
 assert.equal(tick(s,{...idle,fire:true}).shots.length,1);
 s={...s,enemies:[{id:1,x:200,y:100,hp:1,kind:0},{id:2,x:300,y:100,hp:2,kind:1}], shots:[{x:200,y:105,enemy:false}]};
 let n=tick(s); assert.equal(n.enemies.length,1); assert.equal(n.score,100);
 n=tick({...n,shots:[{x:300,y:105,enemy:false}]}); assert.equal(n.enemies[0].hp,1);
 n=tick({...n,shots:[{x:300,y:105,enemy:false}]}); assert.equal(n.wave,2); assert.equal(n.score,250);
});
test('damage gives invulnerability, then game over; shield blocks and cools down',()=>{
 const hit=s=>tick({...s,shots:[{x:s.playerX,y:PLAYER_Y-4,enemy:true}]});
 let s=hit(createGame()); assert.equal(s.lives,2); assert.ok(s.invincible>0);
 assert.equal(hit(s).lives,2);
 s=hit({...s,invincible:0}); assert.equal(s.lives,1);
 s=hit({...s,invincible:0}); assert.equal(s.status,'over'); assert.deepEqual(tick(s),s);
 let shield=tick(createGame(),{...idle,shield:true}); assert.ok(shield.shield>0); assert.ok(shield.shieldCooldown>0);
 assert.equal(hit(shield).lives,3);
 shield=tick({...shield,shield:0},{...idle,shield:true}); assert.equal(shield.shield,0);
});
test('waves clear bullets, win after five, formation bounces and breach ends run',()=>{
 let s=createGame();
 for(let wave=2;wave<=5;wave++) {s=tick({...s,enemies:[],shots:[{x:5,y:5,enemy:true}]}); assert.equal(s.wave,wave);assert.equal(s.shots.length,0);}
 s=tick({...s,enemies:[]}); assert.equal(s.status,'won'); assert.deepEqual(tick(s),s);
 let edge=tick({...createGame(), enemies:[{id:1,x:WIDTH-17,y:100,hp:1,kind:0}]});
 assert.equal(edge.direction,-1); assert.ok(edge.enemies[0].y>100);
 assert.equal(tick({...edge,enemies:[{id:1,x:100,y:PLAYER_Y-20,hp:1,kind:0}]}).status,'over');
});
test('enemy fire is deterministic, leaves screen and timers expire',()=>{
 let s={...createGame(),enemyFireCooldown:0,shield:.01,shieldCooldown:.01,invincible:.01,shots:[{x:10,y:-30,enemy:false},{x:10,y:HEIGHT+30,enemy:true}]};
 const a=tick(s); assert.deepEqual(a,tick(s)); assert.equal(a.shots.length,1);assert.equal(a.shots[0].enemy,true);
 assert.equal(a.shield,0);assert.equal(a.shieldCooldown,0);assert.equal(a.invincible,0);
});
