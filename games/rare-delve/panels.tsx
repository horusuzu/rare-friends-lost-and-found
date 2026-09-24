/** DOM overlays for each scene: HUD, town, shop counter, chest, bag and item actions, identify picker, summary and log. */
import { useEffect, useRef } from 'react';
import { FULL_MAX, ITEMS, UNIDENTIFIED, SHOP_COSTS, SHOP_MAX, BAG_MAX, CHEST_MAX, type Text } from './data.ts';
import { itemName, sellPrice, type Item } from './items.ts';
import { TOWN_MENU, actOptions, bagRows, onStairs, type ActOption, type Button } from './game.ts';
import type { GameState } from './run.ts';

export type Lang = 'ja' | 'en';
export interface PanelProps {
  readonly s: GameState;
  readonly lang: Lang;
  readonly active: boolean;
  /** Move the cursor from `current` to `index` in a list of `count`, then press A. */
  readonly choose: (index: number, current: number, count: number) => void;
  readonly press: (b: Button) => void;
}

const pick = (lang: Lang, text: Text) => text[lang === 'ja' ? 0 : 1];
export const GOLD_NOTE: Text = ['ゴールドは ゲーム内の 無料シミュレーション通貨です（RFでは ありません）。', 'Gold is a free, simulated in-game currency (not RF).'];

/** In the dungeon, names follow this run's identification; in town every item is appraised. */
export function nameOf(s: GameState, it: Item): Text {
  return s.run ? itemName(it, s.run.known, s.run.seed) : itemName(it, [it.k], 0);
}
const noteOf = (s: GameState, it: Item): Text => {
  if (!s.run || s.run.known.includes(it.k) || !UNIDENTIFIED.includes(ITEMS[it.k].kind)) return ITEMS[it.k].note;
  return ['まだ 正体が わからない。つかうか 見極めの巻物で しらべよう。', 'Unidentified. Use it, or read a Scroll of Insight.'];
};

const TOWN_TEXT: Readonly<Record<string, readonly [Text, Text]>> = {
  dive: [['ランタン洞に もぐる', 'Dive into Lantern Hollow'], ['1階から。レベルは 1 から はじまる。', 'Start at floor 1, level 1.']],
  shop: [['お店のカウンター', 'Shop counter'], ['もちものを 売る・お店を 育てる', 'Sell finds, upgrade the shop']],
  chest: [['そうこ', 'Storage chest'], [`${CHEST_MAX}こまで あずけられる。しんでも なくならない。`, `Keeps ${CHEST_MAX} items safe, even if you fall.`]],
  bag: [['もちもの', 'Bag'], ['そうびを えらぶ', 'Choose your gear']],
};
export const ACT_TEXT: Readonly<Record<ActOption, Text>> = {
  use: ['つかう', 'Use'], zap: ['ふる', 'Zap'], throw: ['なげる', 'Throw'], drop: ['おく', 'Drop'], equip: ['そうび', 'Equip'], unequip: ['はずす', 'Unequip'],
};
const USE_TEXT: Readonly<Record<string, Text>> = { food: ['たべる', 'Eat'], herb: ['たべる', 'Eat'], potion: ['のむ', 'Drink'], scroll: ['よむ', 'Read'] };

function Row({ label, extra, cur, active, onPick, testId }: { label: string; extra?: string; cur: boolean; active: boolean; onPick: () => void; testId?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (cur) ref.current?.scrollIntoView?.({ block: 'nearest' }); }, [cur]);
  return <li><button ref={ref} className={cur ? 'cur' : ''} aria-current={cur} disabled={!active} onClick={onPick} data-testid={testId}>
    <span className="nm">{label}</span>{extra !== undefined && <span className="num">{extra}</span>}</button></li>;
}

/** Top status strip: floor, level, HP, belly and carried gold in the dungeon; purse and shop level in town. */
export function Hud({ s, lang }: { s: GameState; lang: Lang }) {
  const h = s.hero, run = s.run;
  if (!run) {
    return <div className="hud" data-testid="hud">
      <b>{pick(lang, ['町', 'Town'])}</b>
      <span>{pick(lang, ['さいふ', 'Purse'])} <em data-testid="purse">{s.meta.purse}G</em></span>
      <span>{pick(lang, ['お店', 'Shop'])} Lv{s.meta.shopLv}</span>
      <span>{pick(lang, ['さいこう', 'Best'])} {pick(lang, [`${s.meta.best}階`, `F${s.meta.best}`])}</span>
    </div>;
  }
  const ratio = h.maxHp > 0 ? h.hp / h.maxHp : 0, hungry = h.full <= 20;
  const status = [h.sleep > 0 && pick(lang, ['ねむり', 'Asleep']), h.conf > 0 && pick(lang, ['こんらん', 'Muddled']), h.haste > 0 && pick(lang, ['はやあし', 'Swift'])].filter(Boolean);
  return <div className="hud" data-testid="hud">
    <b>{pick(lang, [`${run.floor}階`, `F${run.floor}`])}</b>
    <span>Lv{h.level}</span>
    <span className="hpbox">HP <em>{h.hp}/{h.maxHp}</em>
      <i className={`bar${ratio <= 0.25 ? ' low' : ''}`} role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={h.maxHp} aria-valuenow={h.hp}><i style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} /></i></span>
    <span className={hungry ? 'warn' : ''}>{pick(lang, ['おなか', 'Belly'])} <em>{Math.round(h.full / FULL_MAX * 100)}%</em></span>
    <span>{h.gold}G</span>
    {status.length > 0 && <span className="warn">{status.join('·')}</span>}
  </div>;
}

function Town({ s, lang, active, choose }: PanelProps) {
  if (s.scene.k !== 'town') return null;
  const cur = s.scene.cur;
  return <nav className="panel town" aria-label={pick(lang, ['町', 'Town'])}>
    <h2>{pick(lang, ['ランタン洞の 町', 'Town above Lantern Hollow'])}</h2>
    <ul>{TOWN_MENU.map((id, i) => <li key={id}><button className={i === cur ? 'cur' : ''} aria-current={i === cur} disabled={!active}
      data-testid={`town-${id}`} onClick={() => choose(i, cur, TOWN_MENU.length)}>
      <span className="nm">{pick(lang, TOWN_TEXT[id][0])}</span><small>{pick(lang, TOWN_TEXT[id][1])}</small></button></li>)}</ul>
  </nav>;
}

function Shop({ s, lang, active, choose }: PanelProps) {
  if (s.scene.k !== 'shop') return null;
  const cur = s.scene.cur, lv = s.meta.shopLv, count = 1 + s.hero.bag.length;
  const upgrade = lv >= SHOP_MAX ? pick(lang, ['お店は さいだいレベル', 'Shop at max level'])
    : pick(lang, [`お店を Lv${lv + 1}へ（${SHOP_COSTS[lv + 1]}G）`, `Upgrade shop to Lv${lv + 1} (${SHOP_COSTS[lv + 1]}G)`]);
  return <section className="panel full" aria-label={pick(lang, ['お店', 'Shop'])}>
    <h2>{pick(lang, ['お店のカウンター', 'Shop counter'])} <small>Lv{lv} · {s.meta.purse}G</small></h2>
    <ul>
      <Row label={upgrade} cur={cur === 0} active={active} onPick={() => choose(0, cur, count)} testId="shop-upgrade" />
      {s.hero.bag.map((it, i) => <Row key={i} label={pick(lang, nameOf(s, it))} extra={`${sellPrice(it)}G`} cur={cur === i + 1} active={active} onPick={() => choose(i + 1, cur, count)} />)}
    </ul>
    <p className="note">{pick(lang, ['お店の レベルが 上がると、もぐるたびに もらえる食料が ふえる。', 'A higher shop level sends you off with more provisions.'])} {pick(lang, GOLD_NOTE)}</p>
  </section>;
}

function Chest({ s, lang, active, choose }: PanelProps) {
  if (s.scene.k !== 'chest') return null;
  const cur = s.scene.cur, count = s.chest.length + s.hero.bag.length;
  return <section className="panel full" aria-label={pick(lang, ['そうこ', 'Chest'])}>
    <h2>{pick(lang, ['そうこ', 'Storage chest'])} <small>{s.chest.length}/{CHEST_MAX}</small></h2>
    <ul>
      {s.chest.length === 0 && <li className="empty">{pick(lang, ['からっぽ', 'Empty'])}</li>}
      {s.chest.map((it, i) => <Row key={`c${i}`} label={pick(lang, nameOf(s, it))} extra={pick(lang, ['だす', 'Take'])} cur={cur === i} active={active} onPick={() => choose(i, cur, count)} />)}
    </ul>
    <h2>{pick(lang, ['もちもの', 'Bag'])} <small>{s.hero.bag.length}/{BAG_MAX}</small></h2>
    <ul>{s.hero.bag.map((it, i) => <Row key={`b${i}`} label={pick(lang, nameOf(s, it))} extra={pick(lang, ['あずける', 'Store'])}
      cur={cur === s.chest.length + i} active={active} onPick={() => choose(s.chest.length + i, cur, count)} />)}</ul>
  </section>;
}

function actLabel(s: GameState, row: number, o: ActOption): Text {
  const r = bagRows(s)[row];
  return o === 'use' && r ? USE_TEXT[ITEMS[r.item.k].kind] ?? ACT_TEXT.use : ACT_TEXT[o];
}

function Bag({ s, lang, active, choose, press }: PanelProps) {
  if (s.scene.k !== 'bag' && s.scene.k !== 'act') return null;
  const rows = bagRows(s), inAct = s.scene.k === 'act', cur = s.scene.k === 'act' ? s.scene.row : s.scene.cur;
  const focus = rows[cur];
  return <section className="panel full" aria-label={pick(lang, ['もちもの', 'Bag'])} data-testid="bag">
    <h2>{pick(lang, ['もちもの', 'Bag'])} <small>{s.hero.bag.length}/{BAG_MAX}</small></h2>
    <ul>{rows.length === 0 && <li className="empty">{pick(lang, ['なにも もっていない', 'Nothing carried'])}</li>}
      {rows.map((r, i) => <Row key={`${r.slot}`} label={pick(lang, nameOf(s, r.item))} extra={typeof r.slot === 'number' ? undefined : 'E'}
        cur={i === cur} active={active && !inAct} onPick={() => choose(i, cur, rows.length)} testId={`bag-row-${i}`} />)}</ul>
    {focus && <p className="note">{pick(lang, noteOf(s, focus.item))}</p>}
    {inAct && s.scene.k === 'act' && <div className="act" role="group" aria-label={pick(lang, ['どうする？', 'What to do?'])}>
      {actOptions(s, s.scene.row).map((o, i, all) => <button key={o} className={i === (s.scene.k === 'act' ? s.scene.cur : 0) ? 'cur' : ''} disabled={!active}
        data-testid={`act-${o}`} onClick={() => choose(i, s.scene.k === 'act' ? s.scene.cur : 0, all.length)}>{pick(lang, actLabel(s, cur, o))}</button>)}
      <button disabled={!active} onClick={() => press('b')}>{pick(lang, ['やめる', 'Cancel'])}</button>
    </div>}
  </section>;
}

function Pick({ s, lang, active, choose }: PanelProps) {
  if (s.scene.k !== 'pick') return null;
  const cur = s.scene.cur;
  return <section className="panel full" aria-label={pick(lang, ['見極め', 'Identify'])}>
    <h2>{pick(lang, ['どれを しらべる？', 'Identify which item?'])}</h2>
    <ul>{s.hero.bag.map((it, i) => <Row key={i} label={pick(lang, nameOf(s, it))} cur={i === cur} active={active} onPick={() => choose(i, cur, s.hero.bag.length)} />)}</ul>
  </section>;
}

function Summary({ s, lang, active, press }: PanelProps) {
  if (s.scene.k !== 'summary') return null;
  const sc = s.scene;
  const title: Text = sc.result === 'clear' ? ['ハートのランタンを 持ちかえった！', 'You brought back the Heart Lantern!']
    : sc.result === 'home' ? ['ぶじに 町へ かえった', 'Home safe and sound'] : ['ちからつきた…', 'You collapsed…'];
  const kept: Text = sc.result === 'dead' ? ['もっていた ものと ゴールドは すべて うしなった。そうこと 財布は ぶじ。', 'Everything carried and all carried gold is lost. The chest and purse are safe.']
    : sc.result === 'clear' ? [`もちものと ${sc.gold}G、クリアボーナスを 持ちかえった。`, `You kept your items, ${sc.gold}G and the clear bonus.`]
      : [`もちものと ${sc.gold}G を 持ちかえった。`, `You kept your items and ${sc.gold}G.`];
  return <section className={`panel summary ${sc.result}`} aria-label={pick(lang, ['けっか', 'Result'])} role="dialog">
    <h2>{pick(lang, title)}</h2>
    <dl>
      <dt>{pick(lang, ['とうたつ', 'Reached'])}</dt><dd>{pick(lang, [`${sc.floor}階`, `Floor ${sc.floor}`])}</dd>
      <dt>{pick(lang, ['ターン', 'Turns'])}</dt><dd>{sc.turns}</dd>
      <dt>{pick(lang, ['レベル', 'Level'])}</dt><dd>{sc.level}</dd>
      {sc.cause && <><dt>{pick(lang, ['げんいん', 'Cause'])}</dt><dd>{pick(lang, sc.cause)}</dd></>}
    </dl>
    <p>{pick(lang, kept)}</p>
    <button className="big" disabled={!active} onClick={() => press('a')} data-testid="summary-ok">{pick(lang, ['町へ', 'To town'])}</button>
  </section>;
}

function Log({ s, lang }: { s: GameState; lang: Lang }) {
  if (s.scene.k !== 'dungeon' || s.showMap) return null;
  const lines = s.log.slice(-2);
  return <div className="log" aria-live="polite">
    {lines.map((l, i) => <p key={`${s.log.length}-${i}`}>{pick(lang, l)}</p>)}
    {onStairs(s) && <p className="hint">{pick(lang, ['かいだんだ。A で おりる。', 'Stairs. Press A to descend.'])}</p>}
    {s.turnMode && <p className="hint">{pick(lang, ['むきを えらぶ（ターンは すすまない）', 'Pick a direction (no turn passes)'])}</p>}
  </div>;
}

export function Panels(props: PanelProps) {
  return <>
    <Town {...props} /><Shop {...props} /><Chest {...props} /><Bag {...props} /><Pick {...props} /><Summary {...props} /><Log s={props.s} lang={props.lang} />
    {props.s.showMap && <p className="maplabel">{pick(props.lang, ['ちず（B で とじる）', 'Map (B to close)'])}</p>}
  </>;
}
