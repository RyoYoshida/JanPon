import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../../src/core/random.ts';
import { outcome, payoutAt, uniformOpponent, fixedPayout } from '../../src/core/rules.ts';
import { initialState, assertState } from '../../src/core/state.ts';
import { transition } from '../../src/core/transitions.ts';
const rules={opponent:uniformOpponent,payout:fixedPayout};
const rng={next:(state,bound)=>({state:state+1,value:bound===3?1:99})};
const move=(s,a)=>transition(s,a,rng,rules,42);
test('G01–G09 direct independent nine outcomes',()=>{
 const expected=[['rock','rock','draw'],['rock','scissors','win'],['rock','paper','loss'],['scissors','rock','loss'],['scissors','scissors','draw'],['scissors','paper','win'],['paper','rock','win'],['paper','scissors','loss'],['paper','paper','draw']];
 for(const [a,b,result] of expected) assert.equal(outcome(a,b),result);
});
test('G14 all 100 payout slots against independent approved ranges; G15 arithmetic',()=>{
 const expected=[...Array(65).fill(1),...Array(18).fill(2),...Array(11).fill(4),...Array(5).fill(7),20];
 assert.deepEqual(Array.from({length:100},(_,i)=>payoutAt(i)),expected);
 assert.equal(expected.reduce((a,b)=>a+b,0)/100,2);
 assert.equal((1/3)/(1-1/3),0.49999999999999994);
 for(const x of [-1,100,0.5,NaN,Infinity]) assert.throws(()=>payoutAt(x));
});
test('seeded RNG independent exact-integer vector and rejection threshold',()=>{
 const states=[48271,182605794,1291394886,1914720637,2078669041,407355683,1105902161,854716505,564586691,1596680831];
 const values=[70,93,85,36,40,82,60,4,90,30];let state=1;
 for(let i=0;i<states.length;i++){const next=seededRandom.next(state,100);assert.deepEqual(next,{state:states[i],value:values[i]});state=next.state;}
 assert.deepEqual(seededRandom.next(247665088,100),{state:2147435376,value:75});
 assert.deepEqual(seededRandom.next(655175813,100),{state:2145263181,value:80});
 for(const seed of [0,-1,2147483647,NaN,1.5])assert.throws(()=>seededRandom.next(seed,3));
});
test('G10 coin transitions once, saved opponent; G13 twenty award settles once',()=>{
 const start=initialState(1,42);assert.equal(move(start,{kind:'hand',hand:'rock'}),start);
 const choosing=move(start,{kind:'coin'});assert.equal(choosing.balance,9);assert.equal(choosing.round.opponent,'scissors');
 assert.equal(move(choosing,{kind:'coin'}),choosing);
 const won=move(choosing,{kind:'hand',hand:'rock'});assert.equal(won.balance,9);assert.equal(won.round.result.payout,20);
 const settled=move(won,{kind:'advance'});assert.equal(settled.balance,29);assert.equal(settled.phase,'idle');assert.equal(move(settled,{kind:'advance'}),settled);
});
test('G11 last medal remains playable through two free draws; G12 terminal restart',()=>{
 // A valid already-settled nine-loss history is represented by its current round only.
 let s={...initialState(1,42),balance:1,roundNumber:9,round:{number:9,balanceBefore:2,opponent:'rock',result:{player:'scissors',opponent:'rock',outcome:'loss',payout:0}}};
 s=move(s,{kind:'coin'});assert.equal(s.balance,0);const number=s.round.number;
 for(let i=0;i<2;i++){s=move(s,{kind:'hand',hand:'scissors'});assert.equal(s.phase,'choosing');assert.equal(s.balance,0);assert.equal(s.round.number,number);}
 s=move(s,{kind:'hand',hand:'paper'});s=move(s,{kind:'advance'});assert.equal(s.phase,'game-over');assert.equal(s.balance,0);
 s=move(s,{kind:'restart'});assert.equal(s.balance,10);assert.equal(s.phase,'idle');
});
test('saved context rejects corruption, inconsistent phases, unknown schema without modifying input',()=>{
 const start=initialState(1,42);const win=move(move(start,{kind:'coin'}),{kind:'hand',hand:'rock'});
 const bad=[null,{}, {...start,schema:'future'}, {...start,balance:0}, {...win,balance:29}, {...win,phase:'choosing'}, {...win,round:{...win.round,result:{...win.round.result,payout:3}}}, {...win,rngState:0}];
 for(const data of bad){const before=JSON.stringify(data);assert.throws(()=>assertState(data));assert.equal(JSON.stringify(data),before);}
});
