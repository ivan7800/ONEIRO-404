const fs=require('fs'),vm=require('vm');
const {webcrypto}=require('node:crypto');
const store=new Map();
const context={console,crypto:webcrypto,TextEncoder,TextDecoder,Buffer,setInterval,clearInterval,
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i]||null,get length(){return store.size;}}
};
context.globalThis=context;context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/storage.js','utf8'),context);
vm.runInContext(fs.readFileSync('js/privacy.js','utf8'),context);
(async()=>{
  const P=context.ONEIRO_PRIVACY;
  if(!P.supported())throw new Error('Web Crypto should be supported in test context');
  await P.setPin('4047');
  if(!(await P.verifyPin('4047')))throw new Error('valid PIN rejected');
  if(await P.verifyPin('0000'))throw new Error('invalid PIN accepted');
  let failed=false;try{await P.disablePin('0000')}catch{failed=true}if(!failed)throw new Error('disable accepted wrong PIN');
  await P.disablePin('4047');if(P.prefs().lockEnabled)throw new Error('lock still enabled');
  const source={app:'ONEIRO 404',dreams:[{title:'Hotel',text:'Puerta roja'}],n:7};
  const envelope=await context.ONEIRO_PRIVACY_CRYPTO.encryptJSON(source,'oneiro-secret');
  if(envelope.cipher!=='AES-256-GCM'||envelope.kdf!=='PBKDF2-SHA256')throw new Error('crypto metadata wrong');
  const restored=await context.ONEIRO_PRIVACY_CRYPTO.decryptJSON(envelope,'oneiro-secret');
  if(JSON.stringify(restored)!==JSON.stringify(source))throw new Error('encrypted backup roundtrip failed');
  failed=false;try{await context.ONEIRO_PRIVACY_CRYPTO.decryptJSON(envelope,'wrong-password')}catch{failed=true}if(!failed)throw new Error('wrong backup password accepted');
  console.log('PASS privacy');
})().catch(err=>{console.error(err);process.exit(1)});
