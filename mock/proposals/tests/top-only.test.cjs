const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../JanPon-top-only.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
const values=[...html.matchAll(/class="lamp" data-value="(\d+)"/g)].map(m=>m[1]);
assert.equal(values.length,100);assert.deepEqual([1,2,4,7,20].map(v=>values.filter(x=>x==v).length),[65,18,11,5,1]);
assert.equal((html.match(/<main\b/g)||[]).length,1);assert.equal((html.match(/<button\b/g)||[]).length,3);
const text=html.split('<body>')[1].split('</body>')[0].replace(/<script>[\s\S]*?<\/script>/g,'').replace(/<[^>]*>/g,' ').trim().split(/\s+/);
assert.deepEqual(text,['JanPon','7','1','2','4','7','20','10']);
assert(!/Math\.random|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|history\.|location\./.test(script));
assert(!/<(?:nav|footer|dialog|iframe|img|link)\b/.test(html));
assert(!/\s(?:src|href|title)=/.test(html));
assert(html.includes('prefers-reduced-motion'));
function harness(reduced=false,animate=true){
 let now=0,next=1,queue=new Map(),ghosts=new Set(),flights=0,maxGhosts=0;
 const schedule=(fn,ms)=>{let id=next++;queue.set(id,{at:now+ms,fn});return id;};
 function elem(value=''){
  const cls=new Set();let text=value;const changes=[];
  const el={dataset:{},style:{},disabled:false,innerHTML:'<svg></svg>',listeners:{},changes,
   get textContent(){return text},set textContent(v){text=v;changes.push(v)},
   classList:{add(c){cls.add(c)},remove(c){cls.delete(c)},toggle(c,on){on?cls.add(c):cls.delete(c)},contains(c){return cls.has(c)}},
   addEventListener(k,fn){this.listeners[k]=fn},setAttribute(){},getBoundingClientRect(){return {left:10,top:10,width:30,height:30}},remove(){ghosts.delete(this)}};
  if(animate)el.animate=()=>{
   flights++;let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b});const timer=schedule(resolve,650);
   return {finished,cancel(){queue.delete(timer);reject(new Error('cancel'))}};
  };
  return el;
 }
 const buttons=[elem(),elem(),elem()],lamps=values.map(v=>Object.assign(elem(),{dataset:{value:v}}));
 const ids={prize:elem('7'),balance:elem('10'),'coin-target':elem()};const events={};
 const doc={querySelectorAll(s){return s==='.lamp'?lamps:buttons},getElementById(s){return ids[s]},querySelector(){return elem()},createElement(){return elem()},body:{append(el){ghosts.add(el);maxGhosts=Math.max(maxGhosts,ghosts.size)}}};
 vm.runInNewContext(script,{document:doc,matchMedia:()=>({matches:reduced}),window:{addEventListener(k,f){events[k]=f}},setTimeout:schedule,clearTimeout:id=>queue.delete(id)});
 async function micros(){for(let i=0;i<10;i++)await Promise.resolve()}
 async function step(){await micros();if(!queue.size)return false;let [id,t]=[...queue].sort((a,b)=>a[1].at-b[1].at)[0];queue.delete(id);now=t.at;t.fn();await micros();return true;}
 async function drain(){for(let n=0;n<2000;n++){if(!await step())return;}throw Error('unbounded lifecycle')}
 return {buttons,lamps,ids,events,drain,step,queue,ghosts,get flights(){return flights},get maxGhosts(){return maxGhosts}};
}
(async()=>{
 for(const [reduced,animate] of [[false,true],[true,true],[false,false]]){
  const h=harness(reduced,animate);const first=h.buttons[0].listeners.click();const second=h.buttons[1].listeners.click();
  assert(h.buttons.every(b=>b.disabled));await h.drain();await Promise.all([first,second]);
  assert.equal(h.ids.balance.textContent,'16');assert.deepEqual(h.ids.balance.changes,['10','9','16']);
  assert.equal(h.ids.prize.textContent,'7');assert.equal(h.lamps.filter(l=>l.classList.contains('active')).length,1);
  assert(h.buttons.every(b=>!b.disabled));assert.equal(h.ghosts.size,0);assert.equal(h.queue.size,0);
  assert.equal(h.flights,reduced||!animate?0:8);if(!reduced&&animate)assert(h.maxGhosts>1);
  h.buttons[2].listeners.click();await h.drain();assert.equal(h.ids.balance.textContent,'16');
 }
 for(const steps of [0,1,20,225]){
  const h=harness();h.buttons[0].listeners.click();for(let i=0;i<steps;i++)await h.step();h.events.pagehide();await h.drain();
  assert.equal(h.ids.balance.textContent,'10');assert(h.buttons.every(b=>!b.disabled));assert.equal(h.ghosts.size,0);assert.equal(h.queue.size,0);
 }
 console.log(JSON.stringify({staticVisibleText:text,ringCounts:[65,18,11,5,1],singleScreen:true,normalDemo:true,reducedMotion:true,noWebAnimationFallback:true,replay:true,duplicateClickSuppression:true,pagehideCancellation:true,coinFlightCount:8,renderedBrowserQA:false},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
