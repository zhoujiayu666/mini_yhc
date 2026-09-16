const homeProducts=require('../../utils/home-products');
const homeCloud=require('../../utils/home-cloud');
const DETAIL_KEY='topuyi_home_dev_product_detail_v1';
function snapshotProduct(sku){
 try{
  const saved=wx.getStorageSync(DETAIL_KEY);
  if(!saved||saved.sku!==sku)return null;
  const coverImage=saved.coverImage||'';
  const uploaded=Array.isArray(saved.detailImages)?saved.detailImages:[];
  return {...saved,detailImages:[...new Set([coverImage,...uploaded].filter(src=>typeof src==='string'&&src.trim()).map(src=>src.trim()))],detailBlocks:saved.detailBlocks||[]};
 }catch(_){return null;}
}
Page({
 data:{product:null,loading:true,error:'',imageIndex:0},
 onLoad(options){
  this._sku=options?.sku||'';
  const cached=homeCloud.peek();
  if(cached)homeProducts.hydrate(cached.config.blocks,cached.products||[],cached.catalogSource);
  const local=snapshotProduct(this._sku)||homeProducts.snapshotFrom(this._sku);
  if(local)this.setData({product:local,loading:false,imageIndex:0});
  if(!local||!homeProducts.get(this._sku))this.loadProduct();
 },
 paintProduct(product,extra){
  if(!product)return;
  if(homeProducts.viewFingerprint(product)===homeProducts.viewFingerprint(this.data.product)){if(extra)this.setData(extra);return;}
  const prev=this.data.product;
  if(prev&&Array.isArray(prev.detailImages)&&Array.isArray(product.detailImages)){
   product={...product,detailImages:product.detailImages.map((src,i)=>{const old=prev.detailImages[i];return old&&homeProducts.imageKey(old)===homeProducts.imageKey(src)?old:src;})};
  }
  this.setData({product,...(extra||{})});
 },
 async loadProduct(){
  if(!this.data.product)this.setData({loading:true,error:''});
  try{
   const result=await homeCloud.load();
   homeProducts.hydrate(result.config.blocks,result.products||[],result.catalogSource);
   const product=homeProducts.snapshotFrom(this._sku);
   if(!product){if(!this.data.product)throw Error(result.error||'商品已下架或不存在');this.setData({loading:false,error:result.error||''});return;}
   this.paintProduct(product,{loading:false,error:result.error||'',imageIndex:Math.min(this.data.imageIndex,Math.max(0,product.detailImages.length-1))});
  }catch(error){this.setData({error:this.data.product?'':(error.message||'商品加载失败，请重试'),loading:false});}
 },
 onImageChange(e){const index=Number(e.detail.current),count=this.data.product?.detailImages.length||0;if(Number.isInteger(index)&&index>=0&&index<count&&index!==this.data.imageIndex)this.setData({imageIndex:index});},
 changeImage(e){const count=this.data.product?.detailImages.length||0;if(count<2)return;const step=Number(e.currentTarget.dataset.step);if(step!==1&&step!==-1)return;this.setData({imageIndex:(this.data.imageIndex+step+count)%count});},
 previewImage(e){const images=this.data.product?.detailImages||[],src=images[Number(e.currentTarget.dataset.index)||0];if(src)wx.previewImage({current:src,urls:images});},
 async addCart(){if(!this.data.product)return;try{await homeProducts.add(this.data.product.sku);const res=await wx.showModal({title:'已加入购物车',content:'是否现在进入结算并下单？',confirmText:'去结算',cancelText:'继续浏览'});if(res.confirm)wx.navigateTo({url:'/pages/checkout/checkout?mode=cart&source='+this.data.product.catalogSource});}catch(error){wx.showToast({title:error.message,icon:'none'});}},
 buyNow(){const product=this.data.product;if(!product)return;wx.navigateTo({url:'/pages/checkout/checkout?mode=buy&source='+product.catalogSource+'&sku='+encodeURIComponent(product.sku)+'&qty=1'});}
});
