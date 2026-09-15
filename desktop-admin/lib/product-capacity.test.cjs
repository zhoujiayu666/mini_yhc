const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const entry = path.resolve(__dirname, '../server/ops-functions/topuyi-ops-v1/index.js');
const localRequire = createRequire(entry);
const records = new Map();
const writes = [];
records.set('topuyi_operators_v1/fixture', {active:true,name:'Capacity test'});
records.set('topuyi_ops_content_v1/asset_'+'a'.repeat(32), {ready:true,mime:'image/png',fileID:'cloud://fixture/product.png'});
const db = {
  collection(name) {
    return {
      limit() { return {get:async()=>({data:[]})}; },
      doc(id) {
        const key=name+'/'+id;
        return {
          get:async()=>({data:records.has(key)?[structuredClone(records.get(key))]:[]}),
          set:async value=>{records.set(key,structuredClone(value));writes.push(key);}
        };
      }
    };
  },
  runTransaction:async action=>action(db)
};
const handler = {};
const sdk={init:()=>({database:()=>db}),getCloudbaseContext:()=>({TCB_UUID:'fixture'})};
vm.runInNewContext(fs.readFileSync(entry,'utf8'), {
  exports:handler, require:name=>name==='@cloudbase/node-sdk'?sdk:localRequire(name),console
}, {filename:entry});
function config(count, type='products') {
  return {version:1,blocks:[{
    id:'capacity-block',type,title:'测试商品',subtitle:'',visible:true,showHeading:false,
    background:'#ffffff',height:340,spacing:12,columns:2,video:'',
    items:Array.from({length:count},(_,index)=>({
      id:'product-'+index,title:'商品 '+index,subtitle:'',filename:'product.png',target:1,
      image:'/api/ops/media/'+'a'.repeat(32),price:19.8,originalPrice:29.8,
      detailImages:['/api/ops/media/'+'a'.repeat(32)],
      detailBlocks:[{id:'text',type:'text',text:'商品介绍'},{id:'image',type:'image',image:'/api/ops/media/'+'a'.repeat(32)}]
    }))
  }]};
}
(async()=>{
  const save=await handler.main({action:'save',config:config(100),expectedRevision:null});
  assert.equal(save.ok,true,save.error);
  assert.equal(save.record.config.blocks[0].items.length,100);
  assert.equal(new Set(save.record.config.blocks[0].items.map(item=>item.sku)).size,100);
  const published=await handler.main({action:'publish',expectedDraftRevision:save.record.revision,expectedRevision:null});
  assert.equal(published.ok,true,published.error);
  assert.equal(published.productCount,100);
  assert.equal(records.get('topuyi_storefront_live_v1/active').config.blocks[0].items.length,100);
  const products=[...records.entries()].filter(([key])=>key.startsWith('topuyi_home_products_live_v1/'));
  assert.equal(products.length,100);
  assert.ok(products.every(([,product])=>product.active&&product.manageStock===false&&product.price===19.8));
  const writeCount=writes.length;
  for(const invalid of [config(101),config(21,'links')]){
    const rejected=await handler.main({action:'save',config:invalid,expectedRevision:save.record.revision});
    assert.equal(rejected.code,'INVALID');
    assert.equal(writes.length,writeCount);
  }
  console.log('PASS: save and publish 100 products with details; 101 rejected without writes; other modules retain 20. All database calls were in-memory mocks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
