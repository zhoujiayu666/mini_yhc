const homeProducts=require('../../utils/home-products');
const homeCloud=require('../../utils/home-cloud');
Page({
 data:{product:null,loading:true,error:'',imageIndex:0},
 async onLoad(options){this._sku=options?.sku||'';await this.loadProduct();},
 async loadProduct(){
  this.setData({loading:true,error:''});
  try{
   const result=await homeCloud.load();
   await homeProducts.hydrate(result.config.blocks,result.products||[],result.catalogSource);
   const base=homeProducts.get(this._sku),item=result.config.blocks.flatMap(b=>b.type==='products'?b.items:[]).find(i=>i.sku===this._sku);
   if(!base||!item)throw Error(result.error||'商品已下架或不存在');
   const coverImage=item.image||base.coverImage||'';
   const uploaded=Array.isArray(item.detailImages)?item.detailImages:base.detailImages||[];
   const detailImages=[...new Set([coverImage,...uploaded].filter(src=>typeof src==='string'&&src.trim()).map(src=>src.trim()))];
   this.setData({imageIndex:0,product:{...base,catalogSource:homeProducts.source(),name:item.title||base.name,coverImage,detailImages,detailBlocks:item.detailBlocks||[],detail:item.subtitle||base.detail||'暂无商品详情'}});
  }catch(error){this.setData({error:error.message||'商品加载失败，请重试'});}finally{this.setData({loading:false});}
 },
 onImageChange(e){const index=Number(e.detail.current),count=this.data.product?.detailImages.length||0;if(Number.isInteger(index)&&index>=0&&index<count)this.setData({imageIndex:index});},
 changeImage(e){const count=this.data.product?.detailImages.length||0;if(count<2)return;const step=Number(e.currentTarget.dataset.step);if(step!==1&&step!==-1)return;this.setData({imageIndex:(this.data.imageIndex+step+count)%count});},
 previewImage(e){const images=this.data.product?.detailImages||[],src=images[Number(e.currentTarget.dataset.index)||0];if(src)wx.previewImage({current:src,urls:images});},
 async addCart(){if(!this.data.product)return;try{await homeProducts.add(this.data.product.sku);const res=await wx.showModal({title:'已加入购物车',content:'是否现在进入结算并下单？',confirmText:'去结算',cancelText:'继续浏览'});if(res.confirm)wx.navigateTo({url:'/pages/checkout/checkout?mode=cart&source='+this.data.product.catalogSource});}catch(error){wx.showToast({title:error.message,icon:'none'});}},
 buyNow(){const product=this.data.product;if(!product)return;wx.navigateTo({url:'/pages/checkout/checkout?mode=buy&source='+product.catalogSource+'&sku='+encodeURIComponent(product.sku)+'&qty=1'});}
});
