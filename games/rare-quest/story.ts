/** Original NPC dialogue for Rare Quest. Each script returns lines and an optional effect run after the last line. */
import type { Text } from './data.ts';

export type Effect = 'heal' | 'rest' | 'lab' | 'shop' | 'boss';
export interface Script { readonly lines: readonly Text[]; readonly then?: Effect }
export interface StoryFlags { readonly lab: boolean; readonly badge: boolean; readonly rest: boolean }

export function npcScript(id: string, flags: StoryFlags): Script {
  switch (id) {
    case 'grandma': return { lines: [['おばあちゃん「おかえり。すこし やすんでいき」', 'Grandma: "Welcome home. Rest a little."']], then: 'heal' };
    case 'kid': return { lines: [['こども「くさむらの モンスターは リボンで なかまに なるんだって！」', 'Kid: "They say a ribbon turns grass monsters into friends!"']] };
    case 'doctor':
      if (!flags.lab) return {
        lines: [
          ['ユズ博士「やあ！ ここは ねむの木研究所だよ」', 'Dr. Yuzu: "Hi there! Welcome to the Nemunoki Lab."'],
          ['「きみには もう Friendという あいぼうが いるね。ぼくから わたす モンスターは いないよ」', '"You already have a partner: your own Friend. I have no monster to hand you."'],
          ['「かわりに リボンを どうぞ。あいてを よわらせてから むすぶのが コツさ」', '"Take some ribbons instead. Tie one after you weaken a monster."'],
        ], then: 'lab',
      };
      return {
        lines: [
          ['ユズ博士「め は しおと いわに、ほむらは めと かぜに つよい」', 'Dr. Yuzu: "SPROUT beats TIDE and STONE. EMBER beats SPROUT and GALE."'],
          ['「しおは ほむらと いわに、かぜは めと ドットに、いわは ほむらと かぜに つよいよ」', '"TIDE beats EMBER and STONE, GALE beats SPROUT and PIXEL, STONE beats EMBER and GALE."'],
          ['「おなじ タイプの わざは 1.5ばい。ためしてごらん」', '"Moves that match your own type hit 1.5 times harder. Give it a try."'],
        ],
      };
    case 'hiker': return { lines: [['ハイカー「HPが へった あいてほど リボンが ほどけにくいよ」', 'Hiker: "The lower its HP, the better a ribbon holds."']] };
    case 'stroller': return { lines: [['さんぽの おじさん「つかれたら きたの ヒスイ町、やすらぎの家へ おいき」', 'Strolling man: "Tired? The Rest House in Jade Town is just north."']] };
    case 'girl': return {
      lines: flags.badge
        ? [['女の子「わあ、ヒスイバッジ！ 師範に かったんだね！」', 'Girl: "Wow, the Jade Badge! You beat the master!"']]
        : [['女の子「道場の 師範は いわ・ほむら・め の モンスターを つかうよ」', 'Girl: "The dojo master uses STONE, EMBER and SPROUT monsters."']],
    };
    case 'keeper': return { lines: [['ハナ「やすらぎの家へ ようこそ。なかまを やすませるね」', 'Hana: "Welcome to the Rest House. Let me rest your team."']], then: 'rest' };
    case 'clerk': return { lines: [['店員「いらっしゃい！ どんぐりで かえるよ（シミュレーション）」', 'Clerk: "Welcome! Everything is paid in acorns (simulated)."']], then: 'shop' };
    case 'leader':
      if (flags.badge) return { lines: [['師範コハク「その バッジは きみと Friendの きずなの あかしだ」', 'Master Kohaku: "That badge is proof of the bond between you and your Friend."']] };
      return { lines: [['師範コハク「よく きた。ヒスイ道場の しょうぶ、うけて たとう！」', 'Master Kohaku: "Welcome. I accept your Jade Dojo challenge!"']], then: 'boss' };
    default: return { lines: [['……', '...']] };
  }
}
