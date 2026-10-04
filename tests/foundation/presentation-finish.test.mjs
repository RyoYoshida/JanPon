import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplay } from '../../src/adapters/dom.ts';
import { startBundle } from '../helpers/browser-harness.mjs';
const win = { phase:'result',balance:9,choices:[],result:{player:'rock',opponent:'scissors',outcome:'win',payout:20} };
const draw = { phase:'choosing',balance:9,choices:[{kind:'hand',hand:'rock'}],result:{player:'rock',opponent:'rock',outcome:'draw',payout:0} };
test('foundation finish joins the original animation with one static committed-result hold',async()=>{
 const h=await startBundle({runBundle:false});const display=createDisplay(h.document);
 display.render(win,'ready','');let completed=0;
 const animation=display.animate(win).then(()=>completed++);await h.tick();
 const finish=display.finishPresentation();assert.equal(display.finishPresentation(),finish);
 await h.flush();assert.equal(completed,0);assert.equal(h.timers.size,1);
 assert.equal(h.ids.get('prize').textContent,'20');
 assert.deepEqual(h.lamps.filter(l=>l.classList.contains('active')).map(l=>l.dataset.value),['20']);
 await h.tick(449);assert.equal(completed,0);
 await h.tick(1);await Promise.all([animation,finish]);assert.equal(completed,1);assert.equal(h.timers.size,0);
 assert.equal(display.finishPresentation(),finish);
});
test('foundation stop cancels static hold without late relight, input or extra timer',async()=>{
 for(const view of [win,draw]){
  const h=await startBundle({runBundle:false});const display=createDisplay(h.document);
  display.render(view,'ready','');const animation=display.animate(view),finish=display.finishPresentation();
  display.render(view,'stopped','test stop');await Promise.all([animation,finish]);await display.finishPresentation();await h.drain();
  assert.equal(h.timers.size,0);assert.equal(h.ids.get('prize').textContent,'');
  assert.ok(h.lamps.every(l=>!l.classList.contains('active')));assert.ok(h.hands.every(b=>b.disabled));
 }
});
