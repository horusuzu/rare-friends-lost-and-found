import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, step, WIDTH, HEIGHT, FLOOR, DROP_Y, DANGER_Y, RADII, TIERS, TIER_POINTS, radius} from './engine.ts';
const idle = {move:0, aim:null, drop:false};
const run = (s, seconds, input=idle) => { for (let t=0; t<seconds; t+=.03) s = step(s,input,.03); return s; };
const body = (id, tier, x, y, extra={}) => ({id, tier, x, y, vx:0, vy:0, age:5, ...extra});

test('new game is deterministic, immutable and ignores invalid time',()=>{
 const a=createGame(7), b=createGame(7), before=structuredClone(a);
 assert.deepEqual(a,b); assert.equal(a.status,'playing'); assert.equal(a.bodies.length,0); assert.equal(a.score,0);
 assert.ok(a.current>=1&&a.current<=5&&a.next>=1&&a.next<=5);
 assert.equal(TIERS,11); assert.equal(RADII.length,11); assert.equal(TIER_POINTS.length,11);
 assert.ok(RADII.every((r,i)=>i===0||r>RADII[i-1])); assert.ok(2*RADII[10]<WIDTH);
 assert.ok(DROP_Y<DANGER_Y && DANGER_Y<FLOOR && FLOOR<=HEIGHT);
 step(a,{...idle,drop:true},.03); assert.deepEqual(a,before);
 assert.equal(step(a,idle,NaN),a); assert.equal(step(a,idle,-1),a); assert.equal(step(a,idle,0),a);
 const seq=s=>{const out=[];for(let i=0;i<30;i++){out.push(s.current);s=run(step(s,{...idle,drop:true},.03),.7);}return out;};
 const tiers=seq(createGame(3)); assert.ok(tiers.every(t=>t>=1&&t<=5)); assert.ok(new Set(tiers).size>=3); assert.deepEqual(tiers,seq(createGame(3)));
});

test('aim moves and clamps to the current piece, absolute aim wins',()=>{
 let s=createGame(1); const r=radius(s.current);
 for(let i=0;i<200;i++) s=step(s,{...idle,move:1},.03); assert.equal(s.aimX,WIDTH-r);
 for(let i=0;i<200;i++) s=step(s,{...idle,move:-1},.03); assert.equal(s.aimX,r);
 assert.equal(step(s,{...idle,aim:123.5},.03).aimX,123.5);
 assert.equal(step(s,{...idle,aim:-50},.03).aimX,r); assert.equal(step(s,{...idle,aim:Number.NaN},.03).aimX,r);
 assert.equal(step(s,{...idle,move:Number.POSITIVE_INFINITY},.03).aimX,r);
});

test('dropping spawns the current piece, promotes next and respects cooldown',()=>{
 let s=createGame(2); const {current,next}=s;
 s=step(s,{move:0,aim:200,drop:true},.01);
 assert.equal(s.bodies.length,1); assert.equal(s.bodies[0].tier,current); assert.equal(s.bodies[0].x,200); assert.ok(s.bodies[0].y>=DROP_Y);
 assert.equal(s.current,next); assert.ok(s.cooldown>0);
 s=step(s,{...idle,drop:true},.01); assert.equal(s.bodies.length,1);
 s=run(s,.7); s=step(s,{...idle,drop:true},.01); assert.equal(s.bodies.length,2);
});

test('a dropped piece falls and comes to rest on the floor',()=>{
 let s={...createGame(1),bodies:[body(1,3,200,DROP_Y,{age:0})],nextId:2};
 s=run(s,3); const b=s.bodies[0];
 assert.ok(Math.abs(b.y-(FLOOR-radius(3)))<1.5,`y=${b.y}`); assert.ok(Math.abs(b.vy)<30); assert.ok(Math.abs(b.x-200)<1);
});

test('touching equal tiers merge once into the next tier and score',()=>{
 const r=radius(2);
 let s={...createGame(1),bodies:[body(1,2,150,FLOOR-r),body(2,2,150+2*r-2,FLOOR-r)],nextId:3};
 s=step(s,idle,.03);
 assert.equal(s.bodies.length,1); assert.equal(s.bodies[0].tier,3); assert.ok(Math.abs(s.bodies[0].x-(150+r-1))<3);
 assert.equal(s.score,TIER_POINTS[2]); assert.equal(s.maxTier,3); assert.equal(s.merges,1);
 s={...createGame(1),bodies:[body(1,1,100,FLOOR-10),body(2,1,110,FLOOR-10),body(3,1,120,FLOOR-10)],nextId:4};
 s=step(s,idle,.03); assert.deepEqual(s.bodies.map(b=>b.tier).sort(),[1,2]);
});

test('different tiers push apart without merging',()=>{
 let s={...createGame(1),bodies:[body(1,4,200,FLOOR-radius(4)),body(2,5,205,FLOOR-radius(4)-10)],nextId:3};
 s=run(s,3); assert.equal(s.bodies.length,2);
 const [a,b]=s.bodies; const d=Math.hypot(a.x-b.x,a.y-b.y); assert.ok(d>=radius(4)+radius(5)-2,`overlap ${radius(4)+radius(5)-d}`);
 assert.equal(s.score,0);
});

test('two Friend orbs vanish for a bonus',()=>{
 const r=radius(11);
 let s={...createGame(1),bodies:[body(1,11,r,FLOOR-r),body(2,11,3*r-4,FLOOR-r)],nextId:3};
 s=step(s,idle,.03); assert.equal(s.bodies.length,0); assert.equal(s.score,TIER_POINTS[10]*2); assert.equal(s.maxTier,11);
});

test('a heavy pile stays inside the jar with finite, bounded motion',()=>{
 let s=createGame(11);
 for(let i=0;i<45&&s.status==='playing';i++){s=step(s,{move:0,aim:40+(i*97)%320,drop:true},.03);s=run(s,.6);}
 s=run(s,2);
 for(const b of s.bodies){const r=radius(b.tier);
  assert.ok([b.x,b.y,b.vx,b.vy].every(Number.isFinite));
  assert.ok(b.x>=r-.5&&b.x<=WIDTH-r+.5,`x ${b.x}`); assert.ok(b.y<=FLOOR-r+.5,`y ${b.y}`);
  assert.ok(Math.hypot(b.vx,b.vy)<=1400);}
 assert.ok(s.maxTier>=4); assert.ok(s.score>0);
});

test('resting above the line for two seconds ends the run; brief crossings do not',()=>{
 const r=radius(1);
 const above=body(1,1,200,DANGER_Y-5,{age:5});
 let s={...createGame(1),bodies:[above],nextId:2};
 s=step(s,idle,.03); assert.ok(s.danger>0); assert.equal(s.status,'playing');
 const fresh={...createGame(1),bodies:[body(1,1,200,DANGER_Y-5,{age:0})],nextId:2};
 assert.equal(step(fresh,idle,.03).danger,0);
 let held={...createGame(1),bodies:[above],nextId:2,danger:1.99};
 held=step({...held,bodies:[{...above,y:DANGER_Y-5,vy:0}]},idle,.001);
 held={...held,bodies:[{...above,y:DANGER_Y-5,vy:0}]}; held=step(held,idle,.03);
 assert.equal(held.status,'over'); assert.equal(step(held,{...idle,drop:true},.03),held);
 let low={...createGame(1),bodies:[body(1,1,200,FLOOR-r)],danger:1.5,nextId:2}; low=step(low,idle,.03); assert.equal(low.danger,0);
});
