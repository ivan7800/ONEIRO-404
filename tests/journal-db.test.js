const assert=require('assert');
global.ONEIRO_JOURNAL_CORE=require('../js/journal-core.js');
require('../js/journal-db.js');
const DB=global.ONEIRO_JOURNAL_DB_CLASS;
(async()=>{
  const db=new DB();
  const present=new Set(['session-existing']);
  const imported=[];
  db.get=async id=>present.has(id)?{id}:null;
  db.addFromSession=async session=>{imported.push(session.id);present.add(`session-${session.id}`);return {id:`session-${session.id}`};};
  const history=[
    {id:'existing',recall:{text:'ya migrado'}},
    {id:'fresh',recall:{text:'nuevo sueño'}},
    {id:'empty',recall:{text:'   '}}
  ];
  const storage={get:(key,fallback)=>key==='sessionHistory'?history:fallback};
  const first=await db.migrateSessionHistory(storage);
  assert.deepEqual(first,{imported:1,skipped:2,total:3});
  assert.deepEqual(imported,['fresh']);
  const second=await db.migrateSessionHistory(storage);
  assert.deepEqual(second,{imported:0,skipped:3,total:3});
  console.log('PASS journal-db: idempotent legacy migration and empty recall skip');
})().catch(err=>{console.error(err);process.exit(1)});
