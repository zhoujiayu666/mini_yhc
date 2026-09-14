import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {defaults} from '../lib/editor.ts';
const require=createRequire(import.meta.url);
const {connect,COLLECTION,FUNCTION}=require('./cloud-client.cjs');
const url='http://localhost:5188/api/home-preview';
const headers={'x-topuyi-preview':'1','content-type':'application/json','origin':'http://localhost:5188'};
let revision,app,fileID;
async function active(){const r=await app.database().collection(COLLECTION).where({_id:'active'}).limit(1).get();return r.data[0];}
async function invoke(accessCode){const r=await app.callFunction({name:FUNCTION,data:{action:'getPreview',accessCode}});return typeof r.result==='string'?JSON.parse(r.result):r.result;}
try{
 assert.equal((await fetch(url+'/status')).status,403);
 assert.equal((await fetch(url+'/status',{headers:{...headers,origin:'https://example.com'}})).status,403);
 const status=await (await fetch(url+'/status',{headers})).json();assert.equal(status.connected,true);assert.equal(status.revision,null,'Existing user preview found; do not overwrite.');
 const config=defaults();config.blocks[0].title='连接验证临时页面';
 const png=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6t00AAAAASUVORK5CYII=','base64'),randomBytes(12)]);
 config.blocks[0].items[0].image='data:image/png;base64,'+png.toString('base64');
 const r=await fetch(url+'/sync',{method:'POST',headers,body:JSON.stringify({config,expectedRevision:null})});const synced=await r.json();assert.equal(r.status,200,JSON.stringify(synced));revision=synced.revision;
 app=await connect();const doc=await active();assert.equal(doc.revision,revision);fileID=doc.config.blocks[0].items[0].image;assert.ok(fileID.startsWith('cloud://'));assert.ok(fileID.includes('topuyi/home-preview/v1/'));
 const denied=await invoke('0'.repeat(32));assert.equal(denied.ok,false);
 const result=await invoke(synced.accessCode);assert.equal(result.ok,true);assert.equal(result.config.blocks[0].title,config.blocks[0].title);assert.equal(result.revision,revision);
 const imageResponse=await fetch(result.config.blocks[0].items[0].image);assert.equal(imageResponse.status,200);assert.equal(Buffer.compare(Buffer.from(await imageResponse.arrayBuffer()),png),0);
 const stale=await fetch(url+'/sync',{method:'POST',headers,body:JSON.stringify({config,expectedRevision:null})});assert.equal(stale.status,409);
 console.log('PASS: local origin protection, cloud upload, isolated draft write, authenticated read-only function, signed image retrieval, stale revision rejection.');
}finally{
 if(revision){app=app||await connect();const doc=await active();if(doc?.revision===revision){await app.database().collection(COLLECTION).doc('active').remove();if(fileID)await app.deleteFile({fileList:[fileID]});console.log('Removed only the temporary verification draft and its uniquely generated image.');}}
}
