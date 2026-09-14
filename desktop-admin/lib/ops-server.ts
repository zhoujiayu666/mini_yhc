import type {OpsResult} from './ops-types';
// Only official CloudBase user tokens cross this boundary. No cloud administrator keys.
const BASE='https://cloud1-d4grfezxdaca540d6.api.tcloudbasegateway.com';
const COOKIE='topuyi_ops_session';
export class OpsError extends Error {constructor(public status:number,message:string){super(message);}}
export function token(request:Request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}
export function cookie(request:Request,value:string,maxAge:number){return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function mutation(request:Request){if(request.headers.get('x-topuyi-ops')!=='1'||request.headers.get('origin')!==new URL(request.url).origin)throw new OpsError(403,'请从运营后台页面操作。');}
export async function bytes(request:Request,limit:number){if(Number(request.headers.get('content-length')||0)>limit)throw new OpsError(413,'上传内容过大。');const reader=request.body?.getReader();if(!reader)return new Uint8Array();const parts:Uint8Array[]=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit){await reader.cancel();throw new OpsError(413,'上传内容过大。');}parts.push(r.value);}const all=new Uint8Array(size);let pos=0;for(const p of parts){all.set(p,pos);pos+=p.length;}return all;}
export async function jsonBody(request:Request,limit=900000){try{return JSON.parse(new TextDecoder().decode(await bytes(request,limit)));}catch(e){if(e instanceof OpsError)throw e;throw new OpsError(400,'请求格式不正确。');}}
export async function invoke(accessToken:string,event:Record<string,unknown>){
 if(!accessToken)throw new OpsError(401,'登录已过期，请重新登录。');
 const r=await fetch(BASE+'/v1/functions/topuyi-ops-v1',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify(event)});
 const result=await r.json() as OpsResult;
 if(!r.ok)throw new OpsError(r.status===401||r.status===403?401:502,r.status===401||r.status===403?'登录已过期，请重新登录。':'云端暂不可用，请稍后重试。');
 if(!result.ok)throw new OpsError(({UNAUTHENTICATED:401,FORBIDDEN:403,CONFLICT:409,INVALID:400,NOT_FOUND:404} as Record<string,number>)[result.code]||502,result.error||'操作失败。');return result;
}
export async function signin(username:string,password:string){const r=await fetch(BASE+'/auth/v1/signin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});const result=await r.json() as {access_token?:string;expires_in?:number};if(!r.ok||!result.access_token)throw new OpsError(401,'账号或密码不正确，或登录暂受限制，请稍后重试。');return result as {access_token:string;expires_in:number};}
export function response(value:unknown,status=200,headers:Record<string,string>={}){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});}
export function failure(e:unknown){return response({error:e instanceof OpsError?e.message:'服务暂不可用，请稍后重试。'},e instanceof OpsError?e.status:502);}
