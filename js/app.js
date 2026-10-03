window.ONEIRO_APP={
  sessionUnsubscribe:null,
  audioUnsubscribe:null,
  journalReady:false,
  journalMigration:null,
  pwaInstallPrompt:null,
  swRegistration:null,

  async init(){
    this.applySettings();
    window.ONEIRO_ACCESSIBILITY?.init?.();
    ONEIRO_PRIVACY.init();
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();this.pwaInstallPrompt=e;this.refreshPwaInstallButton?.();});
    window.addEventListener('appinstalled',()=>{this.pwaInstallPrompt=null;this.refreshPwaInstallButton?.();});
    this._networkStatusHandler=()=>this.refreshPwaStatus?.();
    window.addEventListener('online',this._networkStatusHandler);
    window.addEventListener('offline',this._networkStatusHandler);
    if('serviceWorker' in navigator){
      const register=async()=>{try{this.swRegistration=await navigator.serviceWorker.register('./sw.js');}catch(err){console.warn(err);}this.refreshPwaStatus?.();};
      if(document.readyState==='complete') register();else window.addEventListener('load',register,{once:true});
    }
    this.startClock();
    ONEIRO_SESSION_ENGINE.init();
    ONEIRO_AUDIO_ENGINE.init();
    ONEIRO_AUDIO_ENGINE.bindSessionEngine(ONEIRO_SESSION_ENGINE);
    this.audioUnsubscribe=ONEIRO_AUDIO_ENGINE.subscribe(state=>this.refreshAudioUI(state));
    try{
      await ONEIRO_JOURNAL_DB.init();
      this.journalMigration=await ONEIRO_JOURNAL_DB.migrateSessionHistory(ONEIRO_STORAGE);
      this.journalReady=true;
    }catch(err){
      this.journalReady=false;
      console.warn('Dream Journal no disponible:',err);
    }
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden){ONEIRO_SESSION_ENGINE.tick();this.refreshAudioUI();}
    });
    ONEIRO_ROUTER.init();

  },

  afterRender(route){
    if(this.sessionUnsubscribe){this.sessionUnsubscribe();this.sessionUnsubscribe=null;}
    if(route!=='session' && ONEIRO_AUDIO_ENGINE.getState().status==='preview') ONEIRO_AUDIO_ENGINE.stopPreview();
    document.body.classList.remove('sleep-phase');
    if(route==='home') this.renderStats();
    if(route==='session') this.bindSession();
    if(route==='journal') this.bindJournal().catch(err=>this.showJournalError(err));
    if(route==='lab') this.bindLab().catch(err=>this.showLabError(err));
    if(route==='settings') this.bindSettings();
    window.ONEIRO_ACCESSIBILITY?.afterRender?.(route);
  },

  async renderStats(){
    const stats=ONEIRO_STORAGE.get('stats',{sessions:0,recall:'—',streak:0});
    const el=document.getElementById('home-stats');
    if(!el)return;
    let dreams=0,recall=stats.recall||'—';
    if(this.journalReady){
      try{
        const entries=await ONEIRO_JOURNAL_DB.list();
        const summary=ONEIRO_JOURNAL_CORE.summarize(entries);
        dreams=summary.count;
        recall=summary.count?`${summary.avgVividness}%`:'—';
      }catch(err){console.warn(err);}
    }
    if(!document.getElementById('home-stats'))return;
    el.innerHTML=`<div class="stat"><span>SESIONES</span><strong>${stats.sessions||0}</strong></div><div class="stat"><span>SUEÑOS</span><strong>${dreams}</strong></div><div class="stat"><span>RECALL MEDIO</span><strong>${recall}</strong></div>`;
    const active=ONEIRO_SESSION_ENGINE.getSnapshot();
    const banner=document.getElementById('active-session-home');
    if(active&&banner){
      banner.hidden=false;
      banner.innerHTML=`<span><strong>${this.escape(active.phase)}</strong> · ${this.escape(active.mode)}</span><button class="btn ghost" data-route="session">CONTINUAR</button>`;
    }
  },

  bindSession(){
    const form=document.getElementById('session-form');
    const range=document.getElementById('intensity');
    const out=document.getElementById('intensity-output');
    const duration=document.getElementById('duration');
    const status=document.getElementById('session-status');
    const save=document.getElementById('save-session-config');
    const vividness=document.getElementById('vividness');
    const vividnessOut=document.getElementById('vividness-output');
    const dreamIntensity=document.getElementById('dream-intensity');
    const dreamIntensityOut=document.getElementById('dream-intensity-output');
    const lucidity=document.getElementById('recall-lucidity');
    const lucidityOut=document.getElementById('lucidity-output');
    const audioEnabled=document.getElementById('audio-enabled');
    const master=document.getElementById('master-volume');
    const masterOut=document.getElementById('master-volume-output');
    const layerInputs=[...document.querySelectorAll('.audio-layer')];

    const saved=ONEIRO_STORAGE.get('lastSession');
    if(saved){
      document.getElementById('mode').value=saved.mode||'Dream';
      document.getElementById('intention').value=saved.intention||'';
      range.value=Number(saved.intensity)||40;
      out.value=`${range.value}%`;
      duration.value=String(saved.duration||30);
    }

    const audioPrefs=ONEIRO_AUDIO_ENGINE.getPrefs();
    audioEnabled.checked=audioPrefs.enabled;
    master.value=audioPrefs.master;
    masterOut.value=`${master.value}%`;
    layerInputs.forEach(input=>input.value=audioPrefs.layers[input.dataset.layer]??100);

    const updatePlan=()=>this.renderPlan(Number(duration.value));
    range.addEventListener('input',()=>out.value=`${range.value}%`);
    duration.addEventListener('change',updatePlan);
    updatePlan();

    const config=()=>({
      mode:document.getElementById('mode').value,
      intention:document.getElementById('intention').value.trim(),
      intensity:Number(range.value),
      duration:Number(duration.value),
      savedAt:new Date().toISOString()
    });
    const collectAudioPrefs=()=>({
      enabled:audioEnabled.checked,
      master:Number(master.value),
      layers:Object.fromEntries(layerInputs.map(input=>[input.dataset.layer,Number(input.value)]))
    });
    const saveAudioPrefs=()=>ONEIRO_AUDIO_ENGINE.updatePrefs(collectAudioPrefs());

    master.addEventListener('input',()=>{masterOut.value=`${master.value}%`;saveAudioPrefs();});
    audioEnabled.addEventListener('change',()=>{saveAudioPrefs();this.refreshAudioUI();});
    layerInputs.forEach(input=>input.addEventListener('input',saveAudioPrefs));

    document.getElementById('preview-audio').addEventListener('click',async()=>{
      saveAudioPrefs();
      await ONEIRO_AUDIO_ENGINE.preview(document.getElementById('mode').value,Number(range.value));
      this.refreshAudioUI();
    });
    document.getElementById('stop-audio-preview').addEventListener('click',()=>{ONEIRO_AUDIO_ENGINE.stopPreview();this.refreshAudioUI();});

    save.addEventListener('click',()=>{
      if(ONEIRO_STORAGE.set('lastSession',config())===false){status.textContent='No se pudo guardar la configuración en este navegador.';return;}
      saveAudioPrefs();status.textContent='Configuración y mezcla guardadas localmente.';
    });
    let sessionStarting=false;
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      if(sessionStarting||ONEIRO_SESSION_ENGINE.getSnapshot())return;
      const payload=config();
      if(!payload.intention){status.textContent='Escribe una intención breve antes de empezar.';document.getElementById('intention').focus();return;}
      sessionStarting=true;
      try{
        if(ONEIRO_STORAGE.set('lastSession',payload)===false) throw new Error('No se pudo guardar la sesión en este navegador.');
        const prefs=saveAudioPrefs();
        if(prefs.enabled) await ONEIRO_AUDIO_ENGINE.unlock();
        ONEIRO_SESSION_ENGINE.start(payload);
      }catch(err){status.textContent=err.message;}
      finally{sessionStarting=false;}
    });

    document.getElementById('pause-session').addEventListener('click',()=>{
      const s=ONEIRO_SESSION_ENGINE.getSnapshot();
      if(s?.status==='paused') ONEIRO_SESSION_ENGINE.resume(); else ONEIRO_SESSION_ENGINE.pause();
    });
    document.getElementById('skip-phase').addEventListener('click',()=>ONEIRO_SESSION_ENGINE.skip());
    document.getElementById('end-session').addEventListener('click',()=>{
      if(confirm('¿Terminar la sesión actual?')){ONEIRO_SESSION_ENGINE.end('user');this.renderSessionState(null);}
    });
    document.getElementById('audio-session-toggle').addEventListener('click',async()=>{
      const prefs=ONEIRO_AUDIO_ENGINE.getPrefs();
      ONEIRO_AUDIO_ENGINE.updatePrefs({enabled:!prefs.enabled});
      if(!prefs.enabled) await ONEIRO_AUDIO_ENGINE.reactivate();
      ONEIRO_AUDIO_ENGINE.syncSession(ONEIRO_SESSION_ENGINE.getSnapshot());this.refreshAudioUI();
    });
    document.getElementById('reactivate-audio').addEventListener('click',async()=>{
      await ONEIRO_AUDIO_ENGINE.reactivate();ONEIRO_AUDIO_ENGINE.syncSession(ONEIRO_SESSION_ENGINE.getSnapshot());this.refreshAudioUI();
    });

    vividness.addEventListener('input',()=>vividnessOut.value=`${vividness.value}%`);
    dreamIntensity.addEventListener('input',()=>dreamIntensityOut.value=`${dreamIntensity.value}%`);
    lucidity.addEventListener('input',()=>lucidityOut.value=`${lucidity.value}%`);
    document.getElementById('recall-form').addEventListener('submit',async e=>{e.preventDefault();await this.finishRecall(false);});
    document.getElementById('discard-recall').addEventListener('click',async()=>this.finishRecall(true));

    this.sessionUnsubscribe=ONEIRO_SESSION_ENGINE.subscribe(snapshot=>this.renderSessionState(snapshot));
    this.renderSessionState(ONEIRO_SESSION_ENGINE.getSnapshot());
    this.refreshAudioUI();
  },

  renderPlan(totalMinutes){
    const plan=ONEIRO_SESSION_ENGINE.buildPlan(totalMinutes);
    const el=document.getElementById('plan-preview');if(!el)return;
    const f=s=>s>=3600?`${Math.floor(s/3600)} h ${Math.round((s%3600)/60)} min`:`${Math.round(s/60)} min`;
    el.innerHTML=`<span>PRIME <b>${f(plan.PRIME)}</b></span><span>DESCENT <b>${f(plan.DESCENT)}</b></span><span>SLEEP <b>${f(plan.SLEEP)}</b></span><span>WAKE <b>${f(plan.WAKE)}</b></span>`;
  },

  renderSessionState(session){
    const builder=document.getElementById('session-builder-wrap'),live=document.getElementById('session-live'),recall=document.getElementById('session-recall');
    if(!builder||!live||!recall)return;
    if(!session){builder.hidden=false;live.hidden=true;recall.hidden=true;document.body.classList.remove('sleep-phase');this._lastAnnouncedPhase=null;this.refreshAudioUI();return;}
    if(session.phase==='RECALL'){builder.hidden=true;live.hidden=true;recall.hidden=false;document.body.classList.remove('sleep-phase');if(this._lastAnnouncedPhase!=='RECALL'){this._lastAnnouncedPhase='RECALL';window.ONEIRO_ACCESSIBILITY?.announce?.('Fase RECALL: registra lo que recuerdes del sueño.',true);}this.refreshAudioUI();return;}
    builder.hidden=true;live.hidden=false;recall.hidden=true;
    document.body.classList.toggle('sleep-phase',session.phase==='SLEEP');
    const meta=ONEIRO_SESSION_ENGINE.getModeContent(session.mode);
    document.getElementById('live-mode').textContent=`${meta.label} PROTOCOL`;
    document.getElementById('live-phase').textContent=session.phase;
    document.getElementById('live-title').textContent=this.phaseTitle(session.phase);
    document.getElementById('live-guidance').textContent=meta[session.phase.toLowerCase()]||'';
    document.getElementById('live-intention').textContent=session.intention||'Sin intención escrita';
    document.getElementById('live-timer').textContent=this.formatTime(ONEIRO_SESSION_ENGINE.getRemainingMs());
    document.getElementById('live-progress').style.width=`${Math.round(ONEIRO_SESSION_ENGINE.getPhaseProgress()*100)}%`;
    document.getElementById('live-state').textContent=session.status==='paused'?'SESIÓN EN PAUSA':'Temporizador basado en reloj real · el audio depende del navegador';
    document.getElementById('pause-session').textContent=session.status==='paused'?'REANUDAR':'PAUSAR';
    if(this._lastAnnouncedPhase!==session.phase){this._lastAnnouncedPhase=session.phase;window.ONEIRO_ACCESSIBILITY?.announce?.(`Fase ${session.phase}: ${this.phaseTitle(session.phase)}`);}
    this.renderPhaseRail(session.phase);this.refreshAudioUI();
  },

  renderPhaseRail(current){
    const phases=['PREPARE','PRIME','DESCENT','SLEEP','WAKE','RECALL'],currentIndex=phases.indexOf(current),rail=document.getElementById('phase-rail');
    rail.innerHTML=phases.map((phase,i)=>`<span role="listitem" ${i===currentIndex?'aria-current="step"':''} class="${i<currentIndex?'done':i===currentIndex?'active':''}">${phase}</span>`).join('');
  },

  refreshAudioUI(state=ONEIRO_AUDIO_ENGINE?.getState?.()){
    if(!state)return;
    const builderStatus=document.getElementById('audio-status');if(builderStatus){builderStatus.textContent=state.message;builderStatus.dataset.state=state.status;}
    const strip=document.getElementById('live-audio-strip'),text=document.getElementById('live-audio-status'),reactivate=document.getElementById('reactivate-audio'),toggle=document.getElementById('audio-session-toggle');
    if(strip)strip.dataset.state=state.status;if(text)text.textContent=state.message;
    if(reactivate)reactivate.hidden=!['locked','suspended','error'].includes(state.status);
    if(toggle)toggle.textContent=state.prefs.enabled?'AUDIO ON':'AUDIO OFF';
  },

  async finishRecall(discardText){
    if(ONEIRO_SESSION_ENGINE.getSnapshot()?.phase!=='RECALL')return;
    const text=discardText?'':document.getElementById('recall-text').value.trim();
    const details={
      title:discardText?'':document.getElementById('recall-title').value.trim(),
      text,
      vividness:Number(document.getElementById('vividness').value),
      intensity:Number(document.getElementById('dream-intensity').value),
      lucidity:Number(document.getElementById('recall-lucidity').value),
      emotions:document.getElementById('recall-emotions').value,
      places:document.getElementById('recall-places').value,
      people:document.getElementById('recall-people').value,
      symbols:document.getElementById('recall-symbols').value,
      tags:document.getElementById('recall-tags').value
    };
    const archived=ONEIRO_SESSION_ENGINE.finishRecall({...details,lucid:details.lucidity>=50});
    this.renderSessionState(null);
    const status=document.getElementById('session-status');
    if(!text){if(status)status.textContent='Sesión cerrada sin crear una entrada de diario.';return;}
    if(!this.journalReady){if(status)status.textContent='Sesión guardada. IndexedDB no está disponible; ONEIRO reintentará migrar el recall en el próximo arranque.';return;}
    try{
      await ONEIRO_JOURNAL_DB.addFromSession(archived,details);
      if(status)status.textContent='Sesión completada y sueño guardado en Dream Journal.';
    }catch(err){
      console.warn(err);
      if(status)status.textContent='La sesión quedó en el historial, pero IndexedDB falló. ONEIRO reintentará la migración al volver a abrirse.';
    }
  },

  async bindJournal(){
    const status=document.getElementById('journal-status');
    if(!this.journalReady){this.showJournalError(ONEIRO_JOURNAL_DB.error||new Error('IndexedDB no disponible.'));return;}
    let entries=await ONEIRO_JOURNAL_DB.list();
    if(ONEIRO_ROUTER.current!=='journal')return;
    const list=document.getElementById('journal-list'),empty=document.getElementById('journal-empty'),summary=document.getElementById('journal-summary');
    const query=document.getElementById('journal-search'),mode=document.getElementById('journal-mode-filter'),lucid=document.getElementById('journal-lucid-filter'),sort=document.getElementById('journal-sort');
    const render=()=>{
      const filtered=ONEIRO_JOURNAL_CORE.searchEntries(entries,{query:query.value,mode:mode.value,lucid:lucid.value,sort:sort.value});
      const overall=ONEIRO_JOURNAL_CORE.summarize(entries);
      summary.innerHTML=`<span><strong>${filtered.length}</strong> visibles</span><span><strong>${overall.count}</strong> sueños</span><span><strong>${overall.avgVividness||0}%</strong> recall medio</span><span><strong>${overall.lucidRate||0}%</strong> lúcidos</span>`;
      list.innerHTML=filtered.map(entry=>this.journalCard(entry)).join('');
      empty.hidden=filtered.length!==0;
      status.textContent=this.journalMigration?.imported?`${this.journalMigration.imported} recall(s) anterior(es) migrados a IndexedDB.`:'';
    };
    const reload=async()=>{entries=await ONEIRO_JOURNAL_DB.list();render();};
    [query,mode,lucid,sort].forEach(el=>el.addEventListener(el===query?'input':'change',render));
    document.getElementById('clear-journal-filters').addEventListener('click',()=>{query.value='';mode.value='all';lucid.value='all';sort.value='newest';render();});
    document.getElementById('new-dream').addEventListener('click',()=>this.openJournalEditor());
    document.getElementById('close-journal-editor').addEventListener('click',()=>this.closeJournalEditor());
    document.querySelector('.journal-layout').addEventListener('click',async e=>{
      const entryButton=e.target.closest('[data-entry-id]');
      const newButton=e.target.closest('[data-journal-action="new"]');
      if(newButton){this.openJournalEditor();return;}
      if(entryButton){const entry=await ONEIRO_JOURNAL_DB.get(entryButton.dataset.entryId);if(entry)this.openJournalEditor(entry);}
    });
    ['vividness','intensity','lucidity'].forEach(name=>{
      const input=document.getElementById(`journal-${name}`),output=document.getElementById(`journal-${name}-output`);
      input.addEventListener('input',()=>output.value=`${input.value}%`);
    });
    let journalSaving=false;
    document.getElementById('journal-form').addEventListener('submit',async e=>{
      e.preventDefault();
      if(journalSaving)return;
      const formStatus=document.getElementById('journal-form-status');
      const payload=this.collectJournalForm();
      if(!payload.text.trim()){formStatus.textContent='Escribe al menos un fragmento del sueño.';document.getElementById('journal-text').focus();return;}
      journalSaving=true;
      try{const saved=await ONEIRO_JOURNAL_DB.put(payload);formStatus.textContent='Entrada guardada en IndexedDB.';await reload();this.openJournalEditor(saved);}
      catch(err){formStatus.textContent=`No se pudo guardar: ${err.message}`;}
      finally{journalSaving=false;}
    });
    document.getElementById('delete-journal-entry').addEventListener('click',async()=>{
      const id=document.getElementById('journal-id').value;if(!id)return;
      if(!confirm('¿Eliminar esta entrada del Dream Journal? Esta acción no se puede deshacer.'))return;
      try{await ONEIRO_JOURNAL_DB.remove(id);this.closeJournalEditor();await reload();status.textContent='Entrada eliminada.';}
      catch(err){document.getElementById('journal-form-status').textContent=`No se pudo eliminar: ${err.message}`;}
    });
    render();
  },

  journalCard(entry){
    const date=new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.dreamAt));
    const snippet=(entry.text||'').replace(/\s+/g,' ').slice(0,220);
    const chips=[...(entry.symbols||[]),...(entry.places||[]),...(entry.emotions||[]),...(entry.tags||[])].slice(0,5);
    return `<article class="journal-card"><button class="journal-card-main" type="button" data-entry-id="${this.escape(entry.id)}" aria-label="Abrir sueño: ${this.escape(entry.title)}. ${this.escape(date)}. Recall ${entry.vividness}%, intensidad ${entry.intensity}%, lucidez ${entry.lucidity}%"><div class="journal-card-top"><span class="eyebrow">${this.escape(entry.mode)}</span><time>${this.escape(date)}</time></div><h3>${this.escape(entry.title)}</h3><p>${this.escape(snippet)}${entry.text.length>220?'…':''}</p><div class="journal-meters"><span>RECALL <b>${entry.vividness}%</b></span><span>INTENSIDAD <b>${entry.intensity}%</b></span><span>LUCIDEZ <b>${entry.lucidity}%</b></span></div>${chips.length?`<div class="chip-row" aria-hidden="true">${chips.map(chip=>`<span>${this.escape(chip)}</span>`).join('')}</div>`:''}</button></article>`;
  },

  openJournalEditor(entry=null){
    const editor=document.getElementById('journal-editor');if(!editor)return;
    if(editor.hidden){const active=document.activeElement;if(active&&active!==document.body)this._journalReturnFocus=active;}
    const isEdit=!!entry;
    const e=entry||{};
    document.getElementById('journal-editor-title').textContent=isEdit?'Editar sueño':'Nuevo sueño';
    document.getElementById('journal-id').value=e.id||'';
    document.getElementById('journal-created-at').value=e.createdAt||'';
    document.getElementById('journal-session-id').value=e.sessionId||'';
    document.getElementById('journal-source').value=e.source||'manual';
    document.getElementById('journal-title').value=e.title||'';
    document.getElementById('journal-dream-at').value=this.toLocalDateTime(e.dreamAt||new Date().toISOString());
    document.getElementById('journal-text').value=e.text||'';
    document.getElementById('journal-mode').value=e.mode||'Manual';
    document.getElementById('journal-vividness').value=e.vividness??50;
    document.getElementById('journal-intensity').value=e.intensity??50;
    document.getElementById('journal-lucidity').value=e.lucidity??0;
    document.getElementById('journal-intention').value=e.intention||'';
    document.getElementById('journal-emotions').value=(e.emotions||[]).join(', ');
    document.getElementById('journal-places').value=(e.places||[]).join(', ');
    document.getElementById('journal-people').value=(e.people||[]).join(', ');
    document.getElementById('journal-symbols').value=(e.symbols||[]).join(', ');
    document.getElementById('journal-tags').value=(e.tags||[]).join(', ');
    document.getElementById('journal-notes').value=e.notes||'';
    ['vividness','intensity','lucidity'].forEach(name=>document.getElementById(`journal-${name}-output`).value=`${document.getElementById(`journal-${name}`).value}%`);
    document.getElementById('delete-journal-entry').hidden=!isEdit;
    document.getElementById('journal-form-status').textContent=isEdit&&e.sessionId?'Vinculado a la sesión original. Editar aquí no modifica el historial de sesión.':'';
    editor.hidden=false;
    requestAnimationFrame(()=>{editor.scrollIntoView({behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth',block:'start'});document.getElementById('journal-title').focus({preventScroll:true});});
  },

  closeJournalEditor(){const editor=document.getElementById('journal-editor');if(editor){editor.hidden=true;const target=this._journalReturnFocus;this._journalReturnFocus=null;if(target?.isConnected)requestAnimationFrame(()=>target.focus({preventScroll:true}));window.ONEIRO_ACCESSIBILITY?.announce?.('Editor de Dream Journal cerrado');}},

  collectJournalForm(){
    const val=id=>document.getElementById(id).value;
    const dreamAt=val('journal-dream-at');
    return {
      id:val('journal-id')||undefined,createdAt:val('journal-created-at')||undefined,sessionId:val('journal-session-id')||null,source:val('journal-source')||'manual',
      title:val('journal-title'),dreamAt:dreamAt?new Date(dreamAt).toISOString():new Date().toISOString(),text:val('journal-text'),mode:val('journal-mode'),
      vividness:Number(val('journal-vividness')),intensity:Number(val('journal-intensity')),lucidity:Number(val('journal-lucidity')),intention:val('journal-intention'),
      emotions:val('journal-emotions'),places:val('journal-places'),people:val('journal-people'),symbols:val('journal-symbols'),tags:val('journal-tags'),notes:val('journal-notes')
    };
  },

  showJournalError(err){
    const status=document.getElementById('journal-status');if(status)status.textContent=`Dream Journal no disponible: ${err?.message||'error de IndexedDB'}`;
    const empty=document.getElementById('journal-empty');if(empty){empty.hidden=false;empty.querySelector('h3').textContent='IndexedDB no está disponible';empty.querySelector('p').textContent='Las sesiones siguen guardándose en el historial local y ONEIRO intentará migrarlas cuando la base de datos vuelva a estar disponible.';}
  },

  async bindLab(){
    const empty=document.getElementById('lab-empty'),content=document.getElementById('lab-content'),windowSelect=document.getElementById('lab-window');
    if(!empty||!content||!windowSelect)return;
    if(!this.journalReady){this.showLabError(ONEIRO_JOURNAL_DB.error||new Error('IndexedDB no disponible.'));return;}
    const entries=await ONEIRO_JOURNAL_DB.list();
    if(ONEIRO_ROUTER.current!=='lab')return;

    const render=()=>{
      const report=ONEIRO_ANALYTICS.analyze(entries,{days:windowSelect.value,weeks:8});
      const {summary,association}=report;
      empty.hidden=summary.count>0;
      content.hidden=summary.count===0;
      if(!summary.count)return;

      document.getElementById('lab-recall').textContent=`${summary.avgVividness}%`;
      document.getElementById('lab-recall-note').textContent=`intensidad media ${summary.avgIntensity}%`;
      document.getElementById('lab-lucid').textContent=`${summary.lucidRate}%`;
      document.getElementById('lab-lucid-note').textContent=`${summary.lucidCount} de ${summary.count} sueños`;
      document.getElementById('lab-association').textContent=association.eligible?`${association.rate}%`:'—';
      document.getElementById('lab-association-note').textContent=association.eligible?`${association.hits}/${association.eligible} con ≥1 coincidencia`:'sin intenciones comparables';
      document.getElementById('lab-sample').textContent=String(summary.count);
      document.getElementById('lab-confidence').textContent=`muestra ${summary.confidence}`;
      document.getElementById('dna-sample').textContent=`${summary.count} sueño${summary.count===1?'':'s'}`;

      const dna=document.getElementById('dream-dna');
      dna.innerHTML=report.dna.length?report.dna.map(item=>`<div class="dna-row"><span class="dna-rank">${String(item.rank).padStart(2,'0')}</span><div class="dna-name"><strong>${this.escape(item.label)}</strong><small>${this.escape(item.category)} · ${item.count} sueño${item.count===1?'':'s'}</small></div><div class="dna-meter"><span style="width:${Math.max(3,item.rate)}%"></span></div><b>${item.rate}%</b></div>`).join(''):'<div class="lab-no-data">Añade símbolos, lugares, emociones o etiquetas a tus sueños para formar el Dream DNA.</div>';

      document.getElementById('lab-trend').innerHTML=this.labTrendMarkup(report.trend);

      this.renderDreamMap(report.graph,entries);

      const modes=document.getElementById('lab-modes');
      modes.innerHTML=report.modes.length?`<div class="mode-row mode-head"><span>PROTOCOLO</span><span>N</span><span>RECALL</span><span>LUCIDEZ</span></div>${report.modes.map(row=>`<div class="mode-row"><strong>${this.escape(row.mode)}</strong><span>${row.count}</span><span>${row.recall}%</span><span>${row.lucidRate}%</span></div>`).join('')}`:'<div class="lab-no-data">Todavía no hay protocolos con recuerdos registrados.</div>';

      const assoc=document.getElementById('lab-association-detail');
      if(!association.eligible){
        assoc.innerHTML='<div class="lab-no-data">Las entradas manuales sin intención pueden formar Dream DNA, pero no permiten comparar intención ↔ recuerdo.</div>';
      }else{
        const keywords=association.keywords.length?`<div class="association-keywords">${association.keywords.map(k=>`<span>${this.escape(k.keyword)} <b>×${k.count}</b></span>`).join('')}</div>`:'<p class="muted-copy">Aún no hay palabras objetivo repetidas.</p>';
        assoc.innerHTML=`<div class="association-score"><strong>${association.rate}%</strong><span>de sueños con intención contienen al menos una palabra objetivo</span></div><div class="association-secondary"><span>Solapamiento medio</span><b>${association.avgOverlap}%</b></div>${keywords}`;
      }

      const recurrenceGroups=[['symbols','Símbolos'],['places','Lugares'],['emotions','Emociones']];
      const recurrentCount=recurrenceGroups.reduce((sum,[key])=>sum+(report.recurrences[key]?.length||0),0);
      document.getElementById('recurrence-count').textContent=`${recurrentCount} patrón${recurrentCount===1?'':'es'}`;
      document.getElementById('lab-recurrences').innerHTML=recurrenceGroups.map(([key,label])=>{
        const items=report.recurrences[key]||[];
        return `<div class="recurrence-group"><span class="eyebrow">${label.toUpperCase()}</span>${items.length?items.map(item=>`<div class="recurrence-item"><strong>${this.escape(item.label)}</strong><span>${item.count}× · ${item.rate}%</span></div>`).join(''):'<p>Sin recurrencias ≥2.</p>'}</div>`;
      }).join('');

      const status=document.getElementById('lab-status');
      status.textContent=summary.count<3?'Lectura inicial: con menos de 3 sueños los porcentajes cambian mucho con cada nueva entrada.':summary.count<5?'Patrones preliminares. Añade más recuerdos para estabilizar comparaciones.':'Análisis calculado íntegramente en este navegador; no se envía el diario a ningún servidor.';
    };

    windowSelect.addEventListener('change',render);
    render();
  },

  renderDreamMap(graph,entries=[]){
    const host=document.getElementById('dream-map'), inspector=document.getElementById('map-inspector'), count=document.getElementById('map-count'), select=document.getElementById('map-category'), reset=document.getElementById('map-reset');
    if(!host||!inspector||!count)return;
    const draw=()=>{
      const cat=select?.value||'all', nodes=graph.nodes.filter(n=>cat==='all'||n.categories.includes(cat)), keep=new Set(nodes.map(n=>n.id)), edges=graph.edges.filter(e=>keep.has(e.source)&&keep.has(e.target));
      count.textContent=`${nodes.length} nodos · ${edges.length} conexiones`; host.innerHTML='';
      if(!nodes.length){host.innerHTML='<div class="lab-no-data">No hay nodos para esta categoría.</div>';return;}
      const w=100,h=100,cx=50,cy=50, radius=nodes.length<8?34:40, positions=new Map();
      nodes.forEach((n,i)=>{const a=-Math.PI/2+(Math.PI*2*i/nodes.length);const r=radius-(i%3)*5;positions.set(n.id,{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});});
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('preserveAspectRatio','none');
      edges.forEach(e=>{const a=positions.get(e.source),b=positions.get(e.target),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','map-edge');line.setAttribute('stroke-width',String(.15+1.2*e.count/graph.maxEdge));line.dataset.edge=e.id;svg.appendChild(line);}); host.appendChild(svg);
      nodes.forEach(n=>{const pos=positions.get(n.id),btn=document.createElement('button');btn.type='button';btn.className='map-node';btn.style.left=`${pos.x}%`;btn.style.top=`${pos.y}%`;btn.textContent=`${n.label} · ${n.count}`;btn.dataset.node=n.id;btn.setAttribute('aria-label',`${n.label}. Aparece en ${n.count} de ${graph.dreamCount} sueños. Seleccionar nodo.`);btn.setAttribute('aria-pressed','false');btn.addEventListener('click',()=>{host.querySelectorAll('.map-node').forEach(x=>{const active=x===btn;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});const links=edges.filter(e=>e.source===n.id||e.target===n.id).sort((a,b)=>b.count-a.count);const related=new Set(links.flatMap(e=>[e.source,e.target]));host.querySelectorAll('.map-node').forEach(x=>x.classList.toggle('faded',x.dataset.node!==n.id&&!related.has(x.dataset.node)));const dreams=entries.filter(e=>n.dreamIds.includes(e.id));inspector.innerHTML=`<span class="eyebrow">${this.escape(n.categories.join(' · '))}</span><h4>${this.escape(n.label)}</h4><p>Aparece en <b>${n.count}</b> de ${graph.dreamCount} sueños (${n.rate}%). ${links.length} conexiones visibles.</p><div class="map-links">${links.slice(0,7).map(l=>{const other=l.source===n.id?l.target:l.source,nn=graph.nodes.find(x=>x.id===other);return `<div class="map-link"><strong>${this.escape(nn?.label||other)}</strong><span>${l.count} sueño${l.count===1?'':'s'}</span></div>`}).join('')||'<span>Sin conexiones en el filtro actual.</span>'}</div><p>${dreams.slice(0,3).map(d=>this.escape(d.title||'Sueño sin título')).join(' · ')}</p>`;});host.appendChild(btn);});
    };
    if(select&&!select.dataset.bound){select.addEventListener('change',draw);select.dataset.bound='1';} if(reset&&!reset.dataset.bound){reset.addEventListener('click',()=>{if(select)select.value='all';inspector.innerHTML='<span class="eyebrow">SELECT NODE</span><h4>Explora tu constelación</h4><p>Pulsa un nodo para ver su frecuencia, conexiones y sueños relacionados.</p>';draw();});reset.dataset.bound='1';} draw();
  },

  labTrendMarkup(trend=[]){
    const maxCount=Math.max(1,...trend.map(row=>Number(row.count)||0));
    const summary=trend.map(row=>`${row.label}: ${row.count} sueños, recall ${Math.max(0,Math.min(100,Number(row.recall)||0))}%`).join('. ');
    return `<div class="trend-chart-a11y" role="img" aria-label="Actividad de ocho semanas. ${this.escape(summary)}"><div class="trend-bars" aria-hidden="true">${trend.map(row=>{
      const recall=Math.max(0,Math.min(100,Number(row.recall)||0));
      const activity=Math.round((Number(row.count)||0)/maxCount*100);
      return `<div class="trend-column" title="${this.escape(row.label)} · ${row.count} sueños · recall ${recall}%"><div class="trend-value">${row.count||''}</div><div class="trend-bar-shell"><span class="trend-activity" style="height:${Math.max(row.count?8:0,activity)}%"></span><span class="trend-recall" style="height:${recall}%"></span></div><small>${this.escape(row.label)}</small></div>`;
    }).join('')}</div></div>`;
  },

  showLabError(err){
    const empty=document.getElementById('lab-empty'),content=document.getElementById('lab-content');
    if(content)content.hidden=true;
    if(empty){empty.hidden=false;empty.querySelector('h3').textContent='ONEIRO LAB no puede leer Dream Journal';empty.querySelector('p').textContent=`IndexedDB no está disponible: ${err?.message||'error desconocido'}`;}
  },

  phaseTitle(phase){return {PRIME:'Mantén una sola intención.',DESCENT:'Deja que la escena se deshaga.',SLEEP:'Ahora no tienes que hacer nada.',WAKE:'Permanece quieto unos instantes.'}[phase]||phase;},
  formatTime(ms){const total=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;},
  toLocalDateTime(iso){const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);},

  bindSettings(){
    const theme=document.getElementById('theme-select'),motion=document.getElementById('reduced-motion'),highContrast=document.getElementById('high-contrast'),largeText=document.getElementById('large-text'),reset=document.getElementById('reset-local'),status=document.getElementById('settings-status'),dbStatus=document.getElementById('journal-db-status');
    const lockState=document.getElementById('privacy-lock-state'),currentPin=document.getElementById('privacy-current-pin'),newPin=document.getElementById('privacy-new-pin'),confirmPin=document.getElementById('privacy-confirm-pin'),savePin=document.getElementById('privacy-save-pin'),disablePin=document.getElementById('privacy-disable-pin'),lockNow=document.getElementById('privacy-lock-now'),autoLock=document.getElementById('privacy-auto-lock'),hidePreviews=document.getElementById('privacy-hide-previews'),blurHidden=document.getElementById('privacy-blur-hidden'),privacyStatus=document.getElementById('privacy-settings-status'),cryptoStatus=document.getElementById('crypto-status');
    const backupPass=document.getElementById('backup-passphrase'),backupJson=document.getElementById('backup-export-json'),backupEncrypted=document.getElementById('backup-export-encrypted'),backupImport=document.getElementById('backup-import'),backupFile=document.getElementById('backup-file'),backupMode=document.getElementById('backup-restore-mode'),backupStatus=document.getElementById('backup-status'),backupSummary=document.getElementById('backup-summary');
    const persistButton=document.getElementById('storage-persist'),pwaStatus=document.getElementById('pwa-status');
    const prefs=ONEIRO_STORAGE.get('prefs',{theme:'void',reducedMotion:false,highContrast:false,largeText:false});theme.value=prefs.theme||'void';motion.checked=!!prefs.reducedMotion;highContrast.checked=!!prefs.highContrast;largeText.checked=!!prefs.largeText;
    const privacy=ONEIRO_PRIVACY.prefs();autoLock.value=String(privacy.autoLockMinutes??5);hidePreviews.checked=!!privacy.hidePreviews;blurHidden.checked=!!privacy.blurWhenHidden;
    const refreshPrivacyState=()=>{const p=ONEIRO_PRIVACY.prefs();lockState.textContent=p.lockEnabled?'PIN activo':'Sin bloqueo';disablePin.disabled=!p.lockEnabled;lockNow.disabled=!p.lockEnabled;};refreshPrivacyState();
    const db=ONEIRO_JOURNAL_DB.getStatus();dbStatus.textContent=db.ready?`IndexedDB activa · ${db.name} v${db.version}`:`No disponible${db.error?` · ${db.error}`:''}`;
    cryptoStatus.textContent=ONEIRO_PRIVACY.supported()?'Disponible en este navegador':'No disponible en este contexto';
    theme.addEventListener('change',()=>{prefs.theme=theme.value;ONEIRO_STORAGE.set('prefs',prefs);this.applySettings();status.textContent='Skin aplicada.';});
    motion.addEventListener('change',()=>{prefs.reducedMotion=motion.checked;ONEIRO_STORAGE.set('prefs',prefs);this.applySettings();status.textContent='Preferencia de movimiento actualizada.';});
    highContrast.addEventListener('change',()=>{prefs.highContrast=highContrast.checked;ONEIRO_STORAGE.set('prefs',prefs);this.applySettings();status.textContent='Contraste actualizado.';});
    largeText.addEventListener('change',()=>{prefs.largeText=largeText.checked;ONEIRO_STORAGE.set('prefs',prefs);this.applySettings();status.textContent='Tamaño de texto actualizado.';});
    autoLock.addEventListener('change',()=>{try{ONEIRO_PRIVACY.save({autoLockMinutes:Number(autoLock.value)});privacyStatus.textContent=Number(autoLock.value)?`Bloqueo automático: ${autoLock.value} min.`:'Bloqueo automático desactivado.';}catch(err){privacyStatus.textContent=err.message;}});
    hidePreviews.addEventListener('change',()=>{try{ONEIRO_PRIVACY.save({hidePreviews:hidePreviews.checked});privacyStatus.textContent='Privacidad de previews actualizada.';}catch(err){privacyStatus.textContent=err.message;}});
    blurHidden.addEventListener('change',()=>{try{ONEIRO_PRIVACY.save({blurWhenHidden:blurHidden.checked});privacyStatus.textContent='Protección visual al ocultar la pestaña actualizada.';}catch(err){privacyStatus.textContent=err.message;}});
    savePin.addEventListener('click',async()=>{
      privacyStatus.textContent='';
      try{
        const existing=ONEIRO_PRIVACY.prefs().lockEnabled;
        if(existing&&!(await ONEIRO_PRIVACY.verifyPin(currentPin.value))) throw new Error('PIN actual incorrecto.');
        if(newPin.value!==confirmPin.value) throw new Error('Los dos PIN nuevos no coinciden.');
        await ONEIRO_PRIVACY.setPin(newPin.value);currentPin.value='';newPin.value='';confirmPin.value='';refreshPrivacyState();privacyStatus.textContent=existing?'PIN cambiado correctamente.':'Bloqueo local activado.';
      }catch(err){privacyStatus.textContent=err.message;}
    });
    disablePin.addEventListener('click',async()=>{
      privacyStatus.textContent='';
      try{await ONEIRO_PRIVACY.disablePin(currentPin.value);currentPin.value='';newPin.value='';confirmPin.value='';refreshPrivacyState();privacyStatus.textContent='Bloqueo local desactivado.';}catch(err){privacyStatus.textContent=err.message;}
    });
    lockNow.addEventListener('click',()=>{if(ONEIRO_PRIVACY.lock('manual'))privacyStatus.textContent='';else privacyStatus.textContent='Activa primero un PIN.';});

    backupJson.addEventListener('click',async()=>{
      backupStatus.textContent='Preparando exportación…';
      try{
        const snapshot=await ONEIRO_BACKUP.create(ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{includeSecrets:false});
        this.downloadBlob(this.backupFilename('json'),JSON.stringify(snapshot,null,2),'application/json');
        backupStatus.textContent=`JSON exportado · ${snapshot.payload.dreams.length} sueño(s). El contenido no está cifrado.`;
      }catch(err){backupStatus.textContent=err.message;}
    });
    backupEncrypted.addEventListener('click',async()=>{
      backupStatus.textContent='Cifrando backup…';
      try{
        if(backupPass.value.length<8) throw new Error('Escribe una contraseña de backup de al menos 8 caracteres.');
        const snapshot=await ONEIRO_BACKUP.create(ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{includeSecrets:true});
        const encrypted=await ONEIRO_PRIVACY_CRYPTO.encryptJSON(snapshot,backupPass.value);
        this.downloadBlob(this.backupFilename('encrypted'),JSON.stringify(encrypted,null,2),'application/json');
        backupPass.value='';
        backupStatus.textContent=`Backup cifrado exportado · ${snapshot.payload.dreams.length} sueño(s). Guarda la contraseña: no puede recuperarse.`;
      }catch(err){backupStatus.textContent=err.message;}
    });
    backupImport.addEventListener('click',()=>backupFile.click());
    backupFile.addEventListener('change',async()=>{
      const file=backupFile.files?.[0];if(!file)return;
      backupStatus.textContent='Validando backup…';backupSummary.hidden=true;
      try{
        if(file.size>25*1024*1024) throw new Error('El archivo supera el límite de importación de 25 MB.');
        const raw=JSON.parse(await file.text());
        let snapshot=raw;
        if(raw?.format==='ONEIRO404-ENCRYPTED'){
          if(!backupPass.value) throw new Error('Este backup está cifrado. Introduce su contraseña antes de importarlo.');
          snapshot=await ONEIRO_PRIVACY_CRYPTO.decryptJSON(raw,backupPass.value);
        }
        const verified=await ONEIRO_BACKUP.validate(snapshot),info=ONEIRO_BACKUP.summary(snapshot);
        backupSummary.innerHTML=`<strong>BACKUP VERIFICADO</strong><span>${verified.dreams} sueño(s) · ONEIRO ${this.escape(info.appVersion)}</span><span>Exportado: ${this.escape(this.formatDateTime(info.exportedAt))}</span><span>${info.containsLockCredential?'Incluye credencial de bloqueo local':'No incluye credencial PIN'}</span>`;
        backupSummary.hidden=false;
        const replace=backupMode.value==='replace';
        const warning=replace?'REEMPLAZAR borrará primero los datos ONEIRO actuales.':'COMBINAR conservará la entrada local más reciente cuando coincida un ID.';
        if(!confirm(`${warning}\n\nBackup verificado: ${verified.dreams} sueño(s). ¿Continuar?`)){backupStatus.textContent='Importación cancelada.';return;}
        ONEIRO_SESSION_ENGINE.end('backup-restore');ONEIRO_AUDIO_ENGINE.reset();
        const result=await ONEIRO_BACKUP.restore(snapshot,ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{mode:backupMode.value});
        backupPass.value='';
        backupStatus.textContent=`Restauración completada · ${result.imported} importados · ${result.skipped} conservados localmente. Recargando ONEIRO…`;
        setTimeout(()=>location.reload(),800);
      }catch(err){
        if(err.recoveryBackup) this.downloadBlob(this.backupFilename('recovery'),JSON.stringify(err.recoveryBackup,null,2),'application/json');
        backupStatus.textContent=err.message;
      }
      finally{backupFile.value='';}
    });

    this.refreshPwaStatus();this.refreshPwaInstallButton();
    document.getElementById('pwa-install').addEventListener('click',async()=>{
      if(!this.pwaInstallPrompt){pwaStatus.textContent='El navegador no ofrece instalación en este momento. En iPhone/iPad usa Compartir → Añadir a pantalla de inicio.';return;}
      this.pwaInstallPrompt.prompt();const choice=await this.pwaInstallPrompt.userChoice;this.pwaInstallPrompt=null;this.refreshPwaInstallButton();pwaStatus.textContent=choice.outcome==='accepted'?'Instalación aceptada.':'Instalación cancelada.';
    });
    persistButton.addEventListener('click',async()=>{
      try{
        if(!navigator.storage?.persist) throw new Error('Este navegador no permite solicitar almacenamiento persistente.');
        const granted=await navigator.storage.persist();pwaStatus.textContent=granted?'Almacenamiento persistente concedido.':'El navegador no ha concedido persistencia; mantén backups periódicos.';await this.refreshPwaStatus();
      }catch(err){pwaStatus.textContent=err.message;}
    });

    reset.addEventListener('click',async()=>{
      if(confirm('Esto borrará configuración, sesiones, privacidad y todo el Dream Journal de este navegador.')){
        ONEIRO_SESSION_ENGINE.end('data-reset');ONEIRO_AUDIO_ENGINE.reset();
        try{await ONEIRO_JOURNAL_DB.init();await ONEIRO_JOURNAL_DB.clear();}
        catch(err){status.textContent=`Dream Journal no pudo borrarse: ${err.message}. La configuración y el PIN se conservan.`;return;}
        if(ONEIRO_STORAGE.clear()===false){status.textContent='Dream Journal borrado, pero la configuración local no pudo borrarse. Reintenta cuando el almacenamiento esté disponible.';return;}
        ONEIRO_PRIVACY.unlocked=true;ONEIRO_PRIVACY.hideLock();ONEIRO_PRIVACY.applyVisualPrefs();this.applySettings();
        status.textContent='Datos ONEIRO e IndexedDB borrados de este navegador.';refreshPrivacyState();
      }
    });
  },

  downloadBlob(filename,text,type='application/json'){
    const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  backupFilename(kind){
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    return kind==='encrypted'?`ONEIRO-404_${stamp}.oneiro.json`:`ONEIRO-404_${stamp}.json`;
  },
  formatDateTime(value){try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}catch{return String(value||'—');}},
  formatBytes(value){const n=Number(value)||0;if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(1)} GB`;},
  refreshPwaInstallButton(){const btn=document.getElementById('pwa-install');if(btn)btn.hidden=!this.pwaInstallPrompt;},
  async refreshPwaStatus(){
    const network=document.getElementById('network-status'),sw=document.getElementById('sw-status'),persist=document.getElementById('storage-persist-status'),usage=document.getElementById('storage-usage');
    if(network)network.textContent=navigator.onLine?'Online':'Offline · usando caché local';
    if(sw){
      if(!('serviceWorker'in navigator)) sw.textContent='No compatible';
      else if(navigator.serviceWorker.controller) sw.textContent='Controlando esta sesión';
      else{
        try{const reg=this.swRegistration||await navigator.serviceWorker.getRegistration();sw.textContent=reg?'Registrado / pendiente de control':'No registrado';}
        catch{sw.textContent='Estado no disponible';}
      }
    }
    if(persist){try{persist.textContent=navigator.storage?.persisted&&await navigator.storage.persisted()?'Persistente':'Best effort';}catch{persist.textContent='No disponible';}}
    if(usage){try{const e=await navigator.storage?.estimate?.();usage.textContent=e?`${this.formatBytes(e.usage)} / ${this.formatBytes(e.quota)}`:'No disponible';}catch{usage.textContent='No disponible';}}
  },

  applySettings(){
    const prefs=ONEIRO_STORAGE.get('prefs',{theme:'void',reducedMotion:false,highContrast:false,largeText:false}),theme=prefs.theme||'void';
    const reduced=!!prefs.reducedMotion||!!window.ONEIRO_ACCESSIBILITY?.systemReducedMotion?.();
    const contrast=!!prefs.highContrast||!!window.ONEIRO_ACCESSIBILITY?.systemHighContrast?.();
    document.body.dataset.theme=theme;document.body.classList.toggle('reduced-motion',reduced);document.body.classList.toggle('high-contrast',contrast);document.body.classList.toggle('large-text',!!prefs.largeText);document.documentElement.classList.toggle('large-text-root',!!prefs.largeText);ONEIRO_PRIVACY?.applyVisualPrefs?.();
    const colors={void:'#050505',oneiric:'#090610',liminal:'#11100b',soma:'#0b0506',terminal:'#020603',nocturne:'#030712',dreamcore:'#08070c'};
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[theme]||colors.void);
  },
  startClock(){const tick=()=>{const el=document.getElementById('clock');if(el)el.textContent=new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(new Date());};tick();setInterval(tick,30000);},
  escape(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
};
document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());
