const {createHash,randomBytes}=require('node:crypto');
const CONTENT='topuyi_ops_content_v1',LIVE='topuyi_storefront_live_v1',ID='product_categories';
const fail=(code,message)=>{const e=new Error(message);e.publicCode=code;throw e;};
const nameOf=value=>typeof value==='string'?value.trim():'';
const key=value=>nameOf(value).toLocaleLowerCase();
const legacyName=item=>nameOf(item.category)||'荧光棒';
const products=config=>(config?.blocks||[]).filter(b=>b.type==='products').flatMap(b=>b.items||[]);
async function read(db,collection,id){const r=await db.collection(collection).doc(id).get();return Array.isArray(r.data)?r.data[0]:r.data;}
async function sources(db){const [record,draft,live,templates]=await Promise.all([read(db,CONTENT,ID),read(db,CONTENT,'draft'),read(db,LIVE,'active'),read(db,CONTENT,'templates')]);return {record,draft,live,templates};}
function migrate(configs){const items=[],seen=new Set();for(const config of configs)for(const item of products(config)){const name=legacyName(item),k=key(name);if(seen.has(k))continue;seen.add(k);items.push({id:'cat_'+createHash('sha256').update(k).digest('hex').slice(0,24),name,aliases:[]});}return {items,revision:null};}
function registry(s){return s.record||migrate([s.draft?.config,s.live?.config,...(s.templates?.items||[]).map(t=>t.config)]);}
function find(items,item){return item.categoryId?items.find(c=>c.id===item.categoryId):items.find(c=>[c.name,...(c.aliases||[])].some(n=>key(n)===key(legacyName(item))));}
function normalize(config,record){const result=JSON.parse(JSON.stringify(config));for(const item of products(result)){const category=find(record.items,item);if(!category)fail('INVALID',`商品“${item.title||'未填写标题'}”的分类不存在，请在商品分类中新增，或重新选择分类。`);item.categoryId=category.id;item.category=category.name;}result.categories=record.items.map(({id,name})=>({id,name}));result.categoryRevision=record.revision||null;return result;}
function usage(s,r){return Object.fromEntries(r.items.map(c=>[c.id,{draft:products(s.draft?.config).filter(i=>find(r.items,i)?.id===c.id).length,published:products(s.live?.config).filter(i=>find(r.items,i)?.id===c.id).length,templates:(s.templates?.items||[]).reduce((n,t)=>n+products(t.config).filter(i=>find(r.items,i)?.id===c.id).length,0)}]));}
function result(s,r){return {ok:true,items:r.items,revision:r.revision||null,usage:usage(s,r)};}
function change(s,event,user){const before=registry(s);if((before.revision||null)!==(event.expectedRevision||null))fail('CONFLICT','同事已更新商品分类，请刷新分类后重试。');const items=JSON.parse(JSON.stringify(before.items));
 if(event.operation==='add'||event.operation==='rename'){const name=nameOf(event.name);if(!name||name.length>20)fail('INVALID','分类名称请填写 1–20 个字。');if(key(name)===key('全部商品'))fail('INVALID','“全部商品”是系统入口，请使用其他分类名称。');const target=event.operation==='rename'?items.find(c=>c.id===event.id):null;if(event.operation==='rename'&&!target)fail('CONFLICT','该分类已被删除，请刷新分类。');if(items.some(c=>c.id!==target?.id&&[c.name,...(c.aliases||[])].some(n=>key(n)===key(name))))fail('INVALID','分类名称已存在或被旧名称占用，请使用其他名称。');if(target){target.aliases=[...new Set([...(target.aliases||[]),target.name])].filter(n=>n!==name);if(target.aliases.length>100)fail('INVALID','该分类改名次数过多，请联系管理员。');target.name=name;}else {if(items.length>=100)fail('INVALID','最多添加 100 个商品分类。');items.push({id:'cat_'+randomBytes(12).toString('hex'),name,aliases:[]});}}
 else if(event.operation==='reorder'){if(!Array.isArray(event.ids)||event.ids.length!==items.length||new Set(event.ids).size!==items.length||event.ids.some(id=>!items.some(c=>c.id===id)))fail('INVALID','分类顺序不完整，请刷新后重试。');items.sort((a,b)=>event.ids.indexOf(a.id)-event.ids.indexOf(b.id));}
 else if(event.operation==='delete'){const at=items.findIndex(c=>c.id===event.id);if(at<0)fail('CONFLICT','该分类已被删除，请刷新分类。');const used=usage(s,before)[event.id];if(used.draft||used.published||used.templates)fail('INVALID',`该分类仍被使用：共享草稿 ${used.draft} 件，已发布商城 ${used.published} 件，模板 ${used.templates} 件。请先调整商品分类并保存、发布，清理相关模板后再删除。`);items.splice(at,1);}
 else fail('INVALID','分类操作不正确。');
 return {items,revision:randomBytes(12).toString('hex'),updatedAt:new Date().toISOString(),updatedBy:user.name};
}
async function handle(db,event,user){if(event.action==='categoriesLoad'){const s=await sources(db);return result(s,registry(s));}return db.runTransaction(async tx=>{const s=await sources(tx),record=change(s,event,user);await tx.collection(CONTENT).doc(ID).set(record);return result(s,record);});}
async function getRegistry(db){return registry(await sources(db));}
async function assertRevision(db,revision){const r=await read(db,CONTENT,ID);if((r?.revision||null)!==(revision||null))fail('CONFLICT','商品分类已更新，请刷新分类并重新保存共享草稿后再操作。');}
module.exports={handle,getRegistry,assertRevision,normalize,migrate,find,change,usage};
