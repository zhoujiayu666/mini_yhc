import type {OpsResult} from './ops-types';
import type {Config} from './editor';
export async function ops(action:string,body?:unknown,options:{timeoutMs?:number}={}){
 const controller=options.timeoutMs?new AbortController():undefined;
 const timer=controller?setTimeout(()=>controller.abort(),options.timeoutMs):undefined;
 try{
  const r=await fetch('/api/ops/'+action,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json','x-topuyi-ops':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal});
  if(r.status===401&&action!=='session'&&action!=='login')window.dispatchEvent(new Event('ops-session-expired'));
  let value:OpsResult;
  try{value=await r.json() as OpsResult;}catch{throw new Error(r.status>=500?'后台服务暂时不可用，请稍后重新检查。':'服务器返回异常，请刷新后重试。');}
  if(!r.ok)throw new Error(value.error||'操作失败。');return value;
 }
 catch(error){if(controller?.signal.aborted)throw new Error('连接超时，请检查网络后重试。');throw error;}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
export async function uploadMedia(file:Blob){const r=await fetch('/api/ops/upload',{method:'POST',headers:{'content-type':file.type,'x-topuyi-ops':'1'},body:file});const value=await r.json() as OpsResult;if(!r.ok){if(r.status===401)window.dispatchEvent(new Event('ops-session-expired'));throw new Error(value.error||'素材上传失败。');}return value.src as string;}
export async function migrateMedia(config:Config){const result=structuredClone(config),memo=new Map<string,string>();async function media(v:string){if(!v.startsWith('data:'))return v;if(!memo.has(v)){const blob=await (await fetch(v)).blob();memo.set(v,await uploadMedia(blob));}return memo.get(v)!;}for(const b of result.blocks){b.video=await media(b.video);for(const i of b.items){i.image=await media(i.image);if(i.detailImages)i.detailImages=await Promise.all(i.detailImages.map(media));if(i.detailBlocks)for(const x of i.detailBlocks)if(x.type==='image')x.image=await media(x.image||'');}}return result;}
