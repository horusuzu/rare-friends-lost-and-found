import type { GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { MISSIONS, NODES, type Run } from './model.js';

/** Render locally to a PNG image. No wallet, remote service, or sandbox escape. */
export function makePostcard(run: Run, sprites: GenerationSprites, gold: boolean): string {
  if (run.phase !== 'delivered' || String(sprites.tokenId) !== run.friendId) throw new Error('A completed delivery and matching Friend are required.');
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser cannot make postcards.');
  ctx.fillStyle = '#f5efdf'; ctx.fillRect(0, 0, 1200, 800);
  ctx.strokeStyle = gold ? '#b18b43' : '#85a294'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 1144, 744);
  ctx.fillStyle = '#d5e0c7'; ctx.fillRect(55, 55, 1090, 410);
  ctx.fillStyle = '#a9cac3'; ctx.fillRect(55, 320, 1090, 145);
  ctx.fillStyle = '#e7e4c8'; ctx.beginPath(); ctx.ellipse(600, 365, 365, 72, 0, 0, Math.PI*2); ctx.fill();
  if (run.node === 'lighthouse') {
    ctx.fillStyle = '#f9efd6'; ctx.fillRect(738, 190, 64, 172); ctx.fillStyle = '#c77967'; ctx.fillRect(738, 250, 64, 40);
    ctx.fillStyle = '#486e65'; ctx.fillRect(726, 160, 88, 34); ctx.beginPath(); ctx.moveTo(720,160); ctx.lineTo(770,125); ctx.lineTo(820,160); ctx.fill();
    ctx.fillStyle = '#efd48b'; ctx.fillRect(736,169,68,16);
  } else if (run.node === 'garden') {
    ctx.fillStyle = '#a9c9ae'; ctx.beginPath(); ctx.moveTo(690,350); ctx.lineTo(690,245); ctx.lineTo(775,170); ctx.lineTo(860,245); ctx.lineTo(860,350); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f7efd6'; ctx.lineWidth = 5; ctx.stroke();
    for (const x of [718,747,775,803,832]) { ctx.beginPath(); ctx.moveTo(x,242); ctx.lineTo(x,350); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(690,290); ctx.lineTo(860,290); ctx.stroke();
    ctx.fillStyle='#668873'; ctx.fillRect(757,307,36,43);
  } else {
    ctx.fillStyle='#f0deba'; ctx.fillRect(688,245,174,108); ctx.fillStyle='#668f82'; ctx.beginPath(); ctx.moveTo(670,245); ctx.lineTo(700,199); ctx.lineTo(850,199); ctx.lineTo(880,245); ctx.fill();
    ctx.fillStyle='#6c9082'; ctx.fillRect(753,296,42,57); ctx.fillRect(705,265,25,32); ctx.fillRect(820,265,25,32);
    ctx.fillStyle='#f7eed4'; ctx.beginPath(); ctx.arc(773,230,17,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='#668f82'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(773,217); ctx.lineTo(773,231); ctx.lineTo(782,231); ctx.stroke();
  }
  ctx.fillStyle = '#203e3d';
  sprites.clips.idle.down[0].rows.forEach((row, y) => [...row].forEach((pixel,x) => { if(pixel === '#') ctx.fillRect(428+x*10, 200+y*10, 10,10); }));
  ctx.fillStyle = '#c0825f'; ctx.fillRect(565, 314, 40, 30); ctx.strokeStyle = '#f9ebcd'; ctx.lineWidth=3; ctx.strokeRect(570,319,30,20);
  ctx.fillStyle = '#294e47'; ctx.textAlign = 'left'; ctx.font = '16px monospace'; ctx.fillText('RARE FRIENDS POSTAL SERVICE / EST. 597', 82, 96);
  ctx.font = 'italic 46px Georgia, serif'; ctx.fillText('A little less lost.', 76, 538);
  ctx.font = '24px Georgia, serif'; ctx.fillText(MISSIONS[run.mission].title.en, 78, 586);
  ctx.font = '18px monospace'; ctx.fillText(`Delivered by Friend #${run.friendId}`, 78, 640);
  const destination = NODES.find(node => node.id === run.node)!;
  ctx.font = '16px monospace'; ctx.fillText(`${destination.name.en.toUpperCase()}  /  ${run.stars} OF 3 STARS`, 78, 680);
  ctx.fillStyle = '#798d7c'; ctx.font = '14px monospace'; ctx.fillText('LOST & FOUND · VIBEATHON 2026 · SIMULATED GAME KEEPSAKE', 78, 735);
  ctx.strokeStyle = gold ? '#b18b43' : '#71988a'; ctx.lineWidth = 3; ctx.setLineDash([6,4]); ctx.strokeRect(970, 515, 145, 170); ctx.setLineDash([]);
  ctx.fillStyle = gold ? '#b18b43' : '#71988a'; ctx.textAlign='center'; ctx.font='bold 48px Georgia'; ctx.fillText('597',1042,593); ctx.font='14px monospace'; ctx.fillText(gold ? 'GOLD FOIL' : 'WITH LOVE',1042,627); ctx.fillText('POSTAGE',1042,651);
  return canvas.toDataURL('image/png');
}
