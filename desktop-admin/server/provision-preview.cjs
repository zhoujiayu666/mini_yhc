const path=require('node:path');const {createRequire}=require('node:module');
const {connect,ENV,COLLECTION}=require('./cloud-client.cjs');
(async()=>{
 const app=await connect();
 try{await app.database().collection(COLLECTION).limit(1).get();console.log('Preview collection already exists.');}
 catch(e){if(e.code!=='DATABASE_COLLECTION_NOT_EXIST')throw e;await app.database().createCollection(COLLECTION);console.log('Created isolated preview collection.');}
 const req=createRequire(path.join(process.env.TOPUYI_MINI_PROJECT||'D:/Project/mini/mini_topuyi','package.json'));
 const {checkAndGetCredential}=req('@cloudbase/toolbox');const credential=await checkAndGetCredential({cwd:'D:/Project/mini/mini_topuyi'});
 const {CloudApiService}=req('@cloudbase/cloud-api');const service=new CloudApiService({service:'tcb',version:'2018-06-08',getCredential:async()=>credential});
 await service.request('ModifyDatabaseACL',{EnvId:ENV,CollectionName:COLLECTION,AclTag:'ADMINONLY'});
 const result=await service.request('DescribeDatabaseACL',{EnvId:ENV,CollectionName:COLLECTION});
 console.log(JSON.stringify({collection:COLLECTION,acl:result.AclTag||result.Response?.AclTag||'verify-result-unrecognized'}));
})().catch(e=>{console.error('Provision failed:',e.code||String(e.message).slice(0,150));process.exitCode=1;});
