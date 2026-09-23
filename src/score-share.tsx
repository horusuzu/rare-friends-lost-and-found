import {useEffect,useRef} from 'react';
export type ScoreShare = readonly [score:number,wave:number,status:'over'|'won',language:'ja'|'en'];
export function scoreIntent(result:ScoreShare,friendId:bigint,collection:string){
 const [score,wave,status,lang]=result;const pilot=`${collection==='genesis'?'Genesis':'Friend'} #${friendId}`;
 const text=lang==='ja'?`RARE INVADERSで${pilot}と${score}点！ ${status==='won'?'全5ウェーブクリア！':`WAVE ${wave}/5`}\nあなたのFriendで挑戦してみて。`:`I scored ${score} with ${pilot} in RARE INVADERS! ${status==='won'?'All 5 waves cleared!':`Wave ${wave}/5`}\nYour Friend. Your turn.`;
 const url=new URL('https://x.com/intent/post');url.searchParams.set('text',text);url.searchParams.set('url','https://horusuzu.github.io/rare-friends-lost-and-found/invaders/');url.searchParams.set('hashtags','RareFriends,Vibeathon');return {text,url:url.href};
}
export function ScoreShareDialog({result,friendId,collection,onClose}:{result:ScoreShare;friendId:bigint;collection:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const ja=result[3]==='ja';const intent=scoreIntent(result,friendId,collection);
 useEffect(()=>{const el=dialog.current!;el.showModal();return()=>el.close();},[]);
 return <dialog ref={dialog} aria-label={ja?'スコアをシェア':'Share your score'} onCancel={e=>{e.preventDefault();onClose();}} style={{maxWidth:'min(440px, calc(100vw - 24px))',maxHeight:'85dvh',overflow:'auto',padding:24,border:'1px solid #799861',borderRadius:12,background:'#14221e',color:'#eaf4da'}}>
 <h2>{ja?'スコアをシェア':'Share your score'}</h2><p style={{whiteSpace:'pre-wrap',lineHeight:1.7}}>{intent.text}</p><p>{ja?'ブラウザー内の自己記録です。Xで内容を確認してから投稿できます。':'A local, self-reported score. Review your post on X before publishing.'}</p>
 <a href={intent.url} target="_blank" rel="noopener noreferrer" style={{display:'block',padding:16,background:'#d3ff64',color:'#142011',textAlign:'center',borderRadius:6}}>{ja?'Xの投稿画面を開く':'Open X composer'} ↗</a><button style={{marginTop:16,minHeight:44,width:'100%'}} onClick={onClose}>{ja?'ゲームに戻る':'Back to game'}</button></dialog>;
}
