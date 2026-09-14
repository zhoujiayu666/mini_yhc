const {randomBytes}=require('node:crypto');
const {productRecords,writeProducts}=require('./owned-products');
const LIVE='topuyi_storefront_live_v1',PRODUCTS='topuyi_home_products_live_v1';
async function read(db,collection,id){const r=await db.collection(collection).doc(id).get();return Array.isArray(r.data)?r.data[0]:r.data;}
function publicationConfig(config){
  const result=JSON.parse(JSON.stringify(config));
  result.blocks=result.blocks.filter(block=>block.visible);
  const products=productRecords(result,'published');
  if(!products.length)throw Error('请至少添加一个可购买商品后再发布。');
  const invalid=products.find(product=>!product.active||!product.image);
  if(invalid)throw Error(`商品“${invalid.name||'未填写标题'}”需要填写标题、有效售价和商品图片。`);
  return result;
}
async function publish(db,config,event,user){
  const published=publicationConfig(config);
  return db.runTransaction(async tx=>{
    const [draft,before]=await Promise.all([read(tx,'topuyi_ops_content_v1','draft'),read(tx,LIVE,'active')]);
    if(draft?.revision!==event.expectedDraftRevision)throw Error('共享草稿已更新，请刷新后台后重新发布。');
    if((before?.revision||null)!==(event.expectedRevision||null))throw Error('正式内容已更新，请重新检查发布状态。');
    const revision=randomBytes(12).toString('hex'),updatedAt=new Date().toISOString();
    if(before){const {_id,...saved}=before;await tx.collection(LIVE).doc('history_'+before.revision).set(saved);}
    const products=await writeProducts(tx,PRODUCTS,published,before?.config,updatedAt,'published');
    await tx.collection(LIVE).doc('active').set({scope:'published-storefront',schemaVersion:1,config:published,revision,updatedAt,updatedBy:user.name,draftRevision:draft.revision,productCount:products.filter(p=>p.active).length});
    return {ok:true,revision,updatedAt,productCount:products.filter(p=>p.active).length,draftRevision:draft.revision};
  });
}
module.exports={LIVE,PRODUCTS,publicationConfig,publish};
