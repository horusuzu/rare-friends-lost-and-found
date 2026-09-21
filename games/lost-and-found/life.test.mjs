import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife, act, depart, choose, returnHome, build, restore, rename, greeting, PROJECTS } from './life.ts';
const start = () => newLife('77251', 1);
test('a Friend has a persistent personal identity and care needs', () => {
 const s = start(); assert.equal(s.friendId, '77251'); assert.equal(s.day, 1); assert.equal(s.location, 'home'); assert.ok(s.energy > 0); assert.notEqual(newLife('77252').favorite, s.favorite);
 assert.equal(rename(s, '  まめ  ').name, 'まめ'); assert.equal(rename(s, ' ').name, s.name);
});
test('food preference changes bond and records a memory; full Friend cannot be spam fed', () => {
 const s = start(); const fed = act(s, s.favorite); assert.ok(fed.bond > s.bond); assert.ok(fed.hunger > s.hunger); assert.ok(fed.journal.length); assert.equal(act(fed, s.favorite), fed);
});
test('walk and rest are distinct care choices; low energy can recover without purchases', () => {
 const s = act(start(), 'walk'); assert.ok(s.energy < start().energy); assert.ok(s.bond > 0);
 const slept = act({...s, energy: 0}, 'sleep'); assert.equal(slept.energy, 100); assert.equal(slept.day, 2); assert.equal(slept.location, 'home');
 assert.match(greeting({...slept,hunger:60}), /まって|おはよう|おかえり/);
});
test('outing requires energy and locked areas cannot be entered', () => {
 const s = start(); assert.equal(depart(s, 'lighthouse'), s); const tired={...s,energy:0}; assert.equal(depart(tired,'beach'),tired); assert.equal(depart({...s, energy:0},'beach').location,'home');
 const trip = depart(s, 'beach'); assert.equal(trip.location, 'beach'); assert.equal(act(trip, 'sleep'),trip); assert.equal(depart(trip,'forest'),trip);
});
test('choices produce different resources and memories; returning banks the trip', () => {
 const trip = depart(start(), 'beach'); assert.equal(returnHome(trip), trip);
 const a = choose(trip, 0); const b = choose(trip, 1); assert.notDeepEqual(a.bag, b.bag); assert.notEqual(a.bond, b.bond); assert.equal(choose(a, 1), a);
 const home = returnHome(a); assert.equal(home.location, 'home'); assert.equal(home.cards.length, 1); assert.ok(home.shells > start().shells); assert.equal(returnHome(home), home);
});
test('construction spends materials once and unlocks a real destination', () => {
 const s = {...start(), wood: 30, shells: 30, seeds: 30};
 const bridge = build(s,'bridge'); assert.ok(bridge.wood < s.wood); assert.equal(build(bridge,'bridge'), bridge); assert.equal(depart(bridge,'lighthouse').location,'lighthouse');
 assert.equal(build({...s,wood:0},'bridge').projects.length,0);
 for (const p of PROJECTS) assert.ok(build(s,p.id).projects.includes(p.id));
});
test('garden grows after a night and can be harvested only once', () => {
 const garden = build({...start(),wood:10,seeds:10},'garden'); const morning = act(garden,'sleep'); assert.equal(morning.gardenReady,true);
 const harvest=act(morning,'harvest'); assert.ok(harvest.flowers>0); assert.equal(act(harvest,'harvest'),harvest);
});
test('all destinations and choices resolve and make distinct postcards', () => {
 let s={...start(),projects:['bridge']};
 for (const d of ['beach','forest','plaza','lighthouse']) for (const c of [0,1]) { s=returnHome(choose(depart({...s,energy:100,hunger:100},d),c)); }
 assert.equal(s.cards.length,8); assert.ok(s.journal.length<=24); assert.ok(greeting(s).length);
});
test('save roundtrip preserves a trip and rejects another Friend, corrupted or future saves', () => {
 const s=choose(depart(start(),'forest'),1); assert.deepEqual(restore(JSON.stringify(s),'77251'),s);
 for (const raw of ['oops', '{}', JSON.stringify({...s,friendId:'99'}), JSON.stringify({...s,version:900}), JSON.stringify({...s,energy:NaN}), JSON.stringify({...s,wood:-1}),JSON.stringify({...s,location:'unknown'}), JSON.stringify({...s,cards:[{id:'evil'}]})]) assert.equal(restore(raw,'77251'),null);
});
test('invalid action/choice/project does not mutate state and journal is bounded', () => {
 let s=start(); assert.equal(act(s,'unknown'),s); assert.equal(build(s,'unknown'),s); assert.equal(choose(s,0),s); assert.equal(choose(depart(s,'beach'),8).choice,null);
 for(let i=0;i<40;i++) s=act(s,'sleep'); assert.equal(s.journal.length,24);
});
test('care feedback and malformed storage edge cases',()=>{
 const s=start(); assert.match(greeting({...s,energy:1}),/ねむい/); assert.match(greeting({...s,hunger:1}),/おなか/); assert.match(greeting({...s,gardenReady:true}),/お花/); assert.ok(greeting(s));
 assert.equal(act({...s,energy:0},'walk').energy,0); assert.match(act({...s,projects:['picnic']},'walk').message,/ベンチ/); assert.equal(act(s,'soup').bond,2);
 assert.equal(restore(null,'77251'),null); assert.equal(restore('x'.repeat(32001),'77251'),null);
 for(const patch of [{day:0},{projects:['bad']},{projects:['garden','garden']},{choice:2},{choice:0},{bag:{}},{bag:{wood:5,seeds:0,shells:0}},{journal:[{day:0,text:'x'}]},{cards:[{id:'beach-0',place:'beach',choice:0,day:1,title:'ok',text:7}]},{name:''},{gardenReady:'yes'}]) assert.equal(restore(JSON.stringify({...s,...patch}),'77251'),null);
});
test('language preference survives save without changing progress; legacy saves work and invalid locales fail',()=>{
 const original=act(start(),'walk'), saved={...original,language:'en'};
 assert.equal(restore(JSON.stringify(saved),original.friendId)?.language,'en');
 assert.equal(restore(JSON.stringify(original),original.friendId)?.bond,original.bond);
 assert.equal(restore(JSON.stringify({...saved,language:'xx'}),original.friendId),null);
});
