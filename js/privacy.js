(function(root){
  'use strict';

  const encoder=new TextEncoder();
  const PIN_ITERATIONS=160000;
  const BACKUP_ITERATIONS=220000;
  const DEFAULTS={lockEnabled:false,autoLockMinutes:5,hidePreviews:false,blurWhenHidden:true,pinSalt:null,pinHash:null,pinIterations:PIN_ITERATIONS};

  function cryptoApi(){
    const c=root.crypto;
    if(!c?.subtle||!c?.getRandomValues) throw new Error('Web Crypto no está disponible en este contexto.');
    return c;
  }
  function bytesToB64(bytes){
    if(typeof btoa==='function'){
      let binary='';
      for(let offset=0;offset<bytes.length;offset+=32768) binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
      return btoa(binary);
    }
    if(typeof Buffer!=='undefined') return Buffer.from(bytes).toString('base64');
    throw new Error('No hay codificador Base64 disponible.');
  }
  function b64ToBytes(value){
    if(typeof atob==='function') return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    if(typeof Buffer!=='undefined') return new Uint8Array(Buffer.from(value,'base64'));
    throw new Error('No hay decodificador Base64 disponible.');
  }
  function equalBytes(a,b){
    if(a.length!==b.length) return false;
    let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
  }
  async function derivePin(pin,salt,iterations=PIN_ITERATIONS){
    const c=cryptoApi();
    const key=await c.subtle.importKey('raw',encoder.encode(String(pin)),'PBKDF2',false,['deriveBits']);
    const bits=await c.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
    return new Uint8Array(bits);
  }
  async function deriveAesKey(passphrase,salt,iterations=BACKUP_ITERATIONS,usage=['encrypt','decrypt']){
    const c=cryptoApi();
    const material=await c.subtle.importKey('raw',encoder.encode(String(passphrase)),'PBKDF2',false,['deriveKey']);
    return c.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,usage);
  }
  async function encryptJSON(data,passphrase){
    if(String(passphrase).length<8) throw new Error('La contraseña de backup debe tener al menos 8 caracteres.');
    const c=cryptoApi(),salt=c.getRandomValues(new Uint8Array(16)),iv=c.getRandomValues(new Uint8Array(12));
    const key=await deriveAesKey(passphrase,salt,BACKUP_ITERATIONS,['encrypt']);
    const plain=encoder.encode(JSON.stringify(data));
    const cipher=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv},key,plain));
    return {format:'ONEIRO404-ENCRYPTED',version:1,cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:BACKUP_ITERATIONS,salt:bytesToB64(salt),iv:bytesToB64(iv),payload:bytesToB64(cipher)};
  }
  async function decryptJSON(envelope,passphrase){
    if(!envelope||envelope.format!=='ONEIRO404-ENCRYPTED'||envelope.version!==1) throw new Error('Formato de backup cifrado no reconocido.');
    const iterations=Number(envelope.iterations);
    if(envelope.cipher!=='AES-256-GCM'||envelope.kdf!=='PBKDF2-SHA256'||!Number.isInteger(iterations)||iterations<100000||iterations>1000000) throw new Error('Parámetros de cifrado no admitidos.');
    if(typeof envelope.payload!=='string'||envelope.payload.length>35*1024*1024) throw new Error('Tamaño de backup cifrado no admitido.');
    const c=cryptoApi(),salt=b64ToBytes(envelope.salt),iv=b64ToBytes(envelope.iv),cipher=b64ToBytes(envelope.payload);
    if(salt.length!==16||iv.length!==12||cipher.length<16) throw new Error('Backup cifrado dañado.');
    const key=await deriveAesKey(passphrase,salt,iterations,['decrypt']);
    try{
      const plain=await c.subtle.decrypt({name:'AES-GCM',iv},key,cipher);
      return JSON.parse(new TextDecoder().decode(plain));
    }catch{throw new Error('Contraseña incorrecta o backup cifrado dañado.');}
  }

  class PrivacyEngine{
    constructor(storage){this.storage=storage;this.unlocked=false;this.lastActivity=Date.now();this.timer=null;this.initialized=false;}
    prefs(){return {...DEFAULTS,...(this.storage?.get('privacy',{})||{})};}
    save(patch){const next={...this.prefs(),...patch};if(this.storage?.set('privacy',next)===false) throw new Error('No se pudo guardar la privacidad. Comprueba el almacenamiento del navegador.');this.applyVisualPrefs(next);return next;}
    supported(){try{return !!cryptoApi();}catch{return false;}}
    async setPin(pin){
      if(!/^\d{4,12}$/.test(String(pin))) throw new Error('El PIN debe contener entre 4 y 12 dígitos.');
      const c=cryptoApi(),salt=c.getRandomValues(new Uint8Array(16)),hash=await derivePin(pin,salt,PIN_ITERATIONS);
      const next=this.save({lockEnabled:true,pinSalt:bytesToB64(salt),pinHash:bytesToB64(hash),pinIterations:PIN_ITERATIONS});
      this.unlocked=true;this.lastActivity=Date.now();return next;
    }
    async verifyPin(pin){
      const p=this.prefs();if(!p.lockEnabled||!p.pinSalt||!p.pinHash)return true;
      const got=await derivePin(pin,b64ToBytes(p.pinSalt),Number(p.pinIterations)||PIN_ITERATIONS);
      return equalBytes(got,b64ToBytes(p.pinHash));
    }
    async disablePin(pin){
      if(!(await this.verifyPin(pin))) throw new Error('PIN actual incorrecto.');
      this.save({lockEnabled:false,pinSalt:null,pinHash:null,pinIterations:PIN_ITERATIONS});this.unlocked=true;this.hideLock();return true;
    }
    applyVisualPrefs(p=this.prefs()){
      if(typeof document==='undefined')return;
      document.body?.classList.toggle('privacy-hide-previews',!!p.hidePreviews);
      document.body?.classList.toggle('privacy-blur-enabled',!!p.blurWhenHidden);
    }
    init(){
      if(this.initialized)return;this.initialized=true;this.applyVisualPrefs();
      if(typeof document==='undefined')return;
      const p=this.prefs();this.unlocked=!p.lockEnabled;
      ['pointerdown','keydown','touchstart'].forEach(evt=>document.addEventListener(evt,()=>{if(this.unlocked)this.lastActivity=Date.now();},{passive:true}));
      document.addEventListener('visibilitychange',()=>{
        const prefs=this.prefs();
        if(document.hidden){document.body.classList.toggle('privacy-hidden',!!prefs.blurWhenHidden);this.hiddenAt=Date.now();}
        else{
          document.body.classList.remove('privacy-hidden');
          const mins=Number(prefs.autoLockMinutes)||0;
          if(this.unlocked&&prefs.lockEnabled&&mins>0&&this.hiddenAt&&Date.now()-this.hiddenAt>=mins*60000)this.lock('auto');
          this.lastActivity=Date.now();
        }
      });
      this.timer=setInterval(()=>{
        const prefs=this.prefs(),mins=Number(prefs.autoLockMinutes)||0;
        if(this.unlocked&&prefs.lockEnabled&&mins>0&&Date.now()-this.lastActivity>=mins*60000)this.lock('auto');
      },30000);
      const form=document.getElementById('privacy-unlock-form');
      if(form)form.addEventListener('submit',async e=>{
        e.preventDefault();const input=document.getElementById('privacy-unlock-pin'),status=document.getElementById('privacy-unlock-status');
        try{if(await this.unlock(input.value)){input.value='';status.textContent='';}}catch(err){status.textContent=err.message;input.select();}
      });
      if(p.lockEnabled)this.lock('startup');else this.hideLock();
    }
    lock(reason='manual'){
      const p=this.prefs();if(!p.lockEnabled)return false;this.unlocked=false;
      if(typeof document!=='undefined'){
        const overlay=document.getElementById('privacy-lock'),shell=document.querySelector('.app-shell'),status=document.getElementById('privacy-unlock-status');
        if(overlay)overlay.hidden=false;if(shell)shell.inert=true;document.body.classList.add('privacy-locked');
        if(status)status.textContent=reason==='auto'?'ONEIRO se bloqueó automáticamente.':'';
        setTimeout(()=>document.getElementById('privacy-unlock-pin')?.focus(),0);
      }return true;
    }
    hideLock(){
      if(typeof document==='undefined')return;const overlay=document.getElementById('privacy-lock'),shell=document.querySelector('.app-shell');
      if(overlay)overlay.hidden=true;if(shell)shell.inert=false;document.body.classList.remove('privacy-locked');
    }
    async unlock(pin){
      if(!(await this.verifyPin(pin))) throw new Error('PIN incorrecto.');
      this.unlocked=true;this.lastActivity=Date.now();this.hideLock();return true;
    }
  }

  root.ONEIRO_PRIVACY_CRYPTO={encryptJSON,decryptJSON,derivePin,bytesToB64,b64ToBytes,PIN_ITERATIONS,BACKUP_ITERATIONS};
  root.ONEIRO_PRIVACY_CLASS=PrivacyEngine;
  root.ONEIRO_PRIVACY=new PrivacyEngine(root.ONEIRO_STORAGE);
})(typeof window!=='undefined'?window:globalThis);
