const cloudPreview=require('../../utils/home-cloud');
const homeProducts=require('../../utils/home-products');
const categoryNames=require('../../utils/product-categories');
const tabs=require('../../utils/tabs');
Page({
 data:{loading:true,banner:'',products:[],shown:[],categories:['全部商品'],active:'全部商品',keyword:'',cartCount:0},
 onLoad(){this.applyResult(cloudPreview.peek(),true);this.load();},
 onShow(){tabs.sync('products');this.updateCartCount();},
 updateCartCount(){const cart=wx.getStorageSync('shopCart')||[];const cartCount=cart.filter(i=>i.catalogSource===homeProducts.source()).reduce((n,i)=>n+(Number(i.qty)||1),0);if(cartCount!==this.data.cartCount)this.setData({cartCount});},
 openCart(){wx.navigateTo({url:'/pages/checkout/checkout?mode=cart&source='+homeProducts.source()});},
 async onPullDownRefresh(){try{await this.load();}finally{wx.stopPullDownRefresh();}},
 applyResult(result,fromCache){
  if(!result||!result.config)return false;
  const config=result.config||{blocks:[]},productBlocks=config.blocks.filter(b=>b.visible&&b.type==='products'),poster=config.blocks.find(b=>b.visible&&b.type==='poster'&&b.items&&b.items[0]&&b.items[0].image),items=homeProducts.hydrate(productBlocks,result.products||[],result.catalogSource);
  const products=items.flatMap(b=>b.items).map((p,index)=>({...p,category:(p.category||'荧光棒').trim()||'荧光棒',sort:index})),categories=categoryNames(config,products);
  const banner=poster?.items[0]?.image||'';
  const fp=[banner,categories.join(','),products.map(p=>[p.sku,p.title,homeProducts.imageKey(p.image),p.priceText,p.available].join(':')).join('|')].join('#');
  if(fp===this._fp){if(this.data.loading)this.setData({loading:false});if(!fromCache&&result.error)wx.showToast({title:result.error,icon:'none'});return true;}
  this._fp=fp;
  this.setData({banner,products,categories,active:categories.includes(this.data.active)?this.data.active:'全部商品',loading:false});
  this.updateCartCount();
  this.apply();
  if(!fromCache&&result.error)wx.showToast({title:result.error,icon:'none'});
  return true;
 },
 async load(){if(!this.data.products.length)this.setData({loading:true});this.applyResult(await cloudPreview.load(),false);},
 onSearch(e){this.setData({keyword:e.detail.value});this.apply();},
 chooseCategory(e){this.setData({active:e.currentTarget.dataset.name});this.apply();},
 apply(){const key=(this.data.keyword||'').trim().toLowerCase(),active=this.data.active,shown=this.data.products.filter(p=>(active==='全部商品'||p.category===active)&&(!key||(p.title||'').toLowerCase().includes(key))),fp=active+'|'+key+'|'+shown.map(p=>p.sku).join(',');if(fp===this._shownFp)return;this._shownFp=fp;this.setData({shown});},
 openProduct(e){const snapshot=homeProducts.snapshotFrom(e.currentTarget.dataset.sku);if(!snapshot)return;wx.setStorageSync('topuyi_home_dev_product_detail_v1',snapshot);wx.navigateTo({url:'/pages/home-product-detail/home-product-detail?sku='+encodeURIComponent(snapshot.sku)});},
 async addCart(e){try{await homeProducts.add(e.currentTarget.dataset.sku);this.updateCartCount();wx.showToast({title:'已加入购物车',icon:'success'});}catch(error){wx.showToast({title:error.message,icon:'none'});}}
});
