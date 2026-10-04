import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENGINE, EFFECTS } from '../../src/spec.ts';
import { createDisplay } from '../../src/adapters/dom.ts';
import { listenPresentationCue } from '../../src/adapters/presentation-cues.ts';
import { startBundle } from '../helpers/browser-harness.mjs';

// Real bundled orchestration, controlled DOM/audio/clock. No actual rendering/audio QA claim.
const center = ui => ui.ids.get('state-indicator');
const drawTones = ui => ui.audio.starts.filter(({oscillator})=>oscillator.frequency.value === EFFECTS.frequencies.draw);
async function beginDraw(options={}) {
  const ui=await startBundle(options);
  ui.click('#coin-input'); await ui.flush();
  ui.click(`[data-hand="${ui.savedState.round.opponent}"]`); await ui.flush();
  assert.equal(ui.savedState.round.result.outcome,'draw'); assert.equal(center(ui).dataset.scene,'draw');
  return ui;
}
function markHidden(ui,value) {
  ui.document.hidden=value; ui.document.visibilityState=value?'hidden':'visible';
  ui.dispatch(ui.document,'visibilitychange');
}

test('draw holds still, rejects rapid input, and starts sound plus fast choice on the same 450ms tick', async t => {
  const ui=await beginDraw(); t.after(()=>ui.close());
  assert.equal(drawTones(ui).length,0);
  const saved=ui.savedState,writes=ui.writes;
  for (let press=0;press<8;press++) {ui.click('[data-hand="paper"]'); ui.pressKey('p');}
  await ui.tick(ENGINE.drawDurationMs-1);
  assert.equal(center(ui).dataset.scene,'draw'); assert.equal(drawTones(ui).length,0);
  assert.ok(ui.hands.every(button=>button.disabled));
  assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
  await ui.tick(1);
  assert.equal(center(ui).dataset.scene,'draw-ready');
  assert.match(center(ui).innerHTML,/class="center-cycle"/);
  assert.equal(drawTones(ui).length,1); assert.equal(drawTones(ui)[0].when,.45);
  assert.equal(ui.elapsed,450); assert.ok(ui.hands.every(button=>!button.disabled));
  assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
  for(const {oscillator} of ui.audio.starts.slice(0,-1)) assert.equal(oscillator.disconnected,true,'older voices disconnected before restart');
});

test('muted, refused, pending, suspended and missing audio never postpone the same visual restart', async t => {
  for(const mode of ['allowed','muted','rejected','pending','suspended','unavailable']) {
    const audio=mode==='rejected'?{resume:'reject'}:mode==='pending'?{resume:'pending'}:mode==='unavailable'?{available:false}:{};
    const ui=await beginDraw({audio}); t.after(()=>ui.close());
    if(mode==='muted') ui.click('#audio-toggle');
    if(mode==='suspended') await ui.audio.contexts[0].suspend();
    const saved=ui.savedState,writes=ui.writes;
    await ui.tick(450);
    assert.equal(center(ui).dataset.scene,'draw-ready',mode); assert.ok(ui.hands.every(button=>!button.disabled),mode);
    assert.equal(drawTones(ui).length,mode==='allowed'?1:0,mode);
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes); assert.equal(ui.timers.size,0);
    if(mode==='muted') ui.click('#audio-toggle');
    if(mode==='pending') ui.audio.resolveResume();
    if(mode==='suspended') await ui.audio.contexts[0].resume();
    await ui.flush(); assert.equal(drawTones(ui).length,mode==='allowed'?1:0,'no late catch-up cue');
  }
});

test('reduced switches during hold join its deadline; switches after it never replay a hold or cue', async t => {
  for(const initialReduced of [false,true]) for(const elapsed of [0,125,449]) {
    const ui=await beginDraw({reducedMotion:initialReduced}); t.after(()=>ui.close());
    await ui.tick(elapsed); const saved=ui.savedState,writes=ui.writes;
    for(let flip=0;flip<5;flip++) {ui.click('#motion-toggle'); await ui.flush();}
    assert.equal(ui.timers.size,1); assert.equal(drawTones(ui).length,0);
    await ui.tick(450-elapsed);
    assert.equal(center(ui).dataset.scene,'draw-ready'); assert.equal(ui.timers.size,0);
    assert.equal(drawTones(ui).length,1); assert.equal(drawTones(ui)[0].when,.45);
    for(let flip=0;flip<4;flip++) {ui.click('#motion-toggle'); await ui.flush();}
    await ui.tick(2000);
    assert.equal(center(ui).dataset.scene,'draw-ready'); assert.equal(drawTones(ui).length,1);
    assert.equal(ui.timers.size,0); assert.ok(ui.hands.every(button=>!button.disabled));
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
  }
});

test('each consecutive draw gets one pause/cue, including identical hand results, without extra stakes', async t => {
  const ui=await startBundle(); t.after(()=>ui.close());
  ui.click('#coin-input'); await ui.flush();
  let previous=null, repeated=false;
  for(let round=0;round<12;round++) {
    const opponent=ui.savedState.round.opponent;
    if(opponent===previous) repeated=true; previous=opponent;
    ui.click(`[data-hand="${opponent}"]`); await ui.flush();
    assert.equal(center(ui).dataset.scene,'draw'); assert.equal(drawTones(ui).length,round);
    assert.equal(ui.savedState.balance,9); assert.equal(ui.savedState.roundNumber,1);
    await ui.tick(450);
    assert.equal(center(ui).dataset.scene,'draw-ready'); assert.equal(drawTones(ui).length,round+1);
    assert.equal(drawTones(ui).at(-1).when,((round+1)*450)/1000);
  }
  assert.equal(repeated,true,'deterministic sequence contains identical adjacent opponents');
  assert.equal(ui.writes,14); assert.equal(ui.savedState.balance,9); assert.equal(ui.timers.size,0);
});

test('restored draws remain ready and do not manufacture a new cue when reduced mode is toggled', async t => {
  const original=await beginDraw(); await original.close();
  const restored=await startBundle({shared:original.shared}); t.after(()=>restored.close());
  assert.equal(center(restored).dataset.scene,'draw-ready'); assert.ok(restored.hands.every(button=>!button.disabled));
  const saved=restored.savedState,writes=restored.writes;
  for(let flip=0;flip<4;flip++) restored.click('#motion-toggle');
  await restored.drain();
  assert.equal(center(restored).dataset.scene,'draw-ready'); assert.equal(drawTones(restored).length,0);
  assert.equal(restored.timers.size,0); assert.deepEqual(restored.savedState,saved); assert.equal(restored.writes,writes);
  restored.click(`[data-hand="${restored.savedState.round.opponent}"]`); await restored.flush();
  await restored.tick(450);
  assert.equal(drawTones(restored).length,1); assert.equal(restored.savedState.balance,9);
});

test('hidden tabs silence voices and skip the expired cue without replaying it on return', async t => {
  const ui=await beginDraw(); t.after(()=>ui.close());
  await ui.tick(100); markHidden(ui,true);
  assert.ok(ui.audio.oscillators.every(oscillator=>oscillator.disconnected));
  await ui.tick(350);
  assert.equal(center(ui).dataset.scene,'draw-ready'); assert.equal(drawTones(ui).length,0);
  assert.equal(ui.timers.size,0); markHidden(ui,false); await ui.tick(1000);
  assert.equal(drawTones(ui).length,0); assert.ok(ui.hands.every(button=>!button.disabled));
});

test('page exit cancels pending cues and timers and removes audio subscriptions before late permission', async t => {
  for(const resume of ['resolve','pending']) {
    const ui=await beginDraw({audio:{resume}}); t.after(()=>ui.close());
    await ui.tick(200); const saved=ui.savedState,writes=ui.writes;
    await ui.close(); ui.audio.resolveResume(); await ui.tick(1000);
    assert.equal(center(ui).dataset.scene,'closed'); assert.equal(drawTones(ui).length,0);
    assert.equal(ui.timers.size,0); assert.equal(ui.audio.closeCalls,1);
    assert.ok(ui.audio.oscillators.every(oscillator=>oscillator.disconnected));
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
  }
});

test('state cancellation and detached presentation never fire a late cue; listener exceptions cannot block restart', async t => {
  const draw={phase:'choosing',balance:9,choices:[{kind:'hand',hand:'rock'}],result:{player:'rock',opponent:'rock',outcome:'draw',payout:0}};
  for(const action of ['stopped','closed','detached','exception']) {
    const ui=await startBundle({runBundle:false}); t.after(()=>ui.close());
    const display=createDisplay(ui.document); let cues=0;
    const remove=listenPresentationCue(ui.document,()=>{cues++; if(action==='exception') throw Error('optional receiver rejected cue');}); t.after(remove);
    display.render(draw,'ready',''); const presenting=display.animate(draw);
    await ui.tick(100);
    if(action==='detached') ui.machine.remove();
    else if(action!=='exception') display.render(draw,action,'test cancellation');
    await ui.drain(); await presenting;
    assert.equal(cues,action==='exception'?1:0); assert.equal(ui.timers.size,0);
    if(action==='exception') {
      assert.equal(ui.hands.find(button=>button.dataset.hand==='rock').disabled,false);
      assert.ok(ui.hands.filter(button=>button.dataset.hand!=='rock').every(button=>button.disabled));
    }
  }
});

test('rapid choices use unchanged idle fades with no added backlight, inversion, or full-panel animation', async () => {
  const css=await readFile('game/style.css','utf8');
  assert.doesNotMatch(css,/center-backlight|center-rapid-cycle|center-(rock|scissors|paper)-rapid/);
  assert.doesNotMatch(css,/data-scene="draw"\][^{]*\{animation:/);
  for(const hand of ['rock','scissors','paper']) {
    const waiting=css.split('\n').find(line=>line.includes(`[data-scene="waiting"] .center-${hand}`)).split('{')[1];
    const choosing=css.split('\n').find(line=>line.includes(`[data-scene="choosing"] .center-${hand}`)).split('{')[1];
    assert.equal(choosing.replace('.48s','4.8s'),waiting);
  }
  const fastRules=css.split('\n').filter(line=>line.includes('.48s'));
  assert.equal(fastRules.length,3); assert.ok(fastRules.every(line=>line.includes('] .center-')));
  assert.equal(4.8/.48,10);
});
