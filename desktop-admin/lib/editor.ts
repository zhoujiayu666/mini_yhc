export type Kind = 'banner'|'video'|'links'|'poster'|'products'|'about';
export type DetailBlock={id:string;type:'text'|'image';text?:string;image?:string};
export type Item = {id:string; title:string; subtitle:string; image:string; filename:string; target:number; sku?:string; category?:string; categoryId?:string; detailImages?:string[]; detailBlocks?:DetailBlock[]; price?:number; originalPrice?:number};
export type Block = {id:string; type:Kind; title:string; subtitle:string; visible:boolean; showHeading?:boolean; background:string; height:number; spacing:number; columns:number; video:string; items:Item[]};
export type Config = {version:1; blocks:Block[]; categories?:{id:string;name:string}[]; categoryRevision?:string|null};
export const kinds:Record<Kind,string>={banner:'轮播海报',video:'品牌视频',links:'海报入口',poster:'活动海报',products:'商品展示',about:'公司介绍'};
export const targets=['不跳转','所有商品','演出','设备管理','连接指南','APP控制','房间'];
export const colors=['#f4f4f1','#ffffff','#eee9db','#171b26','#202733'];
export function maxContentItems(type:Kind):number{return type==='products'?100:20;}
export function minMediaHeight(type:Kind):number{return type==='links'?40:160;}
export function newItem(title:string,target=0):Item{return {id:crypto.randomUUID(),title,subtitle:'',image:'',filename:'',target};}
export function newBlock(type:Kind):Block{return {id:crypto.randomUUID(),type,title:kinds[type],subtitle:'',visible:true,showHeading:false,background:'#ffffff',height:type==='banner'?540:340,spacing:12,columns:2,video:'',items:[newItem('编辑标题')]};}
export function defaults():Config{
 const item=(title:string,target=0,id='item'):Item=>({id,title,subtitle:'',image:'',filename:'',target});
 const make=(type:Kind,patch:Partial<Block>):Block=>({id:'default-'+type,type,title:kinds[type],subtitle:'',visible:true,showHeading:false,background:'#ffffff',height:340,spacing:12,columns:2,video:'',items:[item('编辑内容')],...patch});
 return {version:1,blocks:[
 make('banner',{title:'品牌主视觉',subtitle:'TOPUYI · 智能灯光',background:'#171b26',height:540,items:[item('让每一束光\n与热爱同频',1,'hero1'),item('把现场的热爱\n握在手心',2,'hero2')]}),
 make('video',{title:'光，连接每一个现场',subtitle:'活动现场 / 工厂影像'}),
 make('links',{title:'',background:'#ffffff',columns:4,height:160,items:[item('所有商品',1,'link1'),item('APP控制',5,'link2'),item('演出',2,'link3'),item('房间',6,'link4')]}),
 make('links',{id:'default-community',title:'',background:'#ffffff',columns:2,items:[item('微信公众号',0,'official-account'),item('明星粉丝群',0,'fan-groups')]}),
 make('poster',{title:'为下一场热爱，准备好',subtitle:'探索 TOPUYI 产品与活动',background:'#eee9db',items:[item('',0,'campaign-poster')]}),
 make('products',{title:'发现好物',subtitle:'为现场增添一束光',items:[{...item('TOPUYI 明星同款15色演唱会荧光棒',1,'product1'),sku:'stick-05'},{...item('TOPUYI 经典荧光棒',1,'product2'),sku:'stick-01'},{...item('TOPUYI RGB 智能荧光棒',1,'product3'),sku:'stick-02'},{...item('荧光棒 10支套装',1,'product4'),sku:'stick-03'}]}),
 make('poster',{id:'default-bottom-poster',title:'底部海报',subtitle:'',background:'#ffffff',items:[item('',0,'bottom-poster')]})]};
}
function media(s:unknown,video=false):s is string{return typeof s==='string'&&(s===''||/^\/api\/ops\/media\/[a-f0-9]{32}$/.test(s)||(video?/^data:video\/(mp4|webm);base64,[A-Za-z0-9+/=]+$/:/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).test(s));}
export function validateConfig(input:unknown):Config{
 const c=input as Config;const fail=()=>{throw new Error('Invalid template');};
 if(!c||c.version!==1||!Array.isArray(c.blocks)||c.blocks.length>30)fail();
 const ids=new Set<string>();
 for(const b of c.blocks){
 if(!b||typeof b.id!=='string'||ids.has(b.id)||!Object.hasOwn(kinds,b.type)||typeof b.title!=='string'||b.title.length>60||typeof b.subtitle!=='string'||b.subtitle.length>300||typeof b.visible!=='boolean'||(b.showHeading!==undefined&&typeof b.showHeading!=='boolean')||!colors.includes(b.background)||!Number.isFinite(b.height)||b.height<minMediaHeight(b.type)||b.height>900||!Number.isFinite(b.spacing)||b.spacing<0||b.spacing>40||![1,2,4].includes(b.columns)||!media(b.video,true)||!Array.isArray(b.items)||!b.items.length||b.items.length>maxContentItems(b.type))fail();
 ids.add(b.id);const itemIds=new Set<string>();
 for(const i of b.items){const subtitleLimit=b.id==='default-community'?3000:200,detailOk=i.detailBlocks===undefined||(Array.isArray(i.detailBlocks)&&i.detailBlocks.length<=30&&i.detailBlocks.every(x=>x&&typeof x.id==='string'&&x.id.length<=80&&['text','image'].includes(x.type)&&(x.text===undefined||(typeof x.text==='string'&&x.text.length<=3000))&&(x.image===undefined||media(x.image))));if(!i||typeof i.id!=='string'||(i.sku!==undefined&&(typeof i.sku!=='string'||i.sku.length>100))||(i.categoryId!==undefined&&(typeof i.categoryId!=='string'||i.categoryId.length>80))||(i.category!==undefined&&(typeof i.category!=='string'||i.category.length>20))||(i.detailImages!==undefined&&(!Array.isArray(i.detailImages)||i.detailImages.length>10||i.detailImages.some(v=>!media(v))))||!detailOk||(i.price!==undefined&&(!Number.isFinite(i.price)||i.price<0||i.price>9999999))||(i.originalPrice!==undefined&&(!Number.isFinite(i.originalPrice)||i.originalPrice<0||i.originalPrice>9999999))||itemIds.has(i.id)||typeof i.title!=='string'||i.title.length>80||typeof i.subtitle!=='string'||i.subtitle.length>subtitleLimit||typeof i.filename!=='string'||!media(i.image)||!Number.isInteger(i.target)||i.target<0||i.target>=targets.length)fail();itemIds.add(i.id);}
 }return structuredClone(c);
}
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('topuyi-desktop-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Storage blocked'));});}
export async function readRecord<T>(key:string):Promise<T|undefined>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('records','readonly'),r=tx.objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>d.close();tx.onabort=()=>{d.close();reject(tx.error);};});}
export async function writeRecord(key:string,value:unknown):Promise<void>{const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=()=>{d.close();resolve();};tx.onerror=tx.onabort=()=>{d.close();reject(tx.error);};});}
