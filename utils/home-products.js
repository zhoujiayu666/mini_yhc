let current=[],listings=[],catalogSource='home_live';
function source(){return catalogSource;}
function imageKey(src){return String(src||'').split('?')[0];}
function listing(sku){return listings.find(i=>i.sku===sku)||null;}
function slimItem(i){return {id:i.id,sku:i.sku,title:i.title,image:i.image,subtitle:i.subtitle||'',available:i.available,price:i.price,originalPrice:i.originalPrice,priceText:i.priceText,originalPriceText:i.originalPriceText,category:i.category||''};}
function slimBlock(b){
 if(b.type!=='products')return b;
 return {id:b.id,type:b.type,title:b.title,subtitle:b.subtitle,visible:b.visible,showHeading:b.showHeading,background:b.background,spacing:b.spacing,height:b.height,columns:b.columns,items:b.items.map(slimItem)};
}
function blocksFingerprint(blocks){
 return (blocks||[]).map(b=>[b.id,b.type,b.title,b.subtitle,b.height,b.background,b.spacing,b.columns,b.video||'',(b.items||[]).map(i=>[i.id||i.sku,i.title,imageKey(i.image),i.priceText,i.available,i.target,i.subtitle]).join(',')].join(':')).join('|');
}
function reuseBlockImages(prev,next){
 if(!Array.isArray(prev)||!Array.isArray(next))return next;
 const old=new Map();
 prev.forEach(b=>(b.items||[]).forEach(i=>{const k=i.id||i.sku;if(k&&i.image)old.set(String(k),i.image);}));
 return next.map(b=>{
  if(!b.items)return b;
  return {...b,items:b.items.map(i=>{
   const prevSrc=old.get(String(i.id||i.sku||''));
   if(prevSrc&&i.image&&imageKey(prevSrc)===imageKey(i.image))return {...i,image:prevSrc};
   return i;
  })};
 });
}
function viewFingerprint(p){
 if(!p)return '';
 return [p.sku,p.name||p.title,p.price,p.originalPrice,p.detail,(p.detailImages||p.mainImages||[]).map(imageKey).join(','),(p.detailBlocks||[]).map(b=>(b.id||'')+imageKey(b.image||'')+(b.text||'')).join(';')].join('|');
}
function hydrate(blocks,products=[],from='home_live'){
 catalogSource=from==='home_dev'?'home_dev':'home_live';
 const result=blocks.map(b=>b.type!=='products'?b:{...b,items:b.items.map(i=>{const p=products.find(p=>p.sku===i.sku),price=Number(p?.price??i.price),original=Number(p?.originalPrice??i.originalPrice);return {...i,title:i.title||p?.name||'',image:i.image||p?.coverImage||'',available:!!p&&(p.manageStock===false||Number(p.stock)>0),price,originalPrice:original,priceText:Number.isFinite(price)?price.toFixed(2):'',originalPriceText:Number.isFinite(original)&&original>price?original.toFixed(2):''};})});
 listings=result.flatMap(b=>b.type==='products'?b.items:[]);
 current=products.map(p=>{const i=listings.find(v=>v.sku===p.sku);return i?{...p,price:i.price,originalPrice:i.originalPrice}:p;});
 return result.map(slimBlock);
}
async function add(sku){if(!sku)throw Error('请先在运营后台选择商品');const product=current.find(p=>p.sku===sku);if(!product)throw Error('商品信息已更新，请刷新后重试');if(product.manageStock!==false&&!(Number(product.stock)>0))throw Error('商品暂时缺货');const key='shopCart',cart=wx.getStorageSync(key)||[],found=cart.find(i=>i.catalogSource===catalogSource&&(i.sku||i.id)===sku);if(found){if(Number(found.qty)>=99)throw Error('每件商品最多购买99件');found.qty=(Number(found.qty)||1)+1;}else cart.push({sku,id:sku,productId:product._id||product.productId||'',name:product.name,price:Number(product.price)||0,priceFen:Math.round((Number(product.price)||0)*100),qty:1,catalogSource});wx.setStorageSync(key,cart);return cart;}
function get(sku){return current.find(p=>p.sku===sku)||null;}
function snapshotFrom(sku){
 const product=get(sku),item=listing(sku);
 if(!product&&!item)return null;
 const coverImage=item?.image||product?.coverImage||'';
 const uploaded=item?.detailImages?.length?item.detailImages:product?.detailImages||[];
 return {...(product||{}),catalogSource:source(),sku,name:item?.title||product?.name||'商品详情',coverImage,detailImages:[...new Set([coverImage,...uploaded].filter(src=>typeof src==='string'&&src.trim()).map(src=>src.trim()))],detailBlocks:item?.detailBlocks||[],price:item?.price??product?.price,originalPrice:item?.originalPrice??product?.originalPrice,detail:item?.subtitle||product?.detail||'暂无商品详情'};
}
module.exports={hydrate,add,get,source,listing,snapshotFrom,blocksFingerprint,reuseBlockImages,viewFingerprint,imageKey};
