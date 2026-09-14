const {connect,COLLECTION,FUNCTION}=require('./cloud-client.cjs');
const {createHash}=require('node:crypto');
(async()=>{
  const app=await connect();
  const [linkResult,previewResult]=await Promise.all([
    app.database().collection('topuyi_ops_content_v1').doc('preview_link').get(),
    app.database().collection(COLLECTION).doc('active').get()
  ]);
  const first=result=>Array.isArray(result.data)?result.data[0]:result.data;
  const link=first(linkResult),active=first(previewResult);
  const accessCode=link?.accessCode||'';
  if(!accessCode||!active||createHash('sha256').update(accessCode).digest('hex')!==active.accessHash)throw Error('PREVIEW_LINK_NOT_CURRENT');
  const response=await app.callFunction({name:FUNCTION,data:{action:'getPreview',accessCode}});
  const result=typeof response.result==='string'?JSON.parse(response.result):response.result;
  if(!result?.ok)throw Error(result?.error||'PREVIEW_UNAVAILABLE');
  const blocks=result.config.blocks,items=blocks.flatMap(b=>b.type==='products'?b.items:[]),products=result.products||[];
  const media=blocks.flatMap(b=>[b.video,...b.items.flatMap(i=>[i.image,...(i.detailImages||[]),...(i.detailBlocks||[]).map(x=>x.image)])]).filter(Boolean);
  let sampleImageStatus=null;
  const sample=media.find(url=>url.startsWith('https://'));
  if(sample){const response=await fetch(sample,{method:'HEAD',signal:AbortSignal.timeout(15000)});sampleImageStatus=response.status;}
  console.log(JSON.stringify({accessCode,updatedAt:result.updatedAt,blocks:blocks.length,mediaCount:media.length,configuredProducts:items.length,availableProducts:items.filter(i=>products.some(p=>p.sku===i.sku&&(p.manageStock===false||p.stock>0))).length,sampleImageStatus},null,2));
})().catch(error=>{console.error(JSON.stringify({error:error.code||'',message:String(error.message||'').replace(/(AKID|secret|token)\S+/gi,'[redacted]').slice(0,200)}));process.exitCode=1;});
