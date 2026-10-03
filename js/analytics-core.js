(function(root){
  'use strict';

  const STOPWORDS=new Set([
    'que','como','con','sin','para','por','una','uno','unos','unas','del','las','los','el','la','de','en','al','y','o','u','e','mi','mis','me','yo','tu','tus','su','sus','se','un','es','ser','estar','quiero','soñar','sonar','sueño','sueno','esta','este','esto','esa','ese','eso','muy','más','mas','menos','sobre','entre','hacia','desde','donde','cuando','algo','alguna','alguno','algún','algun','noche','hoy','the','and','with','without','for','from','into','want','dream','dreaming','tonight','this','that','there','where','when','some','very','more','less','about'
  ]);
  const FIELD_LABELS={symbols:'Símbolos',places:'Lugares',emotions:'Emociones',people:'Personas',tags:'Etiquetas'};
  const MODES=['Dream','Lucid','Nightmare','Liminal','Adventure','Memory','Custom','Manual'];

  const clamp=(v,min,max)=>Math.min(max,Math.max(min,Number(v)||0));
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const unique=list=>[...new Set(list)];
  const avg=(entries,key)=>entries.length?Math.round(entries.reduce((s,e)=>s+Number(e[key]||0),0)/entries.length):0;

  function tokenize(value){
    return unique(fold(value)
      .replace(/[^a-z0-9ñ]+/g,' ')
      .split(/\s+/)
      .filter(word=>word.length>=3&&!STOPWORDS.has(word)&&!/^[0-9]+$/.test(word)));
  }

  function filterByDays(entries=[],days='all',now=new Date()){
    if(days==='all'||days===0||days==='0'||days==null) return entries.slice();
    const n=Math.max(1,Number(days)||0);
    const cutoff=now.getTime()-n*86400000;
    return entries.filter(e=>{
      const t=new Date(e.dreamAt||e.createdAt||0).getTime();
      return Number.isFinite(t)&&t>=cutoff&&t<=now.getTime()+86400000;
    });
  }

  function summarize(entries=[]){
    const count=entries.length;
    const lucidCount=entries.filter(e=>Number(e.lucidity||0)>=50).length;
    return {
      count,
      avgVividness:avg(entries,'vividness'),
      avgIntensity:avg(entries,'intensity'),
      avgLucidity:avg(entries,'lucidity'),
      lucidCount,
      lucidRate:count?Math.round(lucidCount/count*100):0,
      sessionCount:entries.filter(e=>e.sessionId||e.source==='session').length,
      manualCount:entries.filter(e=>!(e.sessionId||e.source==='session')).length,
      confidence:count>=12?'alta':count>=5?'media':count>=3?'preliminar':'insuficiente'
    };
  }

  function fieldFrequency(entries=[],field,limit=12){
    const map=new Map();
    for(const entry of entries){
      const seen=new Set();
      const values=Array.isArray(entry[field])?entry[field]:[];
      for(const raw of values){
        const key=fold(raw).trim();
        if(!key||seen.has(key)) continue;
        seen.add(key);
        const prev=map.get(key)||{key,label:String(raw).trim(),count:0,field};
        prev.count+=1;
        map.set(key,prev);
      }
    }
    return [...map.values()]
      .map(item=>({...item,rate:entries.length?Math.round(item.count/entries.length*100):0}))
      .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es'))
      .slice(0,limit);
  }

  function dreamDNA(entries=[],limit=16){
    const map=new Map();
    for(const entry of entries){
      const seen=new Set();
      for(const field of Object.keys(FIELD_LABELS)){
        for(const raw of (Array.isArray(entry[field])?entry[field]:[])){
          const key=fold(raw).trim();
          if(!key) continue;
          const composite=`${entry.id||entry.dreamAt||''}::${key}`;
          const prev=map.get(key)||{key,label:String(raw).trim(),count:0,categories:new Set()};
          prev.categories.add(FIELD_LABELS[field]);
          if(!seen.has(composite)){prev.count+=1;seen.add(composite);}
          map.set(key,prev);
        }
      }
    }
    return [...map.values()]
      .map(item=>({...item,categories:[...item.categories],category:[...item.categories].join(' · '),rate:entries.length?Math.round(item.count/entries.length*100):0,recurrent:item.count>=2}))
      .sort((a,b)=>b.count-a.count||b.rate-a.rate||a.label.localeCompare(b.label,'es'))
      .slice(0,limit)
      .map((item,index)=>({...item,rank:index+1}));
  }

  function modePerformance(entries=[]){
    return MODES.map(mode=>{
      const subset=entries.filter(e=>e.mode===mode);
      if(!subset.length) return null;
      const s=summarize(subset);
      return {mode,count:subset.length,recall:s.avgVividness,lucidity:s.avgLucidity,lucidRate:s.lucidRate,intensity:s.avgIntensity};
    }).filter(Boolean).sort((a,b)=>b.count-a.count||b.recall-a.recall);
  }

  function association(entries=[]){
    const keywordMap=new Map();
    let eligible=0,hits=0,totalOverlap=0;
    const rows=[];
    for(const entry of entries){
      const target=tokenize(entry.intention||'');
      if(!target.length) continue;
      eligible++;
      const observed=new Set(tokenize([
        entry.title,entry.text,
        ...(entry.symbols||[]),...(entry.places||[]),...(entry.people||[]),...(entry.tags||[]),...(entry.emotions||[])
      ].join(' ')));
      const matched=target.filter(word=>observed.has(word));
      const overlap=target.length?matched.length/target.length:0;
      const hit=matched.length>0;
      if(hit) hits++;
      totalOverlap+=overlap;
      for(const word of matched) keywordMap.set(word,(keywordMap.get(word)||0)+1);
      rows.push({id:entry.id,mode:entry.mode,targetCount:target.length,matchedCount:matched.length,matched,overlap:Math.round(overlap*100),hit});
    }
    const keywords=[...keywordMap.entries()].map(([keyword,count])=>({keyword,count})).sort((a,b)=>b.count-a.count||a.keyword.localeCompare(b.keyword,'es')).slice(0,10);
    return {
      eligible,hits,
      rate:eligible?Math.round(hits/eligible*100):0,
      avgOverlap:eligible?Math.round(totalOverlap/eligible*100):0,
      rows,keywords,
      note:'Coincidencia léxica entre palabras relevantes de la intención y el recuerdo registrado. No demuestra causalidad.'
    };
  }

  function weeklyTrend(entries=[],weeks=8,now=new Date()){
    const count=Math.max(4,Math.min(16,Number(weeks)||8));
    const end=new Date(now);end.setHours(23,59,59,999);
    const buckets=[];
    for(let i=count-1;i>=0;i--){
      const to=new Date(end.getTime()-i*7*86400000);
      const from=new Date(to.getTime()-6*86400000);from.setHours(0,0,0,0);
      const subset=entries.filter(e=>{
        const t=new Date(e.dreamAt||e.createdAt||0).getTime();
        return Number.isFinite(t)&&t>=from.getTime()&&t<=to.getTime();
      });
      buckets.push({
        from:from.toISOString(),to:to.toISOString(),
        label:new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short'}).format(from),
        count:subset.length,recall:avg(subset,'vividness'),lucidity:avg(subset,'lucidity'),intensity:avg(subset,'intensity')
      });
    }
    return buckets;
  }

  function recurrenceMatrix(entries=[]){
    const categories={symbols:fieldFrequency(entries,'symbols',8),places:fieldFrequency(entries,'places',8),emotions:fieldFrequency(entries,'emotions',8)};
    return Object.fromEntries(Object.entries(categories).map(([key,items])=>[key,items.filter(item=>item.count>=2)]));
  }


  function dreamGraph(entries=[],options={}){
    const fields=options.fields||Object.keys(FIELD_LABELS), maxNodes=Math.max(4,Math.min(30,Number(options.maxNodes)||18));
    const nodes=new Map(), edges=new Map();
    for(const entry of entries){
      const items=new Map();
      for(const field of fields) for(const raw of (Array.isArray(entry[field])?entry[field]:[])){
        const key=fold(raw).trim(); if(!key) continue;
        const item=items.get(key)||{key,label:String(raw).trim(),categories:new Set()}; item.categories.add(FIELD_LABELS[field]); items.set(key,item);
      }
      for(const item of items.values()){
        const n=nodes.get(item.key)||{id:item.key,label:item.label,count:0,categories:new Set(),dreamIds:[]};
        n.count++; item.categories.forEach(x=>n.categories.add(x)); n.dreamIds.push(entry.id); nodes.set(item.key,n);
      }
      const keys=[...items.keys()].sort();
      for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++){
        const a=keys[i],b=keys[j],id=`${a}::${b}`, e=edges.get(id)||{id,source:a,target:b,count:0,dreamIds:[]};
        e.count++; e.dreamIds.push(entry.id); edges.set(id,e);
      }
    }
    const chosen=[...nodes.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es')).slice(0,maxNodes);
    const keep=new Set(chosen.map(n=>n.id));
    const outNodes=chosen.map(n=>({...n,categories:[...n.categories],rate:entries.length?Math.round(n.count/entries.length*100):0}));
    const outEdges=[...edges.values()].filter(e=>keep.has(e.source)&&keep.has(e.target)).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
    return {nodes:outNodes,edges:outEdges,maxEdge:Math.max(1,...outEdges.map(e=>e.count)),dreamCount:entries.length};
  }

  function analyze(entries=[],options={}){
    const now=options.now instanceof Date?options.now:new Date(options.now||Date.now());
    const filtered=filterByDays(entries,options.days??'all',now);
    return {
      generatedAt:now.toISOString(),
      window:options.days??'all',
      entries:filtered,
      summary:summarize(filtered),
      dna:dreamDNA(filtered,options.dnaLimit||16),
      modes:modePerformance(filtered),
      association:association(filtered),
      trend:weeklyTrend(filtered,options.weeks||8,now),
      recurrences:recurrenceMatrix(filtered),
      graph:dreamGraph(filtered,{maxNodes:18})
    };
  }

  const api={STOPWORDS,FIELD_LABELS,MODES,fold,tokenize,filterByDays,summarize,fieldFrequency,dreamDNA,modePerformance,association,weeklyTrend,recurrenceMatrix,dreamGraph,analyze,clamp};
  root.ONEIRO_ANALYTICS=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
