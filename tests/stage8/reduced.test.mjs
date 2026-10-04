import test from 'node:test';
import assert from 'node:assert/strict';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';
const committed = state => { const copy=structuredClone(state);delete copy.updatedAt;return copy; };
async function win(options={}) {
 const ui=await startBundle(options);ui.click('#coin-input');await ui.flush();ui.click('[data-hand="paper"]');await ui.flush();
 assert.equal(ui.machine.dataset.phase,'result');assert.equal(ui.savedState.round.result.payout,4);return ui;
}
test('A5 full bundle switches during roulette or payout hold without changing result, RNG or accounting',async()=>{
 const normal=await win();await normal.drain();const expected=committed(normal.savedState);await normal.close();
 for(const time of [0,45,1305,1350,1500]){
  const ui=await win();await ui.tick(time);const before=committed(ui.savedState),writes=ui.writes;
  ui.click('#motion-toggle');await ui.flush();
  assert.equal(ui.machine.dataset.motion,'reduced');assert.deepEqual(committed(ui.savedState),before);assert.equal(ui.writes,writes);
  assert.equal(ui.ids.get('prize').textContent,'4');assert.deepEqual(ui.lamps.filter(l=>l.classList.contains('active')).map(l=>l.dataset.value),['4']);
  assert.equal(ui.timers.size,1);ui.click('#motion-toggle');await ui.flush();assert.equal(ui.machine.dataset.motion,'standard');assert.equal(ui.timers.size,1);
  await ui.tick(449);assert.equal(ui.machine.dataset.phase,'result');assert.equal(ui.savedState.balance,9);
  await ui.tick(1);assert.equal(ui.machine.dataset.phase,'idle');assert.equal(ui.savedState.balance,13);assert.equal(ui.writes,4);
  assert.deepEqual(committed(ui.savedState),expected);await ui.drain();assert.equal(ui.writes,4);await ui.close();
 }
});
test('A5 initial system preference uses one static result hold and respects manual choice',async()=>{
 const ui=await win({reducedMotion:true});assert.equal(ui.machine.dataset.motion,'reduced');assert.equal(ui.ids.get('prize').textContent,'4');
 assert.equal(ui.timers.size,1);assert.equal(ui.timerHistory.at(-1).duration,450);
 await ui.drain();assert.equal(ui.savedState.balance,13);assert.equal(ui.writes,4);
 ui.click('#motion-toggle');assert.equal(ui.machine.dataset.motion,'standard');ui.setReducedMotion(false);ui.setReducedMotion(true);
 assert.equal(ui.machine.dataset.motion,'standard');assert.equal(ui.writes,4);await ui.close();
});
test('A5 media preference change in flight finishes once; missing media API still offers settings',async()=>{
 const ui=await win();const before=committed(ui.savedState);ui.setReducedMotion(true);await ui.flush();
 assert.deepEqual(committed(ui.savedState),before);assert.equal(ui.ids.get('prize').textContent,'4');assert.equal(ui.timers.size,1);
 ui.setReducedMotion(false);ui.setReducedMotion(true);assert.equal(ui.timers.size,1);await ui.drain();assert.equal(ui.writes,4);assert.equal(ui.savedState.balance,13);await ui.close();
 const absent=await startBundle({matchMedia:false});assert.equal(absent.machine.dataset.motion,'standard');absent.click('#motion-toggle');assert.equal(absent.machine.dataset.motion,'reduced');assert.equal(absent.savedState.balance,10);await absent.close();
});
test('A5 persisted committed prizes all render unchanged and reload never pays twice',async()=>{
 const sample=await win();const saved=sample.savedState;await sample.close();
 for(const payout of [1,2,4,7,20]){
  const shared=createSharedState();const state=structuredClone(saved);state.round.result.payout=payout;shared.durable.set('current',state);
  let ui=await startBundle({shared,reducedMotion:true});assert.equal(ui.ids.get('prize').textContent,String(payout));
  assert.deepEqual(ui.lamps.filter(l=>l.classList.contains('active')).map(l=>l.dataset.value),[String(payout)]);
  assert.deepEqual(committed(ui.savedState),committed(state));await ui.tick(100);await ui.close();assert.equal(ui.timers.size,0);assert.equal(shared.writes,0);
  ui=await startBundle({shared,reducedMotion:true});await ui.drain();assert.equal(ui.savedState.balance,9+payout);assert.equal(shared.writes,1);await ui.close();
  ui=await startBundle({shared,reducedMotion:true});await ui.drain();assert.equal(ui.savedState.balance,9+payout);assert.equal(shared.writes,1);await ui.close();
 }
});
test('A5 settings never insert and reduced draws remain free with semantic icon controls',async()=>{
 const ui=await startBundle();const button=ui.ids.get('motion-toggle');assert.equal(button.localName,'button');assert.equal(button.type,'button');
 assert.equal(button.getAttribute('aria-keyshortcuts'),'Enter Space');assert.match(button.getAttribute('aria-label'),/動き控えめ/);
 assert.equal(button.closest('#coin-input'),null);assert.ok(button.closest('.settings-controls'));assert.equal(button.textContent,'');
 ui.click('#motion-toggle');assert.equal(ui.savedState.balance,10);assert.equal(ui.writes,1);
 ui.click('#coin-input');await ui.flush();ui.click('[data-hand="rock"]');await ui.flush();assert.equal(ui.savedState.round.result.outcome,'draw');
 const before=committed(ui.savedState);ui.click('#motion-toggle');ui.click('#motion-toggle');await ui.drain();assert.deepEqual(committed(ui.savedState),before);
 assert.equal(ui.savedState.balance,9);assert.equal(ui.writes,3);assert.ok(ui.hands.every(b=>!b.disabled));assert.equal(ui.ids.get('coin-input').disabled,true);await ui.close();
});
