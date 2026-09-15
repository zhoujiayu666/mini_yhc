const {CLOUD_ENV_ID,initCloud}=require('./cloud-config');
const {getUserInfo}=require('./auth');
async function call(action,data={}){
 let timer;
 try{
  const ready=initCloud();if(!ready.ok)throw Error('网络连接暂不可用，请重试');
  const response=await Promise.race([wx.cloud.callFunction({name:'user-service',config:{env:CLOUD_ENV_ID},data:{...data,action}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('网络响应超时，请重试确认')),20000);})]);
  const r=response.result;if(!r||!r.success)throw Object.assign(Error(r?.message||'服务暂时不可用，请重试'),{code:r?.code||'UNAVAILABLE'});return r;
 }finally{clearTimeout(timer);}
}
const pendingKey=productId=>{const user=getUserInfo()||{};return 'redemptionPending:'+String(user.openid||user.phone||'guest')+':'+productId;};
const statusLabel=status=>({processing:'待发货',shipped:'待收货',completed:'已完成'}[status]||'处理中');
const orderView=o=>({...o,statusLabel:statusLabel(o.status),dateText:new Date(o.createdAt).toLocaleString()});
function actionState(quote,loggedIn,quantity=1){
 if(!loggedIn||!quote.isMember)return {buttonText:'登录后兑换',canRedeem:true};
 if(quote.stock!=null&&quote.stock<quantity)return {buttonText:'库存不足',canRedeem:false};
 const deficit=quote.product.points*quantity-quote.points;
 return deficit>0?{buttonText:'还差 '+deficit+' 积分',canRedeem:false}:{buttonText:'立即兑换',canRedeem:true};
}
module.exports={call,pendingKey,statusLabel,orderView,actionState};
