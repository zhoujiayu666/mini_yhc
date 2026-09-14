const template=require('../../utils/home-template');
const homeProducts=require('../../utils/home-products');
const cloudPreview=require('../../utils/home-cloud');
Page({
 data:{blocks:[],preview:false,editable:false,cloudStatus:'',syncing:false,cartCount:0},
 onLoad(options){this.setData({preview:options.preview==='1'&&template.canEdit(),editable:template.canEdit()});},
 onShow(){this.updateCartCount();this.refreshHome();},
 updateCartCount(){const cart=wx.getStorageSync('shopCart')||[];this.setData({cartCount:cart.filter(i=>i.catalogSource===homeProducts.source()).reduce((n,i)=>n+(Number(i.qty)||1),0)});},
 openCart(){wx.navigateTo({url:'/pages/checkout/checkout?mode=cart&source='+homeProducts.source()});},
 async onPullDownRefresh(){try{await this.refreshHome();}finally{wx.stopPullDownRefresh();}},
 async refreshHome(){
   const sequence=(this._sequence||0)+1;this._sequence=sequence;
   if(this.data.preview){const blocks=await homeProducts.hydrate(template.read(template.PREVIEW).blocks.filter(b=>b.visible));if(this._sequence===sequence)this.setData({blocks});return;}
   this.setData({syncing:true});
   const result=await cloudPreview.load();if(this._sequence!==sequence)return;
   const blocks=await homeProducts.hydrate(result.config.blocks.filter(b=>b.visible),result.products||[],result.catalogSource);if(this._sequence!==sequence)return;
   this.setData({blocks,cloudStatus:result.status,syncing:false});this.updateCartCount();
   if(result.error)wx.showToast({title:result.error,icon:'none'});
 },
 connectDesktop(){
   if(!this.data.editable)return;
   wx.showModal({title:'连接电脑后台',content:cloudPreview.getCode(),editable:true,placeholderText:'粘贴后台同步后显示的 32 位预览码',success:res=>{
     if(!res.confirm)return;try{cloudPreview.setCode((res.content||'').trim());this.setData({preview:false});this.refreshHome();}catch(e){wx.showToast({title:e.message,icon:'none'});}
   }});
 },
 edit(){wx.navigateTo({url:'/pages/home-editor/home-editor'});},
 async addProduct(e){if(this._adding)return;this._adding=true;try{await homeProducts.add(e.currentTarget.dataset.sku);this.updateCartCount();wx.showToast({title:'已加入购物车',icon:'success'});}catch(error){wx.showToast({title:error.message,icon:'none'});}finally{this._adding=false;}},
 openProduct(e){const sku=e.currentTarget.dataset.sku;if(!sku)return;const product=homeProducts.get(sku),item=this.data.blocks.flatMap(b=>b.type==='products'?b.items:[]).find(i=>i.sku===sku);if(!product&&!item){wx.showToast({title:'商品信息不存在',icon:'none'});return;}const coverImage=item?.image||product?.coverImage||'',detailImages=item?.detailImages?.length?item.detailImages:(coverImage?[coverImage]:[]);wx.setStorageSync('topuyi_home_dev_product_detail_v1',{...(product||{}),catalogSource:homeProducts.source(),sku,name:item?.title||product?.name||'商品详情',coverImage,detailImages,detailBlocks:item?.detailBlocks||[],price:item?.price??product?.price,originalPrice:item?.originalPrice??product?.originalPrice,detail:item?.subtitle||product?.detail||'暂无商品详情'});wx.navigateTo({url:'/pages/home-product-detail/home-product-detail?sku='+encodeURIComponent(sku)});},
 open(e){const data=e.currentTarget.dataset;if(data.blockId==='default-community'){const block=this.data.blocks.find(b=>b.id===data.blockId),item=block&&block.items.find(i=>i.id===data.itemId);if(!item)return;wx.setStorageSync('topuyi_home_content_detail_v1',{id:item.id,title:item.title||'内容详情',text:item.subtitle||'',image:item.image||''});wx.navigateTo({url:'/pages/home-content-detail/home-content-detail?id='+encodeURIComponent(item.id)});return;}template.navigate(data.target);},
 onShareAppMessage(){return {title:'TOPUYI 拓普依智能灯光',path:'/pages/home/home'};}
});
