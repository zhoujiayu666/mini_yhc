const redemption=require('../../utils/redemption-cloud');
const {isLoggedIn,goLoginPage}=require('../../utils/auth');
Page({
 data:{loading:true,error:'',order:null,success:false,receiving:false,loggedIn:false},
 onLoad(options){this._id=options.id||'';this.setData({success:options.success==='1'});},
 onShow(){this.load();},
 onUnload(){this._sequence=(this._sequence||0)+1;},
 onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh());},
 login(){goLoginPage('登录后查看兑换订单');},
 async load(){const n=this._sequence=(this._sequence||0)+1;if(!isLoggedIn()){this.setData({loggedIn:false,order:null,loading:false});return;}this.setData({loading:true,loggedIn:true,error:''});try{const r=await redemption.call('redemptionOrder',{orderId:this._id});if(n===this._sequence&&isLoggedIn())this.setData({order:redemption.orderView(r.order)});}catch(e){if(n===this._sequence)this.setData({error:e.message||'订单暂未加载，请重试'});}finally{if(n===this._sequence)this.setData({loading:false});}},
 copyTracking(){if(this.data.order?.shipping?.trackingNo)wx.setClipboardData({data:this.data.order.shipping.trackingNo});},
 async receive(){if(this.data.receiving||this.data.order?.status!=='shipped')return;const answer=await wx.showModal({title:'确认收货',content:'请确认已收到兑换商品。',confirmText:'已收到'});if(!answer.confirm||this.data.receiving)return;this.setData({receiving:true});try{const r=await redemption.call('redemptionReceive',{orderId:this._id});this.setData({order:redemption.orderView(r.order)});}catch(e){this.setData({error:e.message});}finally{this.setData({receiving:false});}},
 orders(){wx.redirectTo({url:'/pages/redemption-orders/redemption-orders'});},
 browse(){require('../../utils/tabs').open('/pages/member/member');}
});
