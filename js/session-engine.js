(function(root){
  'use strict';

  const PHASE_ORDER=['PREPARE','PRIME','DESCENT','SLEEP','WAKE','RECALL'];
  const TIMED_PHASES=['PRIME','DESCENT','SLEEP','WAKE'];

  const MODE_CONTENT={
    Dream:{
      label:'DREAM',
      prime:'Repite tu intención con calma. No intentes forzar imágenes: deja que aparezcan asociaciones alrededor del tema.',
      descent:'Cierra los ojos. Respira con naturalidad y permite que la escena pierda detalle consciente.',
      sleep:'La sesión queda en modo nocturno. Descansa; no necesitas mantener la atención.',
      wake:'No te muevas todavía. Busca primero una imagen, una emoción o un lugar antes de reconstruir la historia.'
    },
    Lucid:{
      label:'LUCID',
      prime:'Haz una comprobación de realidad: mira tus manos, lee una frase dos veces y recuerda cómo llegaste aquí. Formula la intención de reconocer el próximo sueño.',
      descent:'Deja ir la comprobación. Conserva solo una idea sencilla: “cuando algo sea extraño, recordaré que estoy soñando”.',
      sleep:'Modo nocturno activo. La lucidez no puede garantizarse; prioriza un descanso normal.',
      wake:'Antes de levantarte, pregúntate si en algún momento supiste que estabas soñando.'
    },
    Nightmare:{
      label:'NIGHTMARE',
      prime:'Construye una escena inquietante pero tolerable. El objetivo es explorar una estética oscura, no asustarte ni interrumpir el sueño.',
      descent:'Reduce la escena a una sola presencia, lugar u objeto. Si aumenta el malestar, termina la sesión.',
      sleep:'Modo nocturno seguro: ONEIRO no introduce sobresaltos ni estímulos destinados a despertarte.',
      wake:'Recuerda primero la emoción y después las imágenes. Si la experiencia fue desagradable, no repitas el protocolo esta noche.'
    },
    Liminal:{
      label:'LIMINAL',
      prime:'Imagina un lugar familiar que debería estar lleno, pero está vacío: un hotel, un centro comercial, una piscina, un pasillo.',
      descent:'Permite que la arquitectura cambie lentamente. No necesitas decidir qué hay detrás de cada puerta.',
      sleep:'Modo nocturno activo. Conserva la sensación de espacio, no una historia rígida.',
      wake:'¿Qué espacio recuerdas? ¿Había puertas, escaleras, pasillos, agua o habitaciones repetidas?'
    },
    Adventure:{
      label:'ADVENTURE',
      prime:'Define solo tres elementos: un lugar, un objetivo y algo desconocido que quieras encontrar.',
      descent:'Visualiza el primer paso de la expedición y deja el resto sin resolver.',
      sleep:'Modo nocturno activo. Deja que el sueño complete el mundo por su cuenta.',
      wake:'Recuerda dónde estabas, qué buscabas y qué cambió respecto a tu intención inicial.'
    },
    Memory:{
      label:'MEMORY',
      prime:'Evoca un lugar o recuerdo elegido sin intentar reconstruirlo con precisión. Quédate con detalles sensoriales simples.',
      descent:'Deja que el recuerdo se vuelva menos exacto. ONEIRO no interpreta ni valida recuerdos como hechos.',
      sleep:'Modo nocturno activo. Los sueños pueden mezclar o deformar recuerdos de manera normal.',
      wake:'Separa lo que recuerdas del sueño de lo que sabes del recuerdo original.'
    },
    Custom:{
      label:'CUSTOM',
      prime:'Lee una vez tu intención personalizada y redúcela mentalmente a una imagen o frase breve.',
      descent:'No sigas escribiendo la historia conscientemente. Deja la intención abierta.',
      sleep:'Modo nocturno activo. Tu intención queda como referencia, no como resultado garantizado.',
      wake:'Anota cualquier coincidencia, pero también las diferencias y elementos inesperados.'
    }
  };

  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
  function uid(){return `oneiro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}

  function buildPlan(totalMinutes){
    const total=Math.max(8,Number(totalMinutes)||30);
    let prime,descent,wake=1;
    if(total<=15){prime=2;descent=3;}
    else if(total<=30){prime=3;descent=5;}
    else if(total<=60){prime=5;descent=8;}
    else{prime=5;descent=10;}
    const sleep=Math.max(2,total-prime-descent-wake);
    return {PRIME:prime*60,DESCENT:descent*60,SLEEP:sleep*60,WAKE:wake*60};
  }

  class SessionEngine{
    constructor(storage,options={}){
      this.storage=storage;
      this.now=options.now||(()=>Date.now());
      this.listeners=new Set();
      this.timer=null;
      this.autoTick=options.autoTick!==false;
      this.session=null;
    }

    init(){
      this.session=this.storage.get('activeSession',null);
      if(this.session && this.session.status==='running') this._advanceExpired();
      if(this.session && this.autoTick) this._startTicker();
      this._emit();
      return this.getSnapshot();
    }

    subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
    getSnapshot(){return this.session?JSON.parse(JSON.stringify(this.session)):null;}
    getModeContent(mode){return MODE_CONTENT[mode]||MODE_CONTENT.Dream;}
    buildPlan(totalMinutes){return buildPlan(totalMinutes);}

    start(config){
      const mode=MODE_CONTENT[config.mode]?config.mode:'Dream';
      const duration=Number(config.duration)||30;
      const now=this.now();
      const plan=buildPlan(duration);
      this.session={
        id:uid(),mode,intention:String(config.intention||'').trim(),intensity:clamp(Number(config.intensity)||0,0,100),duration,
        plan,phase:'PRIME',phaseIndex:1,status:'running',startedAt:new Date(now).toISOString(),phaseStartedAt:now,
        phaseEndsAt:now+plan.PRIME*1000,pausedRemainingMs:null,completedPhases:['PREPARE'],recall:null
      };
      this._persist();
      if(this.autoTick) this._startTicker();
      this._emit();
      return this.getSnapshot();
    }

    pause(){
      if(!this.session||this.session.status!=='running'||this.session.phase==='RECALL') return;
      const now=this.now();
      this.session.pausedRemainingMs=Math.max(0,(this.session.phaseEndsAt||now)-now);
      this.session.phaseEndsAt=null;
      this.session.status='paused';
      this._persist();this._stopTicker();this._emit();
    }

    resume(){
      if(!this.session||this.session.status!=='paused') return;
      const now=this.now();
      this.session.phaseEndsAt=now+Math.max(0,this.session.pausedRemainingMs||0);
      this.session.pausedRemainingMs=null;
      this.session.status='running';
      this._persist();if(this.autoTick)this._startTicker();this._emit();
    }

    skip(){
      if(!this.session||this.session.phase==='RECALL') return;
      const wasPaused=this.session.status==='paused';
      this._moveNext(this.now());
      if(this.session&&wasPaused&&this.session.phase!=='RECALL'){
        this.session.status='paused';
        this.session.pausedRemainingMs=(this.session.plan[this.session.phase]||0)*1000;
        this.session.phaseEndsAt=null;
      }
      this._persist();this._emit();
    }

    end(reason='user'){this._archive('ended',reason);}

    finishRecall(recall={}){
      if(!this.session||this.session.phase!=='RECALL') return null;
      const list=value=>Array.isArray(value)?value.map(v=>String(v||'').trim()).filter(Boolean).slice(0,24):String(value||'').split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean).slice(0,24);
      const lucidity=clamp(recall.lucidity ?? (recall.lucid?100:0),0,100);
      this.session.recall={
        title:String(recall.title||'').trim().slice(0,120),
        text:String(recall.text||'').trim().slice(0,12000),
        vividness:clamp(Number(recall.vividness)||0,0,100),
        intensity:clamp(Number(recall.intensity)||0,0,100),
        lucidity,
        lucid:lucidity>=50,
        emotions:list(recall.emotions),
        places:list(recall.places),
        people:list(recall.people),
        symbols:list(recall.symbols),
        tags:list(recall.tags),
        savedAt:new Date(this.now()).toISOString()
      };
      return this._archive('completed','recall-saved');
    }

    getRemainingMs(){
      if(!this.session) return 0;
      if(this.session.status==='paused') return Math.max(0,this.session.pausedRemainingMs||0);
      if(this.session.status!=='running'||!this.session.phaseEndsAt) return 0;
      return Math.max(0,this.session.phaseEndsAt-this.now());
    }

    getPhaseProgress(){
      if(!this.session||!TIMED_PHASES.includes(this.session.phase)) return this.session?.phase==='RECALL'?1:0;
      const duration=(this.session.plan[this.session.phase]||1)*1000;
      const remaining=this.getRemainingMs();
      return clamp(1-(remaining/duration),0,1);
    }

    tick(){
      if(!this.session||this.session.status!=='running') return;
      this._advanceExpired();this._emit();
    }

    destroy(){this._stopTicker();this.listeners.clear();}

    _advanceExpired(){
      if(!this.session||this.session.status!=='running') return;
      let guard=0;
      const now=this.now();
      while(this.session.phase!=='RECALL' && this.session.phaseEndsAt!==null && now>=this.session.phaseEndsAt && guard<8){
        this._moveNext(this.session.phaseEndsAt);
        guard++;
      }
      this._persist();
    }

    _moveNext(transitionAt){
      const currentIndex=PHASE_ORDER.indexOf(this.session.phase);
      if(currentIndex<0||currentIndex>=PHASE_ORDER.length-1){return;}
      if(!this.session.completedPhases.includes(this.session.phase)) this.session.completedPhases.push(this.session.phase);
      const next=PHASE_ORDER[currentIndex+1];
      this.session.phase=next;
      this.session.phaseIndex=currentIndex+1;
      this.session.phaseStartedAt=transitionAt;
      this.session.pausedRemainingMs=null;
      if(next==='RECALL'){
        this.session.phaseEndsAt=null;
        this.session.status='recall';
        this._stopTicker();
      }else{
        this.session.phaseEndsAt=transitionAt+(this.session.plan[next]||0)*1000;
      }
    }

    _archive(status,reason){
      if(!this.session) return null;
      this._stopTicker();
      const archived={...this.session,status,endedAt:new Date(this.now()).toISOString(),endReason:reason};
      const history=this.storage.get('sessionHistory',[]);
      history.unshift(archived);
      this.storage.set('sessionHistory',history.slice(0,50));
      if(status==='completed'){
        const stats=this.storage.get('stats',{sessions:0,recall:'—',streak:0});
        stats.sessions=(Number(stats.sessions)||0)+1;
        if(archived.recall && archived.recall.text) stats.recall=`${archived.recall.vividness}%`;
        this.storage.set('stats',stats);
      }
      this.storage.remove('activeSession');
      this.session=null;
      this._emit();
      return archived;
    }

    _persist(){if(this.session)this.storage.set('activeSession',this.session);}
    _startTicker(){if(this.timer||!this.session||this.session.status!=='running')return;this.timer=setInterval(()=>this.tick(),500);}
    _stopTicker(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
    _emit(){const snapshot=this.getSnapshot();this.listeners.forEach(fn=>{try{fn(snapshot);}catch(err){console.error(err);}});}
  }

  root.ONEIRO_SESSION_ENGINE_CORE=SessionEngine;
  root.ONEIRO_SESSION_ENGINE_META={PHASE_ORDER:[...PHASE_ORDER],MODE_CONTENT,buildPlan};
  if(root.ONEIRO_STORAGE) root.ONEIRO_SESSION_ENGINE=new SessionEngine(root.ONEIRO_STORAGE);
})(typeof window!=='undefined'?window:globalThis);
