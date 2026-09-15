const {randomBytes}=require('node:crypto');
const CONTENT='topuyi_ops_content_v1',LIVE='topuyi_storefront_live_v1',DRAFT='member_draft',ACTIVE='member_active';
function fail(code,message){const e=new Error(message);e.publicCode=code;throw e;}
function validate(config){
 if(!config||config.version!==1||JSON.stringify(config).length>240000)fail('INVALID','会员中心内容格式或大小不正确。');
 const text=(v,n)=>typeof v==='string'&&v.length<=n;
 const media=v=>v===''||(typeof v==='string'&&/^\/api\/ops\/media\/[a-f0-9]{32}$/.test(v));
 const flag=v=>typeof v==='boolean',height=v=>Number.isInteger(v)&&v>=80&&v<=900;
 const ids=new Set();
 function id(v){if(!text(v,80)||!v||ids.has(v))fail('INVALID','内容编号重复或不正确。');ids.add(v);return v;}
 function poster(p){if(!p||!flag(p.visible)||!media(p.image)||!height(p.height))fail('INVALID','海报设置不正确。');return {visible:p.visible,image:p.image,height:p.height};}
 const hero=poster(config.hero),banner=poster(config.banner),entries=config.entries,products=config.products;
 if(!entries||!flag(entries.visible)||!height(entries.height)||!Array.isArray(entries.items)||entries.items.length!==2)fail('INVALID','双列海报需要保留两个入口。');
 const items=entries.items.map(e=>{
  if(!e||!text(e.title,80)||!media(e.image)||!flag(e.enabled)||!Array.isArray(e.content)||e.content.length>30)fail('INVALID','海报入口设置不正确。');
  const entryId=id(e.id),content=e.content.map(b=>{if(!b||!['text','image'].includes(b.type)||!text(b.text,3000)||!media(b.image))fail('INVALID','二级页图文格式不正确。');return {id:id(b.id),type:b.type,text:b.type==='text'?b.text:'',image:b.type==='image'?b.image:''};});
  return {id:entryId,title:e.title.trim(),image:e.image,enabled:e.enabled,content};
 });
 if(!products||!flag(products.visible)||!text(products.title,60)||!Array.isArray(products.items)||products.items.length>50)fail('INVALID','最多配置 50 个积分商品。');
 const goods=products.items.map(p=>{
  if(!p||!text(p.title,80)||!media(p.image)||!Number.isInteger(p.points)||p.points<0||p.points>99999999||!flag(p.visible)||!text(p.description,3000)||!text(p.exchangeInstructions,3000))fail('INVALID','商品内容或积分设置不正确。');
  const productId=id(p.id),detailImages=p.detailImages===undefined?[]:p.detailImages,blocks=p.detailBlocks===undefined?[]:p.detailBlocks;
  if(!Array.isArray(detailImages)||detailImages.length>10||detailImages.some(src=>!src||!media(src)))fail('INVALID','每个积分商品最多添加 10 张已上传的补充主图。');
  if(!Array.isArray(blocks)||blocks.length>30)fail('INVALID','每个积分商品最多添加 30 项详情图文。');
  const detailBlocks=blocks.map(b=>{if(!b||!['text','image'].includes(b.type)||!text(b.text,3000)||!media(b.image))fail('INVALID','积分商品详情图文格式不正确。');return {id:id(b.id),type:b.type,text:b.type==='text'?b.text.trim():'',image:b.type==='image'?b.image:''};});
  return {id:productId,title:p.title.trim(),image:p.image,points:p.points,visible:p.visible,description:p.description.trim(),exchangeInstructions:p.exchangeInstructions.trim(),detailImages:[...detailImages],detailBlocks};
 });
 return {version:1,hero,entries:{visible:entries.visible,height:entries.height,items},banner,products:{visible:products.visible,title:products.title.trim(),items:goods}};
}
async function read(db,collection,id){const r=await db.collection(collection).doc(id).get();return Array.isArray(r.data)?r.data[0]||null:r.data||null;}
async function resolve(db,config){
 const c=validate(config),memo=new Map();
 async function image(src){if(!src)return '';if(!memo.has(src)){const a=await read(db,CONTENT,'asset_'+src.split('/').pop());if(!a?.ready||!a.mime?.startsWith('image/')||!a.fileID?.startsWith('cloud://'))fail('INVALID','会员中心图片尚未上传完成，请重新上传。');memo.set(src,a.fileID);}return memo.get(src);}
 c.hero.image=await image(c.hero.image);c.banner.image=await image(c.banner.image);
 for(const e of c.entries.items){e.image=await image(e.image);for(const b of e.content)b.image=await image(b.image);}
 for(const p of c.products.items){p.image=await image(p.image);p.detailImages=await Promise.all(p.detailImages.map(image));for(const b of p.detailBlocks)if(b.type==='image')b.image=await image(b.image);}
 return c;
}
function publication(config){
 const c=JSON.parse(JSON.stringify(config));
 for(const [p,name] of [[c.hero,'顶部海报'],[c.banner,'横幅海报']]){if(p.visible&&!p.image)fail('INVALID',`请上传${name}，或关闭该模块。`);if(!p.visible)p.image='';}
 if(c.entries.visible){for(const e of c.entries.items){if(!e.image)fail('INVALID','请上传双列海报图片，或关闭双列海报模块。');if(e.enabled&&(!e.title||!e.content.some(b=>b.type==='text'?b.text.trim():b.image)))fail('INVALID','请填写海报二级页标题和内容，或关闭该入口的二级页。');e.content=e.enabled?e.content.filter(b=>b.type==='text'?b.text.trim():b.image):[];}}
 else c.entries.items=[];
 c.products.items=c.products.visible?c.products.items.filter(p=>p.visible):[];
 for(const p of c.products.items){
  if(!p.title||!p.image||p.points<=0)fail('INVALID','上架积分商品需填写标题、图片和正整数积分。');
  const empty=(p.detailBlocks||[]).findIndex(b=>b.type==='text'?!b.text.trim():!b.image);
  if(empty>=0)fail('INVALID',`积分商品“${p.title}”的第 ${empty+1} 项详情图文为空，请补充内容或删除该项。`);
 }
 if(!c.hero.visible&&!c.banner.visible&&!c.entries.visible&&!c.products.items.length)fail('INVALID','请至少配置一个可展示的会员模块。');
 return c;
}
const status=p=>({revision:p?.revision||null,updatedAt:p?.updatedAt||'',productCount:p?.productCount||0,draftRevision:p?.draftRevision||null});
async function handle(db,event,user){
 const action=event.action;
 if(action==='memberLoad')return {ok:true,draft:await read(db,CONTENT,DRAFT),publication:status(await read(db,LIVE,ACTIVE))};
 if(action==='memberStatus')return {ok:true,...status(await read(db,LIVE,ACTIVE))};
 if(action==='memberSave'){
  const config=validate(event.config);await resolve(db,config);
  return db.runTransaction(async tx=>{const before=await read(tx,CONTENT,DRAFT);if((before?.revision||null)!==(event.expectedRevision||null))fail('CONFLICT','同事已更新会员草稿，请重新读取后再保存。');const record={config,revision:randomBytes(12).toString('hex'),updatedAt:new Date().toISOString(),updatedBy:user.name};await tx.collection(CONTENT).doc(DRAFT).set(record);return {ok:true,record};});
 }
 if(action==='memberPublish'){
  const draft=await read(db,CONTENT,DRAFT);if(!draft?.revision||draft.revision!==event.expectedDraftRevision)fail('CONFLICT','请先保存会员中心共享草稿，重新检查后再发布。');
  const config=publication(await resolve(db,draft.config));
  return db.runTransaction(async tx=>{
   const latest=await read(tx,CONTENT,DRAFT),before=await read(tx,LIVE,ACTIVE);
   if(latest?.revision!==event.expectedDraftRevision)fail('CONFLICT','会员草稿已更新，请重新读取后再发布。');
   if((before?.revision||null)!==(event.expectedRevision||null))fail('CONFLICT','会员中心已被更新，请重新检查发布状态。');
   const record={scope:'published-member',schemaVersion:1,config,revision:randomBytes(12).toString('hex'),updatedAt:new Date().toISOString(),updatedBy:user.name,draftRevision:latest.revision,productCount:config.products.items.length};
   if(before){const {_id,...saved}=before;await tx.collection(LIVE).doc('member_history_'+before.revision).set(saved);}
   await tx.collection(LIVE).doc(ACTIVE).set(record);
   return {ok:true,...status(record)};
  });
 }
 fail('INVALID','不支持此会员操作。');
}
module.exports={validate,resolve,publication,handle};
