export type NodeId = 'post' | 'plaza' | 'bakery' | 'garden' | 'bridge' | 'lighthouse' | 'station';
export type Language = 'en' | 'ja';
export type Words = Readonly<Record<Language, string>>;
export const NODES: ReadonlyArray<{ id: NodeId; x: number; y: number; name: Words; address: boolean }> = [
  { id: 'post', x: 148, y: 315, name: { en: 'Post office', ja: '郵便局' }, address: false },
  { id: 'plaza', x: 355, y: 305, name: { en: 'Little square', ja: '小さな広場' }, address: false },
  { id: 'bakery', x: 290, y: 470, name: { en: 'Morning bakery', ja: '朝のパン屋' }, address: true },
  { id: 'garden', x: 500, y: 465, name: { en: 'Glasshouse', ja: 'ガラスの温室' }, address: true },
  { id: 'bridge', x: 570, y: 270, name: { en: 'Old bridge', ja: '古い橋' }, address: false },
  { id: 'lighthouse', x: 745, y: 200, name: { en: 'Lighthouse', ja: '灯台' }, address: true },
  { id: 'station', x: 700, y: 450, name: { en: 'Last-stop station', ja: '終点の駅' }, address: true },
];
export const EDGES: ReadonlyArray<readonly [NodeId, NodeId]> = [
  ['post', 'plaza'], ['plaza', 'bakery'], ['bakery', 'garden'], ['garden', 'bridge'],
  ['plaza', 'bridge'], ['bridge', 'lighthouse'], ['garden', 'station'], ['station', 'lighthouse'],
];
export const MISSIONS: ReadonlyArray<{ title: Words; item: Words; clue: Words; ending: Words; destination: NodeId; icon: string }> = [
  { title: { en: 'A song to come home to', ja: '帰り道のメロディー' }, item: { en: 'A tiny music box', ja: '小さなオルゴール' },
    clue: { en: '“I keep a light on for the boats. But tonight, the room is a little too quiet.”', ja: '「船のために、毎晩明かりを灯すんだ。でも今夜の部屋は、少し静かすぎてね」' },
    ending: { en: '“My mother used to play this when the fog rolled in. Now the boats aren’t the only ones finding their way home.”', ja: '「霧の夜には、母がこれを鳴らしてくれたんだ。今夜は、ぼくにも帰る場所が見つかったよ」' }, destination: 'lighthouse', icon: 'music' },
  { title: { en: 'Something still growing', ja: 'まだ育っているもの' }, item: { en: 'A packet of old seeds', ja: '古い種の袋' },
    clue: { en: '“Rain on a glass roof is my favourite sound. I’ve saved one empty pot for an old friend.”', ja: '「ガラスの屋根に降る雨の音が好き。古い友だちのために、鉢をひとつ空けてあるの」' },
    ending: { en: '“We planted these together, years ago. I thought I’d lost the last of them. Come back in spring, won’t you?”', ja: '「ずっと前に、一緒にまいた種なの。もう残っていないと思ってた。春になったら、また来てくれる？」' }, destination: 'garden', icon: 'seed' },
  { title: { en: 'The very last train', ja: 'いちばん最後の列車' }, item: { en: 'A well-loved red scarf', ja: '使い込まれた赤いマフラー' },
    clue: { en: '“Everyone leaves from here. I stay to wave goodbye, even after the last whistle.”', ja: '「みんな、ここから旅立っていく。最後の汽笛が鳴っても、ぼくは手を振っているよ」' },
    ending: { en: '“Someone knitted this so I wouldn’t be cold while waiting. Funny how a scarf can feel like a hug.”', ja: '「待っている間、寒くないようにって編んでくれたんだ。マフラーなのに、抱きしめてもらったみたいだ」' }, destination: 'station', icon: 'scarf' },
];
export type Run = Readonly<{ friendId: string; mission: number; node: NodeId; remaining: number; moves: number; mistakes: number;
  phase: 'playing' | 'delivered' | 'expired'; stars: number; feedback: 'none' | 'wrong' | 'street' | 'shortcut' | 'miss' }>;
export function createRun(mission: number, friendId: string): Run {
  if (!Number.isInteger(mission) || !MISSIONS[mission]) throw new Error('Unknown delivery.');
  if (!/^[1-9]\d*$/.test(friendId)) throw new Error('A verified Friend ID is required.');
  return { friendId, mission, node: 'post', remaining: 90000, moves: 0, mistakes: 0, phase: 'playing', stars: 0, feedback: 'none' };
}
export function advance(run: Run, milliseconds: number, paused = false): Run {
  if (paused || run.phase !== 'playing' || !Number.isFinite(milliseconds) || milliseconds <= 0) return run;
  const remaining = Math.max(0, run.remaining - milliseconds);
  return { ...run, remaining, phase: remaining === 0 ? 'expired' : 'playing' };
}
export function neighbours(node: NodeId): NodeId[] {
  return EDGES.flatMap(([a, b]) => a === node ? [b] : b === node ? [a] : []);
}
export function travel(run: Run, to: NodeId): Run {
  if (run.phase !== 'playing' || !neighbours(run.node).includes(to)) return run;
  return { ...advance(run, 2500), node: to, moves: run.moves + 1, feedback: 'none' };
}
export function deliver(run: Run): Run {
  if (run.phase !== 'playing') return run;
  if (!NODES.find(node => node.id === run.node)?.address) return { ...run, feedback: 'street' };
  if (MISSIONS[run.mission].destination !== run.node) return { ...advance(run, 8000), mistakes: run.mistakes + 1, feedback: 'wrong' };
  return { ...run, phase: 'delivered', stars: run.mistakes >= 2 ? 1 : run.remaining < 30000 || run.mistakes > 0 ? 2 : 3, feedback: 'none' };
}
export function takeShortcut(run: Run, timing: number): Run {
  if (run.phase !== 'playing' || run.node !== 'plaza' || !Number.isFinite(timing)) return run;
  if (timing < 0.35 || timing > 0.65) return { ...advance(run, 6000), feedback: 'miss' };
  return { ...travel({ ...run, node: 'bridge' }, 'lighthouse'), feedback: 'shortcut' };
}
export function routeBetween(from: string, to: string): NodeId[] {
  if (!NODES.some(node => node.id === from) || !NODES.some(node => node.id === to)) return [];
  const queue: NodeId[][] = [[from as NodeId]], seen = new Set<string>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    if (path.at(-1) === to) return path;
    for (const next of neighbours(path.at(-1)!)) if (!seen.has(next)) { seen.add(next); queue.push([...path, next]); }
  }
  return [];
}
