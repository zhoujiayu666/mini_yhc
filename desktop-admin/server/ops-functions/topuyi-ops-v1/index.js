const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('node:crypto');
const {normalizeProducts,writeProducts}=require('./owned-products');
const storefront=require('./publish-storefront');
const member=require('./member-content');
const redemptions=require('./member-redemptions');
async function normalizeOwned(config){const r=await db.collection(PRODUCTS).limit(1000).get();return normalizeProducts(config,r.data);}
const ENV='cloud1-d4grfezxdaca540d6', CONTENT='topuyi_ops_content_v1', MEMBERS='topuyi_operators_v1', PREVIEW='topuyi_home_preview_v1', PRODUCTS='topuyi_home_products_dev_v1', PREFIX='topuyi/home-preview/v1/ops/';
const app=cloudbase.init({env:ENV}), db=app.database();
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(code,message)=>{const e=new Error(message);e.publicCode=code;throw e;};
async function get(collection,id,source=db){const r=await source.collection(collection).doc(id).get();return Array.isArray(r.data)?r.data[0]||null:r.data||null;}
const types=['banner','video','links','poster','products','about'], colors=['#f4f4f1','#ffffff','#eee9db','#171b26','#202733'];
const mediaId=v=>typeof v==='string'&&/^\/api\/ops\/media\/[a-f0-9]{32}$/.test(v);
function validate(c){
 if(!c||c.version!==1||!Array.isArray(c.blocks)||c.blocks.length>30||JSON.stringify(c).length>250000)fail('INVALID','页面格式或大小不正确。');
 const text=(v,n)=>typeof v==='string'&&v.length<=n, media=v=>v===''||mediaId(v), ids=new Set();
 for(const b of c.blocks){
  if(!b||!text(b.id,80)||ids.has(b.id)||!types.includes(b.type)||!text(b.title,60)||!text(b.subtitle,300)||typeof b.visible!=='boolean'||(b.showHeading!==undefined&&typeof b.showHeading!=='boolean')||!colors.includes(b.background)||!Number.isFinite(b.height)||b.height<(b.type==='links'?40:160)||b.height>900||!Number.isFinite(b.spacing)||b.spacing<0||b.spacing>40||![1,2,4].includes(b.columns)||!media(b.video)||!Array.isArray(b.items)||!b.items.length||b.items.length>(b.type==='products'?100:20))fail('INVALID','模块设置不正确。');
  ids.add(b.id);const items=new Set();
  for(const i of b.items){const subtitleLimit=b.id==='default-community'?3000:200,detailOk=i.detailBlocks===undefined||(Array.isArray(i.detailBlocks)&&i.detailBlocks.length<=30&&i.detailBlocks.every(x=>x&&text(x.id,80)&&['text','image'].includes(x.type)&&(x.text===undefined||text(x.text,3000))&&(x.image===undefined||media(x.image))));if(!i||!text(i.id,80)||(i.sku!==undefined&&!text(i.sku,100))||(i.category!==undefined&&!text(i.category,20))||(i.detailImages!==undefined&&(!Array.isArray(i.detailImages)||i.detailImages.length>10||i.detailImages.some(v=>!media(v))))||!detailOk||(i.price!==undefined&&(!Number.isFinite(i.price)||i.price<0||i.price>9999999))||(i.originalPrice!==undefined&&(!Number.isFinite(i.originalPrice)||i.originalPrice<0||i.originalPrice>9999999))||items.has(i.id)||!text(i.title,80)||!text(i.subtitle,subtitleLimit)||!text(i.filename,255)||!media(i.image)||!Number.isInteger(i.target)||i.target<0||i.target>6)fail('INVALID','内容或图片格式不正确。');items.add(i.id);}
 }
 return JSON.parse(JSON.stringify(c));
}
async function resolveConfig(config){
 const c=validate(config),memo=new Map();
 async function resolve(v,video){if(!v)return '';const id=v.split('/').pop();if(!memo.has(id)){const a=await get(CONTENT,'asset_'+id);if(!a||!a.ready)fail('INVALID','素材未完成上传，请重新选择。');memo.set(id,a);}const a=memo.get(id);if(video!==a.mime.startsWith('video/'))fail('INVALID','素材类型不匹配。');return a.fileID;}
 for(const b of c.blocks){b.video=await resolve(b.video,true);for(const i of b.items){i.image=await resolve(i.image,false);if(i.detailImages)i.detailImages=await Promise.all(i.detailImages.map(v=>resolve(v,false)));if(i.detailBlocks)for(const x of i.detailBlocks)if(x.type==='image')x.image=await resolve(x.image||'',false);}}return c;
}
async function saveRecord(id,value,expectedRevision,user){
 return await db.runTransaction(async tx=>{const before=await get(CONTENT,id,tx);if((before?.revision||null)!==(expectedRevision||null))fail('CONFLICT','同事已更新此内容，请刷新读取最新内容后再保存。');const record={...value,revision:crypto.randomBytes(12).toString('hex'),updatedAt:new Date().toISOString(),updatedBy:user.name};await tx.collection(CONTENT).doc(id).set(record);return record;});
}
exports.main=async(event,context)=>{
 try{
  // Identity comes exclusively from the gateway runtime, never from event fields.
  const identity=cloudbase.getCloudbaseContext(context),uid=identity.TCB_UUID;
  if(!uid||identity.TCB_ISANONYMOUS_USER===true||identity.TCB_ISANONYMOUS_USER==='true')fail('UNAUTHENTICATED','请先登录运营账号。');
  const user=await get(MEMBERS,uid);if(!user||!user.active)fail('FORBIDDEN','此账号没有运营后台权限，请联系管理员。');
  const action=event?.action;
  if(['memberInventory','memberSetStock','memberRedemptionOrders','memberRedemptionShip'].includes(action))return await redemptions.handle(db,event,user);
  if(['memberLoad','memberStatus','memberSave','memberPublish'].includes(action))return await member.handle(db,event,user);
  if(action==='catalog'){const r=await db.collection(PRODUCTS).where({active:true}).limit(1000).get();const products=r.data.map(p=>({sku:p.sku,name:p.name,price:Number(p.price)||0,originalPrice:Number(p.originalPrice)||0,stock:Number(p.stock)||0,image:p.image||''}));const ids=[...new Set(products.map(p=>p.image).filter(i=>i.startsWith('cloud://')))];if(ids.length){const urls=await app.getTempFileURL({fileList:ids.map(fileID=>({fileID,maxAge:1800}))});const map=new Map(urls.fileList.map(i=>[i.fileID,i.tempFileURL]));products.forEach(p=>{if(map.has(p.image))p.image=map.get(p.image)||'';});}return {ok:true,scope:'development-products',products};}
  if(action==='whoami')return {ok:true,user:{name:user.name,username:user.username,role:user.role}};
  if(action==='load')return {ok:true,draft:await get(CONTENT,'draft'),templates:await get(CONTENT,'templates'),link:await get(CONTENT,'preview_link')};
  if(action==='save'){const config=normalizeOwned ? await normalizeOwned(validate(event.config)) : validate(event.config);await resolveConfig(config);return {ok:true,record:await saveRecord('draft',{config},event.expectedRevision,user)};}
  if(action==='templates'){
   if(!Array.isArray(event.templates)||event.templates.length>20||JSON.stringify(event.templates).length>750000)fail('INVALID','最多保存 20 个模板。');
   const list=[];for(const t of event.templates){if(typeof t.id!=='string'||t.id.length>80||typeof t.name!=='string'||t.name.length>50||typeof t.date!=='string'||t.date.length>80)fail('INVALID','模板信息不正确。');const config=validate(t.config);await resolveConfig(config);list.push({id:t.id,name:t.name,date:t.date,config});}
   return {ok:true,record:await saveRecord('templates',{items:list},event.expectedRevision,user)};
  }
  if(action==='status'){const p=await get(PREVIEW,'active'),link=await get(CONTENT,'preview_link');return {ok:true,revision:p?.revision||null,updatedAt:p?.updatedAt||'',accessCode:link?.accessCode||''};}
  if(action==='publishStatus'){const p=await get(storefront.LIVE,'active');return {ok:true,revision:p?.revision||null,updatedAt:p?.updatedAt||'',productCount:p?.productCount||0,draftRevision:p?.draftRevision||null};}
  if(action==='publish'){
   const draft=await get(CONTENT,'draft');
   if(!draft?.config||draft.revision!==event.expectedDraftRevision)fail('CONFLICT','请先保存共享草稿，刷新后再发布。');
   const config=await resolveConfig(await normalizeOwned(validate(draft.config)));
   try{return await storefront.publish(db,config,event,user);}catch(e){if(e.message?.includes('更新'))fail('CONFLICT',e.message);if(e.message?.includes('商品'))fail('INVALID',e.message);throw e;}
  }
  if(action==='sync'){
   const config=await resolveConfig(await normalizeOwned(validate(event.config)));
   return await db.runTransaction(async tx=>{const before=await get(PREVIEW,'active',tx);if((before?.revision||null)!==(event.expectedRevision||null))fail('CONFLICT','开发版预览已被更新，请重新检查连接后再同步。');const link=await get(CONTENT,'preview_link',tx);const accessCode=link?.accessCode||crypto.randomBytes(16).toString('hex'),revision=crypto.randomBytes(12).toString('hex'),updatedAt=new Date().toISOString();await writeProducts(tx,PRODUCTS,config,before?.config,updatedAt);await tx.collection(PREVIEW).doc('active').set({config,revision,updatedAt,updatedBy:user.name,accessHash:sha(accessCode),scope:'development-preview',schemaVersion:1});await tx.collection(CONTENT).doc('preview_link').set({accessCode,revision,updatedAt,updatedBy:user.name});return {ok:true,accessCode,revision,updatedAt};});
  }
  if(action==='prepareUpload'){
   const mime=event.mime,ext={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'}[mime];
   if(!ext||!Number.isInteger(event.size)||event.size<1||event.size>(mime.startsWith('video/')?30:8)*1024*1024)fail('INVALID','素材格式或大小不正确。');
   const id=crypto.randomBytes(16).toString('hex'),cloudPath=PREFIX+id+'.'+ext;
   const {data}=await app.getUploadMetadata({cloudPath});
   await db.collection(CONTENT).doc('asset_'+id).set({fileID:data.fileId,mime,size:event.size,ready:false,owner:uid,createdAt:new Date().toISOString()});
   return {ok:true,id,upload:{url:data.url,token:data.token,authorization:data.authorization,cosFileId:data.cosFileId,cloudPath}};
  }
  if(action==='completeUpload'){
   if(!/^[a-f0-9]{32}$/.test(event.id||''))fail('INVALID','素材编号不正确。');const a=await get(CONTENT,'asset_'+event.id);if(!a||a.owner!==uid)fail('FORBIDDEN','无权操作此素材。');
   const result=await app.downloadFile({fileID:a.fileID});const bytes=result.fileContent;
   const good=a.mime==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':a.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:a.mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':a.mime==='video/mp4'?bytes.toString('ascii',4,8)==='ftyp':bytes.subarray(0,4).toString('hex')==='1a45dfa3';
   if(!good||bytes.length!==a.size)fail('INVALID','素材内容校验失败，请重新上传。');
   await db.collection(CONTENT).doc('asset_'+event.id).update({ready:true});return {ok:true,src:'/api/ops/media/'+event.id};
  }
  if(action==='media'){
   if(!/^[a-f0-9]{32}$/.test(event.id||''))fail('INVALID','素材编号不正确。');const a=await get(CONTENT,'asset_'+event.id);if(!a||!a.ready)fail('NOT_FOUND','素材不存在。');
   const r=await app.getTempFileURL({fileList:[{fileID:a.fileID,maxAge:1800}]});const url=r.fileList[0]?.tempFileURL;if(!url)fail('NOT_FOUND','素材暂不可用。');return {ok:true,url,mime:a.mime};
  }
  fail('INVALID','不支持此操作。');
 }catch(e){if(!e.publicCode)console.error('ops-failure',e.code||e.name);return {ok:false,code:e.publicCode||'UNAVAILABLE',error:e.publicCode?e.message:'云端服务暂不可用，请稍后重试。'};}
};
