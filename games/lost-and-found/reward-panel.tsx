import {useEffect,useRef,useState} from 'react';
import type {GameClient,FriendRewardsSnapshot,NFTRewardAmounts} from '@rarefriends/friendsdk/game';
import {translate,type Language} from './life-i18n.js';
import {tokenAmount} from './reward-format.js';
export function PiggyIcon(){return <svg viewBox="0 0 80 64" aria-hidden="true"><ellipse cx="39" cy="33" rx="26" ry="20" fill="#d9a384"/><path d="M19 20V6l16 10" fill="#d9a384"/><path d="M23 19V12l8 5" fill="#f4d0ad"/><rect x="57" y="26" width="16" height="15" rx="5" fill="#e8b697"/><circle cx="64" cy="32" r="2" fill="#876650"/><circle cx="68" cy="32" r="2" fill="#876650"/><circle cx="50" cy="22" r="2.5" fill="#526750"/><path d="M23 47v10m25-10v10" stroke="#b78367" strokeWidth="9" strokeLinecap="round"/><path d="M13 31Q1 35 7 23" fill="none" stroke="#d9a384" strokeWidth="4"/><path d="M32 16h13" stroke="#8f6d54" strokeWidth="3" strokeLinecap="round"/></svg>;}
function Amounts({value,title,prefix='',language='ja'}:{language?:Language;value:NFTRewardAmounts;title:string;prefix?:string}){
 const t=(text:string)=>translate(text,language);
 return <section className="real-account"><div className="real-account-title"><h3>{title}</h3><span className={value.active?'earning-active':'earning-inactive'}>{value.active?t("アクティブ"):t("現在は報酬停止中")}</span></div>
 <p className="amount-heading">{t("未受取の報酬")}</p><div className="real-amounts"><div data-testid={`${prefix}claimable-rf`}><strong>{tokenAmount(value.claimableRF)}</strong><span>RF</span></div><div data-testid={`${prefix}claimable-weth`}><strong>{tokenAmount(value.claimableWETH,8)}</strong><span>WETH</span></div></div>
 <div className="wallet-amounts"><span>{t("NFTのお財布残高")}</span><p data-testid={`${prefix}wallet-rf`}><b>{tokenAmount(value.walletRF)}</b> RF</p><p data-testid={`${prefix}wallet-weth`}><b>{tokenAmount(value.walletWETH,8)}</b> WETH</p></div>
 {!value.active&&<p className="hint">{t("新しい報酬の割り当ては停止中です。以前に発生した未受取の報酬が残っている場合は、上に表示されます。")}</p>}
 <details><summary>{t("確認したお財布")}</summary><code>{value.walletAddress}</code><small>{t("確認ブロック")} {String(value.blockNumber)}</small></details></section>;
}
export function RewardPanel({client,friendId,previous,onRead,onIncrease,paused,language='ja'}:{language?:Language;client:GameClient;friendId:bigint;previous:FriendRewardsSnapshot|null;onRead:(value:FriendRewardsSnapshot)=>void;onIncrease?:()=>void;paused:boolean}){
 const t=(text:string)=>translate(text,language);
 const [value,setValue]=useState(previous),[loading,setLoading]=useState(false),[error,setError]=useState(false),[increased,setIncreased]=useState(false);
 const alive=useRef(false),busy=useRef(false),last=useRef(previous);
 async function refresh(){
  if(paused||busy.current)return;busy.current=true;setLoading(true);setError(false);setIncreased(false);
  try{if(!client.readRewards)throw Error('Unavailable');const next=await client.readRewards();if(!alive.current)return;if(next.friendId!==friendId)throw Error('Friend changed');
   const old=last.current;const primary=next.genesis??next;const oldPrimary=next.genesis?old?.genesis:old;
   const grew=Boolean(oldPrimary&&(primary.claimableRF>oldPrimary.claimableRF||primary.claimableWETH>oldPrimary.claimableWETH));
   setIncreased(grew);last.current=next;setValue(next);onRead(next);if(grew)onIncrease?.();
  }catch{if(alive.current)setError(true);}finally{if(alive.current){setLoading(false);busy.current=false;}}
 }
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[client,friendId]);
 return <div className="reward-panel"><div className="piggy-heading"><PiggyIcon/><div><span className="tiny">A LITTLE SOMETHING, FOR REAL</span><h2>{t("この家の、貯金箱。")}</h2></div></div><p className="reward-intro">{t("チェーンから読み取った実際の数字です。ゲームの demo RF とは別のお財布です。")}</p>
 {error&&<p className="reward-error" role="alert">{value?t("更新できませんでした。前回確認した数字を表示しています。"):t("報酬を読み取れませんでした。残高が0という意味ではありません。もう一度お試しください。")}</p>}
 {loading&&<p role="status" className="reward-reading">{t("お財布と報酬を確認しています…")}</p>}
 {increased&&!error&&<p className="reward-greeting" role="status">{t("未受取の報酬が増えたよ。貯金箱を見てみて！")}</p>}
 {value?.genesis&&<Amounts language={language} title={`Genesis #${value.genesis.tokenId}`} value={value.genesis} prefix="genesis-"/>}
 {value&&<Amounts language={language} title={`${value.collection==='genesis'?'Genesis':'Friend'} #${friendId}`} value={value}/>}
 {value&&<p className="reward-updated">{new Date(value.checkedAt).toLocaleString(language==='en'?'en-US':'ja-JP')} {t("確認")}{error?t("（更新失敗・前回値）"):''}</p>}
 <button type="button" className="main-action" aria-label={t("最新の報酬を確認")} disabled={loading||paused} onClick={()=>void refresh()}>{loading?t("確認中…"):t("最新の報酬を確認")}<span>↻</span></button>
 <div className="reward-official"><b>{t("受け取りは公式サイトで")}</b><p>{t("この画面を閉じ、下の「Friend wallet」から「公式で確認・受取」を開いてください。")}</p></div>
 <p className="hint">{t("お財布残高は累計の稼ぎではありません。未受取の報酬と分けて表示しています。食事・散歩・島づくりで、実際の報酬率が上がることはありません。")}</p></div>;
}
