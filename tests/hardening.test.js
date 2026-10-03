const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const backup=require('../js/backup.js');
const root=require('node:path').resolve(__dirname,'..');
const ctx={window:null,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Buffer,btoa,atob};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync(root+'/js/privacy.js','utf8'),ctx);
global.ONEIRO_JOURNAL_CORE=require('../js/journal-core.js');require('../js/journal-db.js');
class Store{constructor(data={}){this.data=structuredClone(data)}get(k,f){return k in this.data?structuredClone(this.data[k]):f}set(k,v){this.data[k]=structuredClone(v);return true}clear(){this.data={};return true}}
class DB{constructor(rows=[]){this.rows=structuredClone(rows)}async list(){return structuredClone(this.rows)}async clear(){this.rows=[]}async put(r){this.rows=this.rows.filter(x=>x.id!==r.id);this.rows.push(structuredClone(r));return r}}
(async()=>{
  const source={text:'🌙'.repeat(200000)};
  const encrypted=await ctx.ONEIRO_PRIVACY_CRYPTO.encryptJSON(source,'oneiro-pass');
  assert.deepEqual(JSON.parse(JSON.stringify(await ctx.ONEIRO_PRIVACY_CRYPTO.decryptJSON(encrypted,'oneiro-pass'))),source);
  await assert.rejects(()=>ctx.ONEIRO_PRIVACY_CRYPTO.decryptJSON({...encrypted,iterations:2**31},'oneiro-pass'),/Parámetros/);
  const pin={lockEnabled:true,pinHash:'local-hash',pinSalt:'local-salt',pinIterations:160000};
  const old=await backup.create(new Store({prefs:{theme:'soma'}}),new DB());
  const legacyNull=structuredClone(old);legacyNull.payload.storage.stats=null;legacyNull.payload.storage.lastSession=null;
  const {checksum,...unsigned}=legacyNull;legacyNull.checksum='sha256:'+await backup.sha256(unsigned);
  const nullTarget=new Store();await backup.restore(legacyNull,nullTarget,new DB(),{mode:'replace'});assert.equal(nullTarget.get('stats','default'),'default');
  const target=new Store({privacy:pin});await backup.restore(old,target,new DB(),{mode:'replace'});
  assert.equal(target.get('privacy').pinHash,pin.pinHash);
  const broken=new Store({privacy:pin,prefs:{theme:'void'}});let failOnce=true;
  const write=broken.set.bind(broken);broken.set=(k,v)=>{if(k==='prefs'&&failOnce){failOnce=false;return false}return write(k,v)};
  const local=new DB([{id:'local',text:'preservar'}]);
  await assert.rejects(()=>backup.restore(old,broken,local,{mode:'replace'}),/guardar/);
  assert.equal(broken.get('privacy').pinHash,pin.pinHash);assert.equal(broken.get('prefs').theme,'void');assert.equal(local.rows[0].id,'local');
  const alwaysFail=new Store({prefs:{theme:'void'}});alwaysFail.set=()=>false;
  let error;try{await backup.restore(old,alwaysFail,new DB())}catch(e){error=e}
  assert(error?.recoveryBackup);assert.equal(error.recoveryBackup.payload.storage.prefs.theme,'void');
  const duplicate=structuredClone(old);duplicate.payload.dreams=[{id:'x',text:'a'},{id:'x',text:'b'}];
  assert.throws(()=>backup.validateShape(duplicate),/duplicado/);
  const db=new ONEIRO_JOURNAL_DB_CLASS(),rows=new Map();db.get=async id=>rows.get(id);db.put=async row=>{rows.set(row.id,row);return row};
  const history=new Store({sessionHistory:[{id:'s1',recall:{text:'sueño'}}]});
  await db.migrateSessionHistory(history);assert.equal(rows.size,1);rows.clear();
  await db.migrateSessionHistory(history);assert.equal(rows.size,0,'un sueño eliminado no debe reaparecer tras reiniciar');
  const privacy=new ctx.ONEIRO_PRIVACY_CLASS({get:()=>({}),set:()=>false});
  await assert.rejects(()=>privacy.setPin('1234'),/guardar/);assert.equal(privacy.unlocked,false);
  console.log('PASS hardening: encrypted 800 KB, KDF bounds, old backup PIN, quota failure rollback, recovery snapshot, duplicate IDs, deleted-session migration, failed PIN write');
})().catch(e=>{console.error(e);process.exit(1)});
