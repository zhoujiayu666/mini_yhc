import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {defaults} from '../lib/editor.ts';
const require=createRequire(import.meta.url),{connect,COLLECTION,FUNCTION}=require('./cloud-client.cjs');
const base=process.env.OPS_TEST_URL||'http://localhost:5188',user=JSON.parse(fs.readFileSync(new URL('../.private/operator-bootstrap.json',import.meta.url)));
let cookie='',draftRevision,previewRevision,assetId,app;
async function call(action,data,extra={}){const r=await fetch(base+'/api/ops/'+action,{method:data===undefined?'GET':'POST',headers:{cookie,origin:base,'x-topuyi-ops':'1','content-type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});const raw=await r.text();let v;try{v=JSON.parse(raw);}catch{v={error:raw};}return {r,v};}
async function doc(collection,id){const r=await app.database().collection(collection).doc(id).get();return r.data[0];}
try{
 assert.equal((await call('load')).r.status,401);
 assert.equal((await call('login',{username:user.username,password:user.password},{origin:'https://other.example'})).r.status,403);
 const login=await call('login',{username:user.username,password:user.password});assert.equal(login.r.status,200,JSON.stringify(login.v));cookie=login.r.headers.get('set-cookie').split(';')[0];assert.match(login.r.headers.get('set-cookie'),/HttpOnly/);assert.match(login.r.headers.get('set-cookie'),/SameSite=Strict/);
 assert.equal((await call('session')).v.user.username,user.username);
 const loaded=await call('load');assert.equal(loaded.r.status,200,JSON.stringify(loaded.v));assert.equal(loaded.v.draft,null,'Refuse overwriting existing draft');
 assert.equal((await call('status')).v.revision,null,'Refuse overwriting existing preview');
 const png=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6t00AAAAASUVORK5CYII=','base64'),randomBytes(12)]);
 const uploaded=await fetch(base+'/api/ops/upload',{method:'POST',headers:{cookie,origin:base,'x-topuyi-ops':'1','content-type':'image/png'},body:png});const media=await uploaded.json();assert.equal(uploaded.status,200,JSON.stringify(media));assetId=media.src.split('/').pop();
 const image=await fetch(base+media.src,{headers:{cookie}});assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.equal((await fetch(base+media.src,{redirect:'manual'})).status,401);
 const config=defaults();config.blocks[0].title='临时在线后台验证';config.blocks[0].items[0].image=media.src;
 const saved=await call('save',{config,expectedRevision:null});assert.equal(saved.r.status,200,JSON.stringify(saved.v));draftRevision=saved.v.record.revision;
 assert.equal((await call('save',{config,expectedRevision:null})).r.status,409);
 const reread=await call('load');assert.equal(reread.v.draft.config.blocks[0].title,config.blocks[0].title);
 const synced=await call('sync',{config,expectedRevision:null});assert.equal(synced.r.status,200,JSON.stringify(synced.v));previewRevision=synced.v.revision;
 assert.equal((await call('sync',{config,expectedRevision:null})).r.status,409);
 app=await connect();const preview=await app.callFunction({name:FUNCTION,data:{action:'getPreview',accessCode:synced.v.accessCode}});const value=typeof preview.result==='string'?JSON.parse(preview.result):preview.result;assert.equal(value.ok,true);assert.equal(value.config.blocks[0].title,config.blocks[0].title);assert.equal((await fetch(value.config.blocks[0].items[0].image)).status,200);
 const direct=await app.callFunction({name:'topuyi-ops-v1',data:{action:'whoami',TCB_UUID:user.uid,uid:user.uid}});const denied=typeof direct.result==='string'?JSON.parse(direct.result):direct.result;assert.equal(denied.ok,false,'Forged event UID must not authorize');
 const logout=await call('logout',{});assert.match(logout.r.headers.get('set-cookie'),/Max-Age=0/);
 console.log('PASS: login, cookie flags, CSRF, unauthenticated denial, shared draft, conflict handling, image upload/read, development preview, forged UID denial, logout.');
}finally{
 app=app||await connect();
 if(draftRevision&&(await doc('topuyi_ops_content_v1','draft'))?.revision===draftRevision)await app.database().collection('topuyi_ops_content_v1').doc('draft').remove();
 if(previewRevision&&(await doc(COLLECTION,'active'))?.revision===previewRevision){await app.database().collection(COLLECTION).doc('active').remove();const link=await doc('topuyi_ops_content_v1','preview_link');if(link?.revision===previewRevision)await app.database().collection('topuyi_ops_content_v1').doc('preview_link').remove();}
 if(assetId){const a=await doc('topuyi_ops_content_v1','asset_'+assetId);if(a){await app.deleteFile({fileList:[a.fileID]});await app.database().collection('topuyi_ops_content_v1').doc('asset_'+assetId).remove();}}
 console.log('Removed only temporary verification content.');
}
