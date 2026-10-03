const assert=require('assert');

class MemoryStorage{
  constructor(){this.data=new Map();}
  get(k,f=null){return this.data.has(k)?JSON.parse(JSON.stringify(this.data.get(k))):f;}
  set(k,v){this.data.set(k,JSON.parse(JSON.stringify(v)));return true;}
  remove(k){this.data.delete(k);return true;}
}

global.ONEIRO_STORAGE=new MemoryStorage();
require('../js/session-engine.js');

let now=1_000_000;
const storage=new MemoryStorage();
const engine=new global.ONEIRO_SESSION_ENGINE_CORE(storage,{now:()=>now,autoTick:false});

const plan=engine.buildPlan(30);
assert.deepStrictEqual(plan,{PRIME:180,DESCENT:300,SLEEP:1260,WAKE:60});
assert.strictEqual(Object.values(plan).reduce((a,b)=>a+b,0),1800);

engine.start({mode:'Liminal',intention:'hotel vacío',intensity:55,duration:30});
let s=engine.getSnapshot();
assert.strictEqual(s.phase,'PRIME');
assert.strictEqual(s.status,'running');
assert.deepStrictEqual(s.completedPhases,['PREPARE']);

now=s.phaseEndsAt+1;
engine.tick();
s=engine.getSnapshot();
assert.strictEqual(s.phase,'DESCENT');

engine.pause();
s=engine.getSnapshot();
assert.strictEqual(s.status,'paused');
const paused=s.pausedRemainingMs;
now+=60_000;
engine.tick();
assert.strictEqual(engine.getSnapshot().phase,'DESCENT');
engine.resume();
assert.strictEqual(engine.getSnapshot().phaseEndsAt,now+paused);

engine.skip();
assert.strictEqual(engine.getSnapshot().phase,'SLEEP');
engine.skip();
assert.strictEqual(engine.getSnapshot().phase,'WAKE');
engine.skip();
assert.strictEqual(engine.getSnapshot().phase,'RECALL');
assert.strictEqual(engine.getSnapshot().status,'recall');

const archived=engine.finishRecall({text:'pasillos y agua',vividness:80,lucid:true});
assert.strictEqual(archived.status,'completed');
assert.strictEqual(storage.get('stats').sessions,1);
assert.strictEqual(storage.get('sessionHistory').length,1);
assert.strictEqual(engine.getSnapshot(),null);


// Regression: skipping while paused must keep the next phase paused with its full duration.
now=1_500_000;
const pausedStorage=new MemoryStorage();
const pausedEngine=new global.ONEIRO_SESSION_ENGINE_CORE(pausedStorage,{now:()=>now,autoTick:false});
pausedEngine.start({mode:'Dream',intention:'puerta',intensity:20,duration:30});
pausedEngine.pause();
pausedEngine.skip();
let pausedNext=pausedEngine.getSnapshot();
assert.strictEqual(pausedNext.phase,'DESCENT');
assert.strictEqual(pausedNext.status,'paused');
assert.strictEqual(pausedNext.phaseEndsAt,null);
assert.strictEqual(pausedNext.pausedRemainingMs,pausedNext.plan.DESCENT*1000);
pausedEngine.resume();
assert.strictEqual(pausedEngine.getSnapshot().phaseEndsAt,now+pausedNext.plan.DESCENT*1000);

// Restauración y catch-up por timestamps: debe atravesar varias fases si el navegador estuvo suspendido.
now=2_000_000;
const engine2=new global.ONEIRO_SESSION_ENGINE_CORE(storage,{now:()=>now,autoTick:false});
engine2.start({mode:'Dream',intention:'bosque',intensity:30,duration:15});
const started=engine2.getSnapshot();
now=started.phaseEndsAt+(3*60*1000)+(9*60*1000)+1;
engine2.tick();
assert.strictEqual(engine2.getSnapshot().phase,'WAKE');

console.log('PASS session-engine: plan, transitions, pause/resume, paused-skip regression, recall, archive and timestamp catch-up');
