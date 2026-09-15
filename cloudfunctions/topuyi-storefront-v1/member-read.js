module.exports=async function readMember(cloud){
 const db=cloud.database(),r=await db.collection('topuyi_storefront_live_v1').where({_id:'member_active'}).limit(1).get(),doc=r.data[0];
 if(!doc||doc.scope!=='published-member')return {ok:true,published:false,config:null};
 const config=JSON.parse(JSON.stringify(doc.config));
 // The public endpoint reads only the published member document, never an operator draft.
 if(!config.hero.visible)config.hero.image='';
 if(!config.banner.visible)config.banner.image='';
 config.entries.items=config.entries.visible?config.entries.items:[];
 for(const e of config.entries.items)if(!e.enabled)e.content=[];
 config.products.items=config.products.visible?config.products.items.filter(p=>p.visible):[];
 const refs=[config.hero.image,config.banner.image,...config.entries.items.flatMap(e=>[e.image,...e.content.filter(b=>b.type==='image').map(b=>b.image)]),...config.products.items.map(p=>p.image)];
 const ids=[...new Set(refs.filter(v=>typeof v==='string'&&v.startsWith('cloud://')))];
 const urls={};
 for(let n=0;n<ids.length;n+=50){const batch=ids.slice(n,n+50),r=await cloud.getTempFileURL({fileList:batch});for(const file of r.fileList){if(file.tempFileURL)urls[file.fileID]=file.tempFileURL;}if(batch.some(id=>!urls[id]))throw Error('MEMBER_MEDIA_UNAVAILABLE');}
 const image=src=>urls[src]||src;
 config.hero.image=image(config.hero.image);config.banner.image=image(config.banner.image);
 for(const e of config.entries.items){e.image=image(e.image);for(const b of e.content)if(b.type==='image')b.image=image(b.image);}
 for(const p of config.products.items)p.image=image(p.image);
 return {ok:true,published:true,config,revision:doc.revision,updatedAt:doc.updatedAt};
};
