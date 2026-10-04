import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { centralScene } from '../../src/adapters/central-scene.ts';
import { createDisplay } from '../../src/adapters/dom.ts';
import { startBundle } from '../helpers/browser-harness.mjs';

// Source/DOM evidence, not a rendered pixel or flash-compliance certification.
const idle={phase:'idle',balance:10,choices:[{kind:'coin'}],result:null};
const choosing={phase:'choosing',balance:9,choices:['rock','scissors','paper'].map(hand=>({kind:'hand',hand})),result:null};
const win={phase:'result',balance:9,choices:[],result:{player:'paper',opponent:'rock',outcome:'win',payout:4}};

test('normal center scenes contain no bottom guidance badges/arrows and fast SVG equals idle byte for byte', () => {
  const waiting=centralScene('waiting',idle);
  for(const scene of ['waiting','choosing','draw-ready']) {
    const markup=centralScene(scene,choosing);
    assert.equal(markup,waiting);
    assert.doesNotMatch(markup,/center-badge|center-insert|center-backlight|center-rapid-cycle|translate\(94 132\)/);
    assert.deepEqual([...markup.matchAll(/data-center-hand="([^"]+)"/g)].map(match=>match[1]),['rock','scissors','paper']);
  }
  for(const scene of ['draw','win','loss','roulette','payout']) {
    const markup=centralScene(scene,win);
    assert.doesNotMatch(markup,/center-badge|center-insert|m110 113|translate\(94 132\)/);
    if(scene==='payout') assert.doesNotMatch(markup,/center-coins|center-ejected-coin|<ellipse|center-result-hand|center-orbit/);
    else assert.match(markup,/center-result-hand/);
  }
});

test('visible recovery actions and primary notices remain, with no invisible controls or additional prose', async t => {
  const ui=await startBundle({runBundle:false}); t.after(()=>ui.close());
  const display=createDisplay(ui.document);
  for(const [status,scene,words] of [['new','loading','確認中'],['stopped','stopped','保存は消しません'],['other-tab','other-tab','別のタブ'],['closed','closed','停止しました']]) {
    display.render(null,status,'');
    const center=ui.ids.get('state-indicator');
    assert.equal(center.dataset.scene,scene); assert.match(center.innerHTML,/center-notice/);
    assert.match(ui.ids.get('status').textContent,new RegExp(words));
    if(['stopped','other-tab'].includes(status)) {
      assert.equal(ui.ids.get('retry').hidden,false); assert.equal(ui.ids.get('retry').disabled,false);
      assert.ok(ui.ids.get('retry').querySelector('svg')); assert.equal(ui.ids.get('retry').closest('.display'),ui.display);
    }
  }
  display.render({phase:'game-over',balance:0,choices:[{kind:'restart'}],result:null},'ready','');
  assert.match(ui.ids.get('state-indicator').innerHTML,/center-notice/);
  assert.equal(ui.ids.get('restart').hidden,false); assert.equal(ui.ids.get('restart').disabled,false);
  assert.ok(ui.ids.get('restart').querySelector('svg'));
  assert.match(ui.ids.get('restart').getAttribute('aria-label'),/はじめから/);
  display.render(idle,'ready','');
  assert.equal(ui.ids.get('coin-input').disabled,false); assert.ok(ui.ids.get('coin-target').querySelector('svg'));
  assert.equal(ui.ids.get('balance').textContent,'10'); assert.equal(ui.hands.length,3);
  assert.equal(ui.ids.get('state-indicator').textContent,'');
});

test('source geometry keeps the hand local with an approximate glow envelope and steady panel', async () => {
  const css=await readFile('game/style.css','utf8');
  assert.match(css,/width:min\(100%,430px\);padding:0 20px 28px/);
  assert.match(css,/\.face\{[^}]*border:2px[^}]*padding:25px 20px 28px/);
  assert.match(css,/\.display-rim\{padding:7px/);
  assert.match(css,/\.display\{[^}]*border:4px/);
  assert.match(css,/\.state-indicator\{[^}]*width:66%;height:60%/);
  assert.match(css,/\.state-indicator\{[^}]*filter:drop-shadow\(0 0 3px #edb04b33\)/);
  assert.match(css,/\.center-cycle \.center-hand,\.center-result-hand\{transform:translate\(var\(--hand-x\),var\(--hand-y\)\) scale\(1\.05\)\}/);
  const displayContent=430-4-40-4-40-14-8;
  const handCanvas=95*1.05*(displayContent*.66/220);
  assert.equal(displayContent,320); assert.ok(Math.abs(handCanvas-95.76)<.000001);
  // Engineering 3-sigma approximation for the existing shadow, not a hard Gaussian bound.
  const estimatedArea=(handCanvas+18)**2;
  assert.ok(estimatedArea < .25*341*256);
  assert.doesNotMatch(css,/\.display[^}]*animation:/);
  assert.match(css,/\.machine\[data-motion="reduced"\] \.center-scene \*\{animation:none!important\}/);
});
