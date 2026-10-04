import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/application/game.ts';
import { progress } from '../../src/application/progress.ts';
import { replayAgent, randomAgent, recordingAgent } from '../../src/application/agents.ts';
import { initialState, assertState } from '../../src/core/state.ts';
import { seededRandom } from '../../src/core/random.ts';
import { uniformOpponent, fixedPayout } from '../../src/core/rules.ts';
const clone=x=>structuredClone(x), rules={opponent:uniformOpponent,payout:fixedPayout};
const fast={present:async()=>{}};
function memory(value){return {value:clone(value),mode:'committed',writes:0,async read(){return this.value===undefined?{kind:'empty'}:{kind:'loaded',value:clone(this.value)};},async write(value){this.writes++;if(this.mode!=='failed'&&this.mode!=='unknown-old')this.value=clone(value);return this.mode==='committed'?{kind:'committed'}:{kind:this.mode.startsWith('unknown')?'unknown':'failed',reason:this.mode};}};}
function owner(){let held=false;return {async acquire(){if(held)return null;held=true;return {release(){held=false;}};}};}
function ports(store=memory(),ownership=owner(),outputs=[],rng=seededRandom){return {clock:{now:()=>42},rng,store,ownership,outputs,seed:1};}
const pick=index=>({id:'test',priority:0,decide:async()=>index});
const lastMedal=()=>({...initialState(1,42),balance:1,roundNumber:9,round:{number:9,balanceBefore:2,opponent:'rock',result:{player:'scissors',opponent:'rock',outcome:'loss',payout:0}}});
const fixed={next:(state,bound)=>({state:state+1,value:bound===3?1:99})};
async function gameAt(stage='idle',store=memory(),ownership=owner(),outputs=[]){const game=new Game(ports(store,ownership,outputs,fixed),rules);await game.start();if(stage!=='idle')await game.step(pick(0));if(stage==='result')await game.step(pick(0));return game;}
test('G01–G09 run through application and committed outputs, independent 3×3 goldens',async()=>{
 const expected=[['rock','rock','draw'],['rock','scissors','win'],['rock','paper','loss'],['scissors','rock','loss'],['scissors','scissors','draw'],['scissors','paper','win'],['paper','rock','win'],['paper','scissors','loss'],['paper','paper','draw']];
 const hands=['rock','scissors','paper'];
 for(const [player,opponent,result] of expected){const rng={next:(state,bound)=>({state:state+1,value:bound===3?hands.indexOf(opponent):0})};const g=new Game(ports(memory(),owner(),[],rng),rules);await g.start();await progress(g,pick(0),fast);await progress(g,pick(hands.indexOf(player)),fast);assert.equal(g.view().result.outcome,result);assert.equal(g.view().balance,9);g.close();}
});
test('G10 rejects illegal/duplicate decisions, coin produces one committed stake',async()=>{
 const store=memory();const g=await gameAt('idle',store);
 for(const index of [-1,0.5,NaN,Infinity,1,2])await g.step(pick(index));assert.equal(g.view().balance,10);
 await Promise.all([g.step(pick(0)),g.step(pick(0))]);assert.equal(g.view().balance,9);assert.equal(g.snapshot().roundNumber,1);
 assert.equal(store.writes,2);g.close();
});
test('G11–G13 last medal/free draws/automatic twenty payout/duplicate settle and restart',async()=>{
 const g=await gameAt('idle',memory(lastMedal()));await progress(g,pick(0),fast);
 for(let n=0;n<2;n++){await progress(g,pick(1),fast);assert.equal(g.view().phase,'choosing');assert.equal(g.view().balance,0);assert.equal(g.snapshot().roundNumber,10);}
 await progress(g,pick(0),fast);const revision=g.snapshot().revision;await progress(g,pick(0),fast);assert.equal(g.view().balance,20);assert.equal(g.view().phase,'idle');await g.settle(revision);assert.equal(g.view().balance,20);g.close();
 const loss=await gameAt('idle',memory(lastMedal()));await progress(loss,pick(0),fast);await progress(loss,pick(2),fast);await progress(loss,pick(0),fast);assert.equal(loss.view().balance,0);assert.equal(loss.view().phase,'game-over');await progress(loss,pick(0),fast);assert.equal(loss.view().balance,10);loss.close();
});
test('G14 every prize slot is exercised through real application result and settlement',async()=>{
 for(let value=0;value<100;value++){const rng={next:(state,bound)=>({state:state+1,value:bound===3?1:value})};const g=new Game(ports(memory(),owner(),[],rng),rules);await g.start();await progress(g,pick(0),fast);await progress(g,pick(0),fast);const expected=value<65?1:value<83?2:value<94?4:value<99?7:20;assert.equal(g.view().result.payout,expected);await progress(g,pick(0),fast);assert.equal(g.view().balance,9+expected);g.close();}
});
test('G16–G18 unknown/aborted transaction boundaries stop publication and reconcile exact durable side',async()=>{
 for(const phase of ['idle','choosing','result'])for(const mode of ['failed','unknown-old','unknown-committed']){
  const store=memory(),events=[];let g=await gameAt(phase,store,owner(),[{id:'capture',priority:0,emit:e=>events.push(clone(e))}]);
  const before=clone(store.value), count=events.length;store.mode=mode;
  if(phase==='result')await g.settle(g.snapshot().revision);else await g.step(pick(0));
  assert.equal(g.status,'stopped');assert.equal(events.length,count);assert.deepEqual(g.snapshot(),before);
  await g.step(pick(0));assert.equal(g.status,'stopped');
  if(mode!=='unknown-committed')assert.deepEqual(store.value,before);
  store.mode='committed';await g.retry();assert.equal(g.status,'ready');
  if(phase==='idle'){assert.equal(g.view().balance,mode==='unknown-committed'?9:10);assert.equal(g.view().phase,mode==='unknown-committed'?'choosing':'idle');}
  else {if(g.view().phase==='choosing')await progress(g,pick(0),fast);if(g.view().phase==='result'){assert.equal(g.view().result.payout,20);await progress(g,pick(0),fast);}assert.equal(g.view().balance,29);}
  g.close();
 }
});
test('ordinary reload resumes committed result, never redraws or pays twice',async()=>{
 const store=memory(),ownership=owner();let g=await gameAt('result',store,ownership);const result=clone(g.view().result),rng=store.value.rngState;g.close();
 g=new Game(ports(store,ownership,[],fixed),rules);await g.start();assert.deepEqual(g.view().result,result);assert.equal(store.value.rngState,rng);await progress(g,pick(0),fast);assert.equal(g.view().balance,29);g.close();
 g=new Game(ports(store,ownership,[],fixed),rules);await g.start();assert.equal(g.view().balance,29);g.close();
});
test('G19 output mutation, synchronous throw, audio rejection do not change saved result/accounting',async()=>{
 let baseline;
 for(const emit of [()=>{},()=>{throw Error('audio denied');},async()=>{throw Error('audio denied');},e=>{e.view.balance=999;e.view.choices.length=0;}]){
  const store=memory(),g=await gameAt('result',store,owner(),[{id:'audio-refusal-probe',priority:0,emit}]);
  await progress(g,pick(0),{present:async()=>{throw Error('motion refusal');}});assert.equal(g.view().balance,29);
  if(baseline)assert.deepEqual(store.value,baseline);else baseline=clone(store.value);g.close();
 }
});
test('G20 corrupt or unknown saves stop and retain original, without initializing ten',async()=>{
 for(const value of [null,{schema:'future'},{...initialState(1,42),balance:-1},{}]){const store=memory(value),before=clone(value),g=new Game(ports(store),rules);await g.start();assert.equal(g.status,'stopped');assert.equal(store.writes,0);await g.retry();assert.equal(g.status,'stopped');assert.deepEqual(store.value,before);g.close();}
});
test('other tab cannot read/write; delayed decision cannot act after lease release',async()=>{
 const store=memory(),ownership=owner(),g=await gameAt('idle',store,ownership),other=new Game(ports(store,ownership),rules);await other.start();assert.equal(other.status,'other-tab');assert.equal(store.writes,1);
 let resolve;const step=g.step({id:'delayed',priority:0,decide:()=>new Promise(r=>resolve=r)});g.close();
 const next=new Game(ports(store,ownership),rules);await next.start();resolve(0);await step;assert.equal(store.writes,1);assert.equal(next.view().balance,10);next.close();other.close();
});
test('close during uncertain commit holds ownership until transaction termination',async()=>{
 const store=memory(),ownership=owner(),g=await gameAt('idle',store,ownership);let resolve,entered;
 const writing=new Promise(r=>entered=r);store.write=async candidate=>{entered();return new Promise(r=>resolve=()=>{store.value=clone(candidate);r({kind:'committed'});});};
 const pending=g.step(pick(0));await writing;g.close();assert.equal(await ownership.acquire(),null);resolve();await pending;const lease=await ownership.acquire();assert.ok(lease);lease.release();assert.equal(g.status,'closed');assert.equal(store.value.balance,9);
});
test('agent cannot mutate authoritative choices to insert or restart illegally',async()=>{
 const g=await gameAt('choosing');await g.step({id:'hostile',priority:0,async decide(view){view.choices[0]={kind:'restart'};view.phase='game-over';return 0;}});assert.equal(g.view().phase,'result');assert.equal(g.view().balance,9);g.close();
});
export async function runRounds(rounds=10000){
 const decisions=[],saved=[],store=memory();const agent=recordingAgent(randomAgent(seededRandom,987654),decisions);
 let game=new Game(ports(store),rules);await game.start();let completed=0,inputs=0;
 while(completed<rounds){const before=game.snapshot();await progress(game,agent,fast);assert.equal(game.status,'ready');const after=game.snapshot();assertState(after);inputs++;if(before.phase==='result'){completed++;saved.push(JSON.stringify(after));}}
 const final=game.snapshot();game.close();
 const replayStore=memory();game=new Game(ports(replayStore),rules);await game.start();const replay=replayAgent(decisions);let replayed=0;
 while(replayed<rounds){const before=game.snapshot();await progress(game,replay,fast);assert.equal(game.status,'ready');if(before.phase==='result'){assert.equal(JSON.stringify(game.snapshot()),saved[replayed]);replayed++;}}
 assert.deepEqual(game.snapshot(),final);game.close();return {completed,replayed,inputs,decisions:decisions.length,exceptions:0,invariantViolations:0,seed:1,agentSeed:987654};
}
test('same application path completes and decision-replays 10000 settled rounds',async()=>{const report=await runRounds();assert.equal(report.completed,10000);console.log('JANPON_ROUNDS '+JSON.stringify(report));});
