const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),member=require('../server/ops-functions/topuyi-ops-v1/member-content');
function typescript(file){const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;}
const {memberDefaults}=typescript('member.ts'),{memberPublishIssues}=typescript('member-publish.ts');
const plain=x=>JSON.parse(JSON.stringify(x)),asset=n=>'/api/ops/media/'+String(n).padStart(32,'0'),cloudImage=n=>'cloud://fixture/image-'+n;
const base=plain(memberDefaults());base.hero.visible=false;base.banner.visible=false;base.entries.visible=false;
base.products.items=[{id:'gift',title:'积分商品',image:asset(1),points:100,visible:true,description:'已有的商品介绍',exchangeInstructions:''}];
const old=member.validate(base);assert.deepEqual(old.products.items[0].detailImages,[]);assert.deepEqual(old.products.items[0].detailBlocks,[]);assert.equal(memberPublishIssues(base).length,0);
const config=plain(base);Object.assign(config.products.items[0],{detailImages:[asset(2),asset(3)],detailBlocks:[{id:'specs',type:'text',text:'尺寸：10 × 20 cm\n材质：硅胶',image:''},{id:'long-image',type:'image',text:'',image:asset(4)}]});
assert.equal(memberPublishIssues(config).length,0);
for(const patch of [{detailImages:Array(11).fill(asset(2))},{detailImages:['https://untrusted.test/image']},{detailImages:['']},{detailBlocks:null},{detailBlocks:Array(31).fill(config.products.items[0].detailBlocks[0])},{detailBlocks:[{id:'gift',type:'text',text:'ID 冲突',image:''}]},{detailBlocks:[{id:'bad',type:'image',text:'',image:'data:image/png;base64,secret'}]}]){const c=plain(config);Object.assign(c.products.items[0],patch);assert.throws(()=>member.validate(c));}
const empty=plain(config);empty.products.items[0].detailBlocks[1].image='';assert.match(memberPublishIssues(empty)[0].message,/第 2 项.*编辑详情页/);assert.throws(()=>member.publication(member.validate(empty)),/第 2 项详情图文为空/);
empty.products.items[0].visible=false;empty.hero.visible=true;empty.hero.image=asset(1);assert.equal(memberPublishIssues(empty).length,0);assert.doesNotThrow(()=>member.publication(member.validate(empty)));
const docs=new Map();for(let n=1;n<=4;n++)docs.set('topuyi_ops_content_v1/asset_'+String(n).padStart(32,'0'),{ready:true,mime:'image/png',fileID:cloudImage(n)});
const db={collection:name=>({doc:id=>({get:async()=>({data:plain(docs.get(name+'/'+id)||null)}),set:async value=>docs.set(name+'/'+id,plain(value))})}),runTransaction:async f=>f(db)};
(async()=>{
 const saved=await member.handle(db,{action:'memberSave',config,expectedRevision:null},{name:'测试运营'});
 assert.deepEqual(saved.record.config.products.items[0].detailBlocks,config.products.items[0].detailBlocks);
 assert.equal(saved.record.config.products.items[0].image,asset(1));
 const loaded=await member.handle(db,{action:'memberLoad'},{});assert.deepEqual(loaded.draft.config,saved.record.config);
 await member.handle(db,{action:'memberPublish',expectedDraftRevision:saved.record.revision,expectedRevision:null},{name:'测试运营'});
 const live=docs.get('topuyi_storefront_live_v1/member_active');assert.deepEqual(live.config.products.items[0].detailImages,[cloudImage(2),cloudImage(3)]);assert.equal(live.config.products.items[0].detailBlocks[1].image,cloudImage(4));assert.equal(live.config.products.items[0].exchangeInstructions,'');
 const incomplete=plain(config);incomplete.products.items[0].detailImages=[asset(9)];await assert.rejects(()=>member.resolve(db,incomplete),/尚未上传完成/);
 await assert.rejects(()=>member.handle(db,{action:'memberSave',config,expectedRevision:'stale'},{}),/同事已更新/);
 console.log('PASS: old products, optional details, limits, media validation, duplicate IDs, empty-block publish feedback, hidden products, save/load/publish preservation and revision protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
