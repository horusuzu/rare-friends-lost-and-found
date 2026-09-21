export type Language = 'ja' | 'en';

// Canonical save data stays Japanese; translate only at presentation boundaries.
const english: Record<string, string> = {
 'しおかぜ海岸':'Saltwind Shore',
 '波の音を、ふたりぶん。':'The sound of the waves, just for us.',
 '波打ち際で、小さな貝がきらり。その隣では、子ガメが砂に足をとられている。':'A tiny shell sparkles by the waves. Nearby, a baby turtle struggles through the sand.',
 '貝がらを一緒に探す':'Look for shells together',
 '子ガメを海まで送る':'Help the turtle reach the sea',
 '同じ色の貝をふたつ見つけた。ひとつはきみに、もうひとつはぼくに。':'We found two shells in the same color. One for you, and one for me.',
 '小さな足あとが海へ続く。見えなくなるまで、ふたりで手を振った。':'Tiny footprints led to the sea. We waved together until our little friend was out of sight.',
 'おそろいの貝がら':'Matching seashells',
 '小さな旅立ち':'A little journey begins',
 'こもれびの森':'Dappled Woods',
 '寄り道が、宝ものになる。':'A little detour, a little treasure.',
 '倒れた枝の向こうに、花の種が落ちている。どっちをおうちに持って帰ろう？':'Beyond a fallen branch, flower seeds lie on the ground. Which shall we take home?',
 '枝を集めて、何かつくろう':'Gather branches to make something',
 '花の種を探してみよう':'Look for flower seeds',
 'ちょうどいい枝を見つけるたび、得意げな顔。帰ったら何をつくろう。':'Every perfect branch brought a proud little smile. What shall we build when we get home?',
 '小さな種を両手で包んだ。「咲いたら、いちばんに見せるね」':'Tiny seeds, cupped in both hands. “When they bloom, you will be the first to see.”',
 'ふたりの工作日和':'A day for making things',
 'まだ見ぬ花の約束':'A promise of flowers',
 'こむぎの広場':'Wheatfield Square',
 '焼きたての匂いに、つられて。':'Following the scent of fresh bread.',
 'パン屋さんから、焼きたてのいい匂い。広場のベンチもちょうど空いている。':'Fresh bread smells wonderful at the bakery. A bench in the square is free, too.',
 'パンづくりを手伝う':'Help bake some bread',
 'ベンチで半分こする':'Share a bite on the bench',
 '粉だらけの顔を見て、ふたりで笑った。お礼にもらった種をポケットに。':'We laughed at our flour-covered faces and tucked the thank-you seeds into a pocket.',
 '大きいほうを差し出したら、もっと大きい笑顔が返ってきた。':'I offered the bigger half and got an even bigger smile in return.',
 'こむぎ色の午後':'A golden afternoon',
 'はんぶんこは、倍うれしい':'Half the bread, twice the joy',
 'はじまりの灯台':'First Light Lighthouse',
 'ふたりで架けた橋の、その先。':'Beyond the bridge we built together.',
 '新しい橋を渡った先。灯台の足元に古い絵はがき、空には夕焼けが広がっている。':'Across our new bridge, an old postcard rests by the lighthouse. Sunset fills the sky.',
 '古い絵はがきを拾う':'Pick up the old postcard',
 '夕焼けを一緒に眺める':'Watch the sunset together',
 '昔ここに住んだ誰かの「また会おう」。今度はぼくらの思い出を重ねよう。':'“See you again,” wrote someone who once lived here. Now we can add memories of our own.',
 '何も話さず、隣に座った。この静けさも、きっと忘れない。':'We sat side by side without a word. I think we will remember this quiet, too.',
 'だれかの、いつかの島':'Someone else’s island, long ago',
 '言葉のいらない夕焼け':'A sunset beyond words',
 '小さな花畑':'Little flower garden',
 'ひと晩休むと花が咲く。摘んだ花はお部屋に。':'Flowers bloom after a night of rest. Pick them to brighten our room.',
 '灯台への橋':'Bridge to the lighthouse',
 '新しいお出かけ先「はじまりの灯台」が開く。':'Unlock a new outing: First Light Lighthouse.',
 'おそろいベンチ':'Our shared bench',
 '家の前にふたりの居場所。散歩のなかよし度が増える。':'A place for us outside our home. Walks bring us a little closer.',
 'はじめまして。きみと、ここで暮らしたいな。':'Hello there. I would love to make a home here with you.',
 'ちょっとねむい…。おうちで、となりにいて。':'A little sleepy… Stay beside me at home?',
 'おなかが、くうって鳴っちゃった。':'Oops, that was my tummy rumbling.',
 'おはよう！ お花が咲いたよ。一緒に見に行こう。':'Good morning! The flowers have bloomed. Let’s go see them together.',
 'おはよう。今日もきみをまってたよ。':'Good morning. I was waiting for you today, too.',
 'ねえ、今日は何しよう？':'Hey, what shall we do today?',
 'これ、だいすき！ 覚えていてくれたんだね。':'My favorite! You remembered.',
 'もぐもぐ。きみと食べると、おいしいね。':'Mmm. Everything tastes better with you.',
 '散歩の帰り、おそろいベンチでひと休み。「ここ、ぼくらの席だね」':'After our walk, we rested on our bench. “These are our seats, aren’t they?”',
 'おうちのまわりを、てくてく。帰り道では、少しだけ手が近くなった。':'A little wander around home. On the way back, our hands were just a little closer.',
 'おやすみ。あしたも、ここで会おうね。':'Good night. Let’s meet here again tomorrow.',
 '育てた花を、お部屋に飾った。前よりちょっと、ぼくらのおうち。':'We put the flowers we grew in our room. It feels a little more like our home.',
 'この版では保存機能つきのプレビューが必要です。ページを再読み込みしてください。':'This version needs a preview with saving enabled. Please reload the page.',
 'Friendが変わりました。接続し直してください。':'Your Friend has changed. Please reconnect.',
 '保存データを読み取れませんでした。元のデータはそのまま残しています。':'We could not read your save. The original data has been kept.',
 '読み込みに失敗しました。':'Could not load your island.',
 '保存できませんでした。':'Could not save your progress.',
 '額縁の模擬購入は完了しませんでした。':'The simulated frame purchase did not complete.',
 'あなたのFriendがおうちを準備しています…':'Your Friend is getting our home ready…',
 'もう一度読み込む':'Try loading again',
 '新しい暮らしを始める（次の保存で上書き）':'Start fresh (replaces old data on next save)',
 '画像を作れませんでした。':'Could not create the picture.',
 'はじめまして':'Just met', '気になるともだち':'Getting to know you', 'なかよし':'Close friends', '大切な相棒':'Dear companions', '家族みたいなふたり':'Like family',
 '設定':'Settings', '保存中…':'Saving…', '未保存':'Not saved', '保存済み':'Saved', 'はじめての朝':'Our first morning',
 'おなか':'Fullness', 'げんき':'Energy', 'あなたと暮らす、世界にひとりのFriend':'Your one-of-a-kind Friend, sharing life with you',
 '暮らしの選択':'Choose our day', '道の途中で…':'Along the way…', 'ふたりの、今日のできごと':'Our little story today',
 'おみやげ':'Souvenirs', 'おみやげを持って帰る':'Bring the souvenirs home', '帰ったら、今日の思い出がアルバムに残ります。':'When we get home, today’s memory goes into our album.',
 '今日は、何しよう？':'What shall we do today?', 'いそがなくていい。ふたりのペースで。':'No hurry. We can take our time.',
 'お花を摘む':'Pick the flowers', '花畑が咲いたよ！':'Our garden is in bloom!',
 'ごはん':'Feed', 'いっしょに、いただきます':'A little meal for two', 'おさんぽ':'Take a walk', 'おうちのまわりを、てくてく':'A wander around home', 'おやすみ':'Sleep', '次の朝へ。げんきを回復':'Rest up for a new morning',
 '何を食べよう？':'What shall we eat?', '好きな味を、見つけてみて。':'Discover a favorite flavor.',
 '焼きたてトースト':'Fresh toast', '摘みたてベリー':'Freshly picked berries', 'あったかスープ':'Warm soup', 'いまはおなかいっぱい。またあとで。':'Full for now. Let’s eat again later.',
 '貯金箱を見る':'Open the piggy bank', 'この家の、貯金箱。':'Our little piggy bank.', 'NFTの本当のおこづかいを、のぞいてみよう。':'Take a peek at your NFT’s real rewards.',
 '✎ ふたりのメモ':'✎ Notes from us', 'ふたりのメモ':'Notes from us', 'まだ名前しか知らないふたり。ご飯を食べたり、外へ出たり。一緒の時間から始めよう。':'So far, we only know each other’s names. Share a meal, step outside—let’s begin with time together.',
 'どこへ、出かけよう？':'Where shall we go?', '小さなおみやげと、帰ってくるおうち。':'Little treasures, and a home to return to.', '橋をつくると行けるよ':'Build the bridge to visit', '鍵':'Locked',
 'お出かけはげんき20。':'Outings cost 20 energy. ', 'おうちで「おやすみ」してから出かけよう。':'Rest at home before heading out.', '出先では、好きな過ごし方を選べます。':'Choose how to spend your time when you arrive.',
 'ぼくらの島を、育てよう。':'Let’s grow our little island.', '拾ってきたものが、暮らしになっていく。':'Found treasures become part of our home.',
 '木':'Wood', '貝':'Shells', '種':'Seeds', '完成':'Built', 'つくる':'Build', '材料待ち':'Need materials',
 '木は森で、貝は海岸で見つかります。島の材料はゲーム内だけのものです。':'Find wood in the forest and shells on the beach. Island materials exist only in the game.',
 'ふたりの思い出。':'Memories of us.', '最初の一枚は、これから。':'Our first postcard is still to come.', 'お出かけして、おみやげを持って帰ろう。':'Head out and bring a little treasure home.', '暮らしの日記':'Our everyday journal',
 '島ぐらしメニュー':'Island life menu', 'おうち':'Home', 'おでかけ':'Outings', '島づくり':'Our island', '思い出':'Memories',
 'まだ保存できていません。':'Your progress has not been saved yet. ', '保存をやり直す':'Try saving again',
 'NFTの貯金箱':'NFT piggy bank', '思い出のポストカード':'Memory postcard', '暮らしの設定':'Island life settings', '閉じる':'Close',
 '画像を長押し・右クリックで保存できます。':'Press and hold or right-click the image to save it.', 'きみとの暮らし。':'A life with you.', 'Friendの呼び名':'Your Friend’s name', 'この名前で呼ぶ':'Use this name',
 'スマートフォンで遊ぶ':'Play on your phone', 'ブラウザーのメニューから「ホーム画面に追加」。育成データはこのブラウザーに保存されます。':'Choose “Add to Home Screen” in your browser menu. Your progress is saved in this browser.',
 '起動時に対応ウォレットでの接続が必要です。ホーム画面版にウォレットがない場合は、いつものウォレット対応ブラウザーで開いてください。別ブラウザー・別端末には保存は引き継がれません。':'Connect a supported wallet when you open the game. If the home screen version has no wallet, use your usual wallet-enabled browser. Saves do not transfer between browsers or devices.',
 'お部屋の模様替え':'Decorate our room', '金色の額縁を使用中':'Golden frame in use', '金色の額縁 · 2 demo RF':'Golden frame · 2 demo RF',
 'SDKの模擬購入です。お部屋の枠だけが変わり、この接続中のみ有効。育成と島づくりは無料です。':'A simulated SDK purchase. It changes only the room’s border for this session. Care and island building are free.',
 '暮らしのルール':'Life on our island', '「おやすみ」で次の朝に進みます。閉じている間に弱ったり、いなくなったりはしません。データ削除で思い出も消えるため、このブラウザーを使い続けてください。':'Sleep to move to the next morning. Your Friend will not get weaker or disappear while you are away. Keep using this browser: clearing its data also clears your memories.',
 '無料の育成プレビュー。材料・育成結果は模擬で、RFへの交換やNFTの発行はありません。':'A free companion preview. Materials and progress are simulated; they cannot be exchanged for RF and do not mint NFTs.',
 '少しずつ育つ、ふたりのおうち':'Our home, growing little by little', 'Friendと訪れた島の風景':'Island scenery shared with your Friend', '部屋の貯金箱':'The room’s piggy bank',
 'アクティブ':'Active', '現在は報酬停止中':'Rewards currently paused', '未受取の報酬':'Unclaimed rewards', 'NFTのお財布残高':'NFT wallet balance',
 '新しい報酬の割り当ては停止中です。以前に発生した未受取の報酬が残っている場合は、上に表示されます。':'New reward allocations are paused. Any unclaimed rewards earned earlier appear above.',
 '確認したお財布':'Wallet checked', '確認ブロック':'Block checked', 'チェーンから読み取った実際の数字です。ゲームの demo RF とは別のお財布です。':'These are real amounts read from the chain, in a separate wallet from the game’s demo RF.',
 '更新できませんでした。前回確認した数字を表示しています。':'Could not refresh. Showing the last checked amounts.', '報酬を読み取れませんでした。残高が0という意味ではありません。もう一度お試しください。':'Could not read rewards. This does not mean your balance is zero. Please try again.',
 'お財布と報酬を確認しています…':'Checking your wallet and rewards…', '未受取の報酬が増えたよ。貯金箱を見てみて！':'Your unclaimed rewards have grown. Take a peek in the piggy bank!',
 '確認':'Checked', '（更新失敗・前回値）':'(refresh failed · previous amounts)', '最新の報酬を確認':'Check latest rewards', '確認中…':'Checking…',
 '受け取りは公式サイトで':'Claim on the official site', 'この画面を閉じ、下の「Friend wallet」から「公式で確認・受取」を開いてください。':'Close this panel, then use “Friend wallet” below to open the official rewards and claim page.',
 'お財布残高は累計の稼ぎではありません。未受取の報酬と分けて表示しています。食事・散歩・島づくりで、実際の報酬率が上がることはありません。':'Wallet balances are not lifetime earnings and are shown separately from unclaimed rewards. Meals, walks, and island building do not increase real reward rates.',
 '🌷 お花を摘む':'🌷 Pick the flowers', '🪵 木':'🪵 Wood', '🐚 貝':'🐚 Shells', '🌱 種':'🌱 Seeds',
 '言語':'Language', '日本語':'Japanese', '表示言語':'Display language',
};

/** Translate known game copy without changing arbitrary player-written names or saves. */
export function translate(text: string, language: Language): string {
 if (language === 'ja') return text;
 if (Object.hasOwn(english, text)) return english[text];
 let match: RegExpMatchArray | null;
 if ((match = text.match(/^(.+)から、ただいま。(.*)$/s)) && Object.hasOwn(english, match[1]) && Object.hasOwn(english, match[2])) return `Home from ${english[match[1]]}. ${english[match[2]]}`;
 if ((match = text.match(/^おかえり。(.+)、また一緒に行きたいな。$/)) && Object.hasOwn(english, match[1])) return `Welcome home. I would love to visit ${english[match[1]]} with you again.`;
 if ((match = text.match(/^(.+)ができた！「ふたりでつくったから、特別だね」$/)) && Object.hasOwn(english, match[1])) return `${english[match[1]]} is ready! “We made it together. That makes it special.”`;
 if ((match = text.match(/^(.+)(は完成|をつくる)$/)) && Object.hasOwn(english, match[1])) return match[2] === 'は完成' ? `${english[match[1]]} is built` : `Build ${english[match[1]]}`;
 if ((match = text.match(/^(\d+)日目$/))) return `Day ${match[1]}`;
 if ((match = text.match(/^(.+)と、島ぐらし。$/s))) return `Island life with ${match[1]}.`;
 if ((match = text.match(/^(.+)と過ごした (\d+)日目$/s))) return `Day ${match[2]} with ${match[1]}`;
 if ((match = text.match(/^(.+)に話しかける$/s))) return `Talk to ${match[1]}`;
 if ((match = text.match(/^(.+)との思い出のポストカード$/s))) return `A memory postcard with ${match[1]}`;
 if ((match = text.match(/^前回確認・未受取 (.+)$/))) return `Last checked · Unclaimed ${match[1]}`;
 if ((match = text.match(/^(\d+)\/8 枚のポストカード · (\d+)回のおでかけ$/))) return `${match[1]}/8 postcards · ${match[2]} outings`;
 if ((match = text.match(/^確認ブロック (\d+)$/))) return `Block checked ${match[1]}`;
 return text;
}
