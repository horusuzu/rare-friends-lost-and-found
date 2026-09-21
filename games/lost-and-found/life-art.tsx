import {translate,type Language} from './life-i18n.js';
import type { GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { FriendPixels } from './art.js';
import {PiggyIcon} from './reward-panel.js';
import type { Life, Card } from './life.js';
export function LifeScene({life,sprites,reaction,onPet,onBank,bankDisabled,language='ja'}:{language?:Language;life:Life;sprites:GenerationSprites;reaction:string;onPet:()=>void;onBank?:()=>void;bankDisabled?:boolean}) {
 const t=(text:string)=>translate(text,language);
 const place=life.location,home=place==='home',sea=place==='beach'||place==='lighthouse';
 return <div className={`life-scene scene-${place} reaction-${reaction}`}>
  <svg viewBox="0 0 600 350" role="img" aria-label={home?t("少しずつ育つ、ふたりのおうち"):t("Friendと訪れた島の風景")}>
   <defs><pattern id="wall" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 9v6M9 12h6" stroke="#bdcebd" opacity=".4"/></pattern></defs>
   <rect width="600" height="350" fill={home?'#ebedcf':sea?'#c7e4e3':'#d8e9cf'}/>
   {home?<>
    <rect width="600" height="230" fill="url(#wall)"/><path d="M0 225h600v125H0" fill="#dcc49d"/><path d="M0 225h600M0 245h600M0 295h600M0 340h600M110 245v50m250 0v45M460 245v50" stroke="#b79c76" strokeWidth="2" opacity=".5"/>
    <rect x="48" y="45" width="125" height="120" rx="45" fill="#819c85"/><rect x="57" y="54" width="107" height="102" rx="36" fill="#c3e3df"/><path d="M111 54v102M57 112h107" stroke="#faf4db" strokeWidth="7"/><circle cx="135" cy="78" r="14" fill="#f7d883"/>
    <rect x="435" y="105" width="108" height="10" rx="5" fill="#aa805b"/><rect x="452" y="70" width="20" height="34" rx="3" fill="#d99270"/><rect x="477" y="66" width="15" height="38" rx="3" fill="#82a995"/>
    <path d="M430 220h124v60H430z" fill="#ac8664"/><rect x="420" y="211" width="145" height="14" rx="6" fill="#c6996f"/>
    <ellipse cx="282" cy="284" rx="146" ry="37" fill="#b2bf90"/><ellipse cx="282" cy="284" rx="130" ry="29" fill="none" stroke="#f3ecca" strokeWidth="3" strokeDasharray="7 5"/>
    <path d="M35 277v-46q0-15 17-15h57q17 0 17 15v46" fill="#91ac9c"/><path d="M35 271h91v18H35z" fill="#648979"/><path d="M44 289v12m72-12v12" stroke="#736b53" strokeWidth="6"/>
    {life.flowers>0&&<g><path d="M498 211v-35m0 23-15-15m15 8 13-13" stroke="#688463" strokeWidth="4"/><path d="M483 197h31l-6 16h-19z" fill="#e2b476"/>{[[-12,0],[0,-13],[12,-3]].map(([x,y],i)=><g key={i} transform={`translate(${498+x} ${173+y})`}><circle r="10" fill="#d68f8a"/><circle r="4" fill="#fae8a4"/></g>)}</g>}
    {life.shells>0&&<path d="M529 204l-8-10q8-16 17 0z" fill="#f1c6a9" stroke="#bc8c78"/>}
    {life.cards.length>0&&<g transform="translate(253 58) rotate(-5)"><rect width="80" height="65" rx="4" fill="#fbf3db" stroke="#ae9674" strokeWidth="3"/><path d="M8 44l22-23 20 15 22-19v39H8z" fill="#a1bfa2"/><circle cx="56" cy="16" r="7" fill="#e4ba72"/></g>}
   </>:<>
    <circle cx="487" cy="57" r="28" fill={place==='lighthouse'?'#eab083':'#f7df98'}/><path d="M64 63h72m-29-14h64m200 38h90" stroke="#f7f4df" strokeWidth="14" strokeLinecap="round"/>
    <path d="M0 167Q160 115 300 181T600 151V350H0" fill={sea?'#92c6c3':'#a3be90'}/>
    <path d="M0 289Q140 217 300 264T600 220V350H0" fill={sea?'#efdeaf':'#c9d2a2'}/>
    {sea?<><path d="M35 216h74m93-24h44m170 30h82m-340 12h45" stroke="#e2f0dc" strokeWidth="3" strokeLinecap="round"/><path d="M105 295l-12-16q15-20 29 0zM470 310l-10-16q13-18 25 0z" fill="#dca78d"/></>:<>{[50,135,470,550].map((x,i)=><g key={x} transform={`translate(${x} ${125+i%2*35})`}><path d="M0 0v110" stroke="#8e8664" strokeWidth="12"/><ellipse rx="42" ry="65" fill={i%2?'#749a78':'#86ac80'}/><path d="M-16-14q15 12 31 0" stroke="#a9c493" fill="none" strokeWidth="5"/></g>)}</>}
    {place==='lighthouse'&&<g transform="translate(390 73)"><path d="M-18 161L0 17h47l18 144z" fill="#fbefd4"/><path d="M-8 78h65l6 35H-13z" fill="#cd8876"/><path d="M-7 17V-9h62v26z" fill="#f5d18a" stroke="#657c71" strokeWidth="5"/><path d="M-14-10l38-29 40 29z" fill="#657c71"/></g>}
    {place==='plaza'&&<g transform="translate(310 60)"><rect width="165" height="175" rx="6" fill="#f1dcac"/><path d="M-15 20L80-30l100 50z" fill="#af9472"/><path d="M-7 49h181v26H-7" fill="#d58d76"/><path d="M12 49v26m31-26v26m31-26v26m31-26v26m31-26v26m31-26v26" stroke="#f3e8c4" strokeWidth="15"/><rect x="60" y="115" width="45" height="60" rx="20" fill="#79918a"/></g>}
   </>}
   {home&&life.projects.includes('picnic')&&<g transform="translate(169 216)"><path d="M0 5h54v11H0zm5-20h44V0H5z" fill="#a37957"/><path d="M8 16v15m38-15v15" stroke="#766a51" strokeWidth="5"/></g>}
   {home&&life.projects.includes('garden')&&<g transform="translate(552 280)"><ellipse rx="29" ry="10" fill="#9f8461"/>{[-15,0,15].map(x=><g key={x} transform={`translate(${x} 0)`}><path d="M0 0v-20" stroke="#6c8d5b" strokeWidth="3"/><circle cy="-22" r="7" fill={life.gardenReady?'#e8a393':'#9fb77b'}/></g>)}</g>}
  </svg>
  <button className="living-friend" type="button" onClick={onPet} aria-label={t(`${life.name}に話しかける`)}><span className="friend-emote">{reaction==='eat'?'♡':reaction==='sleep'?'z z':reaction==='walk'?'♪':'♡'}</span><FriendPixels sprites={sprites} size={120}/><span className="pixel-shadow"/></button>
  {home&&onBank&&<button type="button" className="scene-piggy" aria-label={t("部屋の貯金箱")} disabled={bankDisabled} onClick={onBank}><PiggyIcon/></button>}
  <span className="scene-label">{home?'OUR LITTLE HOME':place==='beach'?'SALT AIR & SMALL TREASURES':place==='forest'?'TAKE THE LONG WAY HOME':place==='plaza'?'WARM BREAD, WARM COMPANY':'A BRIDGE WE BUILT TOGETHER'}</span>
 </div>;
}
export function memoryImage(card:Card,life:Life,sprites:GenerationSprites,language:Language='ja'):string {
 const t=(text:string)=>translate(text,language);
 const c=document.createElement('canvas');c.width=1000;c.height=740;const x=c.getContext('2d');if(!x)throw new Error(t("画像を作れませんでした。"));
 x.fillStyle='#faf3df';x.fillRect(0,0,1000,740);x.strokeStyle='#93aa8d';x.lineWidth=3;x.strokeRect(28,28,944,684);
 x.fillStyle=card.place==='forest'?'#bfcea8':'#bdd8d1';x.fillRect(55,55,890,360);x.fillStyle='#ecdfb1';x.beginPath();x.ellipse(500,365,360,55,0,0,Math.PI*2);x.fill();
 x.fillStyle='#f7d687';x.beginPath();x.arc(790,137,37,0,Math.PI*2);x.fill();
 x.fillStyle='#35584b';sprites.clips.idle.down[0].rows.forEach((row,y)=>[...row].forEach((p,col)=>{if(p==='#')x.fillRect(390+col*12,176+y*12,12,12);}));
 x.fillStyle='#38584b';x.font='bold 32px sans-serif';x.fillText(t(card.title),65,480,870);x.font='22px sans-serif';x.fillText(t(`${life.name}と過ごした ${card.day}日目`),65,524);
 x.font='20px sans-serif';
 const text=t(card.text);
 if(language==='en'){
  let line='',row=0;
  for(const word of text.split(/\s+/)){
   const next=line?`${line} ${word}`:word;
   if(line&&x.measureText(next).width>870){x.fillText(line,65,570+row*32);row++;line=word;}else line=next;
  }
  if(line)x.fillText(line,65,570+row*32);
 }else{const chars=[...text];for(let i=0;i<chars.length;i+=37)x.fillText(chars.slice(i,i+37).join(''),65,570+Math.floor(i/37)*32);}
 x.font='15px monospace';x.fillText(`${sprites.collection === "genesis" ? "GENESIS" : "FRIEND"} #${life.friendId} / OUR LITTLE ISLAND / PERSONAL KEEPSAKE`,65,680);return c.toDataURL('image/png');
}
