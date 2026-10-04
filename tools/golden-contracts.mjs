import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SPEC } from '../src/spec.ts';
import { assertAccountingFixture, assertWeights } from '../src/core/invariants.ts';
/** Independent semantic expectations authored from GOAL/RATIONALE before gameplay exists.
 * These are foundation contract checks, never executions of the unfinished game. */
export async function checkGoldens(path = 'tests/golden/approved-examples.json') {
 const golden = JSON.parse(await readFile(path, 'utf8'));
 assert.equal(golden.status, 'approved_semantic_examples');
 assert.equal(golden.rows.length, 20);
 const byId = new Map(golden.rows.map(row => [row.id, row]));
 assert.equal(byId.size, 20);
 const expectations = [
 ['G01','グー／グー','あいこ'], ['G02','グー／チョキ','勝ち'], ['G03','グー／パー','負け'],
 ['G04','チョキ／グー','負け'], ['G05','チョキ／チョキ','あいこ'], ['G06','チョキ／パー','勝ち'],
 ['G07','パー／グー','勝ち'], ['G08','パー／チョキ','負け'], ['G09','パー／パー','あいこ'],
 ['G10','10枚・投入待ち: 手/筐体→コイン→連打','10→10→9→9枚。投入後すぐ選択可'],
 ['G11','1枚→投入→あいこ2回','0枚で手選択継続、投入計1枚'],
 ['G12','1枚→投入→負け→はじめから','0枚で終了→明示操作で10枚'],
 ['G13','1枚→投入→20枚当選→精算通知2回','0→20→20枚、次の投入待ち'],
 ['G14','配当整数u=0..99','0–64:1 / 65–82:2 / 83–93:4 / 94–98:7 / 99:20'],
 ['G15','固定配当＋独立3手＋無料あいこ','勝ち平均2枚、決着勝率1/2、還元100%'],
 ['G16','10枚の投入保存を中断','未commitは10・idle／commit済は9・choosing'],
 ['G17','勝ち20枚の結果保存を中断','旧choosingまたは同じ20のwin-result、残高9'],
 ['G18','残高9・当選20の精算保存を中断／再読込','9・未精算または29・精算済→最終29'],
 ['G19','同じ確定結果で音/動きの設定だけ変更','手・当選・残高が変わらない'],
 ['G20','保存失敗／破損保存','操作停止、元保存保持。勝手に10枚化なし'],
 ];
 for (const [id,input,expected] of expectations) {
  assert.equal(byId.get(id)?.input, input, `${id} input`);
  assert.equal(byId.get(id)?.expected, expected, `${id} approved semantic expectation`);
 }
 assert.equal(SPEC.initialBalance,10); assert.equal(SPEC.stake,1);
 assert.deepEqual([...SPEC.hands],['rock','scissors','paper']);
 assert.deepEqual([...SPEC.opponentWeights],[1,1,1]);
 assertWeights(SPEC.opponentWeights, 3);
 const distribution = SPEC.payoutTable.flatMap(row => Array(row.weight).fill(row.medals));
 const independentDistribution = [...Array(65).fill(1),...Array(18).fill(2),...Array(11).fill(4),...Array(5).fill(7),20];
 assert.deepEqual(distribution, independentDistribution, 'G14 all hundred slots');
 assertWeights(SPEC.payoutTable.map(row=>row.weight),100);
 assert.equal(distribution.reduce((a,b)=>a+b,0)/100,2);
 assert.deepEqual(SPEC.decisiveWinProbability,{numerator:1,denominator:2});
 assert.equal(SPEC.expectedWinPayout * SPEC.decisiveWinProbability.numerator / SPEC.decisiveWinProbability.denominator / SPEC.stake, 1);
 assert.equal(SPEC.theoreticalReturn.numerator / SPEC.theoreticalReturn.denominator,1);
 const stake = {kind:'stake',roundId:'r',amount:1};
 const round = {id:'r',outcome:'pending',payout:0,settlement:'pending'};
 const choosing = {initialBalance:10,balance:9,entries:[stake],phase:'choosing',round};
 const win = {...choosing,phase:'win-result',round:{...round,outcome:'win',payout:20}};
 const settled = {...win,balance:29,phase:'settled',entries:[stake,{kind:'settlement',roundId:'r',amount:20}],round:{...win.round,settlement:'complete'}};
 const fixtures = [
  {initialBalance:10,balance:10,entries:[],phase:'idle'}, choosing,
  {...choosing,initialBalance:1,balance:0,round:{...round,outcome:'draw'}},
  {...choosing,initialBalance:1,balance:0,phase:'game-over',entries:[stake,{kind:'settlement',roundId:'r',amount:0}],round:{...round,outcome:'loss',settlement:'complete'}},
  {...settled,initialBalance:1,balance:20}, win, settled,
 ];
 for (const fixture of fixtures) assertAccountingFixture(fixture);
 assert.throws(()=>assertAccountingFixture({...choosing,balance:10}),/total/);
 assert.throws(()=>assertAccountingFixture({...settled,balance:49,entries:[...settled.entries,settled.entries[1]]}),/duplicate/);
 assert.throws(()=>assertAccountingFixture({...choosing,phase:'idle'}),/idle/);
 return { rows:20, payoutSlots:100, accountingFixtures:fixtures.length,
  scope:'semantic/specification and supplied-fixture invariants only',
  productBehavior:'NOT_IMPLEMENTED: no game, persistence, settings or UI execution' };
}
