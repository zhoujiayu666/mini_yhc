import assert from 'node:assert/strict';
import { defaults, newBlock, validateConfig } from './editor.ts';
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
