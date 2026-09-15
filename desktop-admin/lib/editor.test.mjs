import assert from 'node:assert/strict';
import { defaults, newBlock, maxContentItems, validateConfig } from './editor.ts';
const c=defaults();assert.equal(c.blocks.length,7);assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(c))),c);
const image='data:image/png;base64,aGVsbG8=';c.blocks[0].items[0].image=image;
assert.equal(validateConfig(JSON.parse(JSON.stringify(c))).blocks[0].items[0].image,image);
const copy=newBlock('banner');assert.notEqual(copy.id,newBlock('banner').id);
for(const mutate of [v=>v.blocks[0].items[0].image='javascript:alert(1)',v=>v.blocks[0].items[0].image='data:image/svg+xml;base64,aA==',v=>v.blocks[0].items[0].target=20,v=>v.blocks[0].height=-1,v=>v.blocks[0].type='constructor',v=>v.blocks.push(v.blocks[0]),v=>v.blocks[0].items=[],v=>v.blocks[0].visible='false',v=>v.blocks[0].background='url(https://bad.invalid)']){
 const invalid=structuredClone(c);mutate(invalid);assert.throws(()=>validateConfig(invalid));
}
assert.equal(validateConfig({version:1,blocks:[]}).blocks.length,0);
assert.throws(()=>validateConfig(null));
console.log('PASS: template round-trip with image, unique IDs, invalid media/targets/ranges/types/duplicates, empty state.');

// Heights below the previous 160 rpx limit must survive saving/importing a template.
for(const height of [40,41,80,159,160,900]){
 const config=defaults();config.blocks[3].height=height;
 assert.equal(validateConfig(JSON.parse(JSON.stringify(config))).blocks[3].height,height);
}
for(const [index,height] of [[3,39],[3,901],[3,NaN],[0,159]]){
 const config=defaults();config.blocks[index].height=height;assert.throws(()=>validateConfig(config));
}
console.log('PASS: short entry heights round-trip; invalid heights and other module limits remain rejected.');

// Product capacity must survive draft/template round-trips without expanding other modules.
for(const [type,limit] of [['products',100],['links',20],['banner',20]]){
 const block=newBlock(type);
 assert.equal(maxContentItems(type),limit);
 block.items=Array.from({length:limit},(_,n)=>({...block.items[0],id:'capacity-'+n}));
 const config={version:1,blocks:[block]};
 assert.equal(validateConfig(JSON.parse(JSON.stringify(config))).blocks[0].items.length,limit);
 block.items.push({...block.items[0],id:'over-limit'});
 assert.throws(()=>validateConfig(config));
}
console.log('PASS: 100 products round-trip; product 101 rejected; other modules retain 20 items.');
