const path=require('node:path');const {createRequire}=require('node:module');
const {connect,ENV}=require('./cloud-client.cjs');
const COLLECTION='topuyi_home_products_dev_v1';
const SKUS=['stick-05','stick-01','stick-02','stick-03'];
(async()=>{
 const app=await connect(),db=app.database();
 try{await db.createCollection(COLLECTION);}catch(e){if(!/exist/i.test(e.message))throw e;}
 const req=createRequire(path.join(process.env.TOPUYI_MINI_PROJECT||'D:/Project/mini/mini_topuyi','package.json'));
 const credential=await req('@cloudbase/toolbox').checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});
 const {CloudApiService}=req('@cloudbase/cloud-api'),service=new CloudApiService({service:'tcb',version:'2018-06-08',getCredential:async()=>credential});
 await service.request('ModifyDatabaseACL',{EnvId:ENV,CollectionName:COLLECTION,AclTag:'ADMINONLY'});
 const current=await db.collection(COLLECTION).limit(1).get();
 if(current.data.length){console.log('Development product collection already contains data; left unchanged.');return;}
 const result=await app.callFunction({name:'shop-service',data:{action:'listProducts',autoSeed:false,appId:'wx3610c3ef05d1131e'}});
 const value=typeof result.result==='string'?JSON.parse(result.result):result.result;
 if(!value?.success)throw Error('Could not read source products for one-time snapshot.');
 const now=new Date().toISOString(),selected=SKUS.map(sku=>value.products.find(p=>p.sku===sku)).filter(Boolean);
 if(!selected.length)throw Error('No matching products found for snapshot.');
 for(const p of selected)await db.collection(COLLECTION).doc(p.sku).set({sku:p.sku,name:p.name,price:Number(p.price)||0,originalPrice:Number(p.originalPrice)||0,stock:Number(p.stock)||0,image:p.coverImage||'',active:true,scope:'development-only',createdAt:now,updatedAt:now});
 console.log(`Created isolated development product snapshot with ${selected.length} products.`);
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
