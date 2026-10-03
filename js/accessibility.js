(function(root){
  'use strict';

  const ROUTES={
    '1':'home','2':'session','3':'journal','4':'lab','5':'settings'
  };
  const TITLES={
    home:'Inicio',session:'Sesión',journal:'Dream Journal',lab:'ONEIRO Lab',settings:'Ajustes'
  };

  class AccessibilityEngine{
    constructor(){
      this.initialized=false;
      this.lastAnnouncement='';
      this.lastAnnouncementAt=0;
      this.media=[];
    }
    init(){
      if(this.initialized||typeof document==='undefined')return;
      this.initialized=true;
      document.documentElement.classList.add('js');
      document.addEventListener('keydown',e=>this.onKeyDown(e));
      document.addEventListener('keydown',e=>{if(e.key==='Tab')document.body.classList.add('keyboard-nav');},{passive:true});
      document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-nav'),{passive:true});
      this.bindMedia('(prefers-reduced-motion: reduce)');
      this.bindMedia('(prefers-contrast: more)');
      this.bindMedia('(forced-colors: active)');
      this.syncRangeText(document);
    }
    bindMedia(query){
      if(!root.matchMedia)return;
      const media=root.matchMedia(query),listener=()=>root.ONEIRO_APP?.applySettings?.();
      media.addEventListener?.('change',listener);
      this.media.push([media,listener]);
    }
    onKeyDown(e){
      const lock=document.getElementById('privacy-lock');
      if(lock&&!lock.hidden){
        if(e.key==='Tab')this.trapFocus(e,lock);
        return;
      }
      if(e.altKey&&!e.ctrlKey&&!e.metaKey&&ROUTES[e.key]){
        e.preventDefault();root.ONEIRO_ROUTER?.go?.(ROUTES[e.key]);return;
      }
      const target=e.target;
      const editing=target?.matches?.('input,textarea,select,[contenteditable="true"]');
      if(e.key==='/'&&!editing&&root.ONEIRO_ROUTER?.current==='journal'){
        const search=document.getElementById('journal-search');
        if(search){e.preventDefault();search.focus();search.select?.();this.announce('Buscar en Dream Journal');}
        return;
      }
      if(e.key==='Escape'){
        const editor=document.getElementById('journal-editor');
        if(editor&&!editor.hidden){e.preventDefault();root.ONEIRO_APP?.closeJournalEditor?.();this.announce('Editor cerrado');}
      }
    }
    trapFocus(e,container){
      const nodes=[...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length);
      if(!nodes.length){e.preventDefault();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
    afterRender(route){
      document.title=`${TITLES[route]||'ONEIRO'} · ONEIRO 404`;
      this.syncRangeText(document.getElementById('app')||document);
      requestAnimationFrame(()=>this.announce(`${TITLES[route]||'Vista'} abierta`));
    }
    syncRangeText(scope=document){
      scope.querySelectorAll?.('input[type="range"]').forEach(input=>{
        const update=()=>{
          const unit=input.max==='100'?' por ciento':'';
          input.setAttribute('aria-valuetext',`${input.value}${unit}`);
        };
        update();
        if(!input.dataset.a11yRange){input.addEventListener('input',update);input.dataset.a11yRange='1';}
      });
    }
    announce(message,force=false){
      const text=String(message||'').trim();if(!text)return;
      const now=Date.now();
      if(!force&&text===this.lastAnnouncement&&now-this.lastAnnouncementAt<1200)return;
      this.lastAnnouncement=text;this.lastAnnouncementAt=now;
      const node=document.getElementById('a11y-announcer');if(!node)return;
      node.textContent='';setTimeout(()=>{node.textContent=text;},20);
    }
    systemReducedMotion(){return !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
    systemHighContrast(){return !!root.matchMedia?.('(prefers-contrast: more)').matches||!!root.matchMedia?.('(forced-colors: active)').matches;}
  }

  root.ONEIRO_ACCESSIBILITY=new AccessibilityEngine();
})(typeof window!=='undefined'?window:globalThis);
