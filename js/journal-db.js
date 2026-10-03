(function(root){
  'use strict';
  const DB_NAME='oneiro404';
  const DB_VERSION=1;
  const STORE='dreams';

  class JournalDB{
    constructor(){this.db=null;this.ready=false;this.error=null;}

    init(){
      if(this.ready&&this.db) return Promise.resolve(this);
      if(!('indexedDB' in root)){
        this.error=new Error('IndexedDB no está disponible en este navegador.');
        return Promise.reject(this.error);
      }
      return new Promise((resolve,reject)=>{
        const req=indexedDB.open(DB_NAME,DB_VERSION);
        req.onupgradeneeded=()=>{
          const db=req.result;
          const store=db.objectStoreNames.contains(STORE)?req.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:'id'});
          const indexes={dreamAt:'dreamAt',createdAt:'createdAt',updatedAt:'updatedAt',mode:'mode',sessionId:'sessionId'};
          for(const [name,keyPath] of Object.entries(indexes)) if(!store.indexNames.contains(name)) store.createIndex(name,keyPath,{unique:false});
        };
        req.onsuccess=()=>{this.db=req.result;this.ready=true;this.error=null;this.db.onversionchange=()=>{this.db.close();this.db=null;this.ready=false;};resolve(this);};
        req.onerror=()=>{this.error=req.error||new Error('No se pudo abrir IndexedDB.');reject(this.error);};
        req.onblocked=()=>{this.error=new Error('La base de datos está bloqueada por otra pestaña.');};
      });
    }

    async _store(mode='readonly'){
      if(!this.ready||!this.db) await this.init();
      const tx=this.db.transaction(STORE,mode);
      return {tx,store:tx.objectStore(STORE)};
    }

    async put(entry,options={}){
      const current=entry?.id?await this.get(entry.id):null;
      const normalized=ONEIRO_JOURNAL_CORE.normalizeEntry({...current,...entry,createdAt:current?.createdAt||entry?.createdAt});
      if(options.preserveTimestamps){
        if(entry?.createdAt) normalized.createdAt=entry.createdAt;
        if(entry?.updatedAt) normalized.updatedAt=entry.updatedAt;
      }
      return new Promise(async(resolve,reject)=>{
        try{
          const {tx,store}=await this._store('readwrite');
          store.put(normalized);
          tx.oncomplete=()=>resolve(normalized);
          tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar la entrada.'));
          tx.onabort=()=>reject(tx.error||new Error('Guardado cancelado.'));
        }catch(err){reject(err);}
      });
    }

    async get(id){
      return new Promise(async(resolve,reject)=>{
        try{
          const {store}=await this._store();
          const req=store.get(id);
          req.onsuccess=()=>resolve(req.result||null);
          req.onerror=()=>reject(req.error);
        }catch(err){reject(err);}
      });
    }

    async list(){
      return new Promise(async(resolve,reject)=>{
        try{
          const {store}=await this._store();
          const req=store.getAll();
          req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>new Date(b.dreamAt)-new Date(a.dreamAt)));
          req.onerror=()=>reject(req.error);
        }catch(err){reject(err);}
      });
    }

    async remove(id){
      return new Promise(async(resolve,reject)=>{
        try{
          const {tx,store}=await this._store('readwrite');
          store.delete(id);
          tx.oncomplete=()=>resolve(true);
          tx.onerror=()=>reject(tx.error);
        }catch(err){reject(err);}
      });
    }

    async clear(){
      return new Promise(async(resolve,reject)=>{
        try{
          const {tx,store}=await this._store('readwrite');
          store.clear();
          tx.oncomplete=()=>resolve(true);
          tx.onerror=()=>reject(tx.error);
        }catch(err){reject(err);}
      });
    }

    markSessionSynced(session,storage=root.ONEIRO_STORAGE){
      if(!storage?.set||!session?.id) return;
      const history=storage.get('sessionHistory',[]);
      if(!Array.isArray(history)) return;
      const item=history.find(s=>s?.id===session.id);
      if(item){item.journalSynced=true;if(storage.set('sessionHistory',history)===false) throw new Error('El sueño se guardó, pero no se pudo actualizar su historial de migración.');}
    }

    async addFromSession(session,details={},storage=root.ONEIRO_STORAGE){
      const entry=ONEIRO_JOURNAL_CORE.fromSession(session,details);
      if(!entry.text.trim()) return null;
      const saved=await this.put(entry);
      this.markSessionSynced(session,storage);
      return saved;
    }

    async migrateSessionHistory(storage){
      const raw=storage.get('sessionHistory',[]);
      const history=Array.isArray(raw)?raw:[];
      let imported=0,skipped=0;
      for(const session of history){
        if(session?.journalSynced||typeof session?.recall?.text!=='string'||!session.recall.text.trim()){skipped++;continue;}
        const id=session.id?`session-${session.id}`:null;
        if(id&&await this.get(id)){this.markSessionSynced(session,storage);skipped++;continue;}
        await this.addFromSession(session,{},storage);this.markSessionSynced(session,storage);imported++;
      }
      return {imported,skipped,total:history.length};
    }

    getStatus(){return {ready:this.ready,error:this.error?.message||null,name:DB_NAME,version:DB_VERSION};}
  }

  root.ONEIRO_JOURNAL_DB=new JournalDB();
  root.ONEIRO_JOURNAL_DB_CLASS=JournalDB;
})(typeof window!=='undefined'?window:globalThis);
