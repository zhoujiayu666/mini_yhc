const {createHash,randomBytes}=require('node:crypto');
const APP='wx3610c3ef05d1131e',STOCK='topuyi_member_stock_v1',ORDERS='topuyi_redemption_orders_v1',CONTENT='topuyi_ops_content_v1';
const stockId=productId=>createHash('sha256').update(JSON.stringify(['stock',APP,productId])).digest('hex');
const fail=(code,message)=>{throw Object.assign(Error(message),{publicCode:code});};
async function read(db,collection,id){const r=await db.collection(collection).doc(id).get();return Array.isArray(r.data)?r.data[0]||null:r.data||null;}
async function catalog(db){const [draft,live]=await Promise.all([read(db,CONTENT,'member_draft'),read(db,'topuyi_storefront_live_v1','member_active')]);const map=new Map();for(const p of draft?.config?.products?.items||[])map.set(p.id,{id:p.id,title:p.title||'未命名商品',published:false});if(live?.config?.products?.visible)for(const p of live.config.products.items||[])if(p.visible)map.set(p.id,{id:p.id,title:p.title,published:true});return [...map.values()];}
const publicOrder=o=>({id:o._id,orderNo:o.orderNo,status:o.status,product:{id:o.product.id,title:o.product.title,points:o.product.points},quantity:o.quantity,totalPoints:o.totalPoints,address:o.address,shipping:o.shipping||null,createdAt:o.createdAt,shippedAt:o.shippedAt||0,revision:o.revision});
async function handle(db,event,user){
 if(event.action==='memberInventory'){
  const products=await catalog(db);const items=await Promise.all(products.map(async p=>{const stock=await read(db,STOCK,stockId(p.id));return {...p,remaining:stock?.remaining??null,redeemed:stock?.redeemed||0,revision:stock?.revision||null,configured:stock?.remaining!=null};}));return {ok:true,items};
 }
 if(event.action==='memberSetStock'){
  if(typeof event.productId!=='string'||(event.remaining!==null&&(!Number.isSafeInteger(event.remaining)||Math.abs(event.remaining)>99999999)))fail('INVALID','库存请留空或填写 -99999999–99999999 的整数。');
  if(!(await catalog(db)).some(p=>p.id===event.productId))fail('INVALID','请先保存包含此商品的会员中心草稿。');
  return db.runTransaction(async tx=>{
   const before=await read(tx,STOCK,stockId(event.productId));if((before?.revision||null)!==(event.expectedRevision||null))fail('CONFLICT','库存已变化，请刷新后重新设置。');
   const revision=randomBytes(12).toString('hex'),now=Date.now(),record={sourceAppId:APP,productId:event.productId,remaining:event.remaining,redeemed:before?.redeemed||0,revision,updatedAt:now,updatedBy:user.name};
   await tx.collection(STOCK).doc(stockId(event.productId)).set(record);
   await tx.collection(CONTENT).doc('redemption_stock_'+revision).set({action:'setStock',productId:event.productId,before:before?.remaining??null,after:event.remaining,updatedAt:now,updatedBy:user.name});
   return {ok:true,remaining:record.remaining,redeemed:record.redeemed,revision};
  });
 }
 if(event.action==='memberRedemptionOrders'){
  const offset=event.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>10000)fail('INVALID','页码不正确。');
  const query={sourceAppId:APP};if(event.status){if(!['processing','shipped','completed'].includes(event.status))fail('INVALID','订单状态不正确。');query.status=event.status;}
  const r=await db.collection(ORDERS).where(query).orderBy('createdAt','desc').orderBy('_id','desc').skip(offset).limit(21).get();return {ok:true,orders:r.data.slice(0,20).map(publicOrder),hasMore:r.data.length>20};
 }
 if(event.action==='memberRedemptionShip'){
  if(typeof event.orderId!=='string'||!/^[a-f0-9]{64}$/.test(event.orderId)||typeof event.carrier!=='string'||!event.carrier.trim()||event.carrier.trim().length>40||typeof event.trackingNo!=='string'||! /^[A-Za-z0-9-]{5,60}$/.test(event.trackingNo.trim()))fail('INVALID','请填写快递公司和正确的运单号。');
  const shipping={carrier:event.carrier.trim(),trackingNo:event.trackingNo.trim()};
  return db.runTransaction(async tx=>{
   const before=await read(tx,ORDERS,event.orderId);if(!before||before.sourceAppId!==APP)fail('NOT_FOUND','订单不存在。');
   if(['shipped','completed'].includes(before.status)&&before.shipping?.carrier===shipping.carrier&&before.shipping?.trackingNo===shipping.trackingNo)return {ok:true,order:publicOrder(before)};
   if(before.status!=='processing'||before.revision!==event.expectedRevision)fail('CONFLICT','订单已变化，请刷新后查看。');
   const now=Date.now(),revision=randomBytes(12).toString('hex'),patch={shipping,status:'shipped',shippedAt:now,updatedAt:now,revision,shippedBy:user.name};
   await tx.collection(ORDERS).doc(event.orderId).update(patch);
   await tx.collection(CONTENT).doc('redemption_ship_'+revision).set({action:'ship',orderId:event.orderId,shipping,updatedAt:now,updatedBy:user.name});
   return {ok:true,order:publicOrder({...before,...patch})};
  });
 }
 fail('INVALID','不支持此兑换操作。');
}
module.exports={handle,STOCK,ORDERS,stockId};
