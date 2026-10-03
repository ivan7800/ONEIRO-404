(function(root){
  'use strict';

  const MODES=['Dream','Lucid','Nightmare','Liminal','Adventure','Memory','Custom','Manual'];
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
  const cleanText=(value,max=12000)=>String(value??'').trim().slice(0,max);
  const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

  function normalizeList(value,limit=24){
    const raw=Array.isArray(value)?value:String(value??'').split(/[,;\n]+/);
    const out=[];
    const seen=new Set();
    for(const item of raw){
      const clean=String(item??'').trim().replace(/\s+/g,' ').slice(0,60);
      const key=fold(clean);
      if(!clean||seen.has(key)) continue;
      seen.add(key);out.push(clean);
      if(out.length>=limit) break;
    }
    return out;
  }

  function makeTitle(text,date=new Date()){
    const first=cleanText(text,80).split(/\n|[.!?]/)[0].trim();
    if(first) return first.length>56?`${first.slice(0,53)}…`:first;
    const d=date instanceof Date?date:new Date(date);
    return `Sueño · ${new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(d)}`;
  }

  function normalizeEntry(input={}){
    const now=new Date().toISOString();
    const dreamAt=new Date(input.dreamAt||input.savedAt||input.createdAt||now);
    const safeDreamAt=Number.isNaN(dreamAt.getTime())?now:dreamAt.toISOString();
    const text=cleanText(input.text);
    const mode=MODES.includes(input.mode)?input.mode:'Manual';
    const lucidity=clamp(input.lucidity ?? (input.lucid?100:0),0,100);
    const entry={
      id:cleanText(input.id,140)||`dream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,
      sessionId:cleanText(input.sessionId,160)||null,
      title:cleanText(input.title,120)||makeTitle(text,safeDreamAt),
      text,
      dreamAt:safeDreamAt,
      mode,
      intention:cleanText(input.intention,600),
      vividness:clamp(input.vividness,0,100),
      intensity:clamp(input.intensity,0,100),
      lucidity,
      lucid:lucidity>=50,
      emotions:normalizeList(input.emotions),
      places:normalizeList(input.places),
      people:normalizeList(input.people),
      symbols:normalizeList(input.symbols),
      tags:normalizeList(input.tags),
      notes:cleanText(input.notes,4000),
      createdAt:input.createdAt||now,
      updatedAt:now,
      source:cleanText(input.source,40)||'manual'
    };
    return entry;
  }

  function fromSession(session={},details={}){
    const recall=session.recall||{};
    const sessionId=String(session.id||'').trim();
    const dreamAt=recall.savedAt||session.endedAt||session.startedAt||new Date().toISOString();
    return normalizeEntry({
      ...details,
      id:sessionId?`session-${sessionId}`:details.id,
      sessionId:sessionId||null,
      title:details.title ?? recall.title,
      text:details.text ?? recall.text,
      dreamAt:details.dreamAt||dreamAt,
      mode:session.mode||details.mode,
      intention:session.intention||details.intention,
      vividness:details.vividness ?? recall.vividness,
      intensity:details.intensity ?? recall.intensity ?? 50,
      lucidity:details.lucidity ?? recall.lucidity ?? (recall.lucid?100:0),
      emotions:details.emotions ?? recall.emotions,
      places:details.places ?? recall.places,
      people:details.people ?? recall.people,
      symbols:details.symbols ?? recall.symbols,
      tags:details.tags ?? recall.tags,
      source:'session'
    });
  }

  function searchEntries(entries=[],filters={}){
    const q=fold(filters.query).trim();
    const mode=filters.mode||'all';
    const lucid=filters.lucid||'all';
    const tag=fold(filters.tag).trim();
    const minVividness=clamp(filters.minVividness||0,0,100);
    const haystack=e=>fold([
      e.title,e.text,e.intention,e.mode,e.notes,
      ...(e.emotions||[]),...(e.places||[]),...(e.people||[]),...(e.symbols||[]),...(e.tags||[])
    ].join(' '));
    let out=entries.filter(entry=>{
      if(mode!=='all'&&entry.mode!==mode) return false;
      if(lucid==='yes'&&Number(entry.lucidity||0)<50) return false;
      if(lucid==='no'&&Number(entry.lucidity||0)>=50) return false;
      if(Number(entry.vividness||0)<minVividness) return false;
      const flat=haystack(entry);
      if(q&&!flat.includes(q)) return false;
      if(tag&&!flat.includes(tag)) return false;
      return true;
    });
    const sort=filters.sort||'newest';
    out=out.slice().sort((a,b)=>{
      if(sort==='oldest') return new Date(a.dreamAt)-new Date(b.dreamAt);
      if(sort==='vividness') return Number(b.vividness||0)-Number(a.vividness||0)||new Date(b.dreamAt)-new Date(a.dreamAt);
      if(sort==='lucidity') return Number(b.lucidity||0)-Number(a.lucidity||0)||new Date(b.dreamAt)-new Date(a.dreamAt);
      return new Date(b.dreamAt)-new Date(a.dreamAt);
    });
    return out;
  }

  function summarize(entries=[]){
    const count=entries.length;
    const avg=key=>count?Math.round(entries.reduce((sum,e)=>sum+Number(e[key]||0),0)/count):0;
    const lucidCount=entries.filter(e=>Number(e.lucidity||0)>=50).length;
    return {count,avgVividness:avg('vividness'),avgIntensity:avg('intensity'),avgLucidity:avg('lucidity'),lucidCount,lucidRate:count?Math.round(lucidCount/count*100):0};
  }

  const api={MODES,normalizeList,normalizeEntry,fromSession,searchEntries,summarize,makeTitle,fold};
  root.ONEIRO_JOURNAL_CORE=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
