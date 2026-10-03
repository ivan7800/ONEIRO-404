const assert=require('assert');
const A=require('../js/analytics-core.js');

const now=new Date('2026-10-03T12:00:00Z');
const entries=[
  {id:'1',dreamAt:'2026-10-03T06:00:00Z',mode:'Liminal',vividness:80,intensity:70,lucidity:20,intention:'hotel ocean red door',text:'I walked through a hotel under the ocean and found a red door.',symbols:['Door','Water'],places:['Hotel','Ocean'],emotions:['Curiosity'],tags:['water']},
  {id:'2',dreamAt:'2026-10-02T06:00:00Z',mode:'Liminal',vividness:70,intensity:60,lucidity:10,intention:'endless stairs hotel',text:'Endless stairs in the same hotel.',symbols:['Stairs'],places:['Hotel'],emotions:['Fear'],tags:['recurrent']},
  {id:'3',dreamAt:'2026-09-29T06:00:00Z',mode:'Lucid',vividness:90,intensity:50,lucidity:80,intention:'fly over city',text:'I realized I was dreaming and started to fly over the city.',symbols:['Flight'],places:['City'],emotions:['Joy'],tags:['lucid']},
  {id:'4',dreamAt:'2026-09-20T06:00:00Z',mode:'Dream',vividness:60,intensity:40,lucidity:0,intention:'forest rain',text:'A quiet forest in heavy rain.',symbols:['Rain'],places:['Forest'],emotions:['Calm'],tags:['nature']},
  {id:'5',dreamAt:'2026-08-01T06:00:00Z',mode:'Manual',vividness:50,intensity:30,lucidity:0,intention:'',text:'Train station.',symbols:['Train'],places:['Station'],emotions:['Neutral'],tags:[]},
  {id:'6',dreamAt:'2026-10-01T06:00:00Z',mode:'Dream',vividness:40,intensity:75,lucidity:55,intention:'black lighthouse',text:'A beach at night.',notes:'Later I thought about a black lighthouse.',symbols:['Beach'],places:['Beach'],emotions:['Unease'],tags:[]}
];

const s=A.summarize(entries);
assert.equal(s.count,6);
assert.equal(s.lucidCount,2);
assert.equal(s.lucidRate,33);
assert.equal(s.confidence,'media');

const dna=A.dreamDNA(entries,100);
const water=dna.find(x=>x.key==='water');
assert(water,'water should appear in DNA');
assert.equal(water.count,1,'same term in symbols+tags of one dream must count once');
const hotel=dna.find(x=>x.key==='hotel');
assert.equal(hotel.count,2);
assert.equal(hotel.rate,33);

const assoc=A.association(entries);
assert.equal(assoc.eligible,5);
assert.equal(assoc.hits,4,'notes must not manufacture a target match');
assert.equal(assoc.rate,80);
assert.equal(assoc.rows.find(x=>x.id==='6').hit,false);

const recent=A.filterByDays(entries,30,now);
assert.equal(recent.length,5);
assert(!recent.some(x=>x.id==='5'));

const modes=A.modePerformance(entries);
assert.equal(modes.find(x=>x.mode==='Liminal').count,2);
assert.equal(modes.find(x=>x.mode==='Lucid').lucidRate,100);

const trend=A.weeklyTrend(entries,8,now);
assert.equal(trend.length,8);
assert(trend.reduce((sum,x)=>sum+x.count,0)>=5);

const rec=A.recurrenceMatrix(entries);
assert(rec.places.some(x=>x.key==='hotel'&&x.count===2));
assert.equal(rec.symbols.length,0);

const report=A.analyze(entries,{days:30,weeks:8,now});
assert.equal(report.summary.count,5);
assert.equal(report.association.eligible,5);
assert(report.dna.length>0);

console.log('PASS analytics-core');
