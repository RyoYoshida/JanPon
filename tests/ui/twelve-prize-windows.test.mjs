import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDisplay } from '../../src/adapters/dom.ts';
import { prizeWindow, rouletteFrames } from '../../src/adapters/roulette-windows.ts';
import { publicView } from '../../src/core/view.ts';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// Source + deterministic DOM/API evidence only, not browser-rendered pixels or audio.
const approved = [4,1,2,7,4,2,20,1,2,4,7,2];
const win = { phase:'result', balance:9, choices:[], result:{ player:'paper',opponent:'rock',outcome:'win',payout:4 } };
const lit = ui => ui.lamps.flatMap((lamp,index) => lamp.classList.contains('active') ? [index] : []);
const withoutTime = state => { const copy=structuredClone(state); delete copy.updatedAt; return copy; };

test('approved physical ring has twelve upright numbered windows, clockwise from top, with no lower legend', async t => {
  const ui=await startBundle({runBundle:false}); t.after(()=>ui.close());
  assert.equal(ui.lamps.length,12);
  assert.deepEqual(ui.lamps.map(lamp=>Number(lamp.dataset.value)),approved);
  assert.deepEqual(ui.lamps.map(lamp=>Number(lamp.dataset.angle)),Array.from({length:12},(_,i)=>i*30));
  assert.deepEqual(Object.fromEntries([1,2,4,7,20].map(value=>[value,approved.filter(x=>x===value).length])),{1:2,2:4,4:3,7:2,20:1});
  for (const [index,lamp] of ui.lamps.entries()) {
    const digit=lamp.querySelector('.window-number');
    assert.equal(digit.textContent,String(approved[index]));
    assert.equal(digit.getAttribute('transform'),null,'every number remains upright');
    const x=Number(digit.getAttribute('x')),y=Number(digit.getAttribute('y'));
    assert.ok(Math.abs(Math.hypot(x-180,y-180)-144.5)<.001);
    const angle=index*Math.PI/6;
    assert.ok(Math.abs(x-(180+144.5*Math.sin(angle)))<.001);
    assert.ok(Math.abs(y-(180-144.5*Math.cos(angle)))<.001);
    assert.match(lamp.querySelector('.window-face').getAttribute('d'),/A166 166 0 0 1 .* A123 123 0 0 0/);
  }
  assert.equal(ui.lamps[6].dataset.value,'20');
  assert.deepEqual(ui.lamps.flatMap((lamp,i)=>lamp.dataset.value==='7'?[i]:[]),[3,10]);
  assert.equal(ui.document.querySelector('.key'),null);
  const shell=await readFile('game/index.html','utf8'),css=await readFile('game/style.css','utf8');
  assert.match(shell,/<\/div><\/div>\s*<div class="controls"/,'no legend wrapper or placeholder gap');
  assert.doesNotMatch(shell+css,/class="key"|\.key(?:\s|\{|\bspan)|配当ランプの色/);
  assert.match(css,/\.window-number\{[^}]*font:900 32px/);
  assert.match(css,/\.lamp\.active \.window-face\{[^}]*fill:#2e362a[^}]*stroke-width:2\.5/);
  assert.match(css,/#prize\{[^}]*bottom:23%/);
  assert.match(css,/\.state-controls\{[^}]*top:54%/);
  // At smallest supported 320px source geometry, digits scale to 17.6px;
  // recovery target/focus and central payout fit inside the widened ring.
  assert.equal(198/360*32,17.6);
  assert.ok(Math.hypot(22+7,198*.54+44+7-99) < 198*123/360);
  assert.ok(198*(1-.23) < 198*(180+123)/360);
});

test('stop choice is stable and balanced among only matching windows without any stochastic payout selection', async () => {
  for(const payout of [1,2,4,7,20]) for(const player of ['rock','scissors','paper']) {
    const matches=approved.flatMap((value,i)=>value===payout?[i]:[]), seen=new Map(matches.map(i=>[i,0]));
    for(let balance=0;balance<120;balance++) {
      const view={...win,balance,result:{...win.result,payout,player}}, original=structuredClone(view);
      const index=prizeWindow(approved,view);
      assert.ok(matches.includes(index)); seen.set(index,seen.get(index)+1);
      assert.equal(prizeWindow(approved,structuredClone(view)),index);
      assert.deepEqual(view,original);
    }
    assert.ok([...seen.values()].every(count=>count===120/matches.length));
  }
  assert.equal(prizeWindow(approved,{...win,result:null}),-1);
  assert.equal(prizeWindow(approved,{...win,result:{...win.result,outcome:'loss',payout:0}}),-1);
  assert.equal(prizeWindow([],win),-1);
  const source=await readFile('src/adapters/roulette-windows.ts','utf8');
  assert.doesNotMatch(source,/Math\.random|crypto|Date|rngState|random\.ts|indexedDB|localStorage|sessionStorage/);
});

test('clockwise chase slows down continuously and takes one final adjacent step at exactly1350ms for every possible stop', () => {
  const stops=new Set();
  for(const payout of [1,2,4,7,20]) for(let balance=0;balance<12;balance++) {
    const view={...win,balance,result:{...win.result,payout}}, stop=prizeWindow(approved,view), frames=rouletteFrames(approved,view);
    stops.add(stop); assert.equal(frames[0].index,0); assert.ok(frames.length>=24);
    assert.ok(frames.every((frame,i)=>frame.index===i%12 && Number.isInteger(frame.duration) && frame.duration>0));
    assert.ok(frames.every((frame,i)=>i===0 || frame.duration>=frames[i-1].duration));
    assert.ok(frames.at(-1).duration>frames[0].duration*3);
    assert.equal(frames.reduce((sum,frame)=>sum+frame.duration,0),1350);
    assert.equal((frames.at(-1).index+1)%12,stop);
  }
  assert.equal(stops.size,12);
});

test('display reveal keeps the prize hidden until1350ms and retains exactly one matching window through the prize-proportional payout hold', async t => {
  const ui=await startBundle({runBundle:false}); t.after(()=>ui.close()); const display=createDisplay(ui.document);
  for(const payout of [1,2,4,7,20]) for(let balance=0;balance<4;balance++) {
    const view={...win,balance,result:{...win.result,payout}}, expected=prizeWindow(approved,view), start=ui.elapsed;
    display.render(view,'ready',''); const rendering=display.animate(view);
    assert.equal(ui.ids.get('prize').textContent,''); assert.equal(ui.ids.get('state-indicator').dataset.scene,'roulette');
    assert.match(ui.ids.get('ring').getAttribute('aria-label'),/配当窓12個/);
    await ui.tick(1349); assert.equal(ui.ids.get('prize').textContent,'');
    assert.deepEqual(lit(ui),[(expected+11)%12]);
    await ui.tick(1); assert.deepEqual(lit(ui),[expected]); assert.equal(ui.ids.get('prize').textContent,String(payout));
    const duration=({1:800,2:1000,4:1400,7:1800,20:3000})[payout];
    await ui.tick(duration-1); assert.deepEqual(lit(ui),[expected]);
    await ui.tick(1); await rendering; assert.equal(ui.elapsed-start,1350+duration); assert.equal(ui.timers.size,0);
  }
});

test('saved prizes resume on the same selected duplicate in either motion mode and settle once with unchanged RNG', async t => {
  const sample=await startBundle(); t.after(()=>sample.close());
  sample.click('#coin-input'); await sample.flush(); sample.click('[data-hand="paper"]'); await sample.flush();
  const saved=sample.savedState; await sample.close();
  for(const payout of [1,2,4,7,20]) for(const balance of [8,9,10,11]) {
    const state=structuredClone(saved); state.balance=balance; state.round.balanceBefore=balance+1; state.round.result.payout=payout;
    const shared=createSharedState(state), expected=prizeWindow(approved,publicView(state));
    let ui=await startBundle({shared}); t.after(()=>ui.close());
    await ui.tick(1350); assert.deepEqual(lit(ui),[expected]); assert.deepEqual(ui.savedState,state); assert.equal(shared.writes,0);
    await ui.close(); ui=await startBundle({shared,reducedMotion:true}); t.after(()=>ui.close());
    assert.deepEqual(lit(ui),[expected]); assert.equal(ui.timerHistory.at(-1).duration,450); assert.deepEqual(ui.savedState,state);
    await ui.drain(); const settled=ui.savedState;
    assert.equal(settled.balance,balance+payout); assert.equal(settled.rngState,state.rngState); assert.equal(shared.writes,1);
    await ui.close(); ui=await startBundle({shared}); t.after(()=>ui.close()); await ui.drain();
    assert.deepEqual(ui.savedState,settled); assert.equal(shared.writes,1);
  }
});

test('mid-chase reduced motion cannot reroll a duplicate, advance core RNG, duplicate audio or settlement', async t => {
  const run=async()=>{const ui=await startBundle();t.after(()=>ui.close());ui.click('#coin-input');await ui.flush();ui.click('[data-hand="paper"]');await ui.flush();return ui;};
  const normal=await run(); await normal.drain(); const baseline=withoutTime(normal.savedState); await normal.close();
  for(const time of [0,150,800,1349,1350]) {
    const ui=await run(); await ui.tick(time); const saved=ui.savedState, writes=ui.writes;
    const expected=prizeWindow(approved,publicView(saved));
    ui.click('#motion-toggle'); await ui.flush();
    assert.deepEqual(lit(ui),[expected]); assert.deepEqual(ui.savedState,saved); assert.equal(ui.writes,writes);
    for(let i=0;i<4;i++)ui.click('#motion-toggle'); await ui.drain();
    assert.deepEqual(withoutTime(ui.savedState),baseline); assert.equal(ui.writes,writes+1);
    const frequencies=ui.audio.starts.map(({oscillator})=>oscillator.frequency.calls.find(call=>call[0]==='setValueAtTime')?.[1]);
    assert.equal(frequencies.filter(value=>value===660).length,1); assert.equal(frequencies.filter(value=>value===880).length,1);
    assert.equal(ui.timers.size,0);
  }
});
