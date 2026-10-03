const assert=require('assert');
const backup=require('../js/backup.js');

class Storage{
  constructor(data={}){this.data=JSON.parse(JSON.stringify(data));}
  get(k,f){return Object.prototype.hasOwnProperty.call(this.data,k)?JSON.parse(JSON.stringify(this.data[k])):f;}
  set(k,v){this.data[k]=JSON.parse(JSON.stringify(v));return true;}
  remove(k){delete this.data[k];}
  clear(){this.data={};}
}
class DB{
  constructor(rows=[]){this.rows=new Map(rows.map(r=>[r.id,JSON.parse(JSON.stringify(r))]));}
  async list(){return [...this.rows.values()].map(v=>JSON.parse(JSON.stringify(v)));}
  async clear(){this.rows.clear();}
  async put(v){this.rows.set(v.id,JSON.parse(JSON.stringify(v)));return v;}
}
(async()=>{
  const old='2026-01-01T00:00:00.000Z',newer='2026-02-01T00:00:00.000Z';
  const storage=new Storage({prefs:{theme:'void'},privacy:{lockEnabled:true,pinHash:'secret-hash',pinSalt:'salt'},stats:{sessions:3}});
  const db=new DB([{id:'d1',text:'hotel',updatedAt:old}]);
  const plain=await backup.create(storage,db,{includeSecrets:false});
  assert.equal(plain.format,'ONEIRO404-BACKUP');
  assert.equal(plain.payload.dreams.length,1);
  assert.equal(plain.payload.storage.privacy.lockEnabled,false);
  assert.equal(plain.payload.storage.privacy.pinHash,undefined);
  assert.equal((await backup.validate(plain)).valid,true);

  const tampered=JSON.parse(JSON.stringify(plain));tampered.payload.dreams[0].text='alterado';
  await assert.rejects(()=>backup.validate(tampered),/checksum/i);

  const secure=await backup.create(storage,db,{includeSecrets:true});
  assert.equal(secure.payload.storage.privacy.pinHash,'secret-hash');

  const targetStorage=new Storage({prefs:{theme:'terminal'},stats:{sessions:99},privacy:{lockEnabled:true,pinHash:'local-pin',pinSalt:'local-salt',autoLockMinutes:1}});
  const targetDb=new DB([{id:'d1',text:'local nuevo',updatedAt:newer},{id:'local',text:'solo local',updatedAt:newer}]);
  const merged=await backup.restore(plain,targetStorage,targetDb,{mode:'merge'});
  assert.equal(merged.skipped,1,'debe conservar colisión local más reciente');
  assert.equal((await targetDb.list()).length,2);
  assert.equal((await targetDb.list()).find(x=>x.id==='d1').text,'local nuevo');
  assert.equal(targetStorage.get('privacy').lockEnabled,true,'merge de backup plano conserva el PIN local');
  assert.equal(targetStorage.get('privacy').pinHash,'local-pin');

  // Merge must never replace the PIN of the currently open browser, even from a secure backup.
  const secureMergeStorage=new Storage({privacy:{lockEnabled:true,pinHash:'current-pin',pinSalt:'current-salt',pinIterations:160000}});
  const secureMergeDb=new DB([]);
  await backup.restore(secure,secureMergeStorage,secureMergeDb,{mode:'merge'});
  assert.equal(secureMergeStorage.get('privacy').pinHash,'current-pin');
  assert.equal(secureMergeStorage.get('privacy').pinSalt,'current-salt');

  // Replace with a plain backup must not silently disable the existing local PIN.
  const plainReplaceStorage=new Storage({privacy:{lockEnabled:true,pinHash:'keep-pin',pinSalt:'keep-salt',pinIterations:160000}});
  const plainReplaceDb=new DB([]);
  await backup.restore(plain,plainReplaceStorage,plainReplaceDb,{mode:'replace'});
  assert.equal(plainReplaceStorage.get('privacy').lockEnabled,true);
  assert.equal(plainReplaceStorage.get('privacy').pinHash,'keep-pin');

  // Replace with an encrypted/full backup may intentionally import its lock credential.
  const secureReplaceStorage=new Storage({privacy:{lockEnabled:true,pinHash:'old-pin',pinSalt:'old-salt'}});
  const secureReplaceDb=new DB([]);
  await backup.restore(secure,secureReplaceStorage,secureReplaceDb,{mode:'replace'});
  assert.equal(secureReplaceStorage.get('privacy').pinHash,'secret-hash');

  const replaceStorage=new Storage({prefs:{theme:'soma'}}),replaceDb=new DB([{id:'x',text:'borrar',updatedAt:newer}]);
  const replaced=await backup.restore(plain,replaceStorage,replaceDb,{mode:'replace'});
  assert.equal(replaced.imported,1);
  assert.deepEqual((await replaceDb.list()).map(x=>x.id),['d1']);
  assert.equal(replaceStorage.get('prefs').theme,'void');
  console.log('PASS backup');
})().catch(err=>{console.error(err);process.exit(1);});
