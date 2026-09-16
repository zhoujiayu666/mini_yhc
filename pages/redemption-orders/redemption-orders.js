const redemption=require('../../utils/redemption-cloud');
const {isLoggedIn,goLoginPage}=require('../../utils/auth');
Page({
 data:{loggedIn:false,loading:false,error:'',orders:[],hasMore:false},
 onShow(){this.load(true);},
 onPullDownRefresh(){this.load(true).finally(()=>wx.stopPullDownRefresh());},
 onUnload(){this._sequence=(this._sequence||0)+1;},
 login(){goLoginPage('登录后查看积分兑换订单');},
 async load(reset){
  if(this._loading)return;const n=this._sequence=(this._sequence||0)+1;
  if(!isLoggedIn()){this.setData({loggedIn:false,orders:[],error:'',hasMore:false});return;}
  this._loading=true;this.setData({loggedIn:true,loading:true,error:''});
  try{const r=await redemption.call('redemptionOrders',{offset:reset?0:this.data.orders.length});if(n!==this._sequence||!isLoggedIn())return;const incoming=r.orders.map(redemption.orderView);this.setData({orders:reset?incoming:[...this.data.orders,...incoming.filter(o=>!this.data.orders.some(p=>p.id===o.id))],hasMore:r.hasMore});}
  catch(e){if(n===this._sequence)this.setData({error:e.message||'读取订单失败，请重试'});}
  finally{this._loading=false;if(n===this._sequence)this.setData({loading:false});}
 },
 retry(){this.load(true);},more(){this.load(false);},
 open(e){wx.navigateTo({url:'/pages/redemption-order/redemption-order?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 browse(){require('../../utils/tabs').open('/pages/member/member');}
});
