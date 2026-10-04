import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplay } from '../../src/adapters/dom.ts';
import { centralScene } from '../../src/adapters/central-scene.ts';
import { medalDigits } from '../../src/adapters/medal-digits.ts';
import { initialState } from '../../src/core/state.ts';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// DOM/API-contract snapshots only; not CSS layout, rendered pixels or device QA.
const durations={1:800,2:1000,4:1400,7:1800,20:3000};
const result=(payout,opponent='rock')=>({player:{rock:'paper',scissors:'rock',paper:'scissors'}[opponent],opponent,outcome:'win',payout});
const saved=(payout,opponent='rock')=>({...initialState(1,42),revision:2,balance:9,phase:'result',roundNumber:1,
  round:{number:1,balanceBefore:10,opponent,result:result(payout,opponent)}});
const center=ui=>ui.ids.get('state-indicator');
function finalFrame(ui,payout,opponent='rock') {
  assert.equal(center(ui).dataset.scene,'payout');
  assert.equal(ui.document.querySelectorAll('.center-result-hand').length,1);
  assert.equal(center(ui).querySelector('.center-result-hand').dataset.centerHand,opponent);
  assert.doesNotMatch(center(ui).innerHTML,/center-cycle|center-orbit|center-coins|center-ejected-coin|center-notice|center-progress/);
  assert.equal(ui.ids.get('prize').textContent,String(payout));
  const prize=ui.ids.get('prize'),svg=prize.querySelector('svg');
  assert.equal(prize.innerHTML,medalDigits(payout),'payout uses the same exact dot glyphs as the wallet');
  assert.equal(prize.querySelectorAll('[data-medal-digit]').map(node=>node.dataset.medalDigit).join(''),String(payout));
  assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
  assert.equal(svg.getAttribute('fill'),'currentColor');
  assert.equal(prize.style.color,ui.lamps.find(lamp=>lamp.classList.contains('active')).getAttribute('fill'));
  assert.deepEqual(ui.lamps.filter(lamp=>lamp.classList.contains('active')).map(lamp=>lamp.dataset.value),[String(payout)]);
  assert.equal(ui.ids.get('balance').textContent,'9');
  assert.equal(ui.ids.get('coin-input').disabled,true);
}

test('all committed hands have identical win and payout artwork without coin art or a continuing orbit',()=>{
  for(const opponent of ['rock','scissors','paper'])for(const payout of [1,2,4,7,20]){
    const view={phase:'result',balance:9,choices:[],result:result(payout,opponent)};
    assert.equal(centralScene('payout',view),centralScene('win',view));
    assert.match(centralScene('payout',view),new RegExp(`center-result-hand" data-center-hand="${opponent}"`));
    assert.doesNotMatch(centralScene('payout',view),/center-orbit|center-coins|center-ejected-coin/);
    assert.equal(centralScene('roulette',view).replace(/<circle class="center-orbit"[^>]+\/>/,''),centralScene('payout',view));
  }
});

test('normal payout retains the last hand through the full wait and delayed commit, with no blank intermediate markup',async t=>{
  for(const [amount,duration]of Object.entries(durations)){
    const payout=Number(amount),shared=createSharedState(saved(payout)),ui=await startBundle({shared});t.after(()=>ui.close());
    const writes=[],indicator=center(ui),descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(indicator),'innerHTML');
    Object.defineProperty(indicator,'innerHTML',{get(){return descriptor.get.call(this);},set(markup){writes.push(markup);descriptor.set.call(this,markup);}});
    assert.equal(indicator.querySelector('.center-result-hand').dataset.centerHand,'rock');
    await ui.tick(1349);assert.equal(ui.ids.get('prize').textContent,'');
    await ui.tick(1);finalFrame(ui,payout);const artwork=indicator.innerHTML;
    shared.holdNextWrite=true;await ui.tick(duration-1);finalFrame(ui,payout);assert.equal(shared.writes,0);
    await ui.tick(1);finalFrame(ui,payout);assert.equal(shared.pendingWrites.length,1);assert.equal(ui.timers.size,0);
    await ui.tick(10000);finalFrame(ui,payout);assert.equal(indicator.innerHTML,artwork);assert.equal(shared.durable.get('current').balance,9);
    assert.ok(writes.length>0);assert.ok(writes.every(markup=>/center-result-hand/.test(markup)),'no empty SVG or clearing write before committed return');
    shared.pendingWrites.shift()();await ui.flush();
    assert.equal(indicator.dataset.scene,'waiting');assert.match(indicator.innerHTML,/center-cycle/);
    assert.equal(ui.document.querySelectorAll('.center-result-hand').length,0);assert.equal(ui.ids.get('prize').textContent,'');
    assert.equal(ui.ids.get('balance').textContent,String(9+payout));assert.equal(ui.ids.get('coin-input').disabled,false);assert.equal(shared.writes,1);
    assert.ok(writes.every(markup=>/center-result-hand|center-cycle/.test(markup)),'return to normal is a direct scene replacement');
  }
});

test('reopened and reduced payouts derive the same final hand from the save and preserve it across preference changes',async t=>{
  for(const opponent of ['rock','scissors','paper'])for(const reducedMotion of [false,true]){
    const shared=createSharedState(saved(20,opponent));let ui=await startBundle({shared,reducedMotion});t.after(()=>ui.close());
    if(!reducedMotion)await ui.tick(1350);finalFrame(ui,20,opponent);await ui.close();assert.equal(shared.writes,0);
    ui=await startBundle({shared,reducedMotion:true});t.after(()=>ui.close());finalFrame(ui,20,opponent);const artwork=center(ui).innerHTML;
    for(let i=0;i<9;i++)ui.click('#motion-toggle');
    await ui.tick(449);finalFrame(ui,20,opponent);assert.equal(center(ui).innerHTML,artwork);
    shared.holdNextWrite=true;await ui.tick(1);finalFrame(ui,20,opponent);
    for(let i=0;i<8;i++)ui.click('#motion-toggle');await ui.tick(5000);finalFrame(ui,20,opponent);assert.equal(ui.timers.size,0);
    shared.pendingWrites.shift()();await ui.flush();assert.equal(center(ui).dataset.scene,'waiting');assert.equal(ui.savedState.balance,29);assert.equal(shared.writes,1);
  }
});

test('payout save failure overrides the retained hand with the recoverable error, not a blank or ordinary waiting scene',async t=>{
  const shared=createSharedState(saved(7)),ui=await startBundle({shared});t.after(()=>ui.close());
  await ui.tick(1350);finalFrame(ui,7);shared.holdNextWrite=true;await ui.tick(1800);finalFrame(ui,7);
  shared.abortNext=true;shared.pendingWrites.shift()();await ui.flush();
  assert.equal(center(ui).dataset.scene,'stopped');assert.match(center(ui).innerHTML,/center-notice/);
  assert.doesNotMatch(center(ui).innerHTML,/center-result-hand|center-cycle|center-coins|center-ejected-coin/);
  assert.equal(ui.ids.get('retry').hidden,false);assert.equal(ui.ids.get('coin-input').disabled,true);
  assert.equal(ui.ids.get('balance').textContent,'9');assert.equal(ui.savedState.balance,9);assert.match(ui.ids.get('status').textContent,/保存は消しません/);
});

test('loss and tie keep their original final hands and timing without exposing an uncommitted result',async t=>{
  const ui=await startBundle({runBundle:false});t.after(()=>ui.close());const display=createDisplay(ui.document);
  for(const outcome of ['loss','draw']){
    const view={phase:outcome==='draw'?'choosing':'result',balance:9,choices:outcome==='draw'?[{kind:'hand',hand:'rock'}]:[],result:{player:'rock',opponent:outcome==='draw'?'rock':'paper',outcome,payout:0}};
    display.render(view,'ready','');const presentation=display.animate(view),duration=outcome==='draw'?450:1800;
    const markup=center(ui).innerHTML;await ui.tick(duration-1);assert.equal(center(ui).innerHTML,markup);
    assert.equal(center(ui).querySelector('.center-result-hand').dataset.centerHand,view.result.opponent);assert.equal(ui.ids.get('prize').textContent,'');
    await ui.tick(1);await presentation;
    assert.equal(center(ui).dataset.scene,outcome==='draw'?'draw-ready':'loss');
  }
  display.render({phase:'choosing',balance:9,choices:[{kind:'hand',hand:'rock'}],result:null},'ready','');
  assert.equal(center(ui).dataset.scene,'choosing');assert.equal(center(ui).querySelector('.center-result-hand'),null);assert.equal(ui.ids.get('prize').textContent,'');
});
