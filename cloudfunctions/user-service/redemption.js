const {createHash,randomBytes}=require('crypto');
const {ACCOUNTS,LEDGER,accountId}=require('./member-points');
const APP='wx3610c3ef05d1131e',STOCK='topuyi_member_stock_v1',ORDERS='topuyi_redemption_orders_v1',LIVE='topuyi_storefront_live_v1';
const id=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const stockId=productId=>id('stock',APP,productId);
const fail=(code,message)=>{throw Object.assign(Error(message),{publicCode:code});};
async function read(ref){try{const r=await ref.get();return Array.isArray(r.data)?r.data[0]||null:r.data||null;}catch(e){if(/document with _id .+ does not exist/.test(String(e.errMsg||e.message)))return null;throw e;}}
async function transaction(db,work){for(let n=0;n<4;n++){const tx=await db.startTransaction();try{const value=await work(tx);await tx.commit();return value;}catch(e){await tx.rollback().catch(()=>{});if(n<3&&/transaction.?conflict|DATABASE_TRANSACTION_CONFLICT/i.test(String(e.code)+String(e.message||e.errMsg)))continue;throw e;}}}
function productFrom(doc,productId){const p=doc?.scope==='published-member'&&doc.config?.products?.visible?doc.config.products.items.find(p=>p.id===productId&&p.visible):null;if(!p||!p.title||!p.image||!Number.isSafeInteger(p.points)||p.points<=0)fail('OFF_SHELF','商品已下架，请返回会员中心重新选择');return p;}
const offerVersion=p=>id('offer',p.id,p.title,p.image,p.points);
async function registered(db,appId,openid){let r=await db.collection('users').where({openid,sourceAppId:appId}).limit(1).get();if(!r.data?.length)r=await db.collection('users').where({_openid:openid,sourceAppId:appId}).limit(1).get();return !!r.data?.length;}
function publicOrder(o){return {id:o._id,orderNo:o.orderNo,status:o.status,product:o.product,quantity:o.quantity,totalPoints:o.totalPoints,address:o.address,shipping:o.shipping||null,createdAt:o.createdAt,shippedAt:o.shippedAt||0,completedAt:o.completedAt||0};}
async function signOrders(cloud,orders){const ids=[...new Set(orders.map(o=>o.product.image).filter(s=>s?.startsWith('cloud://')))];if(!ids.length)return orders;const r=await cloud.getTempFileURL({fileList:ids});const map=new Map((r.fileList||[]).map(f=>[f.fileID,f.tempFileURL||'']));return orders.map(o=>({...o,product:{...o.product,image:map.get(o.product.image)||''}}));}
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID',label);return value;}
async function handle(db,cloud,identity,event){
 const {appId,openid}=identity;if(appId!==APP||!openid)fail('LOGIN_REQUIRED','请登录后兑换');
 const action=event.action;
 if(action==='redemptionQuote'){
  if(typeof event.productId!=='string'||event.productId.length>80)fail('INVALID','商品编号不正确');
  const p=productFrom(await read(db.collection(LIVE).doc('member_active')),event.productId);
  const [stock,isMember,account]=await Promise.all([read(db.collection(STOCK).doc(stockId(p.id))),registered(db,appId,openid),read(db.collection(ACCOUNTS).doc(accountId(appId,openid)))]);
  const image=(await signOrders(cloud,[{product:p}]))[0].product.image;
  return {success:true,product:{id:p.id,title:p.title,image,points:p.points},offerVersion:offerVersion(p),isMember,points:isMember&&Number.isSafeInteger(account?.balance)?account.balance:0,stock:stock?.remaining??null,stockConfigured:stock?.remaining!=null};
 }
 if(!await registered(db,appId,openid))fail('LOGIN_REQUIRED','请注册登录后兑换');
 if(action==='redemptionCreate'){
  const {productId,addressId,requestId,offerVersion:expectedOffer}=event,quantity=integer(event.quantity,1,99,'兑换数量须为 1–99 件');
  if(typeof productId!=='string'||!productId||productId.length>80||typeof addressId!=='string'||!addressId||addressId.length>128||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{20,100}$/.test(requestId)||typeof expectedOffer!=='string'||!/^[a-f0-9]{64}$/.test(expectedOffer))fail('INVALID','兑换信息不完整，请重新确认');
  const orderId=id('redeem',appId,openid,requestId),intent=id(productId,addressId,quantity,expectedOffer);
  const order=await transaction(db,async tx=>{
   const orderRef=tx.collection(ORDERS).doc(orderId),existing=await read(orderRef);
   // Resolve retries before checking current stock, points or publication.
   if(existing){if(existing.intent!==intent||existing.openid!==openid||existing.sourceAppId!==appId)fail('CONFLICT','本次兑换信息已变化，请先查看兑换订单');return existing;}
   const p=productFrom(await read(tx.collection(LIVE).doc('member_active')),productId);
   if(offerVersion(p)!==expectedOffer)fail('OFFER_CHANGED','商品信息已更新，请重新确认所需积分');
   const stockRef=tx.collection(STOCK).doc(stockId(productId)),accountRef=tx.collection(ACCOUNTS).doc(accountId(appId,openid));
   const stock=await read(stockRef),account=await read(accountRef),address=await read(tx.collection('addresses').doc(addressId));
   if(!address||address.openid!==openid||address.sourceAppId!==appId||!address.name||!/^1\d{10}$/.test(address.phone)||!address.detail)fail('ADDRESS_REQUIRED','收货地址不可用，请重新选择');
   if(stock&&(stock.sourceAppId!==appId||stock.productId!==productId))fail('UNAVAILABLE','库存信息暂不可用，请稍后重试');
   const remaining=stock?.remaining??null;
   if(remaining!==null&&(!Number.isSafeInteger(remaining)||remaining<quantity))fail('SOLD_OUT','库存不足，请调整数量或选择其他商品');
   const totalPoints=integer(p.points*quantity,1,Number.MAX_SAFE_INTEGER,'兑换积分不正确');
   if(!account?.isMember||account.openid!==openid||account.sourceAppId!==appId||!Number.isSafeInteger(account.balance)||account.balance<totalPoints)fail('INSUFFICIENT_POINTS','积分不足，请重新查看可用积分');
   const now=Date.now(),balance=account.balance-totalPoints,spent=integer((account.spent||0)+totalPoints,0,Number.MAX_SAFE_INTEGER,'积分累计数值异常，请联系客服'),redeemed=integer((stock?.redeemed||0)+quantity,0,Number.MAX_SAFE_INTEGER,'库存累计数值异常，请联系客服');
   const record={sourceAppId:appId,openid,intent,orderNo:'R'+now+randomBytes(4).toString('hex').toUpperCase(),status:'processing',product:{id:p.id,title:p.title,image:p.image,points:p.points},quantity,totalPoints,address:Object.fromEntries(['name','phone','province','city','district','detail'].map(k=>[k,address[k]||''])),createdAt:now,updatedAt:now,revision:randomBytes(12).toString('hex')};
   await accountRef.update({data:{balance,spent,updatedAt:now}});
   const stockData={sourceAppId:appId,productId,remaining:remaining===null?null:remaining-quantity,redeemed,revision:randomBytes(12).toString('hex'),updatedAt:now};
   if(stock)await stockRef.update({data:stockData});else await stockRef.set({data:stockData});
   await orderRef.set({data:record});
   await tx.collection(LEDGER).doc(id('redemption',orderId)).set({data:{sourceAppId:appId,openid,accountId:accountId(appId,openid),orderId,orderNo:record.orderNo,type:'redemption',delta:-totalPoints,balanceAfter:balance,createdAt:now}});
   return {_id:orderId,...record};
  });
  return {success:true,order:publicOrder(order)};
 }
 if(action==='redemptionOrders'){
  const offset=integer(event.offset??0,0,10000,'页码不正确');
  const r=await db.collection(ORDERS).where({sourceAppId:appId,openid}).orderBy('createdAt','desc').orderBy('_id','desc').skip(offset).limit(21).get();
  return {success:true,orders:await signOrders(cloud,r.data.slice(0,20).map(publicOrder)),hasMore:r.data.length>20};
 }
 if(action==='redemptionOrder'||action==='redemptionReceive'){
  if(typeof event.orderId!=='string'||!/^[a-f0-9]{64}$/.test(event.orderId))fail('INVALID','订单编号不正确');
  const owned=o=>{if(!o||o.openid!==openid||o.sourceAppId!==appId)fail('NOT_FOUND','兑换订单不存在');return o;};
  let order;
  if(action==='redemptionReceive')order=await transaction(db,async tx=>{const ref=tx.collection(ORDERS).doc(event.orderId),o=owned(await read(ref));if(o.status==='completed')return o;if(o.status!=='shipped')fail('CONFLICT','订单尚未发货，请刷新后查看');const patch={status:'completed',completedAt:Date.now(),updatedAt:Date.now(),revision:randomBytes(12).toString('hex')};await ref.update({data:patch});return {...o,...patch};});
  else order=owned(await read(db.collection(ORDERS).doc(event.orderId)));
  return {success:true,order:(await signOrders(cloud,[publicOrder(order)]))[0]};
 }
 fail('INVALID','不支持此兑换操作');
}
module.exports={handle,STOCK,ORDERS,stockId,offerVersion,read,transaction};
