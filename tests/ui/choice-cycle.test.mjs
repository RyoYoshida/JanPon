import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { centralScene } from '../../src/adapters/central-scene.ts';
import { startBundle } from '../helpers/browser-harness.mjs';

// Source/DOM contract evidence only, not CSS rendering or a visual smoothness claim.
const idle = { phase:'idle',balance:10,choices:[{kind:'coin'}],result:null };
const choosing = { phase:'choosing',balance:9,choices:['rock','scissors','paper'].map(hand=>({kind:'hand',hand})),result:null };
const cycle = markup => markup.match(/<g class="center-cycle(?: center-rapid-cycle)?">[\s\S]*?<\/g><\/g>/)?.[0];
const sha = text => createHash('sha256').update(text).digest('hex');

// Hashes captured from the original waiting-animation artwork.
test('liked waiting markup, its keyframes, and reduced-motion CSS remain exactly unchanged', async () => {
  assert.equal(sha(centralScene('waiting',idle)),'abc82d992a4e258352aed6175435f1a1d0eea03e2c84225e2116ce6efbaff9cd');
  const css=await readFile('game/style.css','utf8');
  const protectedLines=css.split('\n').filter(line=>!line.includes('center-backlight')).filter(line=>line.includes('[data-scene="waiting"]')||line.startsWith('@keyframes center-rock-cycle')||line.startsWith('@keyframes center-scissors-cycle')||line.startsWith('@keyframes center-paper-cycle')||line.includes('data-motion=')||line.includes('@media(prefers-reduced-motion:reduce)')||line.startsWith('.center-cycle'));
  assert.equal(sha(protectedLines.join('\n')),'f8efae7c6af098fdc7dd7c43aede35e164043fada320590a2df86a7345e852f0');
});

test('choosing and draw-ready reuse the waiting hand shapes and order at 10x tempo over steady backlight', async () => {
  const css=await readFile('game/style.css','utf8'), waiting=cycle(centralScene('waiting',idle));
  assert.ok(waiting);
  assert.deepEqual([...waiting.matchAll(/data-center-hand="([^"]+)"/g)].map(match=>match[1]),['rock','scissors','paper']);
  for (const scene of ['choosing','draw-ready']) {
    const view = scene === 'draw-ready' ? {...choosing,result:{player:'paper',opponent:'paper',outcome:'draw',payout:0}} : choosing;
    const markup=centralScene(scene,view);
    assert.equal(cycle(markup).replace('center-cycle center-rapid-cycle','center-cycle').replace(/<rect class="center-backlight"[^>]*\/>/,''),waiting);
    assert.match(markup,/<rect class="center-backlight"/);
    assert.doesNotMatch(markup,/center-choices|center-result-hand|data-hand=/);
    for (const hand of ['rock','scissors','paper']) {
      const rule=css.split('\n').find(line=>line.includes(`[data-scene="${scene}"] .center-${hand}`));
      assert.ok(rule); assert.match(rule,new RegExp(`animation:center-${hand}-rapid \\.48s linear infinite`));
      assert.equal((css.match(new RegExp(`@keyframes center-${hand}-cycle`,'g'))??[]).length,1);
    }
  }
  assert.equal(4.8/.48,10);
});

test('the faster choices never replace committed hand results, roulette or payout scenes', () => {
  for(const opponent of ['rock','scissors','paper']) {
    const view={phase:'result',balance:9,choices:[],result:{player:'rock',opponent,outcome:'win',payout:7}};
    for(const scene of ['draw','win','loss','roulette']) {
      const resultView={...view,result:{...view.result,outcome:scene==='roulette'?'win':scene}};
      const markup=centralScene(scene,resultView);
      assert.equal(cycle(markup),undefined);
      assert.equal((markup.match(/data-center-hand=/g)??[]).length,1);
      assert.match(markup,new RegExp(`center-result-hand" data-center-hand="${opponent}"`));
    }
    assert.equal(cycle(centralScene('payout',view)),undefined);
  }
  for(const scene of ['choosing','draw-ready']) {
    assert.equal(cycle(centralScene(scene,{...choosing,round:{opponent:'rock'}})),cycle(centralScene(scene,{...choosing,round:{opponent:'paper'}})));
  }
});

test('faster choice scenes retain stationary reduced mode, free draws and immediate exit cleanup', async t => {
  for(const reducedMotion of [false,true]) {
    const ui=await startBundle({reducedMotion}); t.after(()=>ui.close());
    const indicator=()=>ui.ids.get('state-indicator');
    assert.equal(indicator().dataset.scene,'waiting');
    ui.click('#coin-input'); await ui.flush();
    assert.equal(indicator().dataset.scene,'choosing');
    assert.ok(cycle(indicator().innerHTML)); assert.equal(ui.timers.size,0);
    const saved=ui.savedState,writes=ui.writes;
    ui.click('#motion-toggle'); await ui.flush();
    assert.equal(ui.machine.dataset.motion,reducedMotion?'standard':'reduced');
    assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
    ui.click('[data-hand="rock"]'); await ui.flush();
    assert.equal(indicator().dataset.scene,'draw');
    assert.equal(cycle(indicator().innerHTML),undefined);
    await ui.drain();
    assert.equal(indicator().dataset.scene,'draw-ready');
    assert.ok(cycle(indicator().innerHTML)); assert.equal(ui.savedState.balance,9);
    assert.equal(ui.savedState.roundNumber,1); assert.equal(ui.timers.size,0);
    assert.ok(ui.hands.every(button=>!button.disabled));
    const beforeExit=ui.savedState,exitWrites=ui.writes;
    await ui.close();
    assert.equal(indicator().dataset.scene,'closed'); assert.equal(cycle(indicator().innerHTML),undefined);
    await ui.tick(10000);
    assert.equal(ui.timers.size,0); assert.deepEqual(ui.savedState,beforeExit); assert.equal(ui.writes,exitWrites);
  }
});
