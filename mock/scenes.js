// Stage 4: authored screen fixtures only. No rules, draw, accounting or persistence.
export const scenes = {
 ready: {label:'はじめの画面', title:'じゃんけん、しよう！', copy:'1枚いれて、好きな手をえらぼう。', medals:'10', hand:'rock', tag:'READY', action:['1枚いれて あそぶ','choose']},
 choose: {label:'手をえらぶ', title:'じゃん・けん…', copy:'グー・チョキ・パー、どの手でいく？',medals:'9',hand:'rock',tag:'CHOOSE',hands:true,handTarget:'reveal'},
 reveal: {label:'手の発表',title:'ぽん！',copy:'結果を表示しています。',medals:'9',hand:'scissors',tag:'PON!',auto:'win'},
 win: {label:'勝ち',title:'やったね、勝ち！',copy:'ルーレットでメダルをゲット！',medals:'9',hand:'scissors',tag:'YOU WIN',action:['ルーレットへ','roulette']},
 draw: {label:'あいこ',title:'あいこで…',copy:'もういちど！ メダルは追加で使いません。',medals:'9',hand:'rock',tag:'ONE MORE',hands:true,handTarget:'reveal'},
 lose: {label:'負け',title:'ざんねん！',copy:'つぎの勝負でリベンジしよう。',medals:'9',hand:'paper',tag:'TRY AGAIN',action:['最初の画面例にもどる','ready']},
 roulette: {label:'ルーレット中',title:'どこで止まるかな？',copy:'ルーレットは自動で止まります。',medals:'9',hand:'scissors',tag:'FEVER TIME',auto:'payout',spin:true},
 payout: {label:'払い出し表示',title:'7枚 ゲット！',copy:'払い出しの演出例です。',medals:'9',hand:'scissors',tag:'LUCKY SEVEN',prize:'7',auto:'settled'},
 settled: {label:'精算完了',title:'メダルがふえたよ！',copy:'払い出しが終わりました。つぎの勝負へ。',medals:'16',hand:'scissors',tag:'NICE!',prize:'7',action:['最初の画面例にもどる','ready']},
 last: {label:'最後の1枚・手の選択',title:'ラストチャンス！',copy:'結果の精算が終わるまで、ゲームは続きます。',medals:'0',hand:'rock',tag:'CHOOSE',hands:true,handTarget:'lastlose'},
 lastlose: {label:'最後の1枚・負け',title:'ざんねん！',copy:'結果の精算が終わりました。',medals:'0',hand:'paper',tag:'ROUND OVER',action:['結果を見る','gameover']},
 gameover: {label:'ゲームオーバー',title:'また、あそぼう！',copy:'メダルがなくなりました。はじめからなら10枚でスタート。',medals:'0',hand:'rock',tag:'GAME OVER',action:['はじめから','restart']},
 resume: {label:'再開の案内',title:'おかえりなさい！',copy:'途中の勝負があります。確定した結果から再開します。',medals:'9',hand:'scissors',tag:'WELCOME BACK',action:['つづきから','resumed']},
 resumed: {label:'確定結果から再開',title:'7枚の結果から再開',copy:'引き直さず、途中の演出を短くした画面の例です。',medals:'9',hand:'scissors',tag:'RESUMED',prize:'7',action:['精算後の画面へ','settled']},
 resumeSettled: {label:'精算済みの再開',title:'おかえりなさい！',copy:'この結果は精算済み。もう一度は払い出しません。',medals:'16',hand:'scissors',tag:'ALREADY SETTLED',prize:'7',action:['最初の画面例にもどる','ready']},
 saveError: {label:'保存に失敗',title:'保存できませんでした',copy:'このまま勝負は進められません。保存できる状態にして、もう一度お試しください。',medals:'9',hand:'rock',tag:'PAUSED',action:['再試行する（成功例）','recovered'],secondary:['再試行する（失敗例）','saveError']},
 recovered: {label:'保存の回復',title:'保存できました',copy:'これは回復した場合の固定画面です。実際には保存していません。',medals:'9',hand:'rock',tag:'RECOVERED',action:['勝負にもどる','choose']},
 unsupported: {label:'必要な機能が使えない',title:'この環境では進めません',copy:'必要な保存機能を利用できません。対応環境の詳しい案内は検討中です。',medals:'—',hand:'rock',tag:'UNAVAILABLE',action:['もう一度確認（成功例）','ready'],secondary:['案内を見る','help']},
 secondTab: {label:'別のタブでプレイ中',title:'もうひとつのタブでプレイ中',copy:'二重に進めないため、ここではお待ちください。もう一方のタブを閉じてから再試行してください。',medals:'9',hand:'rock',tag:'WAITING',action:['再試行する（解放例）','resume'],secondary:['まだ使用中の例','secondTab']},
 corrupt: {label:'保存の破損・未知版',title:'つづきを読み込めません',copy:'保存内容を確認できませんでした。勝負を止めています。まだ何も消していません。',medals:'—',hand:'rock',tag:'READ ERROR',action:['もう一度読み込む（成功例）','resume'],secondary:['回復方法の候補を見る','resetCandidate']},
 missing: {label:'保存が見つからない',title:'保存が見つかりません',copy:'保存が消去された場合の画面例です。以前のメダルや結果は復元できません。',medals:'—',hand:'rock',tag:'NO SAVE',action:['新しいゲームの例を見る','ready']}
};
Object.assign(scenes, {
 drawAgain:{label:'連続あいこ',title:'もういちど、あいこ！',copy:'何度あいこでも追加のメダルは使いません。',medals:'9',hand:'rock',tag:'ONE MORE',hands:true,handTarget:'reveal'},
 lastdraw:{label:'最後の1枚・あいこ',title:'あいこで…',copy:'残高0枚でも、追加投入なしで勝負を続けます。',medals:'0',hand:'rock',tag:'ONE MORE',hands:true,handTarget:'lastlose'},
 loading:{label:'保存の読み込み中',title:'ちょっと待ってね',copy:'保存された勝負を確認しています。',medals:'—',hand:'rock',tag:'LOADING',auto:'resume'},
 saving:{label:'結果の保存待ち',title:'結果を保存しています',copy:'保存できるまで、つぎの操作はお待ちください。',medals:'9',hand:'rock',tag:'SAVING',auto:'win'},
 settling:{label:'精算の保存待ち',title:'払い出しを確認しています',copy:'精算の保存が終わるまで、そのままお待ちください。',medals:'9',hand:'scissors',tag:'SETTLING',prize:'7',auto:'settled'},
 settleError:{label:'精算の保存失敗',title:'精算を保存できませんでした',copy:'7枚の結果は確定済みです。二重に払い出さず、再試行する画面の候補です。',medals:'9',hand:'scissors',tag:'PAUSED',prize:'7',action:['再試行する（成功例）','settled'],secondary:['再試行する（失敗例）','settleError']},
 payout1:{label:'1枚の払い出し',title:'1枚 ゲット！',copy:'1枚払い出す固定画面の例です。',medals:'9',hand:'scissors',tag:'WIN BONUS',prize:'1',action:['精算後の画面へ','settled1']},
 settled1:{label:'1枚の精算完了',title:'払い出し完了！',copy:'精算後10枚の固定画面です。',medals:'10',hand:'scissors',tag:'NICE!',prize:'1',action:['最初の画面例にもどる','ready']},
 payout2:{label:'2枚の払い出し',title:'2枚 ゲット！',copy:'2枚払い出す固定画面の例です。',medals:'9',hand:'scissors',tag:'WIN BONUS',prize:'2',action:['精算後の画面へ','settled2']},
 settled2:{label:'2枚の精算完了',title:'払い出し完了！',copy:'精算後11枚の固定画面です。',medals:'11',hand:'scissors',tag:'NICE!',prize:'2',action:['最初の画面例にもどる','ready']},
 payout4:{label:'4枚の払い出し',title:'4枚 ゲット！',copy:'4枚払い出す固定画面の例です。',medals:'9',hand:'scissors',tag:'WIN BONUS',prize:'4',action:['精算後の画面へ','settled4']},
 settled4:{label:'4枚の精算完了',title:'払い出し完了！',copy:'精算後13枚の固定画面です。',medals:'13',hand:'scissors',tag:'NICE!',prize:'4',action:['最初の画面例にもどる','ready']},
 payout20:{label:'20枚の払い出し',title:'20枚 ジャックポット！',copy:'20枚払い出す固定画面の例です。',medals:'9',hand:'scissors',tag:'JACKPOT!',prize:'20',action:['精算後の画面へ','settled20']},
 settled20:{label:'20枚の精算完了',title:'大当たり、おめでとう！',copy:'精算後29枚の固定画面です。',medals:'29',hand:'scissors',tag:'NICE!',prize:'20',action:['最初の画面例にもどる','ready']},
 lastwin:{label:'最後の1枚・勝ち',title:'やったね、勝ち！',copy:'残高0枚でも、払い出しが終わるまで続きます。',medals:'0',hand:'scissors',tag:'YOU WIN',action:['払い出しの例へ','lastpayout']},
 lastpayout:{label:'最後の1枚・払い出し',title:'1枚 ゲット！',copy:'最後の1枚で勝ったときの固定例です。',medals:'0',hand:'scissors',tag:'WIN BONUS',prize:'1',action:['精算後の画面へ','lastsettled']},
 lastsettled:{label:'最後の1枚・精算完了',title:'まだまだ、あそべる！',copy:'精算後1枚。ゲームオーバーにはなりません。',medals:'1',hand:'scissors',tag:'NICE!',prize:'1',action:['最初の画面例にもどる','ready']}
});
export const overlays = {
 settings:{title:'あそびの設定'},help:{title:'あそびかた'},restart:{title:'はじめから あそぶ？'},resetCandidate:{title:'回復方法の候補',candidate:true}
};
export const scenarioGroups = [
 ['基本の流れ',['ready','choose','reveal','draw','drawAgain','win','lose','roulette','payout','settled','last','lastlose','gameover']],
 ['配当と最後の1枚',['lastdraw','payout1','settled1','payout2','settled2','payout4','settled4','payout20','settled20','lastwin','lastpayout','lastsettled']],
 ['中断と再開',['loading','saving','settling','resume','resumed','resumeSettled','secondTab']],
 ['エラーと回復',['saveError','settleError','recovered','unsupported','corrupt','missing']]
];

// Visual navigation metadata only. Amounts above remain literal fixtures.
Object.assign(scenes, {
 insert:{label:'1枚投入の演出',title:'投入の固定例',copy:'10枚から9枚の画面へ移るだけです。',medals:'10',hand:'rock',tag:'INSERT',auto:'choose'},
});
const visual = {
 ready:{label:'手を押して開始',title:'じゃんけん、しよう！',copy:'好きな手を押すと、1枚投入から始まる固定演出を表示します。',hands:true,handTarget:'insert',action:['1枚投入の固定演出へ','insert'],symbol:'play'},
 insert:{effect:'insert',symbol:'coin'},
 choose:{label:'手の受付完了',title:'手を受け付けました',copy:'結果の固定画面を表示するまでお待ちください。',hands:false,auto:'reveal',symbol:'hand'},
 reveal:{auto:'saving',symbol:'hand'},
 saving:{auto:'win',symbol:'save'},
 win:{action:undefined,auto:'roulette',symbol:'star'},
 roulette:{effect:'roulette',symbol:'star'},
 payout:{effect:'coins',coins:7,auto:'settling',symbol:'star'},
 settling:{symbol:'save'},
 settled:{symbol:'check'},
 draw:{handTarget:'drawAgain',symbol:'repeat'},
 drawAgain:{handTarget:'reveal',symbol:'repeat'},
 lose:{symbol:'cross'},
 last:{handTarget:'lastlose',symbol:'flag'},
 lastdraw:{handTarget:'lastwin',symbol:'repeat'},
 lastlose:{symbol:'cross'},
 lastwin:{symbol:'star'},
 lastpayout:{effect:'coins',coins:1,auto:'lastsettled',action:undefined,symbol:'star'},
 lastsettled:{symbol:'check'},
 gameover:{symbol:'flag'},
 resume:{symbol:'resume'},resumed:{symbol:'resume'},resumeSettled:{symbol:'saved'},
 loading:{symbol:'hourglass'},
 saveError:{symbol:'saveError'},settleError:{symbol:'saveError'},recovered:{symbol:'saved'},
 secondTab:{symbol:'tabs'},unsupported:{symbol:'blocked'},corrupt:{symbol:'fileError'},missing:{symbol:'empty'},
 payout1:{effect:'coins',coins:1,auto:'settled1',action:undefined,symbol:'star'},
 payout2:{effect:'coins',coins:2,auto:'settled2',action:undefined,symbol:'star'},
 payout4:{effect:'coins',coins:4,auto:'settled4',action:undefined,symbol:'star'},
 payout20:{effect:'coins',coins:20,auto:'settled20',action:undefined,symbol:'star'},
 settled1:{symbol:'check'},settled2:{symbol:'check'},settled4:{symbol:'check'},settled20:{symbol:'check'}
};
for(const [id,metadata] of Object.entries(visual)) Object.assign(scenes[id],metadata);
const originalWalkthrough = ['ready','insert','choose','reveal','saving','win','roulette','payout','settling','settled','draw','drawAgain','lose','last','lastdraw','lastwin','lastpayout','lastsettled','lastlose','gameover','loading','resume','resumed','resumeSettled','saveError','recovered','settleError','secondTab','unsupported','corrupt','missing','payout1','settled1','payout2','settled2','payout4','settled4','payout20','settled20'];
export const palette = [
 ['ready','play'],['draw','repeat'],['lose','cross'],['last','flag'],['lastdraw','repeatFlag'],['lastwin','star'],
 ['resume','resume'],['resumeSettled','saved'],['saveError','saveError'],['settleError','starError'],['secondTab','tabs'],['corrupt','fileError'],
 ['missing','empty'],['unsupported','blocked'],['loading','hourglass'],['gameover','restart'],['recovered','check'],['saving','save'],
 ['payout1','1'],['payout2','2'],['payout4','4'],['payout','7'],['payout20','20'],['settling','save']
];

// Approved low-step interaction. All credit values are authored display fixtures.
Object.assign(scenes.ready,{label:'投入待ち',title:'コインの周辺を押して1枚投入',copy:'コインと残高の周辺を押すとすぐ手を選べます。手ボタンや筐体の他の場所では投入できません。',hands:false,handTarget:undefined,action:undefined,waiting:true,insertTarget:'choose',symbol:'coin'});
Object.assign(scenes.choose,{label:'手を選ぶ',title:'じゃんけん',copy:'グー・チョキ・パーから手を選んでください。固定結果の見本です。',hands:true,auto:undefined,handTarget:'reveal'});
Object.assign(scenes.lastlose,{action:undefined,auto:'gameover'});
Object.assign(scenes.lastwin,{action:undefined,auto:'lastRoulette'});
scenes.lastRoulette={label:'最後の1枚のルーレット',title:'自動停止',copy:'残高0枚でも、固定1枚の払い出しまで続きます。',medals:'0',hand:'scissors',symbol:'star',effect:'roulette',stopPrize:'1',auto:'lastpayout'};
Object.assign(scenes.resumed,{action:undefined,auto:'settling'});
const repeatCredits = [
 {key:'1',charged:'0'}, {key:'9',charged:'8'}, {key:'11',charged:'10'},
 {key:'13',charged:'12'}, {key:'16',charged:'15'}, {key:'29',charged:'28'}
];
const repeatIds=[];
for(const fixture of repeatCredits){
 const prefix='repeat'+fixture.key;
 const ids={ready:prefix+'Ready',choose:prefix+'Choose',win:prefix+'Win',roulette:prefix+'Roulette',payout:prefix+'Payout'};
 // This is a one-medal visual loop, not a computed payout or a probability policy.
 scenes[ids.ready]={label:'次の投入待ち・'+fixture.key+'枚',title:'つぎの勝負へ',copy:'コインと残高の周辺を押すと1枚投入し、すぐ手を選ぶ固定見本です。',medals:fixture.key,hand:'rock',symbol:'coin',waiting:true,insertTarget:ids.choose};
 scenes[ids.choose]={label:'次の手の選択・'+fixture.charged+'枚',title:'じゃんけん',copy:'手を選んでください。この繰り返し例は毎回1枚の固定配当です。',medals:fixture.charged,hand:'rock',symbol:'hand',hands:true,handTarget:ids.win};
 scenes[ids.win]={label:'繰り返し例の勝ち・'+fixture.key+'枚',title:'勝ちの固定例',copy:'自動でルーレットへ進みます。',medals:fixture.charged,hand:'scissors',symbol:'star',auto:ids.roulette};
 scenes[ids.roulette]={label:'繰り返し例のルーレット・'+fixture.key+'枚',title:'自動停止',copy:'1枚に自動停止する固定例です。',medals:fixture.charged,hand:'scissors',symbol:'star',effect:'roulette',stopPrize:'1',auto:ids.payout};
 scenes[ids.payout]={label:'繰り返し例の払い出し・'+fixture.key+'枚',title:'1枚の固定払い出し',copy:'自動で払い出して次の投入待ちへ戻ります。',medals:fixture.charged,hand:'scissors',symbol:'star',effect:'coins',coins:1,prize:'1',auto:ids.ready};
 repeatIds.push(...Object.values(ids));
}
for(const id of ['settled','settled1','settled2','settled4','settled20','lastsettled','resumeSettled','lose']){
 const s=scenes[id];s.action=undefined;s.waiting=true;s.hands=false;s.insertTarget=s.medals==='10'?'choose':'repeat'+s.medals+'Choose';
 s.copy+=' 次の投入はコインと残高の周辺を押してください。';
}
export const walkthrough=[...originalWalkthrough,'lastRoulette',...repeatIds];
