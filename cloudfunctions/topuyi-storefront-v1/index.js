const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const LIVE='topuyi_storefront_live_v1',PRODUCTS='topuyi_home_products_live_v1';
exports.main=async(event={})=>{
  try{
    if(!['getPublished','getMember'].includes(event.action))return {ok:false,error:'INVALID_ACTION'};
    const context=cloud.getWXContext();
    if(context.APPID&&context.APPID!=='wx3610c3ef05d1131e')return {ok:false,error:'APP_NOT_ALLOWED'};
    if(event.action==='getMember')return await require('./member-read')(cloud);
    const db=cloud.database();
    const found=await db.collection(LIVE).where({_id:'active'}).limit(1).get(),doc=found.data[0];
    if(!doc||doc.scope!=='published-storefront')return {ok:false,error:'STOREFRONT_NOT_READY'};
    const config=JSON.parse(JSON.stringify(doc.config));
    config.blocks=config.blocks.filter(b=>b.visible);
    const skus=new Set(config.blocks.flatMap(b=>b.type==='products'?b.items.map(i=>i.sku):[]));
    const result=await db.collection(PRODUCTS).where({active:true,scope:'published'}).limit(1000).get();
    const products=result.data.filter(p=>skus.has(p.sku)).map(p=>({sku:p.sku,name:p.name,price:Number(p.price)||0,originalPrice:Number(p.originalPrice)||0,manageStock:p.manageStock===false?false:true,stock:Number(p.stock)||0,coverImage:p.image||'',detailImages:p.detailImages||[],detailBlocks:p.detailBlocks||[],detail:p.subtitle||'',category:p.category||'商品'}));
    return {ok:true,config,products,catalogSource:'home_live',revision:doc.revision,updatedAt:doc.updatedAt};
  }catch(error){console.error('storefront-read',error.code||error.message);return {ok:false,error:'STOREFRONT_UNAVAILABLE'};}
};
