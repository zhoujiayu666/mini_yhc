let current=[],catalogSource='home_live';
function source(){return catalogSource;}
async function hydrate(blocks,products=[],from='home_live'){
 catalogSource=from==='home_dev'?'home_dev':'home_live';
 const result=blocks.map(b=>b.type!=='products'?b:{...b,items:b.items.map(i=>{const p=products.find(p=>p.sku===i.sku),price=Number(p?.price??i.price),original=Number(p?.originalPrice??i.originalPrice);return {...i,title:i.title||p?.name||'',image:i.image||p?.coverImage||'',available:!!p&&(p.manageStock===false||Number(p.stock)>0),price,originalPrice:original,priceText:Number.isFinite(price)?price.toFixed(2):'',originalPriceText:Number.isFinite(original)&&original>price?original.toFixed(2):''};})});
 const configured=result.flatMap(b=>b.type==='products'?b.items:[]);current=products.map(p=>{const i=configured.find(v=>v.sku===p.sku);return i?{...p,price:i.price,originalPrice:i.originalPrice}:p;});
 return result;
}
async function add(sku){if(!sku)throw Error('请先在运营后台选择商品');const product=current.find(p=>p.sku===sku);if(!product)throw Error('商品信息已更新，请刷新后重试');if(product.manageStock!==false&&!(Number(product.stock)>0))throw Error('商品暂时缺货');const key='shopCart',cart=wx.getStorageSync(key)||[],found=cart.find(i=>i.catalogSource===catalogSource&&(i.sku||i.id)===sku);if(found){if(Number(found.qty)>=99)throw Error('每件商品最多购买99件');found.qty=(Number(found.qty)||1)+1;}else cart.push({sku,id:sku,productId:product._id||product.productId||'',name:product.name,price:Number(product.price)||0,priceFen:Math.round((Number(product.price)||0)*100),qty:1,catalogSource});wx.setStorageSync(key,cart);return cart;}
function get(sku){return current.find(p=>p.sku===sku)||null;}
module.exports={hydrate,add,get,source};
