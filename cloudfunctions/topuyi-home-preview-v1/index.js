const cloud = require('wx-server-sdk');
const {createHash,timingSafeEqual}=require('crypto');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const COLLECTION='topuyi_home_preview_v1',PRODUCTS='topuyi_home_products_dev_v1';
exports.main=async(event={})=>{
  if(event.action!=='getPreview'||typeof event.accessCode!=='string'||! /^[a-f0-9]{32}$/.test(event.accessCode))return {ok:false,error:'PREVIEW_CODE_REQUIRED'};
  const context=cloud.getWXContext();
  if(context.APPID&&context.APPID!=='wx3610c3ef05d1131e')return {ok:false,error:'APP_NOT_ALLOWED'};
  const found=await cloud.database().collection(COLLECTION).where({_id:'active'}).limit(1).get();
  const doc=found.data[0];
  if(!doc||doc.scope!=='development-preview')return {ok:false,error:'PREVIEW_NOT_READY'};
  const actual=createHash('sha256').update(event.accessCode).digest('hex');
  if(typeof doc.accessHash!=='string'||doc.accessHash.length!==64||!timingSafeEqual(Buffer.from(actual),Buffer.from(doc.accessHash)))return {ok:false,error:'PREVIEW_CODE_INVALID'};
  const config=JSON.parse(JSON.stringify(doc.config));
  const productResult=await cloud.database().collection(PRODUCTS).where({active:true}).limit(1000).get();
  const products=productResult.data.map(p=>({sku:p.sku,name:p.name,price:Number(p.price)||0,originalPrice:Number(p.originalPrice)||0,manageStock:p.manageStock===false?false:true,stock:Number(p.stock)||0,coverImage:p.image||''}));
  const ids=[...new Set([...config.blocks.flatMap(b=>[b.video,...b.items.flatMap(i=>[i.image,...(i.detailImages||[]),...(i.detailBlocks||[]).map(x=>x.image)])]),...products.map(p=>p.coverImage)].filter(v=>v&&v.startsWith('cloud://')))];
  const urls={};
  for(let n=0;n<ids.length;n+=50){const result=await cloud.getTempFileURL({fileList:ids.slice(n,n+50)});for(const f of result.fileList){if(!f.tempFileURL)return {ok:false,error:'MEDIA_UNAVAILABLE'};urls[f.fileID]=f.tempFileURL;}}
  for(const b of config.blocks){if(b.video)b.video=urls[b.video]||b.video;for(const i of b.items){if(i.image)i.image=urls[i.image]||i.image;if(i.detailImages)i.detailImages=i.detailImages.map(v=>urls[v]||v);if(i.detailBlocks)for(const x of i.detailBlocks)if(x.image)x.image=urls[x.image]||x.image;}}
  for(const p of products)if(p.coverImage)p.coverImage=urls[p.coverImage]||p.coverImage;
  return {ok:true,config,products,revision:doc.revision,updatedAt:doc.updatedAt};
};
