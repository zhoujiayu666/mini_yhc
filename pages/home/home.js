const template=require('../../utils/home-template');
const homeProducts=require('../../utils/home-products');
const cloudPreview=require('../../utils/home-cloud');
const tabs=require('../../utils/tabs');
const FRESH_MS=60000;
Page({
 data:{blocks:[],preview:false,editable:false,cloudStatus:'',syncing:false,cartCount:0},
 onLoad(options){
  const preview=options.preview==='1'&&template.canEdit();
  this.setData({preview,editable:template.canEdit()});
  this.applyCache();
 },
 onShow(){
  tabs.sync('home');
  if(this.consumePreviewFlag()){this.updateCartCount();return;}
  this.updateCartCount();
  if(!this.data.preview&&this.data.blocks.length&&Date.now()-(this._freshAt||0)<FRESH_MS)return;
  this.refreshHome();
 },
 consumePreviewFlag(){
  if(!template.canEdit())return false;
  try{
   if(!wx.getStorageSync('topuyi_home_open_preview_v1'))return false;
   wx.removeStorageSync('topuyi_home_open_preview_v1');
  }catch(_){return false;}
  if(!this.data.preview)this.setData({preview:true});
  this.refreshHome();
  return true;
 },
 updateCartCount(){const cart=wx.getStorageSync('shopCart')||[];const cartCount=cart.filter(i=>i.catalogSource===homeProducts.source()).reduce((n,i)=>n+(Number(i.qty)||1),0);if(cartCount!==this.data.cartCount)this.setData({cartCount});},
 openCart(){wx.navigateTo({url:'/pages/checkout/checkout?mode=cart&source='+homeProducts.source()});},
 paintBlocks(blocks,extra){
  const next=homeProducts.reuseBlockImages(this.data.blocks,blocks);
  const fp=homeProducts.blocksFingerprint(next);
  if(fp===this._fp){if(extra)this.setData(extra);return false;}
  this._fp=fp;
  this.setData({blocks:next,...(extra||{})});
  return true;
 },
 applyCache(){
  if(this.data.preview)return;
  const cached=cloudPreview.peek();
  if(!cached)return;
  this.paintBlocks(homeProducts.hydrate(cached.config.blocks.filter(b=>b.visible),cached.products||[],cached.catalogSource),{cloudStatus:cached.status});
  this.updateCartCount();
 },
 async onPullDownRefresh(){this._freshAt=0;try{await this.refreshHome();}finally{wx.stopPullDownRefresh();}},
 async refreshHome(){
   const sequence=(this._sequence||0)+1;this._sequence=sequence;
   if(this.data.preview){const blocks=homeProducts.hydrate(template.read(template.PREVIEW).blocks.filter(b=>b.visible));if(this._sequence===sequence)this.paintBlocks(blocks);return;}
   if(!this.data.blocks.length)this.setData({syncing:true});
   const result=await cloudPreview.load();if(this._sequence!==sequence)return;
   const blocks=homeProducts.hydrate(result.config.blocks.filter(b=>b.visible),result.products||[],result.catalogSource);if(this._sequence!==sequence)return;
   this._freshAt=result.error?0:Date.now();
   this.paintBlocks(blocks,{cloudStatus:result.status,syncing:false});
   this.updateCartCount();
   if(result.error)wx.showToast({title:result.error,icon:'none'});
 },
 connectDesktop(){
   if(!this.data.editable)return;
   wx.showModal({title:'连接电脑后台',content:cloudPreview.getCode(),editable:true,placeholderText:'粘贴后台同步后显示的 32 位预览码',success:res=>{
     if(!res.confirm)return;try{cloudPreview.setCode((res.content||'').trim());this.setData({preview:false});this._freshAt=0;this.refreshHome();}catch(e){wx.showToast({title:e.message,icon:'none'});}
   }});
 },
 edit(){wx.navigateTo({url:'/pages/home-editor/home-editor'});},
 async addProduct(e){if(this._adding)return;this._adding=true;try{await homeProducts.add(e.currentTarget.dataset.sku);this.updateCartCount();wx.showToast({title:'已加入购物车',icon:'success'});}catch(error){wx.showToast({title:error.message,icon:'none'});}finally{this._adding=false;}},
 openProduct(e){const sku=e.currentTarget.dataset.sku;if(!sku)return;const snapshot=homeProducts.snapshotFrom(sku);if(!snapshot){wx.showToast({title:'商品信息不存在',icon:'none'});return;}wx.setStorageSync('topuyi_home_dev_product_detail_v1',snapshot);wx.navigateTo({url:'/pages/home-product-detail/home-product-detail?sku='+encodeURIComponent(sku)});},
 open(e){const data=e.currentTarget.dataset;if(data.blockId==='default-community'){const block=this.data.blocks.find(b=>b.id===data.blockId),item=block&&block.items.find(i=>i.id===data.itemId);if(!item)return;wx.setStorageSync('topuyi_home_content_detail_v1',{id:item.id,title:item.title||'内容详情',text:item.subtitle||'',image:item.image||''});wx.navigateTo({url:'/pages/home-content-detail/home-content-detail?id='+encodeURIComponent(item.id)});return;}template.navigate(data.target);},
 onShareAppMessage(){return {title:'TOPUYI 拓普依智能灯光',path:'/pages/home/home'};}
});
