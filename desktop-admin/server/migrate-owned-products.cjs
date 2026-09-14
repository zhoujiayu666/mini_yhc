const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {connect}=require('./cloud-client.cjs');
const {normalizeProducts,productRecords,writeProducts}=require('./ops-functions/topuyi-ops-v1/owned-products');
const CONTENT='topuyi_ops_content_v1',PREVIEW='topuyi_home_preview_v1',PRODUCTS='topuyi_home_products_dev_v1';
const read=async(db,c,id)=>{const r=await db.collection(c).doc(id).get();return Array.isArray(r.data)?r.data[0]:r.data;};
const clean=d=>{const {_id,...rest}=d;return rest;};
(async()=>{
 const app=await connect(),db=app.database();
 const draft=await read(db,CONTENT,'draft'),active=await read(db,PREVIEW,'active'),link=await read(db,CONTENT,'preview_link');
 if(!draft?.config||!active?.config)throw Error('Existing draft and active preview required');
 const products=(await db.collection(PRODUCTS).limit(1000).get()).data;
 const draftConfig=normalizeProducts(draft.config,products),activeConfig=normalizeProducts(active.config,products);
 const records=productRecords(activeConfig);
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(__dirname,'../../backups/owned-products-'+stamp);
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify({draft,active,link,products},null,2));
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',products:records.length,purchasable:records.filter(p=>p.active).length,missingPrice:records.filter(p=>!p.active).map(p=>p.name),backup:dir}));
 if(!process.argv.includes('--apply'))return;
 await db.runTransaction(async tx=>{
  const nowDraft=await read(tx,CONTENT,'draft'),nowActive=await read(tx,PREVIEW,'active');
  if(nowDraft.revision!==draft.revision||nowActive.revision!==active.revision)throw Error('Concurrent operator edit; migration cancelled');
  const updatedAt=new Date().toISOString(),revision=crypto.randomBytes(12).toString('hex');
  await writeProducts(tx,PRODUCTS,activeConfig,active.config,updatedAt);
  // Retire only the four copied development examples, never the original products collection.
  for(const p of products)if(!p.owner&&p.scope==='development-only'&&['stick-01','stick-02','stick-03','stick-05'].includes(p.sku)){
   await tx.collection(PRODUCTS).doc(p._id).update({active:false,retiredReason:'replaced-by-owned-products',updatedAt});
  }
  await tx.collection(CONTENT).doc('draft').set({...clean(draft),config:draftConfig,revision:crypto.randomBytes(12).toString('hex'),updatedAt});
  await tx.collection(PREVIEW).doc('active').set({...clean(active),config:activeConfig,revision,updatedAt});
  if(link)await tx.collection(CONTENT).doc('preview_link').set({...clean(link),revision,updatedAt});
 });
 const after=await read(db,PREVIEW,'active');
 const afterProducts=(await db.collection(PRODUCTS).where({owner:'ops-content-v1'}).limit(1000).get()).data;
 for(const p of records){const saved=afterProducts.find(x=>x.sku===p.sku);if(!saved||saved.price!==p.price||saved.manageStock!==false)throw Error('Verification failed: '+p.sku);}
 if(JSON.stringify(after.config)!==JSON.stringify(activeConfig))throw Error('Preview verification failed');
 console.log(JSON.stringify({verified:true,products:records.length,noStockManagement:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
