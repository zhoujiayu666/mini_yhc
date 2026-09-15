import {token,cookie,mutation,jsonBody,bytes,invoke,signin,response,failure,OpsError} from '@/lib/ops-server';
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context){try{const {path}=await context.params,action=path.join('/');
 if(action==='session')return response(await invoke(token(request),{action:'whoami'}));
 if(['categoriesLoad','load','status','catalog','publishStatus','memberLoad','memberStatus','memberInventory'].includes(action))return response(await invoke(token(request),{action}));
 if(path[0]==='media'&&path.length===2){const r=await invoke(token(request),{action:'media',id:path[1]});return new Response(null,{status:302,headers:{Location:r.url,'cache-control':'private, no-store','referrer-policy':'no-referrer'}});}
 throw new OpsError(404,'页面不存在。');
 }catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){try{mutation(request);const {path}=await context.params,action=path.join('/');
 if(action==='login'){const body=await jsonBody(request,2048);if(typeof body.username!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(body.username)||typeof body.password!=='string'||body.password.length>64)throw new OpsError(400,'请填写正确的账号和密码。');const auth=await signin(body.username,body.password),user=await invoke(auth.access_token,{action:'whoami'});return response(user,200,{'set-cookie':cookie(request,auth.access_token,Math.min(auth.expires_in||7200,7200))});}
 if(action==='logout')return response({ok:true},200,{'set-cookie':cookie(request,'',0)});
 if(action==='upload'){
  const access=token(request);await invoke(access,{action:'whoami'});
  const suppliedMime=request.headers.get('content-type')||'';if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(suppliedMime))throw new OpsError(400,'不支持此素材格式。');
  const content=await bytes(request,(suppliedMime.startsWith('video/')?30:8)*1024*1024);
  const is=(at:number,...values:number[])=>values.every((value,index)=>content[at+index]===value);
  const mime=is(0,137,80,78,71,13,10,26,10)?'image/png':is(0,255,216,255)?'image/jpeg':is(0,82,73,70,70)&&is(8,87,69,66,80)?'image/webp':is(4,102,116,121,112)?'video/mp4':is(0,26,69,223,163)?'video/webm':'';
  if(!mime)throw new OpsError(400,'图片实际格式不是 JPG、PNG 或 WebP，请转换格式后重新上传。');
  if(content.byteLength>(mime.startsWith('video/')?30:8)*1024*1024)throw new OpsError(400,mime.startsWith('video/')?'视频请控制在 30MB 内。':'图片请控制在 8MB 内。');
  const prepared=await invoke(access,{action:'prepareUpload',mime,size:content.byteLength}),u=prepared.upload;
  const destination=new URL(u.url);if(destination.protocol!=='https:')throw new OpsError(502,'素材上传服务暂不可用。');
  const uploaded=await fetch(u.url,{method:'PUT',headers:{Signature:u.authorization,authorization:u.authorization,'x-cos-security-token':u.token,'x-cos-meta-fileid':u.cosFileId,key:encodeURIComponent(u.cloudPath),'content-type':mime},body:content});
  if(!uploaded.ok)throw new OpsError(502,'素材上传失败，请重新上传。');
  return response(await invoke(access,{action:'completeUpload',id:prepared.id}));
 }
 if(!['categoriesUpdate','save','templates','sync','publish','memberSave','memberPublish','memberSetStock','memberRedemptionOrders','memberRedemptionShip'].includes(action))throw new OpsError(404,'接口不存在。');
 const body=await jsonBody(request);return response(await invoke(token(request),{...body,action}));
 }catch(e){return failure(e);}}
