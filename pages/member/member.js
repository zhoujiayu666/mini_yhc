const memberCloud=require('../../utils/member-cloud');
const tabs=require('../../utils/tabs');
function hasContent(c){return !!(c&&(c.hero.visible||c.banner.visible||c.entries.visible||c.products.items.length));}
function configFp(c){
 if(!c)return '';
 const img=src=>String(src||'').split('?')[0];
 return [c.hero?.visible,img(c.hero?.image),c.hero?.height,c.banner?.visible,img(c.banner?.image),c.banner?.height,c.entries?.visible,c.entries?.height,(c.entries?.items||[]).map(i=>i.id+img(i.image)).join(','),c.products?.visible,c.products?.title,(c.products?.items||[]).map(i=>i.id+i.title+i.points+img(i.image)).join(',')].join('|');
}
Page({
 data:{config:null,loading:true,error:'',mediaError:false,hasContent:false},
 onLoad(){const cached=memberCloud.peek();if(cached.config){this._fp=configFp(cached.config);this.setData({config:cached.config,loading:false,hasContent:hasContent(cached.config)});}},
 onShow(){tabs.sync('member');this.loadContent();},
 onPullDownRefresh(){this.loadContent(true).finally(()=>wx.stopPullDownRefresh());},
 async loadContent(force){if(this._loading)return;if(!force&&this.data.config&&Date.now()-(this._freshAt||0)<60000)return;this._loading=true;if(!this.data.config)this.setData({loading:true,error:'',mediaError:false});try{const value=await memberCloud.load(),c=value.config,fp=configFp(c);this._freshAt=value.error?0:Date.now();if(fp===this._fp)this.setData({error:value.error||'',loading:false});else{this._fp=fp;this.setData({config:c,error:value.error||'',hasContent:hasContent(c),loading:false});}}finally{this._loading=false;this.setData({loading:false});}},
 onMediaError(){this.setData({mediaError:true});},
 openEntry(e){const id=e.currentTarget.dataset.id,item=this.data.config?.entries.items.find(i=>i.id===id);if(item?.enabled)wx.navigateTo({url:'/pages/member-content/member-content?kind=entry&id='+encodeURIComponent(id)});},
 openProduct(e){const id=e.currentTarget.dataset.id;if(!this.data.config?.products.items.some(p=>p.id===id))return;wx.navigateTo({url:'/pages/member-content/member-content?kind=product&id='+encodeURIComponent(id)});}
});
