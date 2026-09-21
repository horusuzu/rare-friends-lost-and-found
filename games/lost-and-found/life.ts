export type Place = 'home' | 'beach' | 'forest' | 'plaza' | 'lighthouse';
export type Food = 'toast' | 'berry' | 'soup';
export type Project = 'garden' | 'bridge' | 'picnic';
export type Bag = { wood: number; shells: number; seeds: number };
export type Memory = { day: number; text: string };
export type Card = { id: string; place: Exclude<Place,'home'>; choice: number; day: number; title: string; text: string };
export type Life = {
 language?: 'ja' | 'en';
 version: 2; friendId: string; name: string; favorite: Food; day: number; hunger: number; energy: number; bond: number;
 wood: number; shells: number; seeds: number; flowers: number; projects: Project[]; gardenReady: boolean;
 location: Place; choice: number | null; bag: Bag; cards: Card[]; journal: Memory[]; message: string; outings: number;
};
export const PLACES = {
 beach: { name:'しおかぜ海岸', icon:'🐚', subtitle:'波の音を、ふたりぶん。', question:'波打ち際で、小さな貝がきらり。その隣では、子ガメが砂に足をとられている。', choices:['貝がらを一緒に探す','子ガメを海まで送る'], results:['同じ色の貝をふたつ見つけた。ひとつはきみに、もうひとつはぼくに。','小さな足あとが海へ続く。見えなくなるまで、ふたりで手を振った。'], titles:['おそろいの貝がら','小さな旅立ち'] },
 forest: { name:'こもれびの森',icon:'🌳',subtitle:'寄り道が、宝ものになる。',question:'倒れた枝の向こうに、花の種が落ちている。どっちをおうちに持って帰ろう？',choices:['枝を集めて、何かつくろう','花の種を探してみよう'],results:['ちょうどいい枝を見つけるたび、得意げな顔。帰ったら何をつくろう。','小さな種を両手で包んだ。「咲いたら、いちばんに見せるね」'],titles:['ふたりの工作日和','まだ見ぬ花の約束'] },
 plaza: { name:'こむぎの広場',icon:'🥐',subtitle:'焼きたての匂いに、つられて。',question:'パン屋さんから、焼きたてのいい匂い。広場のベンチもちょうど空いている。',choices:['パンづくりを手伝う','ベンチで半分こする'],results:['粉だらけの顔を見て、ふたりで笑った。お礼にもらった種をポケットに。','大きいほうを差し出したら、もっと大きい笑顔が返ってきた。'],titles:['こむぎ色の午後','はんぶんこは、倍うれしい'] },
 lighthouse: { name:'はじまりの灯台',icon:'⛵',subtitle:'ふたりで架けた橋の、その先。',question:'新しい橋を渡った先。灯台の足元に古い絵はがき、空には夕焼けが広がっている。',choices:['古い絵はがきを拾う','夕焼けを一緒に眺める'],results:['昔ここに住んだ誰かの「また会おう」。今度はぼくらの思い出を重ねよう。','何も話さず、隣に座った。この静けさも、きっと忘れない。'],titles:['だれかの、いつかの島','言葉のいらない夕焼け'] },
} as const;
export const PROJECTS: {id:Project;name:string;icon:string;wood:number;shells:number;seeds:number;description:string}[] = [
 {id:'garden',name:'小さな花畑',icon:'🌷',wood:2,shells:0,seeds:1,description:'ひと晩休むと花が咲く。摘んだ花はお部屋に。'},
 {id:'bridge',name:'灯台への橋',icon:'🌉',wood:5,shells:2,seeds:0,description:'新しいお出かけ先「はじまりの灯台」が開く。'},
 {id:'picnic',name:'おそろいベンチ',icon:'🪑',wood:3,shells:3,seeds:0,description:'家の前にふたりの居場所。散歩のなかよし度が増える。'},
];
const emptyBag = ():Bag => ({wood:0,shells:0,seeds:0});
const cap = (n:number) => Math.max(0,Math.min(100,n));
export function newLife(friendId:string, _now=Date.now()):Life {
 return {version:2,friendId,name:'まめ',favorite:(['toast','berry','soup'] as const)[Number(BigInt(friendId)%3n)],day:1,hunger:55,energy:85,bond:0,wood:2,shells:0,seeds:1,flowers:0,projects:[],gardenReady:false,location:'home',choice:null,bag:emptyBag(),cards:[],journal:[],message:'はじめまして。きみと、ここで暮らしたいな。',outings:0};
}
function remember(s:Life,text:string):Life { return {...s,message:text,journal:[{day:s.day,text},...s.journal].slice(0,24)}; }
export function rename(s:Life,name:string):Life { const clean=name.trim().slice(0,20); return clean ? {...s,name:clean}:s; }
export function greeting(s:Life):string {
 if(s.energy<25) return 'ちょっとねむい…。おうちで、となりにいて。';
 if(s.hunger<30) return 'おなかが、くうって鳴っちゃった。';
 if(s.gardenReady) return 'おはよう！ お花が咲いたよ。一緒に見に行こう。';
 if(s.cards.length) return `おかえり。${PLACES[s.cards.at(-1)!.place].name}、また一緒に行きたいな。`;
 return s.day>1 ? 'おはよう。今日もきみをまってたよ。' : 'ねえ、今日は何しよう？';
}
export function act(s:Life,action:string):Life {
 if(s.location!=='home') return s;
 if(['toast','berry','soup'].includes(action)) {
  if(s.hunger>=90) return s;
  const favorite=action===s.favorite;
  return remember({...s,hunger:cap(s.hunger+40),energy:cap(s.energy+8),bond:s.bond+(favorite?4:2)},favorite?'これ、だいすき！ 覚えていてくれたんだね。':'もぐもぐ。きみと食べると、おいしいね。');
 }
 if(action==='walk') {
  if(s.energy<15) return s;
  return remember({...s,energy:cap(s.energy-12),hunger:cap(s.hunger-10),bond:s.bond+(s.projects.includes('picnic')?5:2)},s.projects.includes('picnic')?'散歩の帰り、おそろいベンチでひと休み。「ここ、ぼくらの席だね」':'おうちのまわりを、てくてく。帰り道では、少しだけ手が近くなった。');
 }
 if(action==='sleep') return remember({...s,day:s.day+1,energy:100,hunger:Math.max(25,s.hunger-20),gardenReady:s.projects.includes('garden')},'おやすみ。あしたも、ここで会おうね。');
 if(action==='harvest' && s.gardenReady) return remember({...s,gardenReady:false,flowers:s.flowers+3,bond:s.bond+3},'育てた花を、お部屋に飾った。前よりちょっと、ぼくらのおうち。');
 return s;
}
export function depart(s:Life,place:Place):Life {
 if(s.location!=='home'||place==='home'||!(place in PLACES)||s.energy<20||(place==='lighthouse'&&!s.projects.includes('bridge'))) return s;
 return {...s,location:place,choice:null,energy:cap(s.energy-20),hunger:cap(s.hunger-12),bag:emptyBag(),message:PLACES[place].question};
}
export function choose(s:Life,choice:number):Life {
 if(s.location==='home'||s.choice!==null||![0,1].includes(choice)) return s;
 const gifts:Record<Exclude<Place,'home'>,Bag[]>={beach:[{wood:0,shells:3,seeds:0},{wood:0,shells:1,seeds:1}],forest:[{wood:3,shells:0,seeds:0},{wood:1,shells:0,seeds:3}],plaza:[{wood:1,shells:0,seeds:2},{wood:0,shells:1,seeds:0}],lighthouse:[{wood:1,shells:2,seeds:0},{wood:0,shells:1,seeds:1}]};
 return {...s,choice,bag:gifts[s.location][choice],bond:s.bond+(choice===1?5:2),hunger:s.location==='plaza'?cap(s.hunger+30):s.hunger,message:PLACES[s.location].results[choice as 0|1]};
}
export function returnHome(s:Life):Life {
 if(s.location==='home'||s.choice===null) return s;
 const place=s.location,choice=s.choice,id=`${place}-${choice}`,info=PLACES[place];
 const card:Card={id,place,choice,day:s.day,title:info.titles[choice as 0|1],text:info.results[choice as 0|1]};
 return remember({...s,location:'home',choice:null,bag:emptyBag(),wood:s.wood+s.bag.wood,shells:s.shells+s.bag.shells,seeds:s.seeds+s.bag.seeds,outings:s.outings+1,cards:s.cards.some(c=>c.id===id)?s.cards:[...s.cards,card]},`${info.name}から、ただいま。${card.text}`);
}
export function build(s:Life,id:string):Life {
 const p=PROJECTS.find(p=>p.id===id);
 if(!p||s.location!=='home'||s.projects.includes(p.id)||s.wood<p.wood||s.shells<p.shells||s.seeds<p.seeds) return s;
 return remember({...s,wood:s.wood-p.wood,shells:s.shells-p.shells,seeds:s.seeds-p.seeds,projects:[...s.projects,p.id],bond:s.bond+5},`${p.name}ができた！「ふたりでつくったから、特別だね」`);
}
/** Validate local untrusted saves, never treating them as ownership or real balances. */
export function restore(raw:string|null,friendId:string):Life|null {
 if(!raw||raw.length>32000)return null;
 try {
  const s=JSON.parse(raw) as Life;
  if(s?.language !== undefined && s.language !== 'ja' && s.language !== 'en')return null;
  if(!s||s.version!==2||s.friendId!==friendId||typeof s.name!=='string'||!s.name.trim()||s.name.length>20||!['toast','berry','soup'].includes(s.favorite)||!['home',...Object.keys(PLACES)].includes(s.location))return null;
  for(const k of ['day','hunger','energy','bond','wood','shells','seeds','flowers','outings'] as const) if(!Number.isSafeInteger(s[k])||s[k]<0||s[k]>1e9)return null;
  if(s.day<1||s.hunger>100||s.energy>100||typeof s.gardenReady!=='boolean'||typeof s.message!=='string'||s.message.length>600)return null;
  if(!Array.isArray(s.projects)||s.projects.length>3||new Set(s.projects).size!==s.projects.length||s.projects.some(p=>!PROJECTS.some(v=>v.id===p)))return null;
  if(s.choice!==null&&s.choice!==0&&s.choice!==1)return null;
  if(s.location==='home'&&s.choice!==null)return null;
  if(!s.bag||Object.values(s.bag).length!==3||!['wood','shells','seeds'].every(k=>Number.isSafeInteger(s.bag[k as keyof Bag])&&s.bag[k as keyof Bag]>=0&&s.bag[k as keyof Bag]<=3))return null;
  if(!Array.isArray(s.journal)||s.journal.length>24||s.journal.some(m=>!m||!Number.isSafeInteger(m.day)||m.day<1||typeof m.text!=='string'||m.text.length>600))return null;
  if(!Array.isArray(s.cards)||s.cards.length>8||s.cards.some(c=>!c||!(c.place in PLACES)||![0,1].includes(c.choice)||c.id!==`${c.place}-${c.choice}`||typeof c.title!=='string'||c.title.length>100||typeof c.text!=='string'||c.text.length>600||!Number.isSafeInteger(c.day)||c.day<1))return null;
  return s;
 }catch{return null;}
}
