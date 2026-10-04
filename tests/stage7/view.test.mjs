import test from 'node:test';
import assert from 'node:assert/strict';
import { publicView } from '../../src/core/view.ts';
const state={schema:'janpon/1',revision:5,phase:'choosing',balance:0,roundNumber:1,rngState:123,round:{number:1,balanceBefore:1,opponent:'scissors',result:null},updatedAt:42};
test('T07-01 public view uses a closed allowlist, legal choices and no RNG/storage context',()=>{
 const view=publicView(state);
 assert.deepEqual(view,{phase:'choosing',balance:0,choices:[{kind:'hand',hand:'rock'},{kind:'hand',hand:'scissors'},{kind:'hand',hand:'paper'}],result:null});
 assert.deepEqual(JSON.parse(JSON.stringify(view)),view);
 assert.deepEqual(Object.keys(view).sort(),['balance','choices','phase','result']);
 assert.deepEqual(publicView({...state,phase:'result'}).choices,[]);
 assert.deepEqual(publicView({...state,phase:'idle'}).choices,[{kind:'coin'}]);
 assert.deepEqual(publicView({...state,phase:'game-over'}).choices,[{kind:'restart'}]);
});
test('T07-01 free draw and saved result are copies, not authority references',()=>{
 const source={...state,round:{...state.round,result:{player:'rock',opponent:'rock',outcome:'draw',payout:0}}};
 const view=publicView(source);view.result.payout=20;view.choices.length=0;
 assert.equal(source.round.result.payout,0);assert.equal(publicView(source).choices.length,3);
 const win=publicView({...state,phase:'result',round:{...state.round,result:{player:'rock',opponent:'scissors',outcome:'win',payout:20}}});
 assert.equal(win.result.payout,20);assert.equal(win.balance,0);
});

test('T07-01 nested result is a closed allowlist and hidden state cannot affect choices',()=>{
 const source={...state,round:{...state.round,result:{player:'rock',opponent:'rock',outcome:'draw',payout:0,rngState:987,pendingPrize:7}}};
 assert.deepEqual(publicView(source).result,{player:'rock',opponent:'rock',outcome:'draw',payout:0});
 assert.deepEqual(publicView(source),publicView({...source,rngState:999,round:{...source.round,opponent:'paper'}}));
});
