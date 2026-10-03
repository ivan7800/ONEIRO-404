(function(root){
  'use strict';

  const FORMAT='ONEIRO404-BACKUP';
  const VERSION=1;
  const APP_VERSION='1.0.1';
  const STORAGE_KEYS=['prefs','lastSession','audioPrefs','stats','activeSession','sessionHistory','privacy'];
  const MAX_DREAMS=50000;
  const encoder=new TextEncoder();

  function cryptoApi(){
    const c=root.crypto;
    if(!c?.subtle) throw new Error('Web Crypto no está disponible para verificar el backup.');
    return c;
  }
  function canonical(value){
    if(value===null||typeof value!=='object') return JSON.stringify(value);
    if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  async function sha256(value){
    const digest=await cryptoApi().subtle.digest('SHA-256',encoder.encode(canonical(value)));
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function safePrivacy(value,includeSecrets){
    const p=value&&typeof value==='object'?clone(value):{};
    if(!includeSecrets){p.lockEnabled=false;delete p.pinSalt;delete p.pinHash;delete p.pinIterations;}
    return p;
  }
  function collectStorage(storage,includeSecrets=false){
    const out={};
    for(const key of STORAGE_KEYS){
      const value=storage.get(key,undefined);
      if(value===undefined||value===null) continue;
      out[key]=key==='privacy'?safePrivacy(value,includeSecrets):clone(value);
    }
    return out;
  }
  async function create(storage,db,{includeSecrets=false}={}){
    const dreams=await db.list();
    const base={
      format:FORMAT,
      version:VERSION,
      appVersion:APP_VERSION,
      exportedAt:new Date().toISOString(),
      containsLockCredential:!!includeSecrets,
      payload:{storage:collectStorage(storage,includeSecrets),dreams:clone(dreams)}
    };
    return {...base,checksum:`sha256:${await sha256(base)}`};
  }
  function validateShape(backup){
    if(!backup||typeof backup!=='object') throw new Error('El archivo no contiene un backup ONEIRO válido.');
    if(backup.format!==FORMAT||Number(backup.version)!==VERSION) throw new Error('Formato o versión de backup no compatible.');
    if(!backup.payload||typeof backup.payload!=='object') throw new Error('El backup no contiene payload.');
    if(!Array.isArray(backup.payload.dreams)) throw new Error('La colección de sueños no es válida.');
    if(backup.payload.dreams.length>MAX_DREAMS) throw new Error('El backup supera el límite de seguridad de entradas.');
    if(!backup.payload.storage||typeof backup.payload.storage!=='object'||Array.isArray(backup.payload.storage)) throw new Error('El bloque de configuración no es válido.');
    for(const key of Object.keys(backup.payload.storage)) if(!STORAGE_KEYS.includes(key)) throw new Error(`Clave de configuración no permitida: ${key}`);
    for(const [key,value] of Object.entries(backup.payload.storage)){
      if(value===null) continue; // Older v1 backups encode absent settings as null.
      if(key==='sessionHistory'){
        if(!Array.isArray(value)||value.some(s=>!s||typeof s!=='object'||(s.recall!=null&&typeof s.recall!=='object'))) throw new Error('Historial de sesiones no válido.');
      }else if(typeof value!=='object'||Array.isArray(value)) throw new Error(`Configuración no válida: ${key}`);
    }
    const ids=new Set();
    for(const dream of backup.payload.dreams){
      if(!dream||typeof dream!=='object'||Array.isArray(dream)) throw new Error('Hay una entrada de sueño dañada.');
      if(typeof dream.id!=='string'||!dream.id.trim()||dream.id.length>140||ids.has(dream.id)) throw new Error('Identificador de sueño ausente o duplicado.');
      ids.add(dream.id);
      if(String(dream.text??'').length>12000||String(dream.notes??'').length>4000) throw new Error('Hay una entrada que excede los límites admitidos.');
    }
    return true;
  }
  async function validate(backup){
    validateShape(backup);
    if(typeof backup.checksum!=='string'||!backup.checksum.startsWith('sha256:')) throw new Error('El backup no incluye checksum de integridad.');
    const {checksum,...base}=backup;
    const expected=`sha256:${await sha256(base)}`;
    if(checksum!==expected) throw new Error('El checksum no coincide: el backup está dañado o fue modificado.');
    return {valid:true,dreams:backup.payload.dreams.length,exportedAt:backup.exportedAt,containsLockCredential:!!backup.containsLockCredential};
  }
  function timeValue(value){const n=new Date(value||0).getTime();return Number.isFinite(n)?n:0;}
  function privacyForRestore(currentPrivacy,incomingPrivacy,{replace=false,containsLockCredential=false}={}){
    const current=currentPrivacy&&typeof currentPrivacy==='object'?clone(currentPrivacy):{};
    const incoming=incomingPrivacy&&typeof incomingPrivacy==='object'?clone(incomingPrivacy):{};
    // Merge never imports authentication credentials: it must not unexpectedly
    // change the PIN of the browser that is currently open.
    if(!replace){
      const merged={...current,...incoming};
      merged.lockEnabled=!!current.lockEnabled;
      if(current.lockEnabled){
        merged.pinSalt=current.pinSalt;merged.pinHash=current.pinHash;merged.pinIterations=current.pinIterations;
      }else{
        delete merged.pinSalt;delete merged.pinHash;delete merged.pinIterations;
      }
      return merged;
    }
    // Replace imports credentials only when the backup explicitly contains them.
    // Plain backups intentionally exclude them, so preserve the current local lock.
    if(containsLockCredential) return incoming;
    const replaced={...incoming};
    replaced.lockEnabled=!!current.lockEnabled;
    if(current.lockEnabled){
      replaced.pinSalt=current.pinSalt;replaced.pinHash=current.pinHash;replaced.pinIterations=current.pinIterations;
    }else{
      delete replaced.pinSalt;delete replaced.pinHash;delete replaced.pinIterations;
    }
    return replaced;
  }
  async function applyStorage(storage,values,{replace=false,containsLockCredential=false}={}){
    const currentPrivacy=storage.get('privacy',{});
    if(replace&&storage.clear()===false) throw new Error('No se pudo limpiar la configuración local.');
    const write=(key,value)=>{if(storage.set(key,value)===false) throw new Error(`No se pudo guardar la configuración: ${key}`);};
    for(const key of STORAGE_KEYS){
      if(!Object.prototype.hasOwnProperty.call(values,key)||values[key]===null||key==='privacy') continue;
      write(key,clone(values[key]));
    }
    // Preserve the local PIN even when an older backup omits privacy entirely.
    if(Object.prototype.hasOwnProperty.call(values,'privacy')||replace){
      write('privacy',privacyForRestore(currentPrivacy,values.privacy,{replace,containsLockCredential:containsLockCredential&&Object.prototype.hasOwnProperty.call(values,'privacy')}));
    }
  }
  async function applyDreams(db,dreams,{replace=false}={}){
    if(replace) await db.clear();
    const existing=replace?[]:await db.list();
    const byId=new Map(existing.map(e=>[e.id,e]));
    let imported=0,skipped=0;
    for(const dream of dreams){
      const local=byId.get(dream.id);
      if(local&&timeValue(local.updatedAt)>timeValue(dream.updatedAt)){skipped++;continue;}
      await db.put(dream,{preserveTimestamps:true});byId.set(dream.id,dream);imported++;
    }
    return {imported,skipped};
  }
  async function restore(backup,storage,db,{mode='merge'}={}){
    await validate(backup);
    if(!['merge','replace'].includes(mode)) throw new Error('Modo de restauración no reconocido.');
    const safety=await create(storage,db,{includeSecrets:true});
    try{
      const replace=mode==='replace';
      await applyStorage(storage,backup.payload.storage,{replace,containsLockCredential:!!backup.containsLockCredential});
      const dreams=await applyDreams(db,backup.payload.dreams,{replace});
      return {ok:true,mode,...dreams,total:backup.payload.dreams.length};
    }catch(err){
      const rollbackErrors=[];
      try{await applyStorage(storage,safety.payload.storage,{replace:true,containsLockCredential:true});}catch(e){rollbackErrors.push(e);}
      try{await applyDreams(db,safety.payload.dreams,{replace:true});}catch(e){rollbackErrors.push(e);}
      if(rollbackErrors.length){
        const failure=new Error(`${err.message}. La recuperación automática no pudo completarse. Conserva el backup de recuperación descargado.`);
        failure.recoveryBackup=safety;
        throw failure;
      }
      throw err;
    }
  }
  function summary(backup){
    validateShape(backup);
    return {dreams:backup.payload.dreams.length,exportedAt:backup.exportedAt||null,appVersion:backup.appVersion||'—',containsLockCredential:!!backup.containsLockCredential};
  }

  const api={FORMAT,VERSION,APP_VERSION,STORAGE_KEYS,MAX_DREAMS,canonical,sha256,create,validate,validateShape,restore,summary,privacyForRestore};
  root.ONEIRO_BACKUP=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
