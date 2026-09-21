import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as i18n from './life-i18n.ts';
import { PLACES, PROJECTS, newLife, act, depart, choose, returnHome, build, greeting } from './life.ts';
const ja = /[\u3040-\u30ff\u3400-\u9fff]/;
test('Japanese is unchanged and unknown nicknames are preserved', () => {
 assert.equal(typeof i18n.translate, 'function');
 for (const text of ['こんにちは、ぽん！', 'My Friend', '', 'おうち']) assert.equal(i18n.translate(text,'ja'),text);
 assert.equal(i18n.translate('ぽんちゃん','en'),'ぽんちゃん');
 assert.equal(i18n.translate('ぽんちゃんと、島ぐらし。','en'),'Island life with ぽんちゃん.');
});
test('all canonical stories and model messages translate without mutating saved life', () => {
 const initial=newLife('597'); const original=JSON.stringify(initial);
 const texts=[initial.message,greeting(initial),greeting({...initial,day:2}),greeting({...initial,energy:1}),greeting({...initial,hunger:1}),greeting({...initial,gardenReady:true})];
 for(const action of ['toast','berry','soup','walk','sleep','harvest'])texts.push(act({...initial,gardenReady:true},action).message);
 texts.push(act({...initial,projects:['picnic']},'walk').message);
 for(const [id,p] of Object.entries(PLACES)){
  texts.push(p.name,p.subtitle,p.question,...p.choices,...p.results,...p.titles);
  for(const choice of [0,1]) {const returned=returnHome(choose(depart({...initial,projects:['bridge']},id),choice));texts.push(returned.message,greeting(returned));}
 }
 for(const p of PROJECTS) texts.push(p.name,p.description,build({...initial,wood:99,shells:99,seeds:99},p.id).message,`${p.name}は完成`,`${p.name}をつくる`);
 for(const text of texts) assert.equal(ja.test(i18n.translate(text,'en')),false,text);
 assert.equal(JSON.stringify(initial),original);
});
test('every static Japanese UI string has an English translation',()=>{
 for(const file of ['index.tsx','life-art.tsx','reward-panel.tsx']){
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  const strings=[...source.matchAll(/(['"])((?:(?!\1)[^\n])*?)\1/g)].map(m=>m[2]).filter(s=>ja.test(s)&&!/[{}<>]/.test(s));
  for(const text of strings)assert.equal(ja.test(i18n.translate(text,'en')),false,`${file}: ${text}`);
 }
});
test('dynamic UI captions preserve names and numbers',()=>{
 assert.equal(i18n.translate('27日目','en'),'Day 27');
 assert.equal(i18n.translate('まめと過ごした 3日目','en'),'Day 3 with まめ');
 assert.equal(i18n.translate('まめに話しかける','en'),'Talk to まめ');
 assert.equal(i18n.translate('まめとの思い出のポストカード','en'),'A memory postcard with まめ');
 assert.equal(i18n.translate('前回確認・未受取 1.23 RF · Genesis #597','en'),'Last checked · Unclaimed 1.23 RF · Genesis #597');
});
