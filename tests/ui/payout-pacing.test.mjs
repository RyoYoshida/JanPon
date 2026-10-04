import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDisplay } from '../../src/adapters/dom.ts';
import { centralScene, sceneFor } from '../../src/adapters/central-scene.ts';
import { Game } from '../../src/application/game.ts';
import { progress } from '../../src/application/progress.ts';
import { initialState } from '../../src/core/state.ts';
import { seededRandom } from '../../src/core/random.ts';
import { uniformOpponent, fixedPayout } from '../../src/core/rules.ts';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// Controlled DOM/API + CSS-source evidence. No rendered pixels, real IDB or sound claims.
const durations = {1:800,2:1000,4:1400,7:1800,20:3000};
const win = {phase:'result',balance:9,choices:[],result:{player:'paper',opponent:'rock',outcome:'win',payout:4}};
const savedResult = payout => ({...initialState(1,42),revision:2,balance:9,phase:'result',roundNumber:1,
  round:{number:1,balanceBefore:10,opponent:'rock',result:{...win.result,payout}}});
const center = ui => ui.ids.get('state-indicator');
const release = async ui => { assert.equal(ui.shared.pendingWrites.length,1); ui.shared.pendingWrites.shift()(); await ui.flush(); };
const noSaveScene = ui => {
  assert.notEqual(center(ui).dataset.scene,'saving');
  assert.doesNotMatch(center(ui).innerHTML,/center-notice|center-progress/);
  assert.doesNotMatch(ui.ids.get('status').textContent,/保存と進行|保存中|保存を確定/);
};

test('all five prizes retain the final hand, matching window and numeral for the exact slower normal/muted timing', async t => {
  for (const [amount, duration] of Object.entries(durations)) for (const muted of [false,true]) {
    const payout=Number(amount), state=savedResult(payout), ui=await startBundle({savedState:state}); t.after(()=>ui.close());
    if(muted) ui.click('#audio-toggle');
    assert.equal(center(ui).dataset.scene,'roulette'); assert.equal(ui.document.querySelectorAll('.center-ejected-coin').length,0);
    await ui.tick(1349); assert.equal(ui.ids.get('prize').textContent,''); assert.equal(ui.writes,0);
    await ui.tick(1); assert.equal(center(ui).dataset.scene,'payout'); assert.equal(center(ui).dataset.payoutMotion,'release');
    assert.equal(ui.document.querySelectorAll('.center-coins, .center-ejected-coin').length,0);
    assert.equal(center(ui).querySelector('.center-result-hand').dataset.centerHand,state.round.result.opponent);
    assert.equal(center(ui).querySelector('.center-orbit'),null);
    assert.equal(ui.ids.get('prize').textContent,String(payout));
    assert.deepEqual(ui.lamps.filter(lamp=>lamp.classList.contains('active')).map(lamp=>lamp.dataset.value),[String(payout)]);
    await ui.tick(duration-1); assert.deepEqual(ui.savedState,state); assert.equal(ui.ids.get('balance').textContent,'9');
    ui.click('#coin-input'); ui.hands.forEach(button=>ui.click(button)); assert.equal(ui.writes,0); noSaveScene(ui);
    await ui.tick(1); assert.equal(ui.elapsed,1350+duration); assert.equal(ui.savedState.balance,9+payout);
    assert.equal(ui.ids.get('balance').textContent,String(9+payout)); assert.equal(ui.writes,1); assert.equal(ui.timers.size,0);
    assert.equal(ui.savedState.rngState,state.rngState); assert.equal(ui.savedState.revision,state.revision+1);
  }
});

test('delayed stake, hand result and settlement keep the prior scene and never advance timers or balance early', async t => {
  const ui=await startBundle(); t.after(()=>ui.close());
  ui.shared.holdNextWrite=true; ui.click('#coin-input'); ui.click('#coin-input'); await ui.flush();
  assert.equal(ui.writes,2); assert.equal(ui.savedState.balance,10); assert.equal(ui.ids.get('balance').textContent,'10');
  assert.equal(center(ui).dataset.scene,'waiting'); noSaveScene(ui); assert.ok(ui.hands.every(button=>button.disabled));
  await ui.tick(8000); assert.equal(ui.timers.size,0); await release(ui);
  assert.equal(ui.savedState.balance,9); assert.equal(center(ui).dataset.scene,'choosing');
  ui.shared.holdNextWrite=true; ui.click('[data-hand="paper"]'); ui.click('[data-hand="rock"]'); await ui.flush();
  assert.equal(ui.writes,3); assert.equal(center(ui).dataset.scene,'choosing'); noSaveScene(ui);
  await ui.tick(8000); assert.equal(ui.timers.size,0); assert.equal(ui.ids.get('prize').textContent,'');
  await release(ui); assert.equal(center(ui).dataset.scene,'roulette'); const start=ui.elapsed;
  ui.shared.holdNextWrite=true; await ui.tick(1350+1400);
  assert.equal(ui.elapsed-start,2750); assert.equal(ui.writes,4); assert.equal(ui.timers.size,0);
  assert.equal(center(ui).dataset.scene,'payout'); assert.equal(center(ui).dataset.payoutMotion,'static'); noSaveScene(ui);
  assert.equal(ui.ids.get('balance').textContent,'9'); assert.equal(ui.savedState.balance,9);
  for(let i=0;i<10;i++){ ui.click('#coin-input'); ui.click('[data-hand="paper"]'); ui.click('#motion-toggle'); }
  await ui.tick(8000); assert.equal(ui.timers.size,0); assert.equal(ui.writes,4); assert.equal(ui.savedState.balance,9);
  await release(ui); assert.equal(ui.savedState.balance,13); assert.equal(ui.ids.get('balance').textContent,'13');
  assert.equal(center(ui).dataset.scene,'waiting'); assert.equal(ui.ids.get('coin-input').disabled,false);
});

test('an aborted settlement replaces the retained payout with the visible non-destructive error and reload retries once', async t => {
  const state=savedResult(20), shared=createSharedState(state), ui=await startBundle({shared}); t.after(()=>ui.close());
  shared.holdNextWrite=true; await ui.tick(4350); assert.equal(center(ui).dataset.scene,'payout');
  shared.abortNext=true; await release(ui);
  assert.equal(center(ui).dataset.scene,'stopped'); assert.match(center(ui).innerHTML,/center-notice/);
  assert.match(ui.ids.get('status').textContent,/保存は消しません/); assert.equal(ui.ids.get('retry').hidden,false);
  assert.equal(ui.ids.get('balance').textContent,'9'); assert.deepEqual(ui.savedState,state); assert.equal(ui.timers.size,0);
  ui.click('#retry'); assert.equal(ui.reloads,1); await ui.close();
  const retry=await startBundle({shared}); t.after(()=>retry.close()); await retry.drain();
  assert.equal(retry.savedState.balance,29); assert.equal(shared.committedWrites,1); await retry.close();
  const again=await startBundle({shared}); t.after(()=>again.close()); await again.drain();
  assert.equal(again.savedState.balance,29); assert.equal(shared.writes,2);
});

test('closing during deferred settlement retains ownership until the write ends, then reopening cannot credit twice', async t => {
  const shared=createSharedState(savedResult(7)), ui=await startBundle({shared}); t.after(()=>ui.close());
  shared.holdNextWrite=true; await ui.tick(3150); assert.equal(shared.pendingWrites.length,1);
  await ui.close(); const closedMarkup=center(ui).innerHTML;
  assert.equal(center(ui).dataset.scene,'closed'); assert.equal(ui.timers.size,0); assert.equal(shared.leases.size,1);
  const blocked=await startBundle({shared}); t.after(()=>blocked.close()); assert.equal(center(blocked).dataset.scene,'other-tab');
  await release(ui); assert.equal(shared.leases.size,0); assert.equal(center(ui).innerHTML,closedMarkup);
  assert.equal(ui.ids.get('balance').textContent,'9'); assert.equal(ui.savedState.balance,16);
  const reopened=await startBundle({shared}); t.after(()=>reopened.close()); await reopened.drain();
  assert.equal(reopened.ids.get('balance').textContent,'16'); assert.equal(shared.writes,1);
});

test('interrupting any extended payout leaves a committed result to replay exactly once, including late payout exit', async t => {
  for(const [amount,duration] of Object.entries(durations)) {
    const payout=Number(amount), state=savedResult(payout), shared=createSharedState(state);
    const ui=await startBundle({shared}); t.after(()=>ui.close()); await ui.tick(1350+duration-1);
    await ui.close(); await ui.tick(20000); assert.equal(ui.timers.size,0); assert.deepEqual(ui.savedState,state); assert.equal(shared.writes,0);
    const replay=await startBundle({shared,reducedMotion:true}); t.after(()=>replay.close());
    assert.equal(center(replay).dataset.payoutMotion,'static'); await replay.tick(449); assert.deepEqual(replay.savedState,state);
    await replay.tick(1); assert.equal(replay.savedState.balance,9+payout); assert.equal(shared.writes,1);
    await replay.close(); const again=await startBundle({shared}); t.after(()=>again.close()); await again.drain(); assert.equal(shared.writes,1);
  }
});

test('late reduced-motion toggles use one static450ms hold with no coin drawing when switched back', async t => {
  for(const time of [0,1350,1801,3500]) {
    const ui=await startBundle({savedState:savedResult(20)}); t.after(()=>ui.close()); await ui.tick(time);
    ui.click('#motion-toggle'); await ui.flush(); assert.equal(center(ui).dataset.payoutMotion,'static'); assert.equal(ui.timers.size,1);
    for(let i=0;i<5;i++)ui.click('#motion-toggle');
    assert.equal(ui.machine.dataset.motion,'standard'); assert.equal(center(ui).dataset.payoutMotion,'static'); assert.equal(ui.timers.size,1);
    await ui.tick(449); assert.equal(ui.savedState.balance,9); await ui.tick(1); assert.equal(ui.savedState.balance,29); assert.equal(ui.writes,1);
  }
  const css=await readFile('game/style.css','utf8');
  assert.doesNotMatch(css,/center-coins|center-ejected-coin|center-coin-release|--coin-flight|--coin-delay/);
  assert.doesNotMatch(css,/data-scene="saving"/);
});

test('busy rendering preserves the same committed view and timer, while replacement/error/cancel clears stale effects', async t => {
  const ui=await startBundle({runBundle:false}); t.after(()=>ui.close()); const display=createDisplay(ui.document);
  display.render(win,'ready',''); const presentation=display.animate(win); await ui.tick(1350);
  const markup=center(ui).innerHTML, timers=[...ui.timers.keys()]; display.render(structuredClone(win),'busy','');
  assert.equal(center(ui).innerHTML,markup); assert.deepEqual([...ui.timers.keys()],timers); noSaveScene(ui);
  await display.finishPresentation(); assert.deepEqual([...ui.timers.keys()],timers,'busy writes cannot cancel the presentation timer');
  await ui.tick(1400); await presentation; assert.equal(center(ui).innerHTML,markup); assert.equal(ui.ids.get('balance').textContent,'9');
  assert.ok(ui.hands.every(button=>button.disabled)); assert.equal(ui.ids.get('coin-input').disabled,true);
  display.render(win,'stopped','write uncertain'); assert.equal(center(ui).dataset.scene,'stopped'); assert.equal(ui.ids.get('prize').textContent,'');
  display.render(win,'busy',''); assert.equal(center(ui).dataset.scene,'win','retry must not preserve the prior error glyph');
  assert.equal(sceneFor(win,'busy'),'win'); assert.equal(centralScene('saving',win),centralScene('win',win));
  display.render(win,'ready',''); const cancelled=display.finishPresentation();
  display.render({...win,result:{...win.result,payout:20}},'ready',''); await cancelled;
  const next=display.animate({...win,result:{...win.result,payout:20}}); await ui.tick(100);
  const finish=display.finishPresentation(); assert.equal(ui.timers.size,1); await ui.tick(450); await Promise.all([next,finish]);
  assert.equal(ui.ids.get('prize').textContent,'20'); assert.equal(ui.timers.size,0);
});

test('real application + display preserve last balance for rejected and unknown writes, rereading either durable side without double credit', async t => {
  for(const outcome of ['failed','reject','unknown-old','unknown-committed']) {
    const ui=await startBundle({runBundle:false}); t.after(()=>ui.close()); const display=createDisplay(ui.document);
    let durable=savedResult(20), writes=0, resolveWrite, rejectWrite, candidate;
    const store={read:async()=>({kind:'loaded',value:structuredClone(durable)}),write:async value=>{writes++;candidate=structuredClone(value);return new Promise((resolve,reject)=>{resolveWrite=resolve;rejectWrite=reject;});}};
    let held=false; const ownership={acquire:async()=>held?null:(held=true,{release(){held=false;}})};
    const game=new Game({store,ownership,seed:1,clock:{now:()=>ui.elapsed},rng:seededRandom,
      outputs:[{id:'display',priority:0,emit:()=>display.render(game.view(),game.status,game.reason)}]}, {opponent:uniformOpponent,payout:fixedPayout});
    await game.start(); const agent={id:'never',priority:0,decide:async()=>{throw Error('unexpected input');}};
    const running=progress(game,agent,{present:view=>display.animate(view)}).then(()=>display.render(game.view(),game.status,game.reason));
    await ui.tick(4350); assert.equal(writes,1); assert.equal(game.status,'busy'); assert.equal(ui.ids.get('balance').textContent,'9'); noSaveScene(ui);
    await ui.tick(5000); assert.equal(ui.timers.size,0); assert.equal(game.view().balance,9);
    if(outcome==='unknown-committed')durable=structuredClone(candidate);
    if(outcome==='reject')rejectWrite(Error('rejected write'));
    else resolveWrite({kind:outcome.startsWith('unknown')?'unknown':'failed',reason:outcome});
    await running; assert.equal(game.status,'stopped'); assert.equal(center(ui).dataset.scene,'stopped'); assert.equal(ui.ids.get('balance').textContent,'9');
    assert.equal(ui.ids.get('retry').hidden,false); assert.equal(durable.balance,outcome==='unknown-committed'?29:9);
    store.write=async value=>{writes++;durable=structuredClone(value);return {kind:'committed'};};
    await game.retry(); if(game.view().phase==='result'){const retry=progress(game,agent,{present:view=>display.animate(view)});await ui.drain();await retry;}
    assert.equal(game.view().balance,29); assert.equal(durable.balance,29); assert.equal(writes,outcome==='unknown-committed'?1:2);
    await game.settle(2); assert.equal(game.view().balance,29); game.close();
  }
});
