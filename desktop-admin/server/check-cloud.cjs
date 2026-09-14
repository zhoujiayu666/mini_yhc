const {connect,COLLECTION,ENV}=require('./cloud-client.cjs');
(async()=>{try { const app=await connect(); const r=await app.database().collection(COLLECTION).limit(1).get(); console.log(JSON.stringify({authenticated:true,env:ENV,collectionExists:true,records:r.data.length})); }
catch(e){console.log(JSON.stringify({ok:false,code:e.code||'',message:String(e.message||'').replace(/(AKID|secret|token)\S+/gi,'[redacted]').slice(0,250)}));process.exitCode=1;}})();
