const redemption=require('../../utils/redemption-cloud');
const {isLoggedIn,goLoginPage}=require('../../utils/auth');
const {callShopService}=require('../../utils/shop-cloud');
async function loadAddresses(){let timer;try{return await Promise.race([callShopService({action:'listAddresses'}),new Promise(resolve=>{timer=setTimeout(()=>resolve({success:false}),10000);})]);}finally{clearTimeout(timer);}}
Page({
 data:{loading:true,error:'',quote:null,quantity:1,totalPoints:0,address:null,addressError:'',submitting:false,pending:false,buttonText:'确认兑换',canSubmit:false,loggedIn:false,successOrderId:''},
 onLoad(options){this._id=options.id||'';},
 onShow(){this.refresh();},
 onUnload(){this._sequence=(this._sequence||0)+1;},
 onLogin(){goLoginPage('登录后使用积分兑换商品');},
 async refresh(){
  const n=this._sequence=(this._sequence||0)+1;
  if(this.data.submitting)return;
  if(!isLoggedIn()){this.setData({loading:false,loggedIn:false,quote:null,address:null,pending:false,error:''});return;}
  this._key=redemption.pendingKey(this._id);this._pending=wx.getStorageSync(this._key)||null;
  this.setData({loading:true,error:'',addressError:'',loggedIn:true,pending:!!this._pending});
  if(this._pending){this.setData({loading:false,quantity:this._pending.quantity,totalPoints:this._pending.totalPoints,quote:this._pending.quote,address:this._pending.address,buttonText:'重试确认',canSubmit:true,error:'上次兑换结果尚未确认，请重试确认。同一次请求不会重复扣积分。'});return;}
  try{
   const [quote,addresses]=await Promise.all([redemption.call('redemptionQuote',{productId:this._id}),loadAddresses()]);
   if(n!==this._sequence||!isLoggedIn())return;
   if(!quote.isMember){this.setData({loggedIn:false,quote:null,address:null});return;}
   const selected=wx.getStorageSync('redemptionSelectedAddressId');wx.removeStorageSync('redemptionSelectedAddressId');
   const list=addresses.success?addresses.addresses||[]:[],previous=selected||this.data.address?.id;
   const address=list.find(a=>a.id===previous)||list.find(a=>a.isDefault)||list[0]||null;
   this.setData({quote,address,addressError:addresses.success?'':'收货地址加载失败，请重试',quantity:quote.stock==null?this.data.quantity:Math.min(this.data.quantity,Math.max(1,quote.stock)),error:''});this.recalculate();
  }catch(e){if(n===this._sequence)this.setData({error:e.message||'加载失败，请重试',canSubmit:false});}finally{if(n===this._sequence)this.setData({loading:false});}
 },
 recalculate(){const q=this.data.quote;if(!q)return;const state=redemption.actionState(q,true,this.data.quantity);this.setData({totalPoints:q.product.points*this.data.quantity,buttonText:state.canRedeem?'确认兑换':state.buttonText,canSubmit:state.canRedeem&&!!this.data.address&&!this.data.addressError});},
 changeQuantity(e){if(this.data.submitting||this.data.pending)return;const delta=Number(e.currentTarget.dataset.step),qty=this.data.quantity+delta;if(![-1,1].includes(delta)||qty<1||qty>99||(this.data.quote.stock!=null&&qty>this.data.quote.stock))return;this.setData({quantity:qty});this.recalculate();},
 chooseAddress(){if(this.data.submitting||this.data.pending)return;wx.navigateTo({url:'/pages/address-list/address-list?from=redemption'});},
 async submit(){
  if(this.data.submitting||!this.data.canSubmit||!isLoggedIn())return;
  if(this.data.successOrderId)return this.viewSuccess();
  const key=redemption.pendingKey(this._id);if(key!==this._key)return this.refresh();
  let pending=wx.getStorageSync(key)||null;
  if(!pending){const {quote,quantity,address,totalPoints}=this.data;pending={productId:this._id,quantity,addressId:address.id,offerVersion:quote.offerVersion,requestId:'redeem_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2),quote,address,totalPoints};try{wx.setStorageSync(key,pending);}catch(_){this.setData({error:'暂时无法保存兑换请求，请清理微信存储后重试'});return;}}
  this._pending=pending;this.setData({submitting:true,pending:true,error:''});
  try{
   const r=await redemption.call('redemptionCreate',{productId:pending.productId,quantity:pending.quantity,addressId:pending.addressId,offerVersion:pending.offerVersion,requestId:pending.requestId});
   this.setData({successOrderId:r.order.id,pending:false,buttonText:'查看兑换订单',canSubmit:true});
   wx.removeStorageSync(key);this._pending=null;
   if(redemption.pendingKey(this._id)!==key||!isLoggedIn())return;
   this.viewSuccess();
  }catch(e){
   if(redemption.pendingKey(this._id)!==key||!isLoggedIn())return;
   if(e.code&&e.code!=='UNAVAILABLE'){wx.removeStorageSync(key);this._pending=null;this.setData({pending:false});await this.refresh();this.setData({error:e.message});}
   else this.setData({pending:true,canSubmit:true,buttonText:'重试确认',error:'暂未确认兑换结果，请重试确认。重复确认不会重复扣积分。'});
  }finally{this.setData({submitting:false});}
 },
 viewSuccess(){wx.redirectTo({url:'/pages/redemption-order/redemption-order?id='+encodeURIComponent(this.data.successOrderId)+'&success=1',fail:()=>this.setData({error:'兑换成功，请点击“查看兑换订单”查看详情。'})});}
});
