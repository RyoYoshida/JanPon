import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { centralScene } from '../../src/adapters/central-scene.ts';
import { createDisplay } from '../../src/adapters/dom.ts';
import { startBundle } from '../helpers/browser-harness.mjs';

// Exact continuous SVG path bounds + CSS source/API tests; not rendered/optical QA.
const css=await readFile('game/style.css','utf8');
const sceneSource=await readFile('src/adapters/central-scene.ts','utf8');
const idle={phase:'idle',balance:10,choices:[{kind:'coin'}],result:null};
const win={phase:'result',balance:9,choices:[],result:{player:'paper',opponent:'rock',outcome:'win',payout:4}};
const hands=['rock','scissors','paper'];
const paths=Object.fromEntries([...sceneSource.matchAll(/  (rock|scissors|paper): \['([^']+)'/g)].map(([,hand,path])=>[hand,path]));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

// The original masks use only line and quadratic commands. Derive extrema rather
// than assuming their transparent95×95 rectangle equals the visible silhouette.
function bounds(path) {
  const tokens=path.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)/gi); let i=0,command='',x=0,y=0,start=[0,0],control=null,previous='';
  const points=[],number=()=>Number(tokens[i++]);
  const point=relative=>{const a=number(),b=number();return relative?[x+a,y+b]:[a,b];};
  const record=(a,b)=>points.push([a,b]);
  const quadratic=(c,end)=>{
    record(x,y);record(...end);
    for(let axis=0;axis<2;axis++) {
      const a=[x,y][axis],b=c[axis],d=end[axis],denominator=a-2*b+d;
      if(!denominator)continue;const t=(a-b)/denominator;
      if(t>0&&t<1)record((1-t)**2*x+2*(1-t)*t*c[0]+t*t*end[0],(1-t)**2*y+2*(1-t)*t*c[1]+t*t*end[1]);
    }
    control=c;[x,y]=end;
  };
  while(i<tokens.length) {
    if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
    const kind=command.toUpperCase(),relative=command!==kind;
    if(kind==='M'){[x,y]=point(relative);start=[x,y];record(x,y);control=null;command=relative?'l':'L';}
    else if(kind==='L'){[x,y]=point(relative);record(x,y);control=null;}
    else if(kind==='H'){x=number()+(relative?x:0);record(x,y);control=null;}
    else if(kind==='V'){y=number()+(relative?y:0);record(x,y);control=null;}
    else if(kind==='Q'){const c=point(relative),end=point(relative);quadratic(c,end);}
    else if(kind==='T'){const c=['Q','T'].includes(previous)&&control?[2*x-control[0],2*y-control[1]]:[x,y];quadratic(c,point(relative));}
    else if(kind==='Z'){[x,y]=start;record(x,y);control=null;command='';}
    else throw new Error(`Unsupported mask command:${command}`);
    previous=kind;
  }
  return [Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))];
}
function variables(hand) {
  const rule=css.match(new RegExp(`\\.center-hand\\[data-center-hand="${hand}"\\]\\{([^}]+)\\}`))[1];
  return Object.fromEntries([...rule.matchAll(/--([\w-]+):([\d.]+)px/g)].map(([,name,value])=>[name,Number(value)]));
}
function transformed(hand,mode) {
  const box=bounds(paths[hand]),v=variables(hand),scale=mode==='trio'?.72:1.05;
  return [v[mode+'-x']+box[0]*scale,v[mode+'-x']+box[1]*scale,v[mode+'-y']+box[2]*scale,v[mode+'-y']+box[3]*scale];
}
function luminance(hex) {
  const values=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return values[0]*.2126+values[1]*.7152+values[2]*.0722;
}

test('denominations carry five consistent readable numeral colors on smoked glass with a structural lit outline', async t => {
  const ui=await startBundle({runBundle:false});t.after(()=>ui.close());
  const colors=new Map();
  for(const lamp of ui.lamps){const value=lamp.dataset.value,color=lamp.getAttribute('fill');if(colors.has(value))assert.equal(colors.get(value),color);colors.set(value,color);assert.equal(lamp.querySelector('text').textContent,value);}
  assert.equal(colors.size,5);assert.equal(new Set(colors.values()).size,5);
  assert.match(css,/\.window-number\{fill:currentColor;stroke:#141c14/);
  assert.match(css,/\.lamp\.active \.window-number\{fill:currentColor;/);
  assert.match(css,/\.lamp\.active \.window-face\{fill:#2e362a;stroke:#fff4c8;stroke-width:2\.5;filter:drop-shadow/);
  const glass=ui.document.querySelector('#window-glass').querySelectorAll('stop').map(stop=>stop.getAttribute('stop-color'));
  assert.equal(glass.length,3);
  for(const foreground of colors.values())for(const background of [...glass,'#2e362a']) {
    const ratio=(luminance(foreground)+.05)/(luminance(background)+.05);
    assert.ok(ratio>=4.5,`${foreground}/${background} nominal source contrast:${ratio}`);
  }
  assert.equal(ui.document.querySelector('.key'),null);assert.equal(ui.lamps.length,12);
});

test('every original hand silhouette is mathematically centered on the roulette circle at the unchanged scale', () => {
  assert.equal(hands.length,Object.keys(paths).length);
  assert.deepEqual(bounds(paths.rock),[22,74,18,73]);
  const expected={scissors:[25.1,79,3.6,85],paper:[10.4,72,6,86]};
  for(const hand of ['scissors','paper'])bounds(paths[hand]).forEach((value,i)=>near(value,expected[hand][i]));
  assert.match(css,/\.state-indicator\{[^}]*left:50%;top:50%;width:66%;height:60%;transform:translate\(-50%,-50%\)/);
  assert.match(css,/\.center-cycle \.center-hand,\.center-result-hand\{transform:translate\(var\(--hand-x\),var\(--hand-y\)\) scale\(1\.05\)/);
  for(const hand of hands) {
    const [left,right,top,bottom]=transformed(hand,'hand');near((left+right)/2,110);near((top+bottom)/2,100);
    // 220×200 scene has exactly the .66/.60 container aspect ratio.
    for(const display of [198,320]){const unit=display*.66/220;near(display*.17+110*unit,display/2);near(display*.2+100*unit,display/2);}
    for(const x of [left,right])for(const y of [top,bottom])assert.ok(Math.hypot(x-110,y-100)<123/360/.003);
  }
});

test('the static reduced trio has equal gaps and its visible bounds center on the same circle without clipping', () => {
  const boxes=hands.map(hand=>transformed(hand,'trio'));
  near((Math.min(...boxes.map(box=>box[0]))+Math.max(...boxes.map(box=>box[1])))/2,110);
  boxes.forEach(box=>near((box[2]+box[3])/2,100));
  near(boxes[1][0]-boxes[0][1],24);near(boxes[2][0]-boxes[1][1],24);
  assert.equal((css.match(/transform:translate\(var\(--trio-x\),var\(--trio-y\)\) scale\(\.72\)/g)||[]).length,2,'manual and OS-reduced paths agree');
  assert.equal((css.match(/\.center-scene \*\{animation:none!important\}/g)||[]).length,2);
  for(const box of boxes)for(const x of [box[0],box[1]])for(const y of [box[2],box[3]])assert.ok(Math.hypot(x-110,y-100)<123/360/.003);
});

test('idle, choosing, draw and all result hands share centered transforms without changing masks or animation rhythm', async t => {
  assert.equal(createHash('sha256').update(centralScene('waiting',idle)).digest('hex'),'d4a744bfdf819fe268b771ef63989f16e5cd5d0daf989e703b2e29d986e52a5a');
  const ui=await startBundle({runBundle:false});t.after(()=>ui.close());const display=createDisplay(ui.document);
  for(const hand of hands) {
    const view={...win,result:{...win.result,opponent:hand}};
    for(const scene of ['draw','win','loss','roulette'])assert.match(centralScene(scene,view),new RegExp(`center-result-hand" data-center-hand="${hand}"`));
    display.render(view,'ready','');assert.equal(ui.document.querySelector('[data-center-hand]').dataset.centerHand,hand);
  }
  assert.equal(centralScene('waiting',idle),centralScene('choosing',idle));assert.equal(centralScene('choosing',idle),centralScene('draw-ready',idle));
  const orbit=centralScene('roulette',win);assert.match(orbit,/class="center-orbit" cx="110" cy="100" r="62"/);
  for(const hand of hands){assert.match(css,new RegExp(`center-${hand}-cycle 4\\.8s ease-in-out infinite`));assert.match(css,new RegExp(`center-${hand}-cycle \\.30s ease-in-out infinite`));}
  assert.match(css,/#prize\{[^}]*bottom:23%/);assert.match(css,/\.state-controls\{[^}]*top:54%/);
});

test('central notices, progress, prize and recovery focus remain inside the widened ring after wrapper centering', () => {
  // All original32×32 notice strokes transformed by translate78,38 scale2,
  // including a conservative2-unit stroke envelope, fit above the recovery button.
  for(const display of [198,320]) {
    const unit=display*.003,inner=display*123/360;
    for(const x of [74,146])for(const y of [34,106])assert.ok(Math.hypot((x-110)*unit,(y-100)*unit)<inner);
    assert.ok(display*.2+106*unit < display*.54,'notice stays above native recovery target');
    for(const y of [132,154])assert.ok(Math.abs(y-100)*unit+4*unit<inner);
    assert.ok(Math.hypot(29,display*.54+51-display/2)<inner,'recovery focus corners remain inside ring');
    assert.ok(display*(1-.23)<display*(180+123)/360,'payout bottom stays inside ring');
  }
});
