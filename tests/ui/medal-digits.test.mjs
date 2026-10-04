import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { medalDigits } from '../../src/adapters/medal-digits.ts';
import { createDisplay } from '../../src/adapters/dom.ts';
import { startBundle, createSharedState } from '../helpers/browser-harness.mjs';

// SVG geometry, CSS constraints and actual packaged DOM/API behavior only.
// These tests do not claim browser layout, rendered legibility or assistive-tech QA.
const css = await readFile('game/style.css', 'utf8');
const idle = { phase:'idle', balance:10, choices:[{kind:'coin'}], result:null };
const groups = markup => [...markup.matchAll(/<g data-medal-digit="(\d)">([\s\S]*?)<\/g>/g)];
const renderedValue = element => element.querySelectorAll('[data-medal-digit]').map(node=>node.dataset.medalDigit).join('');

test('all ten original numeral glyphs have distinct complete 5×7 dot patterns within a padded SVG viewport', () => {
  // Independently specified row masks make a missing/extra LED or wrong digit fail.
  const expected = [[14,17,19,21,25,17,14],[4,12,4,4,4,4,14],[14,17,1,2,4,8,31],
    [30,1,1,14,1,1,30],[2,6,10,18,31,2,2],[31,16,16,30,1,1,30],
    [14,16,16,30,17,17,14],[31,1,2,4,8,8,8],[14,17,17,14,17,17,14],[14,17,17,15,1,1,14]];
  assert.equal(new Set(expected.map(rows=>rows.join())).size,10);
  for(let digit=0;digit<10;digit++) {
    const markup=medalDigits(digit), [group]=groups(markup), masks=Array(7).fill(0);
    assert.equal(groups(markup).length,1); assert.equal(group[1],String(digit));
    for(const [,cx,cy,r] of group[2].matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)) {
      const x=Number(cx)-.5,y=Number(cy)-.5;assert.equal(Number(r),.38);
      assert.ok(x>=1&&x<=5&&y>=1&&y<=7);assert.equal(masks[y-1]&(1<<(5-x)),0,'no duplicated dot');
      masks[y-1]|=1<<(5-x);
    }
    assert.deepEqual(masks,expected[digit]);assert.match(markup,/viewBox="0 0 7 9"/);
    const centers=[...group[2].matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(([,x,y])=>[Number(x),Number(y)]);
    assert.equal((Math.min(...centers.map(p=>p[1]))+Math.max(...centers.map(p=>p[1])))/2,4.5);
    assert.doesNotMatch(markup,/<text|<image|<use|href=|url\(|https?:|font/);
  }
});

test('every decimal position is preserved, including zero, transitions, all digits and the maximum safe integer', () => {
  const values=new Set([0,1,9,10,20,99,100,999,1000,1234567890,9876543210,Number.MAX_SAFE_INTEGER]);
  for(let digits=1;digits<=15;digits++)for(const offset of [-1,0,1])values.add(10**digits+offset);
  for(const value of values) {
    const markup=medalDigits(value), expected=String(value), digits=groups(markup);
    assert.equal(digits.map(group=>group[1]).join(''),expected);
    assert.match(markup,new RegExp(`<span class="sr-only">${expected}<`));
    const [,width,height]=markup.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
    assert.equal(width,expected.length*6+1);assert.equal(height,9);
    for(const [,cx,cy,r] of markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
      assert.ok(Number(cx)-Number(r)>0&&Number(cx)+Number(r)<width);
      assert.ok(Number(cy)-Number(r)>0&&Number(cy)+Number(r)<height);
    }
  }
  for(const invalid of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>medalDigits(invalid));
});

test('live output retains its accessible exact value and element identity through repeats, loading and every blocked status', async t => {
  const ui=await startBundle({runBundle:false});t.after(()=>ui.close());const display=createDisplay(ui.document), balance=ui.ids.get('balance');
  for(const value of [0,10,20,1234567890,Number.MAX_SAFE_INTEGER,9,0,10])for(const status of ['ready','busy','stopped','other-tab','closed']) {
    display.render({...idle,balance:value},status,'');
    assert.equal(ui.document.querySelector('#balance'),balance);assert.equal(balance.textContent,String(value));
    assert.equal(balance.getAttribute('aria-label'),`メダル残高${value}枚`);assert.equal(renderedValue(balance),String(value));
    const svg=balance.querySelector('svg');assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
    assert.equal(balance.querySelectorAll('svg').length,1);assert.equal(balance.closest('#coin-input'),ui.ids.get('coin-input'));
    assert.equal(ui.ids.get('coin-input').disabled,status!=='ready');
  }
  display.render(null,'new','');assert.equal(balance.textContent,'');assert.equal(balance.querySelector('svg'),null);
  assert.equal(balance.getAttribute('aria-label'),'メダル残高。未確認');assert.equal(ui.ids.get('coin-input').disabled,true);
});

test('dot numeral clicks still reach the coin-only native button and payout changes the digits exactly once after settlement', async t => {
  const ui=await startBundle();t.after(()=>ui.close());const balance=ui.ids.get('balance'), coin=ui.ids.get('coin-input');
  assert.equal(renderedValue(balance),'10');ui.focus('#coin-input');
  // The fake click helper focuses every target, even non-focusable SVG/output.
  // Dispatch bubbling clicks directly so this test preserves the native focus target.
  ui.dispatch('[data-medal-digit]','click');ui.dispatch('#balance','click');await ui.flush();
  assert.equal(ui.savedState.balance,9);assert.equal(ui.writes,2);assert.equal(renderedValue(balance),'9');
  assert.ok(ui.document.activeElement===coin);assert.equal(coin.disabled,true);
  ui.click('[data-hand="paper"]');await ui.flush();assert.equal(ui.savedState.round.result.payout,4);
  await ui.tick(1350);assert.equal(ui.ids.get('prize').textContent,'4');assert.equal(renderedValue(balance),'9');
  await ui.tick(449);assert.equal(renderedValue(balance),'9');
  await ui.tick(1);assert.equal(ui.savedState.balance,13);assert.equal(renderedValue(balance),'13');assert.equal(ui.writes,4);
  assert.equal(ui.ids.get('balance'),balance);assert.equal(ui.ids.get('coin-input'),coin);assert.equal(ui.timers.size,0);
});

test('restored 16-digit balances and zero/game-over keep their exact numbers with no write from display', async t => {
  const sample=await startBundle();sample.click('#coin-input');await sample.flush();sample.click('[data-hand="paper"]');await sample.drain();
  const settled=sample.savedState;await sample.close();
  for(const value of [20,999999999999999,Number.MAX_SAFE_INTEGER]) {
    const state=structuredClone(settled);state.balance=value;state.round.balanceBefore=value-3;
    const shared=createSharedState(state),ui=await startBundle({shared});t.after(()=>ui.close());
    assert.equal(renderedValue(ui.ids.get('balance')),String(value));assert.equal(ui.ids.get('balance').textContent,String(value));
    assert.deepEqual(ui.savedState,state);assert.equal(shared.writes,0);
  }
  const zero={...settled,balance:0,phase:'game-over',round:{...settled.round,balanceBefore:1,opponent:'rock',result:{player:'scissors',opponent:'rock',outcome:'loss',payout:0}}};
  const ui=await startBundle({savedState:zero});t.after(()=>ui.close());assert.equal(renderedValue(ui.ids.get('balance')),'0');
  ui.click('#restart');await ui.flush();assert.equal(renderedValue(ui.ids.get('balance')),'10');
});

test('responsive source geometry keeps full-value dots inside the existing wallet and preserves strong nominal contrast', () => {
  assert.match(css,/#balance\{[^}]*min-width:57px;max-width:calc\(100% - 40px\);min-height:41px;flex:0 1 auto/);
  assert.match(css,/#balance \.medal-digits\{display:block;width:auto;max-width:100%;height:27px;overflow:hidden;pointer-events:none\}/);
  assert.match(css,/#coin-target\{flex:0 0 32px\}/);
  assert.match(css,/button\.wallet\{width:max-content;max-width:100%;min-width:120px;min-height:56px/);
  for(const viewport of [320,375,420,430,768,1024])for(const digits of [1,2,3,6,10,16]) {
    const small=viewport<=420, machine=Math.min(viewport-(small?32:40),430);
    const faceContent=machine-4-(small?30:40)-4-(small?30:40), available=faceContent-24-32-8-18;
    const viewWidth=digits*6+1, width=Math.min(viewWidth*3,available), scale=Math.min(width/viewWidth,27/9);
    assert.ok(width<=available);assert.ok(viewWidth*scale<=available+1e-9);assert.ok(9*scale<=27);
    assert.ok(scale>0);assert.ok((viewWidth-1+.38)*scale<width,'all dots fit, including the final digit');
  }
  const luminance=hex=>hex.match(/../g).map(n=>parseInt(n,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  const contrast=(luminance('f7d578')+.05)/(luminance('272b22')+.05);assert.ok(contrast>9);
  assert.match(medalDigits(10),/preserveAspectRatio="xMidYMid meet"/);
});
