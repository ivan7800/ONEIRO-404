(function(root){
  'use strict';

  const LAYERS=['rain','wind','pink','brown','drone'];
  const DEFAULT_PREFS={
    enabled:true,
    master:34,
    fadeSeconds:2.8,
    layers:{rain:100,wind:100,pink:100,brown:100,drone:100}
  };

  const MODE_PRESETS={
    Dream:{rain:.25,wind:.05,pink:.10,brown:.04,drone:.09},
    Lucid:{rain:.12,wind:.04,pink:.07,brown:.03,drone:.15},
    Nightmare:{rain:.16,wind:.12,pink:.03,brown:.09,drone:.18},
    Liminal:{rain:.07,wind:.11,pink:.05,brown:.08,drone:.17},
    Adventure:{rain:.15,wind:.09,pink:.04,brown:.05,drone:.11},
    Memory:{rain:.17,wind:.04,pink:.09,brown:.04,drone:.08},
    Custom:{rain:.13,wind:.07,pink:.08,brown:.06,drone:.10}
  };

  const PHASE_LEVEL={PRIME:.48,DESCENT:.76,SLEEP:.62,WAKE:.22};
  const PHASE_TONE={
    PRIME:{rain:1,wind:.7,pink:.85,brown:.65,drone:.75},
    DESCENT:{rain:1,wind:1,pink:1,brown:1,drone:1},
    SLEEP:{rain:.82,wind:.72,pink:.78,brown:.9,drone:.68},
    WAKE:{rain:.52,wind:.35,pink:.4,brown:.3,drone:.28}
  };

  function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)||0));}
  function deepPrefs(raw={}){
    return {
      enabled:raw.enabled!==false,
      master:clamp(raw.master??DEFAULT_PREFS.master,0,70),
      fadeSeconds:clamp(raw.fadeSeconds??DEFAULT_PREFS.fadeSeconds,.2,8),
      layers:Object.fromEntries(LAYERS.map(name=>[name,clamp(raw.layers?.[name]??100,0,100)]))
    };
  }
  function presetMix(mode='Dream',phase='DESCENT',intensity=40,prefs=DEFAULT_PREFS){
    const p=deepPrefs(prefs);
    const preset=MODE_PRESETS[mode]||MODE_PRESETS.Dream;
    const tone=PHASE_TONE[phase]||PHASE_TONE.DESCENT;
    const intensityScale=.72+(clamp(intensity,0,100)/100)*.38;
    const layerMix={};
    LAYERS.forEach(name=>{
      const custom=p.layers[name]/100;
      layerMix[name]=clamp(preset[name]*tone[name]*intensityScale*custom,0,.24);
    });
    const master=clamp((p.master/100)*(PHASE_LEVEL[phase]??.6),0,.5);
    return {master,layers:layerMix};
  }

  class AudioEngine{
    constructor(storage){
      this.storage=storage;
      this.ctx=null;
      this.masterGain=null;
      this.compressor=null;
      this.nodes={};
      this.sources=[];
      this.started=false;
      this.boundUnsubscribe=null;
      this.listeners=new Set();
      this.lastSyncKey='';
      this.state={supported:!!(root.AudioContext||root.webkitAudioContext),status:'idle',message:'Audio listo para activarse',phase:null,mode:null};
    }

    init(){this._emit();return this.getState();}
    subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
    getState(){return {...this.state,prefs:this.getPrefs()};}
    getPrefs(){return deepPrefs(this.storage?.get('audioPrefs',DEFAULT_PREFS)||DEFAULT_PREFS);}
    savePrefs(next){const prefs=deepPrefs(next);this.storage?.set('audioPrefs',prefs);this.lastSyncKey='';this._emit();return prefs;}
    updatePrefs(patch={}){
      const current=this.getPrefs();
      const next={...current,...patch,layers:{...current.layers,...(patch.layers||{})}};
      const saved=this.savePrefs(next);
      if(this.started && this.state.phase) this.applyPreset(this.state.mode||'Dream',this.state.phase,this.state.intensity||40);
      return saved;
    }

    bindSessionEngine(engine){
      if(this.boundUnsubscribe) this.boundUnsubscribe();
      this.boundUnsubscribe=engine.subscribe(session=>this.syncSession(session));
      this.syncSession(engine.getSnapshot());
    }

    async unlock(){
      if(!this.state.supported){this._setState('unsupported','Web Audio API no está disponible en este navegador.');return false;}
      try{
        this._ensureGraph();
        if(this.ctx.state==='suspended') await this.ctx.resume();
        if(this.ctx.state!=='running'){
          this._setState('suspended','El navegador mantiene el audio suspendido. Pulsa REACTIVAR AUDIO.');
          return false;
        }
        this._setState('ready','Audio activado.');
        return true;
      }catch(err){
        console.warn('ONEIRO audio unlock:',err);
        this._setState('error','No se pudo activar el audio en este navegador.');
        return false;
      }
    }

    async preview(mode='Dream',intensity=40){
      if(!this.getPrefs().enabled){this._setState('disabled','Audio desactivado en la sesión.');return false;}
      const ok=await this.unlock();
      if(!ok)return false;
      this._startSources();
      this.state.mode=mode;this.state.phase='DESCENT';this.state.intensity=intensity;
      this.applyPreset(mode,'DESCENT',intensity,.9);
      this._setState('preview','Preescucha activa · pulsa SILENCIO para detenerla.');
      return true;
    }

    stopPreview(){
      if(this.state.status!=='preview')return;
      this.fadeOut(1.0);
      this.state.phase=null;this.state.mode=null;
      this._setState('ready','Preescucha detenida.');
    }

    async reactivate(){
      const ok=await this.unlock();
      if(ok){this.lastSyncKey='';this._emit();}
      return ok;
    }

    syncSession(session){
      const prefs=this.getPrefs();
      if(!session || session.phase==='RECALL'){
        if(this.started) this.fadeOut(1.6);
        this.lastSyncKey='';
        this.state.phase=null;this.state.mode=null;
        this._setState('idle',session?'Audio detenido durante RECALL.':'Audio listo para activarse.');
        return;
      }
      if(!prefs.enabled){
        if(this.started)this.fadeOut(.7);
        this._setState('disabled','Audio desactivado para esta sesión.');
        return;
      }
      const key=[session.id,session.phase,session.status,session.mode,session.intensity,prefs.master,...LAYERS.map(n=>prefs.layers[n])].join('|');
      if(key===this.lastSyncKey)return;
      this.lastSyncKey=key;
      this.state.phase=session.phase;this.state.mode=session.mode;this.state.intensity=session.intensity;

      if(!this.ctx || this.ctx.state!=='running'){
        this._setState('locked','Sesión activa · pulsa REACTIVAR AUDIO para iniciar o recuperar el sonido.');
        return;
      }
      this._startSources();
      if(session.status==='paused'){
        this._ramp(this.masterGain,0,.7);
        this._setState('paused','Audio atenuado mientras la sesión está en pausa.');
        return;
      }
      this.applyPreset(session.mode,session.phase,session.intensity);
      this._setState('playing',`${session.phase} · paisaje ${session.mode.toUpperCase()} activo`);
    }

    applyPreset(mode,phase,intensity,fadeOverride=null){
      if(!this.ctx||!this.masterGain)return;
      const mix=presetMix(mode,phase,intensity,this.getPrefs());
      const fade=fadeOverride??this.getPrefs().fadeSeconds;
      this._ramp(this.masterGain,mix.master,fade);
      LAYERS.forEach(name=>{if(this.nodes[name]?.gain)this._ramp(this.nodes[name].gain,mix.layers[name],fade);});
    }

    fadeOut(seconds=1.5){if(this.masterGain&&this.ctx)this._ramp(this.masterGain,0,seconds);}

    reset(){
      this.storage?.remove('audioPrefs');
      this.lastSyncKey='';
      this.fadeOut(.2);
      this._setState('idle','Audio restablecido.');
    }

    _ensureGraph(){
      if(this.ctx)return;
      const Ctx=root.AudioContext||root.webkitAudioContext;
      if(!Ctx)throw new Error('AudioContext unavailable');
      this.ctx=new Ctx({latencyHint:'playback'});
      this.masterGain=this.ctx.createGain();
      this.masterGain.gain.value=0;
      this.compressor=this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value=-20;
      this.compressor.knee.value=18;
      this.compressor.ratio.value=5;
      this.compressor.attack.value=.015;
      this.compressor.release.value=.45;
      this.masterGain.connect(this.compressor).connect(this.ctx.destination);
      this.ctx.addEventListener?.('statechange',()=>{
        if(this.ctx.state==='suspended' && this.state.phase)this._setState('suspended','Audio suspendido por el navegador · pulsa REACTIVAR AUDIO.');
      });
    }

    _startSources(){
      if(this.started)return;
      this._ensureGraph();
      const ctx=this.ctx;
      const white=this._noiseBuffer('white',4);
      const pink=this._noiseBuffer('pink',4);
      const brown=this._noiseBuffer('brown',4);

      this.nodes.rain=this._noiseLayer(white,{highpass:900,lowpass:7600});
      this.nodes.pink=this._noiseLayer(pink,{lowpass:3500});
      this.nodes.brown=this._noiseLayer(brown,{lowpass:900});
      this.nodes.wind=this._noiseLayer(pink,{highpass:70,lowpass:850});

      const windLfo=ctx.createOscillator();
      const windDepth=ctx.createGain();
      windLfo.type='sine';windLfo.frequency.value=.075;windDepth.gain.value=.012;
      windLfo.connect(windDepth).connect(this.nodes.wind.gain.gain);
      windLfo.start();this.sources.push(windLfo);

      const droneGain=ctx.createGain();droneGain.gain.value=0;droneGain.connect(this.masterGain);
      const droneFilter=ctx.createBiquadFilter();droneFilter.type='lowpass';droneFilter.frequency.value=420;droneFilter.Q.value=.7;droneFilter.connect(droneGain);
      [55,82.5,110].forEach((freq,i)=>{
        const osc=ctx.createOscillator();const g=ctx.createGain();
        osc.type=i===1?'triangle':'sine';osc.frequency.value=freq;g.gain.value=i===1?.18:.11;
        osc.connect(g).connect(droneFilter);osc.start();this.sources.push(osc);
      });
      this.nodes.drone={gain:droneGain};
      this.started=true;
    }

    _noiseLayer(buffer,filters={}){
      const ctx=this.ctx;const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;
      const gain=ctx.createGain();gain.gain.value=0;
      let tail=src;
      if(filters.highpass){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=filters.highpass;tail.connect(hp);tail=hp;}
      if(filters.lowpass){const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=filters.lowpass;tail.connect(lp);tail=lp;}
      tail.connect(gain).connect(this.masterGain);src.start();this.sources.push(src);return{src,gain};
    }

    _noiseBuffer(kind,seconds){
      const len=Math.max(1,Math.floor(this.ctx.sampleRate*seconds));
      const buffer=this.ctx.createBuffer(1,len,this.ctx.sampleRate);const out=buffer.getChannelData(0);
      if(kind==='white'){for(let i=0;i<len;i++)out[i]=Math.random()*2-1;return buffer;}
      if(kind==='brown'){
        let last=0;for(let i=0;i<len;i++){const white=Math.random()*2-1;last=(last+.02*white)/1.02;out[i]=last*3.4;}return buffer;
      }
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for(let i=0;i<len;i++){
        const w=Math.random()*2-1;
        b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.96900*b2+w*.1538520;
        b3=.86650*b3+w*.3104856;b4=.55000*b4+w*.5329522;b5=-.7616*b5-w*.0168980;
        out[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;
      }
      return buffer;
    }

    _ramp(gainNode,target,seconds){
      if(!gainNode?.gain||!this.ctx)return;
      const t=this.ctx.currentTime;const param=gainNode.gain;
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value,t);
      param.linearRampToValueAtTime(clamp(target,0,1),t+Math.max(.02,seconds));
    }

    _setState(status,message){this.state.status=status;this.state.message=message;this._emit();}
    _emit(){const snapshot=this.getState();this.listeners.forEach(fn=>{try{fn(snapshot);}catch(err){console.error(err);}});}
  }

  root.ONEIRO_AUDIO_META={LAYERS:[...LAYERS],DEFAULT_PREFS,MODE_PRESETS,PHASE_LEVEL,PHASE_TONE,presetMix,deepPrefs};
  root.ONEIRO_AUDIO_ENGINE_CORE=AudioEngine;
  if(root.ONEIRO_STORAGE)root.ONEIRO_AUDIO_ENGINE=new AudioEngine(root.ONEIRO_STORAGE);
})(typeof window!=='undefined'?window:globalThis);
