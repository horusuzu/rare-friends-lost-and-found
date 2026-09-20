import type { GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { EDGES, NODES, neighbours, type Language, type NodeId } from './model.js';

export function FriendPixels({ sprites, size = 56 }: { sprites: GenerationSprites; size?: number }) {
  const rows = sprites.clips.idle.down[0].rows;
  return <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" role="img" aria-label={`Friend #${sprites.tokenId}`}>
    {rows.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === '#' ? [<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#203e3d" />] : []))}
  </svg>;
}
export function ParcelIcon({ kind = 'music', size = 40 }: { kind?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {kind === 'music' ? <><rect x="8" y="22" width="30" height="19" rx="3" fill="#d48b6c" stroke="#684e3e" strokeWidth="2"/><path d="M8 23l7-13h23v13z" fill="#edc79b" stroke="#684e3e" strokeWidth="2"/><path d="M21 27v8m0-8 9-2v8" stroke="#684e3e" strokeWidth="2"/><circle cx="19" cy="35" r="3" fill="#684e3e"/><circle cx="28" cy="33" r="3" fill="#684e3e"/></> : kind === 'seed' ? <><path d="M12 8h25l-3 34H9z" fill="#e8d9ae" stroke="#766947" strokeWidth="2"/><path d="M23 34V20m0 8c-12 0-11-12-11-12 12 0 11 12 11 12zm0-4s0-12 10-12c2 10-10 12-10 12z" fill="#87a776" stroke="#56765e" strokeWidth="2"/></> : <><path d="M11 8h27v10H25v23H14V18h-3z" fill="#c85c4d" stroke="#8a443b" strokeWidth="2"/><path d="M14 34h11m-11 4h11M30 8v10" stroke="#efb8a2" strokeWidth="2"/></>}
  </svg>;
}
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><ellipse cy="9" rx="20" ry="6" fill="#627f69" opacity=".14"/><path d="M0 8v-26" stroke="#796c51" strokeWidth="4"/><path d="M-24-17Q-28-36-12-42Q-12-65 6-59Q25-57 23-36Q42-22 22-13Q8-5-6-13Q-23-5-24-17" fill="#8aab8c" stroke="#668b76" strokeWidth="2"/><path d="M-12-24Q1-17 11-26" fill="none" stroke="#aac3a1" strokeWidth="3"/></g>;
}
function House({ x, y, kind }: { x: number; y: number; kind: string }) {
  return <g transform={`translate(${x} ${y})`}>
    <ellipse cy="-4" rx="56" ry="14" fill="#477364" opacity=".12"/>
    {kind === 'lighthouse' ? <>
      <path d="M-24-9l9-104h26L24-9z" fill="#fcf3dc" stroke="#526e6a" strokeWidth="2"/><path d="M-18-63h36l3 24h-42z" fill="#cb7667"/><path d="M-26-110h51v-20h-51z" fill="#f5d27b" stroke="#526e6a" strokeWidth="2"/><path d="M-30-130l30-18 30 18z" fill="#526e6a"/><path d="M-5-27h10v18H-5zM-5-97h10v11H-5z" fill="#526e6a"/><path d="M-34-108h68" stroke="#526e6a" strokeWidth="4"/>
    </> : kind === 'garden' ? <>
      <path d="M-49-7v-46l49-38 49 38v46z" fill="#b9d3c0" stroke="#648e83" strokeWidth="2"/><path d="M0-91v84M-49-53h98M-25-72v65M25-72v65M-49-28h98" stroke="#f3f0da" strokeWidth="3"/><path d="M-13-7v-31h26v31" fill="#719783"/><path d="M-34-11v-14m0 7-8-9m8 5 8-9" stroke="#456e57" strokeWidth="3"/>
    </> : <>
      <path d="M-44-7v-54h88v54z" fill={kind === 'post' ? '#eed5aa' : '#f0e2c6'} stroke="#7e8068" strokeWidth="2"/>
      <path d="M-54-60l18-28h68l24 28z" fill={kind === 'post' ? '#ce7964' : kind === 'station' ? '#6e9990' : '#be966c'} stroke="#797865" strokeWidth="2"/>
      <path d="M-33-80h68M-40-70h83M-26-88l-8 28M-6-88v28M14-88l9 28" stroke="#fff" strokeOpacity=".22" strokeWidth="2"/>
      <path d="M-10-7v-30h20v30" fill="#64817b"/><rect x="-34" y="-48" width="16" height="18" rx="2" fill="#afd0ca" stroke="#7c8c78"/><rect x="19" y="-48" width="16" height="18" rx="2" fill="#afd0ca" stroke="#7c8c78"/>
      {kind === 'post' ? <><rect x="-23" y="-59" width="47" height="13" rx="2" fill="#f9f1dc"/><text y="-49" textAnchor="middle" fontSize="8" letterSpacing="1.5" fill="#886756">POST</text><rect x="54" y="-21" width="15" height="19" rx="3" fill="#c97562"/><path d="M56-16h11" stroke="#81574e" strokeWidth="2"/></> : kind === 'bakery' ? <><path d="M-43-32h86v12h-86z" fill="#cf8e74"/><path d="M-28-32v12M-8-32v12M12-32v12M32-32v12" stroke="#f7ead0" strokeWidth="10"/></> : <><circle cy="-50" r="9" fill="#f8efd7" stroke="#627e76"/><path d="M0-57v7h5" stroke="#627e76" strokeWidth="2"/></>}
    </>}
  </g>;
}
export function Town({ node, sprites, active = false, lang, onTravel, reduced = false }: {
  node: NodeId; sprites: GenerationSprites; active?: boolean; lang: Language; onTravel?: (id: NodeId) => void; reduced?: boolean;
}) {
  const here = NODES.find(n => n.id === node)!;
  return <div className={`town ${reduced ? 'still' : ''}`}>
    <svg className="town-art" viewBox="0 0 900 610" role="img" aria-label={lang === 'en' ? 'A hand-drawn harbour town after the rain' : '雨上がりの小さな港町'}>
      <defs><pattern id="water-lines" width="70" height="44" patternUnits="userSpaceOnUse"><path d="M8 24q10 5 21 0m15-13h12" fill="none" stroke="#d1e4dc" strokeWidth="2" opacity=".65"/></pattern><pattern id="paper-grain" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".6" fill="#677966" opacity=".12"/><circle cx="10" cy="12" r=".5" fill="#677966" opacity=".12"/></pattern></defs>
      <rect width="900" height="610" fill="#b5d1ca"/><rect width="900" height="610" fill="url(#water-lines)"/>
      <path d="M-30 96Q82 32 204 73T400 119Q489 158 545 153Q630 134 665 74Q690 19 773 31Q858 47 862 111Q848 166 882 220L914 461Q858 585 706 549Q565 565 495 534Q420 596 283 557Q209 588 130 535Q6 537-20 428Z" fill="#95b4a0" stroke="#8bae9b" strokeWidth="10"/>
      <path d="M-30 86Q82 22 204 63T400 109Q489 148 545 143Q630 124 665 64Q690 9 773 21Q858 37 862 101Q848 156 882 210L914 451Q858 575 706 539Q565 555 495 524Q420 586 283 547Q209 578 130 525Q6 527-20 418Z" fill="#dce2c0" stroke="#ece8cd" strokeWidth="9"/>
      <path d="M552 150Q496 195 537 248T535 356Q569 383 596 385" stroke="#a5c7be" strokeWidth="30" fill="none"/>
      {EDGES.map(([a, b]) => { const p = NODES.find(n => n.id === a)!, q = NODES.find(n => n.id === b)!; return <g key={a+b}><path d={`M${p.x} ${p.y}L${q.x} ${q.y}`} stroke="#c9cbb0" strokeWidth="21" strokeLinecap="round"/><path d={`M${p.x} ${p.y}L${q.x} ${q.y}`} stroke="#f5ebd3" strokeWidth="15" strokeLinecap="round"/></g>; })}
      <path d="M522 284l39-12" stroke="#b18e6b" strokeWidth="31"/><path d="M520 272l37-12m-30 35 37-12M524 278l4 12m4-15 4 12m4-15 4 12m4-15 4 12" stroke="#e0c3a0" strokeWidth="3"/>
      <path d="M362 288Q473 112 733 183" stroke="#94a894" strokeDasharray="4 7" strokeWidth="2" fill="none"/>
      <text x="470" y="156" fontSize="10" fill="#6c8d82" letterSpacing="2" transform="rotate(-8 470 156)">THE WIND WAY</text>
      <circle cx="355" cy="305" r="30" fill="#d8cfaf" stroke="#f5ebd3" strokeWidth="7"/><circle cx="355" cy="305" r="12" fill="#9ebdb0" stroke="#809f92" strokeWidth="3"/>
      <Tree x={75} y={208} s={1.15}/><Tree x={218} y={193}/><Tree x={300} y={210} s={.7}/><Tree x={451} y={335} s={.85}/><Tree x={438} y={435} s={.7}/><Tree x={825} y={372} s={1.2}/><Tree x={773} y={530} s={.7}/><Tree x={84} y={416}/><Tree x={620} y={497} s={.75}/>
      <House x={148} y={300} kind="post"/><House x={290} y={453} kind="bakery"/><House x={500} y={446} kind="garden"/><House x={745} y={184} kind="lighthouse"/><House x={700} y={433} kind="station"/>
      <path d="M670 477h111m-111 8h111m-103-15v22m17-22v22m17-22v22m17-22v22m17-22v22m17-22v22" stroke="#9a9b82" strokeWidth="2"/>
      {[ [210,385], [413,215], [595,197], [792,279], [375,515], [170,469] ].map(([x,y]) => <g key={x} fill="#e9c07e"><circle cx={x} cy={y} r="3"/><circle cx={x+9} cy={y+5} r="2"/><circle cx={x-5} cy={y+9} r="2"/></g>)}
      <g transform="translate(100 570) rotate(-9)"><path d="M-23-5h46l-9 12h-28z" fill="#f3e5c9" stroke="#7eaaa0" strokeWidth="2"/><path d="M0-6v-33l18 29H0" fill="#fbf2dc" stroke="#7eaaa0" strokeWidth="2"/></g>
      <g className="gulls" fill="none" stroke="#688d83" strokeWidth="2"><path d="M64 78q7-9 14 0 7-9 14 0m722-36q7-9 14 0 7-9 14 0m-211 30q5-7 10 0 5-7 10 0"/></g>
      <rect width="900" height="610" fill="url(#paper-grain)" pointerEvents="none"/>
      <g transform="translate(843 541)" fill="#63877e"><path d="M0-17l-5 18 5-5 5 5z"/><text y="-24" fontSize="10" textAnchor="middle">N</text><circle r="23" fill="none" stroke="#63877e" opacity=".4"/></g>
    </svg>
    {NODES.map(n => <button key={n.id} className={`town-stop ${node === n.id ? 'here' : ''}`} style={{ left: `${n.x/9}%`, top: `${(n.y+20)/6.1}%` }}
      type="button" disabled={!active || !neighbours(node).includes(n.id)} aria-label={`${lang === 'en' ? 'Go to' : '移動：'} ${n.name[lang]}`} onClick={() => onTravel?.(n.id)}>
      <i/><span>{n.name[lang]}</span>
    </button>)}
    <div className="town-friend" style={{ left: `${here.x/9}%`, top: `${here.y/6.1}%` }}><span className="friend-shadow"/><FriendPixels sprites={sprites}/><span className="satchel">✉</span></div>
    <div className="map-caption">EST. 597 <span>·</span> A LITTLE TOWN, A LITTLE KINDNESS</div>
  </div>;
}
