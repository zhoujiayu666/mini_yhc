const memberCloud=require('../../utils/member-cloud');
Page({
 data:{config:null,loading:true,error:'',mediaError:false,hasContent:false},
 onShow(){this.loadContent();},
 onPullDownRefresh(){this.loadContent().finally(()=>wx.stopPullDownRefresh());},
 async loadContent(){if(this._loading)return;this._loading=true;this.setData({loading:true,error:'',mediaError:false});try{const value=await memberCloud.load(),c=value.config;this.setData({config:c,error:value.error||'',hasContent:!!(c&&(c.hero.visible||c.banner.visible||c.entries.visible||c.products.items.length))});}finally{this._loading=false;this.setData({loading:false});}},
 onMediaError(){this.setData({mediaError:true});},
 openEntry(e){const id=e.currentTarget.dataset.id,item=this.data.config?.entries.items.find(i=>i.id===id);if(item?.enabled)wx.navigateTo({url:'/pages/member-content/member-content?kind=entry&id='+encodeURIComponent(id)});},
 openProduct(e){const id=e.currentTarget.dataset.id;if(!this.data.config?.products.items.some(p=>p.id===id))return;wx.navigateTo({url:'/pages/member-content/member-content?kind=product&id='+encodeURIComponent(id)});}
});
